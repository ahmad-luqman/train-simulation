'use client';
/* eslint-disable react/react-compiler -- Samples the authoritative mutable simulation. */
import { useMemo, useState } from 'react';
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
import { sample } from '@/lib/railway/topology';
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
  const [showSafety, setShowSafety] = useState(false);
  const [selectedLine, setSelectedLine] = useState('');
  const topology = sim.topology;
  const plan = useMemo(() => {
    let minX = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxZ = -Infinity;
    for (const section of topology.sections.values()) {
      for (const point of section.points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
      }
    }
    const width = maxX - minX + 64,
      height = maxZ - minZ + 64;
    return {
      viewBox: `${minX - 32} ${minZ - 32} ${width} ${height}`,
      aspectRatio: `${width} / ${height}`,
    };
  }, [topology]);
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
        priority. Each departure reserves a reachable platform. Requests retry
        together once per second so older requests compete fairly.{' '}
        {snapshot.queued} trains await protected depot admission.
      </p>
      {snapshot.cycles.map((cycle) => (
        <div className="editor-warning" key={cycle.join('-')}>
          <strong>Circular wait</strong>
          <p>{cycle.map((id) => locomotives[id].name).join(' → ')}</p>
          <p>
            Release a held train or add a physical platform at the blocked
            destination. Automatic routing checks alternate paths before
            departure; occupied movements remain protected.
          </p>
        </div>
      ))}
      <h3>Running lines & station approaches</h3>
      <label>
        Inspect track{' '}
        <NativeSelect
          value={selectedLine}
          onChange={(e) => setSelectedLine(e.target.value)}
        >
          <NativeSelectOption value="">
            Selected train’s route
          </NativeSelectOption>
          {sim.network.edges.map((e) => (
            <NativeSelectOption key={e.id} value={e.id}>
              {sim.resourceLabel(`block:${e.id}`)} · {e.id}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <svg
        className="dispatch-map"
        viewBox={plan.viewBox}
        style={{ aspectRatio: plan.aspectRatio }}
        aria-label="Physical running lines, station approaches and reserved route"
      >
        <defs>
          <marker
            id="dispatch-arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        {[...sim.topology.sections.values()].map((section) => {
          const reserved = snapshot.reservations.some(
            (r) =>
              r.resource === `section:${section.id}` ||
              (section.edge && r.resource === `block:${section.edge}`),
          );
          const chosen = train.motion.physical.route?.sections.some(
            (s) => s.section === section.id,
          );
          const line = sim.network.edges.find((e) => e.id === section.edge);
          const mid = sample(section, section.length * 0.5),
            next = sample(section, section.length * 0.5 + 1);
          return (
            <g key={section.id}>
              <polyline
                points={section.points.map((p) => `${p.x},${p.z}`).join(' ')}
                fill="none"
                stroke={chosen ? '#7752a0' : reserved ? '#b15c22' : '#397758'}
                strokeWidth={line?.id === selectedLine ? 2 : chosen ? 1.4 : 0.6}
                strokeDasharray={line?.kind === 'parallel' ? '3 1' : undefined}
              >
                <title>
                  {section.platform
                    ? sim.resourceLabel(`platform:${section.platform}`)
                    : section.edge
                      ? sim.resourceLabel(`block:${section.edge}`)
                      : section.kind === 'crossover'
                        ? 'Controlled crossover'
                        : section.id.startsWith('departure:')
                          ? 'Return loop'
                          : section.id.startsWith('arrival:')
                            ? 'Platform fan'
                            : 'Station throat'}{' '}
                  · {reserved ? 'Reserved' : 'Clear'}
                </title>
              </polyline>
              {line && line.direction && line.direction !== 'both' && (
                <line
                  x1={mid.p.x}
                  y1={mid.p.z}
                  x2={next.p.x}
                  y2={next.p.z}
                  stroke="#273c30"
                  markerEnd={
                    line.direction === 'a-to-b'
                      ? 'url(#dispatch-arrow)'
                      : undefined
                  }
                  markerStart={
                    line.direction === 'b-to-a'
                      ? 'url(#dispatch-arrow)'
                      : undefined
                  }
                />
              )}
            </g>
          );
        })}
        {sim.network.nodes.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.z} r="3.4" fill="#273c30" />
            <text
              x={n.x}
              y={n.z - 10}
              textAnchor="middle"
              fontSize="18"
              stroke="#e1e8d9"
              strokeWidth="3"
              paintOrder="stroke"
            >
              {n.name}
            </text>
          </g>
        ))}
        {sim.trains
          .filter((t) => sim.visible(t))
          .map((t) => {
            const p = sim.vehiclePosition(t, 0).p;
            return (
              <circle
                key={t.id}
                cx={p.x}
                cy={p.z}
                r="3"
                fill={t.id === selected ? '#7752a0' : '#273c30'}
              >
                <title>{locomotives[t.id].name}</title>
              </circle>
            );
          })}
        {train.motion.physical.route &&
          (() => {
            const p = sim.topology.pose(
              train.motion.physical.route!.sections,
              train.motion.physical.stopTarget,
            ).p;
            return (
              <circle cx={p.x} cy={p.z} r="4.6" stroke="#b15c22" fill="none">
                <title>Protected stopping target</title>
              </circle>
            );
          })()}
        {showSafety &&
          snapshot.zones.flatMap((zone) =>
            zone.sections.map((id, index) => {
              const section = sim.topology.sections.get(id)!;
              const interval = zone.intervals[index];
              if (
                !train.motion.physical.route?.sections.some(
                  (part) => part.section === id,
                )
              )
                return null;
              const points = Array.from(
                {
                  length: Math.max(
                    2,
                    Math.ceil(interval.end - interval.start) + 1,
                  ),
                },
                (_, i) => i,
              );
              return (
                <polyline
                  key={`${zone.id}:${id}`}
                  points={points
                    .map((_, i) => {
                      const p = sample(
                        section,
                        interval.start +
                          ((interval.end - interval.start) * i) /
                            (points.length - 1),
                      ).p;
                      return `${p.x},${p.z}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#b52235"
                  strokeWidth="1.5"
                  opacity=".25"
                />
              );
            }),
          )}
        {showSafety &&
          snapshot.physical.map((e) => (
            <rect
              key={`${e.train}:${e.vehicle}`}
              x={e.p.x - e.halfWidth - e.margin}
              y={e.p.z - e.halfLength - e.margin}
              width={2 * (e.halfWidth + e.margin)}
              height={2 * (e.halfLength + e.margin)}
              transform={`rotate(${(-e.angle * 180) / Math.PI} ${e.p.x} ${e.p.z})`}
              fill="none"
              stroke="#b52235"
              strokeWidth=".25"
            />
          ))}
      </svg>
      <p className="editor-hint">
        Solid: main line · dashed: second line · purple: selected route · ring:
        stopping target. Through platforms feed protected return loops; normal
        services keep the locomotive in front.
      </p>
      <label htmlFor="dispatch-safety">
        <Input
          id="dispatch-safety"
          type="checkbox"
          checked={showSafety}
          onChange={(e) => setShowSafety(e.target.checked)}
        />{' '}
        Show vehicle clearance envelopes
      </label>
      <p>
        {train.motion.physical.decision ??
          (train.motion.physical.queued
            ? 'Awaiting a clear depot entry.'
            : 'Waiting at a physical platform.')}
      </p>
      {train.motion.physical.route && (
        <p>
          Braking target:{' '}
          {(
            (train.motion.physical.stopTarget - train.motion.physical.at) *
            METRES_PER_UNIT
          ).toFixed(1)}{' '}
          m ahead ·{' '}
          {sim.resourceLabel(
            `platform:${train.motion.physical.route.destination}`,
          )}
        </p>
      )}
      <details>
        <summary>Occupancy ledger ({snapshot.reservations.length})</summary>
        <ul className="dispatch-ledger">
          {snapshot.reservations.map((r) => (
            <li key={r.resource}>
              <span>{sim.resourceLabel(r.resource)}</span>
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
            <span>
              {wait.message}
              {wait.owners.length > 0 &&
                ` Waiting for: ${wait.owners.map((id) => locomotives[id].name).join(', ')}`}
            </span>
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
      {(sim.network.crossovers ?? []).map((c) => (
        <button
          className="button editor-full"
          key={c.id}
          disabled={train.motion.started}
          onClick={() =>
            act(
              () => sim.useCrossover(selected, c.id),
              'Crossover requested for the next safe departure.',
            )
          }
        >
          Request crossover · {sim.resourceLabel(`block:${c.main}`)}
        </button>
      ))}
      <button
        className="button editor-full"
        disabled={!sim.canTurnBack(selected)}
        onClick={() =>
          act(
            () => sim.turnBack(selected),
            'Train returning to its previous platform. Its original service is retained.',
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
