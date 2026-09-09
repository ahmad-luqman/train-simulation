'use client';
/* eslint-disable react/react-compiler -- Samples the authoritative mutable simulation. */
import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { locomotives } from '@/lib/railway/data';
import { nodeAt } from '@/lib/railway/network';
import {
  consistLength,
  METRES_PER_UNIT,
  performance,
  speedKmh,
  type DispatchSettings,
} from '@/lib/railway/dispatch';
import type { Simulation } from '@/lib/railway/simulation';

export function Dispatcher({
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
  const [settings, setSettings] = useState<DispatchSettings>(() =>
    structuredClone(sim.settings(selected)),
  );
  const [feedback, setFeedback] = useState('');
  const snapshot = sim.dispatcherSnapshot(),
    train = sim.trains[selected],
    edge = sim.track(train);
  const physics = performance(
    selected,
    train.cars,
    train.load,
    edge,
    sim.endpoints(train)[0],
  );
  function act(action: () => void, message: string) {
    try {
      action();
      setFeedback(message);
      changed();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'The command could not be completed.',
      );
    }
  }
  return (
    <section
      className="network-editor dispatcher"
      aria-label="Railway dispatcher"
    >
      <div className="network-editor-heading">
        <h2>Dispatcher</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dispatcher"
        >
          <X size={18} />
        </button>
      </div>
      <div className="dispatch-summary">
        <div>
          <strong>{snapshot.throughput.toFixed(1)}</strong>
          <span>calls / min</span>
        </div>
        <div>
          <strong>{Math.round(snapshot.punctuality)}%</strong>
          <span>on-time departures</span>
        </div>
        <div>
          <strong>{snapshot.waits.length}</strong>
          <span>waiting / held</span>
        </div>
      </div>
      <p className="editor-hint">
        Automatic dispatch favors passenger services; waiting trains gain
        priority. “Dispatch next” moves a train to the front of the queue when
        its route is safe.
      </p>
      {snapshot.cycles.map((cycle) => (
        <div className="editor-warning" key={cycle.join('-')}>
          <strong>Circular wait</strong>
          <p>{cycle.map((id) => locomotives[id].name).join(' → ')}</p>
          <p>
            Release a held train, choose a free parallel track before departure,
            or turn a stopped train back to clear the junction. Additional
            platforms can relieve a platform queue.
          </p>
        </div>
      ))}
      <h3>Live blocks</h3>
      <svg
        className="dispatch-map"
        viewBox="-100 -100 200 200"
        aria-label="Track block occupancy: orange occupied, green clear"
      >
        {sim.network.edges.map((e) => (
          <polyline
            key={e.id}
            points={e.points.map((p) => `${p.x},${p.z}`).join(' ')}
            fill="none"
            stroke={sim.occupied.has(e.id) ? '#b15c22' : '#397758'}
            strokeWidth={e.id === edge.id ? 2 : 1}
          >
            <title>
              {e.id}:{' '}
              {sim.occupied.has(e.id)
                ? locomotives[sim.occupied.get(e.id)!].name
                : 'Clear'}
            </title>
          </polyline>
        ))}
        {sim.network.nodes.map((n) => (
          <circle key={n.id} cx={n.x} cy={n.z} r="2" fill="#273c30">
            <title>{n.name}</title>
          </circle>
        ))}
      </svg>
      <details>
        <summary>Occupancy ledger ({snapshot.reservations.length})</summary>
        <ul className="dispatch-ledger">
          {snapshot.reservations.map((r) => (
            <li key={r.resource}>
              <span>{r.resource}</span>
              <button onClick={() => select(r.owner)}>
                {locomotives[r.owner].name}
              </button>
              <small>
                {r.releaseAt === null
                  ? 'Reserved'
                  : `${(Math.max(0, r.releaseAt - sim.trains[r.owner].motion.travelled) * METRES_PER_UNIT).toFixed(1)} m to rear clearance`}
              </small>
            </li>
          ))}
        </ul>
      </details>
      <h3>Queues & delays</h3>
      {!snapshot.waits.length && <p>All routes are flowing.</p>}
      <ul className="dispatch-ledger">
        {snapshot.waits.map((wait) => (
          <li key={wait.id}>
            <button onClick={() => select(wait.id)}>
              {locomotives[wait.id].name}
            </button>
            <span>{wait.message}</span>
            <small>{Math.floor(wait.seconds)} s waiting</small>
          </li>
        ))}
      </ul>
      <h3>Service control</h3>
      <label>
        Train
        <NativeSelect
          value={selected}
          onChange={(e) => select(Number(e.target.value))}
        >
          {locomotives.map((l, id) => (
            <NativeSelectOption key={id} value={id}>
              {l.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <p>
        {speedKmh(train.motion.velocity).toFixed(1)} km/h ·{' '}
        {Math.round(physics.mass)} t ·{' '}
        {(consistLength(train.cars) * METRES_PER_UNIT).toFixed(0)} m long
        <br />
        Last departure: {train.motion.lateness.toFixed(1)} s late
      </p>
      <div className="editor-actions">
        <button
          className="button"
          onClick={() =>
            act(
              () => {
                train.held = !train.held;
                train.stopAtStation = false;
              },
              train.held
                ? 'Train released.'
                : 'Train held; reservations retained.',
            )
          }
        >
          {train.held ? 'Release' : 'Hold'}
        </button>
        <button
          className="button"
          onClick={() =>
            act(
              () => sim.prioritize(selected),
              'Priority granted for the next safe departure.',
            )
          }
        >
          Dispatch next
        </button>
        <button
          className="button"
          onClick={() =>
            act(
              () => sim.stopForEditing(selected),
              'The train will stop for service editing at its next station.',
            )
          }
        >
          Stop at next station
        </button>
      </div>
      {sim.parallelOptions(selected).map((e) => (
        <button
          className="button editor-full"
          key={e.id}
          onClick={() =>
            act(
              () => sim.useParallel(selected, e.id),
              `Next departure routed over ${e.id}.`,
            )
          }
        >
          Use parallel track {e.id}
        </button>
      ))}
      <button
        className="button editor-full"
        disabled={!sim.canTurnBack(selected)}
        onClick={() =>
          act(
            () => sim.turnBack(selected),
            'Train reversing toward the previous station. Its service is now a recovery shuttle.',
          )
        }
      >
        Turn back to previous station
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act(
            () => sim.configureDispatch(selected, settings),
            'Timetable saved. Occupied platforms remain protected.',
          );
        }}
      >
        <label htmlFor="dispatch-priority">
          Priority
          <NativeSelect
            id="dispatch-priority"
            value={settings.priority}
            onChange={(e) =>
              setSettings({
                ...settings,
                priority: e.target.value as DispatchSettings['priority'],
              })
            }
          >
            <NativeSelectOption value="passenger">Passenger</NativeSelectOption>
            <NativeSelectOption value="freight">Freight</NativeSelectOption>
          </NativeSelect>
        </label>
        <div className="editor-columns">
          {(
            [
              ['firstDeparture', 'First departure (elapsed s)', 1e9],
              ['interval', 'Repeat every (s; 0 = ready)', 3600],
              ['headway', 'Minimum headway (s)', 300],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key}>
              {label}
              <Input
                type="number"
                min="0"
                max={max}
                step="0.5"
                value={settings[key]}
                onChange={(e) =>
                  setSettings({ ...settings, [key]: e.target.valueAsNumber })
                }
                required
              />
            </label>
          ))}
        </div>
        <p className="editor-hint">
          Railway clock: {sim.elapsed.toFixed(1)} s. Dwell and departure slots
          use simulation time. On time means within 2 s of the planned
          departure; headway is measured on the same track and direction.
        </p>
        {sim.services[selected].stops.map((node) => {
          const station = sim.network.stations.find((s) => s.node === node)!;
          return (
            <label key={node}>
              {station.name} platform
              <NativeSelect
                value={settings.platforms[String(node)] ?? ''}
                onChange={(e) => {
                  const platforms = { ...settings.platforms };
                  if (e.target.value) platforms[String(node)] = e.target.value;
                  else delete platforms[String(node)];
                  setSettings({ ...settings, platforms });
                }}
              >
                <NativeSelectOption value="">Automatic</NativeSelectOption>
                {station.platforms.map((p, i) => (
                  <NativeSelectOption key={p} value={p}>
                    Platform {i + 1}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          );
        })}
        <button className="button primary editor-full" type="submit">
          Save timetable
        </button>
      </form>
      <h3>Track direction</h3>
      <p className="editor-hint">
        Direction changes require an empty track. Trains already assigned to the
        opposite direction will wait for a route change.
      </p>
      {sim.network.edges.map((e) => (
        <label key={e.id}>
          {nodeAt(sim.network, e.a).name} → {nodeAt(sim.network, e.b).name} ·{' '}
          {e.id}
          <NativeSelect
            value={e.direction ?? 'both'}
            onChange={(event) =>
              act(
                () =>
                  sim.setDirection(
                    e.id,
                    event.target.value as 'both' | 'a-to-b' | 'b-to-a',
                  ),
                'Track direction updated.',
              )
            }
          >
            <NativeSelectOption value="both">
              Both directions
            </NativeSelectOption>
            <NativeSelectOption value="a-to-b">Forward only</NativeSelectOption>
            <NativeSelectOption value="b-to-a">Reverse only</NativeSelectOption>
          </NativeSelect>
        </label>
      ))}
      {feedback && <output className="editor-feedback">{feedback}</output>}
    </section>
  );
}
