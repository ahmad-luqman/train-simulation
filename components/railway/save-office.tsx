'use client';
/* eslint-disable react/react-compiler -- Commands operate on the authoritative mutable simulation, like the other railway offices. */
import { useLayoutEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  MANUAL_SLOTS,
  SAVE_LIMIT,
  parseRailway,
  type SaveEntry,
  type SaveSlot,
} from '@/lib/railway/save-store';
import { browserSaveStore } from '@/lib/railway/browser-storage';
import type { Simulation } from '@/lib/railway/simulation';

export function downloadFile(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SaveOffice({
  simulation,
  restore,
  notify,
}: {
  simulation: Simulation;
  restore: (state: ReturnType<Simulation['save']>) => void;
  notify: (text: string) => void;
}) {
  const [keepRecovery, setKeepRecovery] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<SaveEntry[]>([]);
  const [name, setName] = useState('My railway');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<{
    label: string;
    run: () => void | Promise<void>;
  } | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open || busy) return;
    if (pending) {
      confirmButton.current?.focus();
      return;
    }
    const target = returnFocus.current;
    returnFocus.current = null;
    if (
      target?.isConnected &&
      (document.activeElement === document.body ||
        document.activeElement === dialog.current)
    )
      target.focus();
  }, [busy, open, pending]);
  function rememberFocus() {
    if (fieldset.current?.contains(document.activeElement))
      returnFocus.current = document.activeElement as HTMLElement;
  }
  function confirm(request: NonNullable<typeof pending>) {
    rememberFocus();
    setMessage('');
    setPending(request);
  }
  async function refresh() {
    setEntries(await browserSaveStore().list());
  }
  async function action(run: () => void | Promise<void>) {
    if (!pending) rememberFocus();
    setMessage('');
    setBusy(true);
    try {
      await run();
      await refresh();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Storage is unavailable. Export your railway to keep a copy.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function load(state: ReturnType<Simulation['save']>) {
    // Persist current state first. A quota error aborts replacement and leaves the game untouched.
    const wasPaused = simulation.paused;
    simulation.paused = true;
    try {
      if (keepRecovery)
        await browserSaveStore().write(
          'recovery',
          simulation.save(),
          'Before last load / new railway',
        );
    } catch (error) {
      simulation.paused = wasPaused;
      throw error;
    }
    restore(state);
    setOpen(false);
    notify(
      keepRecovery
        ? 'Railway restored and paused. Your previous railway is in Recovery.'
        : 'Railway restored and paused.',
    );
  }
  function requestLoad(slot: SaveSlot) {
    confirm({
      label:
        'Replace the current railway? The recovery setting below controls whether your current railway is kept.',
      run: async () => load((await browserSaveStore().load(slot)).state),
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (busy) return;
        setOpen(value);
        setPending(null);
        setMessage('');
        setKeepRecovery(true);
        if (value) void action(refresh);
      }}
    >
      <DialogTrigger className="button">Saves</DialogTrigger>
      <DialogContent ref={dialog} className="save-dialog">
        <DialogHeader>
          <DialogTitle>Saved railways</DialogTitle>
          <DialogDescription>
            Three manual slots, three rotating autosaves and a recovery copy on
            this browser. Export a file to keep a portable backup.
          </DialogDescription>
        </DialogHeader>
        <fieldset ref={fieldset} disabled={busy} className="save-fieldset">
          <label className="save-name">
            Save name
            <input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="save-list">
            {MANUAL_SLOTS.map((slot, i) => {
              const entry = entries.find((e) => e.slot === slot);
              return (
                <section
                  className="save-row"
                  key={slot}
                  aria-label={`Manual slot ${i + 1}`}
                >
                  <div>
                    <strong>
                      Slot {i + 1} · {entry?.name ?? 'Empty'}
                    </strong>
                    <small>
                      {entry
                        ? new Date(entry.date).toLocaleString()
                        : 'Ready for a railway'}
                    </small>
                  </div>
                  <div className="save-row-actions">
                    <button
                      className="button"
                      onClick={() => {
                        const run = async () => {
                          await browserSaveStore().write(
                            slot,
                            simulation.save(),
                            name,
                          );
                          setMessage(`Saved to slot ${i + 1}.`);
                        };
                        if (entry)
                          confirm({
                            label: `Overwrite ${entry.name} in slot ${i + 1}? The previous generation remains available for corruption recovery.`,
                            run,
                          });
                        else void action(run);
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="button"
                      disabled={!entry}
                      onClick={() => requestLoad(slot)}
                    >
                      Load
                    </button>
                  </div>
                </section>
              );
            })}
            {entries
              .filter((e) => !e.slot.startsWith('manual'))
              .map((entry) => (
                <section className="save-row" key={entry.slot}>
                  <div>
                    <strong>
                      {entry.slot === 'recovery' ? 'Recovery' : 'Autosave'} ·{' '}
                      {entry.name}
                    </strong>
                    <small>{new Date(entry.date).toLocaleString()}</small>
                  </div>
                  <button
                    className="button"
                    onClick={() => requestLoad(entry.slot)}
                  >
                    Load
                  </button>
                </section>
              ))}
          </div>
          {pending && (
            <div className="editor-callout">
              <p>{pending.label}</p>
              <div className="save-row-actions">
                <button
                  ref={confirmButton}
                  className="button primary"
                  onClick={() => {
                    const run = pending.run;
                    setPending(null);
                    void action(run);
                  }}
                >
                  Confirm
                </button>
                <button className="button" onClick={() => setPending(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="save-row-actions">
            <button
              className="button"
              onClick={() => {
                try {
                  downloadFile(
                    JSON.stringify(simulation.save()),
                    'steam-atlas-railway.json',
                  );
                  setMessage(
                    'Export requested. Keep the downloaded file as your backup.',
                  );
                } catch {
                  setMessage('Export failed. Please try again.');
                }
              }}
            >
              Export current railway
            </button>
            <button
              className="button"
              onClick={() =>
                confirm({
                  label:
                    'Load a compatible save from the original browser slot? The recovery setting below controls whether your current railway is kept.',
                  run: async () => load(await browserSaveStore().legacy()),
                })
              }
            >
              Load legacy save
            </button>
          </div>
          <label className="save-name">
            Import railway file
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setPending(null);
                await action(async () => {
                  if (file.size > SAVE_LIMIT)
                    throw new Error('This file is too large (maximum 16 MB).');
                  const state = parseRailway(await file.text());
                  setPending({
                    label: `Load ${file.name}? The recovery setting below controls whether your current railway is kept.`,
                    run: () => load(state),
                  });
                });
              }}
            />
          </label>
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={keepRecovery}
              onChange={(e) => {
                setKeepRecovery(e.target.checked);
                setPending(null);
              }}
            />
            Keep a recovery copy before loading
          </label>
          {!keepRecovery && (
            <p className="editor-callout">
              Loading will replace unsaved progress. Export your current railway
              first if you want to keep it.
            </p>
          )}
          <p className="setting-note">
            Autosaves run every two minutes of active play. Loading always
            pauses the railway. If device storage is unavailable, export a file,
            then turn off recovery to load another railway.
          </p>
        </fieldset>
        <output aria-live="polite">
          {busy ? 'Saving or validating railway…' : message}
        </output>
      </DialogContent>
    </Dialog>
  );
}
