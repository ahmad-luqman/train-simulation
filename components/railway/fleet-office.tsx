'use client';
import { useOfficeFocus } from '@/hooks/use-office-focus';
/* eslint-disable react/react-compiler -- Samples the authoritative mutable simulation. */
import { useState } from 'react';
import { X } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import {
  ENGINES,
  UPGRADES,
  buildDepot,
  replaceEngine,
  sellEngine,
  editConsist,
  upgradeEngine,
  resale,
  wagonCapacity,
} from '@/lib/railway/fleet';
import { WAGONS, type Wagon } from '@/lib/railway/economy';
import { engineResearch, RESEARCH } from '@/lib/railway/region';
import { money } from '@/lib/railway/data';
import type { Simulation } from '@/lib/railway/simulation';

export function FleetOffice({
  sim,
  selected,
  select,
  close,
  changed,
}: {
  sim: Simulation;
  selected: number;
  select: (id: number) => void;
  close: () => void;
  changed: () => void;
}) {
  const office = useOfficeFocus(close);
  const [feedback, setFeedback] = useState('');
  const [engine, setEngine] = useState(10);
  const t = sim.trains[selected],
    u = sim.fleet.units[selected],
    spec = ENGINES[u.engine];
  const requiredResearch = engineResearch(engine);
  const locked =
    sim.region.settings.progression &&
    requiredResearch !== null &&
    !sim.region.research.includes(requiredResearch);
  const [draft, setDraft] = useState<Wagon[]>([...u.consist]);
  const [depot, setDepot] = useState(sim.endpoints(t)[0]);
  const act = (fn: () => void, message: string) => {
    try {
      fn();
      setFeedback(message);
      changed();
    } catch (e) {
      setFeedback(
        e instanceof Error ? e.message : 'Unable to complete action.',
      );
    }
  };
  return (
    <section
      ref={office}
      className="network-editor economy-office fleet-office"
      aria-label="Fleet and depots"
    >
      <div className="network-editor-heading">
        <h2>Fleet & depots</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close fleet office"
        >
          <X size={18} />
        </button>
      </div>
      <label>
        Service
        <NativeSelect
          value={selected}
          onChange={(e) => select(Number(e.target.value))}
        >
          {sim.trains.map((train) => (
            <NativeSelectOption key={train.id} value={train.id}>
              {sim.services[train.id].name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <p>
        <strong>{u.owned ? spec.name : 'Vacant engine slot'}</strong> ·{' '}
        {spec.role}
      </p>
      <div className="economy-summary">
        {[
          ['Condition', u.condition],
          ['Coal', u.fuel],
          ['Water', u.water],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{Math.round(Number(value))}%</strong>
            <progress max={100} value={value} />
          </div>
        ))}
      </div>
      {u.detour && (
        <p className="economy-warning">
          Workshop transfer · original service resumes after returning to{' '}
          {sim.network.nodes.find((n) => n.id === u.detour!.origin)?.name}.
        </p>
      )}
      {u.job && (
        <p className="economy-warning">
          {u.job.kind === 'service'
            ? 'Workshop service'
            : 'Coal and water stop'}{' '}
          · {Math.ceil(u.job.remaining)} seconds remaining
        </p>
      )}
      {u.condition < 40 && (
        <p className="economy-warning">
          Worn running gear reduces traction and speed. Arrange a workshop
          visit.
        </p>
      )}
      {u.serviceRequested && !u.job && (
        <p className="economy-warning">
          Service requested. The engine will visit a workshop after delivering
          its cargo.
        </p>
      )}
      <output className="economy-feedback" aria-live="polite">
        {feedback}
      </output>
      <div className="economy-actions">
        <button
          onClick={() =>
            act(
              () => sim.stopForEditing(selected),
              'Stopping at the next station.',
            )
          }
        >
          Stop at next station
        </button>
        <button
          onClick={() =>
            act(() => {
              if (!u.owned) throw new Error('Purchase an engine first.');
              t.held = false;
              t.stopAtStation = false;
            }, 'Service released.')
          }
        >
          Release
        </button>
      </div>
      <Tabs defaultValue="care">
        <TabsList className="economy-tabs">
          <TabsTrigger value="care">Servicing</TabsTrigger>
          <TabsTrigger value="engines">Engines</TabsTrigger>
          <TabsTrigger value="consist">Consist</TabsTrigger>
        </TabsList>
        <TabsContent value="care">
          <label className="fleet-switch" htmlFor="fleet-auto-service">
            Scheduled maintenance
            <Switch
              id="fleet-auto-service"
              checked={u.autoService}
              onCheckedChange={(value) => {
                u.autoService = value;
                changed();
              }}
            />
          </label>
          <label>
            Service below condition
            <NativeSelect
              value={u.serviceAt}
              onChange={(e) => {
                u.serviceAt = Number(e.target.value);
                changed();
              }}
            >
              {[40, 65, 85].map((n) => (
                <NativeSelectOption key={n} value={n}>
                  {n}% ·{' '}
                  {n === 40
                    ? 'Economical'
                    : n === 65
                      ? 'Balanced'
                      : 'Preventive'}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <p className="economy-small">
            Workshop visits take 12–57 seconds and cost $150 plus
            condition-based repair and supplies. Coal and water refill at any
            station below 25%, taking 6 seconds. Protection stays active during
            work.
          </p>
          <button
            onClick={() =>
              act(() => {
                if (!u.owned) throw new Error('Purchase an engine first.');
                u.serviceRequested = true;
              }, 'Workshop visit requested.')
            }
          >
            Request workshop service
          </button>
          <p>
            {u.serviced} completed services · {Math.round(u.downtime)} seconds
            in maintenance
          </p>
          <label>
            Station workshop
            <NativeSelect
              value={depot}
              onChange={(e) => setDepot(Number(e.target.value))}
            >
              {sim.network.stations.map((s) => (
                <NativeSelectOption value={s.node} key={s.id}>
                  {s.name}
                  {sim.fleet.depots.includes(s.node) ? ' · Workshop' : ''}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <button
            disabled={sim.fleet.depots.includes(depot)}
            onClick={() =>
              act(() => buildDepot(sim, depot), 'Workshop opened.')
            }
          >
            Build workshop · $18,000
          </button>
          <p className="economy-small">
            Workshops:{' '}
            {sim.fleet.depots
              .map((n) => sim.network.nodes.find((p) => p.id === n)?.name)
              .join(', ')}
            .
          </p>
        </TabsContent>
        <TabsContent value="engines">
          <label>
            Compare locomotive
            <NativeSelect
              value={engine}
              onChange={(e) => setEngine(Number(e.target.value))}
            >
              {ENGINES.map((e, i) => (
                <NativeSelectOption key={e.name} value={i}>
                  {e.name} · {money(e.price)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <div className="economy-table-scroll">
            <table className="economy-table">
              <thead>
                <tr>
                  <th>Specification</th>
                  <th>Current</th>
                  <th>{ENGINES[engine].name}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Role', spec.role, ENGINES[engine].role],
                  [
                    'Wheel arrangement',
                    spec.type.split(' ')[0],
                    ENGINES[engine].type.split(' ')[0],
                  ],
                  ['Maximum km/h', spec.speed * 5, ENGINES[engine].speed * 5],
                  ['Tractive rating', spec.traction, ENGINES[engine].traction],
                  ['Fuel / distance', spec.fuelRate, ENGINES[engine].fuelRate],
                  [
                    'Reliability',
                    `${Math.round(spec.reliability * 100)}%`,
                    `${Math.round(ENGINES[engine].reliability * 100)}%`,
                  ],
                  [
                    'Upkeep / minute',
                    money(spec.maintenance),
                    money(ENGINES[engine].maintenance),
                  ],
                ].map(([label, a, b]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    <td>{a}</td>
                    <td>{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Trade-in credit {money(resale(sim, selected))}. Net cost{' '}
            {money(ENGINES[engine].price - resale(sim, selected))}.
          </p>
          {locked && (
            <p className="economy-warning">
              Research {RESEARCH[requiredResearch!].name} in Region & goals to
              purchase this engine.
            </p>
          )}
          <div className="economy-actions">
            <button
              disabled={locked}
              onClick={() =>
                act(
                  () => replaceEngine(sim, selected, engine),
                  'Engine purchased. Release to resume the same service.',
                )
              }
            >
              {u.owned ? 'Replace engine' : 'Purchase engine'}
            </button>
            <button
              disabled={!u.owned}
              onClick={() =>
                act(
                  () => sellEngine(sim, selected),
                  'Engine sold. The empty service and wagons are retained.',
                )
              }
            >
              Sell · {money(resale(sim, selected))}
            </button>
          </div>
          <p className="economy-small">
            Heavy engines climb with loaded freight; express engines favor speed
            on easier lines. Purchases and replacements require a stationary
            train.
          </p>
          <label>
            Upgrade · current: {u.upgrade}
            <NativeSelect
              value={u.upgrade}
              onChange={(e) =>
                act(
                  () =>
                    upgradeEngine(
                      sim,
                      selected,
                      e.target.value as keyof typeof UPGRADES,
                    ),
                  'Upgrade installed.',
                )
              }
            >
              {Object.entries(UPGRADES).map(([key, v]) => (
                <NativeSelectOption key={key} value={key}>
                  {v.label} · {money(v.price)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </TabsContent>
        <TabsContent value="consist">
          <p>
            {wagonCapacity(sim, selected)} total units · three to six wagons, in
            displayed order. Each departure loads one compatible cargo into its
            matching wagons.
          </p>
          {draft.map((w, i) => (
            <label key={i}>
              Wagon {i + 1}
              <NativeSelect
                value={w}
                onChange={(e) =>
                  setDraft(
                    draft.map((old, j) =>
                      i === j ? (e.target.value as Wagon) : old,
                    ),
                  )
                }
              >
                {Object.entries(WAGONS).map(([key, v]) => (
                  <NativeSelectOption key={key} value={key}>
                    {v.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          ))}
          <p className="economy-small">
            Refit $850 per changed wagon. Removing a wagon gives no refund.
            Deliver all cargo and stop before editing.
          </p>
          <div className="economy-actions">
            <button
              onClick={() =>
                act(() => editConsist(sim, selected, draft), 'Consist updated.')
              }
            >
              Apply consist ·{' '}
              {money(
                draft.reduce(
                  (n, w, i) => n + (w === u.consist[i] ? 0 : 850),
                  0,
                ),
              )}
            </button>
            <button
              disabled={draft.length <= 3}
              onClick={() => setDraft(draft.slice(0, -1))}
            >
              Remove last
            </button>
            <button
              disabled={t.cars >= 6}
              onClick={() =>
                act(() => {
                  if (!sim.addCar(selected))
                    throw new Error(
                      'Stop with enough funds and a clear rear approach.',
                    );
                  setDraft([...u.consist]);
                }, 'Wagon added.')
              }
            >
              Add wagon · $8,500
            </button>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
