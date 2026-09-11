import { Simulation } from './simulation';

export const SAVE_LIMIT = 16 * 1024 * 1024;
export const MANUAL_SLOTS = ['manual-1', 'manual-2', 'manual-3'] as const;
export const AUTO_SLOTS = ['auto-1', 'auto-2', 'auto-3'] as const;
export type SaveSlot =
  | (typeof MANUAL_SLOTS)[number]
  | (typeof AUTO_SLOTS)[number]
  | 'recovery';
export type StorageLike = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  exclusive?: (run: () => Promise<void>) => Promise<void>;
};
type RecordData = {
  format: 1;
  sequence: number;
  date: string;
  name: string;
  payload: string;
  checksum: string;
};
export type SaveEntry = {
  slot: SaveSlot;
  name: string;
  date: string;
  sequence: number;
};
const prefix = 'steam-atlas-library-1:';
function checksum(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function parseRailway(text: string) {
  if (text.length > SAVE_LIMIT)
    throw new Error('This file is too large (maximum 16 MB).');
  const parsed: unknown = JSON.parse(text);
  const sim = new Simulation();
  sim.restore(parsed);
  return sim.save();
}
/** Two independently committed generations. A failed write never removes the previous save. */
export class SaveStore {
  constructor(private storage: StorageLike) {}
  private async records(slot: SaveSlot) {
    const records: { bank: number; record: RecordData }[] = [];
    for (const bank of [0, 1]) {
      const raw = await this.storage.getItem(`${prefix}${slot}:${bank}`);
      if (!raw) continue;
      try {
        const r = JSON.parse(raw) as RecordData;
        if (
          r.format !== 1 ||
          !Number.isSafeInteger(r.sequence) ||
          r.sequence < 1 ||
          typeof r.payload !== 'string' ||
          r.payload.length > SAVE_LIMIT ||
          r.checksum !== checksum(r.payload) ||
          typeof r.name !== 'string' ||
          !Number.isFinite(Date.parse(r.date))
        )
          continue;
        records.push({ bank, record: r });
      } catch {
        /* Retain malformed bytes; the other generation can still recover. */
      }
    }
    return records.sort((a, b) => b.record.sequence - a.record.sequence);
  }
  async list(): Promise<SaveEntry[]> {
    const result: SaveEntry[] = [];
    for (const slot of [...MANUAL_SLOTS, ...AUTO_SLOTS, 'recovery' as const]) {
      const r = (await this.records(slot))[0];
      if (r)
        result.push({
          slot,
          name: r.record.name,
          date: r.record.date,
          sequence: r.record.sequence,
        });
    }
    return result;
  }
  async write(
    slot: SaveSlot,
    state: ReturnType<Simulation['save']>,
    name: string,
  ) {
    const run = () => this.commit(slot, state, name);
    return this.storage.exclusive ? this.storage.exclusive(run) : run();
  }
  private async commit(
    slot: SaveSlot,
    state: ReturnType<Simulation['save']>,
    name: string,
  ) {
    const records = await this.records(slot);
    const payload = JSON.stringify(state);
    if (payload.length > SAVE_LIMIT)
      throw new Error(
        'This railway exceeds the save size limit. Export it before continuing.',
      );
    const record: RecordData = {
      format: 1,
      sequence: (records[0]?.record.sequence ?? 0) + 1,
      date: new Date().toISOString(),
      name: name.trim().slice(0, 60) || 'My railway',
      payload,
      checksum: checksum(payload),
    };
    const bank = records[0]?.bank === 0 ? 1 : 0;
    await this.storage.setItem(
      `${prefix}${slot}:${bank}`,
      JSON.stringify(record),
    );
  }
  async load(slot: SaveSlot) {
    for (const { record } of await this.records(slot)) {
      try {
        return { state: parseRailway(record.payload), name: record.name };
      } catch {
        /* Try the previous complete and physically valid generation. */
      }
    }
    throw new Error(
      'No valid save in this slot. Try an autosave, recovery copy, or imported file.',
    );
  }
  async autosave(state: ReturnType<Simulation['save']>) {
    const run = async () => {
      const entries = (await this.list()).filter((e) =>
        (AUTO_SLOTS as readonly string[]).includes(e.slot),
      );
      const slot =
        AUTO_SLOTS.find((s) => !entries.some((e) => e.slot === s)) ??
        entries.sort(
          (a, b) => a.sequence - b.sequence || a.slot.localeCompare(b.slot),
        )[0].slot;
      await this.commit(
        slot,
        state,
        `${state.region.mode} · ${Math.floor(state.elapsed / 60)} min`,
      );
    };
    return this.storage.exclusive ? this.storage.exclusive(run) : run();
  }
  async legacy() {
    for (let version = 8; version >= 5; version--) {
      const raw = await this.storage.getItem(`steam-atlas-save-v${version}`);
      if (!raw) continue;
      try {
        return parseRailway(raw);
      } catch {
        /* Preserve old slots and try earlier supported versions. */
      }
    }
    throw new Error(
      'No compatible legacy save found. Original browser saves are preserved.',
    );
  }
}
