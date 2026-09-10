'use client';
/* eslint-disable react/react-compiler -- This panel samples the imperative simulation, like the game shell. */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent,
} from 'react';
import {
  X,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Hammer,
  Route,
} from 'lucide-react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { locomotives, money } from '@/lib/railway/data';
import {
  edgeAt,
  nodeAt,
  planService,
  snapNode,
  type Construction,
  type Service,
  type Point,
} from '@/lib/railway/network';
import { MAP, BUILD_VIEWBOX, MAP_SCALE } from '@/lib/railway/map';
import { metres, METRES_PER_UNIT } from '@/lib/railway/units';
import { height, riverX } from '@/lib/railway/terrain';
import type { Simulation } from '@/lib/railway/simulation';
import type { RailwayWorld } from '@/lib/railway/world';

type Props = {
  sim: Simulation;
  world: RailwayWorld | null;
  selected: number;
  tick: number;
  close: () => void;
  changed: () => void;
};
const pathData = (points: Pick<Point, 'x' | 'z'>[]) =>
  points
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.z.toFixed(2)}`)
    .join(' ');
export function NetworkEditor({
  sim,
  world,
  selected,
  tick,
  close,
  changed,
}: Props) {
  'use no memo';
  const [tab, setTab] = useState('build'),
    [start, setStart] = useState(3),
    [end, setEnd] = useState<Construction['end']>({
      x: -80 * MAP_SCALE,
      z: 10 * MAP_SCALE,
    }),
    [bend, setBend] = useState(0),
    [kind, setKind] = useState<Construction['kind']>('track'),
    [parent, setParent] = useState('0-1'),
    [stationName, setStationName] = useState(''),
    [pick, setPick] = useState<'start' | 'end'>('end'),
    [overlay, setOverlay] = useState<
      'off' | 'connectivity' | 'gradient' | 'cost'
    >('connectivity'),
    [message, setMessage] = useState(''),
    [trainId, setTrainId] = useState(selected),
    [serviceName, setServiceName] = useState(sim.services[selected].name),
    [stops, setStops] = useState<number[]>([...sim.services[selected].stops]),
    [dwell, setDwell] = useState(sim.services[selected].dwell),
    [stop, setStop] = useState(0),
    [preferred, setPreferred] = useState<string[]>([]),
    [stationNode, setStationNode] = useState(0),
    [workName, setWorkName] = useState('New station'),
    [remove, setRemove] = useState('');
  const network = sim.network,
    revision = sim.revision;
  const input = useMemo<Construction>(
    () => ({ start, end, bend, kind, parent, stationName }),
    [start, end, bend, kind, parent, stationName],
  );
  // Refresh occupancy/funds on every sampled tick, but reuse expensive geometry
  // for rendering unless the proposed alignment or actual network changes.
  const quote = useMemo(() => {
    void revision;
    void tick;
    return sim.quote(input);
  }, [sim, input, revision, tick]);
  const proposal = useMemo<{ service?: Service; error?: string }>(() => {
    void revision;
    try {
      return {
        service: planService(
          sim.network,
          trainId,
          serviceName,
          stops,
          dwell,
          preferred,
        ),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Invalid service.' };
    }
  }, [sim, revision, trainId, serviceName, stops, dwell, preferred]);
  useEffect(() => {
    world?.setConstructionPreview(
      tab === 'build' ? quote.edge : undefined,
      quote.errors.length === 0,
    );
  }, [world, tab, quote.edge, quote.errors.length]);
  useEffect(() => {
    world?.setServicePreview(tab === 'service' ? proposal.service : undefined);
  }, [world, tab, proposal]);
  useEffect(() => {
    world?.setNetworkOverlay(overlay);
  }, [world, overlay]);
  useEffect(
    () => () => {
      world?.setConstructionPreview();
      world?.setServicePreview();
      world?.setNetworkOverlay('off');
      if (world) world.onMapPoint = undefined;
    },
    [world],
  );
  const choosePoint = useCallback(
    (x: number, z: number) => {
      const node = snapNode(sim.network, x, z);
      if (pick === 'start') {
        if (!node) {
          setMessage(
            'Start at an existing endpoint. Click a labeled node or use the Start selector.',
          );
          return;
        }
        setStart(node.id);
        setPick('end');
      } else setEnd(node?.id ?? { x: Math.round(x), z: Math.round(z) });
    },
    [sim, pick],
  );
  useEffect(() => {
    if (world)
      world.onMapPoint =
        tab === 'build' && !['loop', 'parallel'].includes(kind)
          ? choosePoint
          : undefined;
    return () => {
      if (world) world.onMapPoint = undefined;
    };
  }, [world, tab, kind, choosePoint]);
  function clickMap(e: PointerEvent<SVGSVGElement>) {
    if (tab !== 'build' || ['loop', 'parallel'].includes(kind)) return;
    const svg = e.currentTarget,
      matrix = svg.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    const nearby = snapNode(
      sim.network,
      p.x,
      p.y,
      Math.max(5, 14 / Math.hypot(matrix.a, matrix.b)),
    );
    choosePoint(nearby?.x ?? p.x, nearby?.z ?? p.y);
  }
  function action(fn: () => void, success: string) {
    try {
      fn();
      changed();
      setMessage(success);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'This action could not be completed.',
      );
    }
  }
  const destination = typeof end === 'number' ? nodeAt(network, end) : end;
  const main = network.edges.filter((e) => e.kind === 'track');
  const routeEdges = new Set(proposal.service?.legs.map((l) => l.edge));
  const disconnected = network.nodes.filter(
    (n) => !network.edges.some((e) => e.a === n.id || e.b === n.id),
  );
  const train = sim.trains[trainId],
    current = nodeAt(network, sim.endpoints(train)[0]);
  const totalSpend = sim.construction.reduce((sum, r) => sum + r.amount, 0);
  return (
    <aside
      className="network-editor"
      aria-label="Railway construction and services"
    >
      <div className="network-editor-heading">
        <div>
          <span className="eyebrow">RAILWAY OFFICE</span>
          <h2>Build & route</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close railway editor"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(String(value));
          setMessage('');
        }}
      >
        <TabsList aria-label="Railway editor tools">
          <TabsTrigger value="build">
            <Hammer size={15} />
            Build
          </TabsTrigger>
          <TabsTrigger value="service">
            <Route size={15} />
            Services
          </TabsTrigger>
          <TabsTrigger value="manage">Infrastructure</TabsTrigger>
        </TabsList>
        <label htmlFor="railway-editor-field-1" className="editor-inline">
          Network overlay
          <NativeSelect
            id="railway-editor-field-1"
            aria-label="Network overlay"
            value={overlay}
            onChange={(e) => setOverlay(e.target.value as typeof overlay)}
          >
            <NativeSelectOption value="connectivity">
              Connectivity
            </NativeSelectOption>
            <NativeSelectOption value="gradient">Gradients</NativeSelectOption>
            <NativeSelectOption value="cost">
              Construction cost
            </NativeSelectOption>
            <NativeSelectOption value="off">Off</NativeSelectOption>
          </NativeSelect>
        </label>
        <svg
          className="construction-map"
          viewBox={BUILD_VIEWBOX}
          aria-label="Editable network plan. Use the endpoint selectors and coordinates below for keyboard input."
          onPointerDown={clickMap}
        >
          <title>Meridian track plan</title>
          <defs>
            <pattern
              id="network-grid"
              width="10"
              height="10"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M10 0H0V10"
                fill="none"
                stroke="#425f52"
                strokeWidth=".2"
              />
            </pattern>
          </defs>
          <rect
            x={-MAP.halfWidth}
            y={-MAP.halfDepth}
            width={MAP.halfWidth * 2}
            height={MAP.halfDepth * 2}
            fill="url(#network-grid)"
          />
          <path
            d={pathData(
              Array.from({ length: 83 }, (_, i) => ({
                x: riverX(-MAP.halfDepth + (i * MAP.halfDepth) / 41),
                z: -MAP.halfDepth + (i * MAP.halfDepth) / 41,
              })),
            )}
            stroke="#467b82"
            strokeWidth="12"
            fill="none"
          />
          {network.edges.map((edge) => (
            <g key={edge.id}>
              <path
                d={pathData(edge.points)}
                fill="none"
                stroke={
                  tab === 'service' && routeEdges.has(edge.id)
                    ? '#f8d68c'
                    : overlay === 'gradient' && edge.grade > 0.025
                      ? '#ffae67'
                      : overlay === 'cost' && edge.cost.total > 35000
                        ? '#ffbc61'
                        : edge.built
                          ? '#70e6ab'
                          : '#a5bdac'
                }
                strokeWidth={
                  tab === 'service' && routeEdges.has(edge.id) ? 1.5 : 0.8
                }
              />
              <title>
                {edge.id} · {metres(edge.length).toFixed(1)} m ·{' '}
                {(edge.grade * 100).toFixed(1)}% · {money(edge.cost.total)}
              </title>
            </g>
          ))}
          {tab === 'build' && quote.edge && (
            <path
              d={pathData(quote.edge.points)}
              fill="none"
              stroke={quote.errors.length ? '#ff927c' : '#92ffc4'}
              strokeWidth="1.8"
              strokeDasharray="3 1.5"
            />
          )}
          {network.nodes.map((n) => (
            <g key={n.id}>
              <circle
                cx={n.x}
                cy={n.z}
                r={n.id === start && tab === 'build' ? 5.2 : 3.2}
                fill={
                  disconnected.includes(n)
                    ? '#ff927c'
                    : network.stations.some((s) => s.node === n.id)
                      ? '#f9dfaa'
                      : '#9ce0c1'
                }
              />
              <text
                x={n.x}
                y={n.z - 10}
                textAnchor="middle"
                fontSize="18"
                fill="#eff2df"
                stroke="#233f34"
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
              return <circle key={t.id} cx={p.x} cy={p.z} r=".9" fill="#fff" />;
            })}
        </svg>
        <p className="editor-hint">
          {overlay === 'gradient'
            ? 'Amber: grades above 2.5%. Maximum new grade: 4%.'
            : overlay === 'cost'
              ? 'Amber: track costing over $35,000. Green: other player track.'
              : 'Gold nodes: stations · green tracks: player built · red nodes: disconnected'}
        </p>
        {disconnected.length > 0 && (
          <p className="editor-warning">
            Disconnected: {disconnected.map((n) => n.name).join(', ')}
          </p>
        )}
        <TabsContent value="build">
          <p>
            Choose a start, then click the plan or the valley to draw an
            endpoint. Nearby endpoints snap within 28 m.
          </p>
          <label htmlFor="railway-editor-field-2">
            Construction
            <NativeSelect
              id="railway-editor-field-2"
              value={kind}
              onChange={(e) => {
                const next = e.target.value as typeof kind;
                setKind(next);
                if (['loop', 'parallel'].includes(next)) {
                  const p = edgeAt(network, parent) ?? main[0];
                  setParent(p.id);
                  setStart(p.a);
                  setEnd(p.b);
                  setStationName('');
                }
              }}
            >
              <NativeSelectOption value="track">
                Track connection
              </NativeSelectOption>
              <NativeSelectOption value="siding">
                Siding with buffer stop
              </NativeSelectOption>
              <NativeSelectOption value="loop">
                Passing loop preset
              </NativeSelectOption>
              <NativeSelectOption value="parallel">
                Second running line
              </NativeSelectOption>
            </NativeSelect>
          </label>
          {['loop', 'parallel'].includes(kind) ? (
            <>
              <label htmlFor="railway-editor-field-3">
                Parent corridor
                <NativeSelect
                  id="railway-editor-field-3"
                  value={parent}
                  onChange={(e) => {
                    const p = edgeAt(network, e.target.value);
                    setParent(p.id);
                    setStart(p.a);
                    setEnd(p.b);
                  }}
                >
                  {main.map((e) => (
                    <NativeSelectOption key={e.id} value={e.id}>
                      {nodeAt(network, e.a).name} → {nodeAt(network, e.b).name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <label htmlFor="railway-editor-field-4">
                Track side
                <NativeSelect
                  id="railway-editor-field-4"
                  value={bend < 0 ? 'left' : 'right'}
                  onChange={(e) =>
                    setBend(e.target.value === 'left' ? -12 : 12)
                  }
                >
                  <NativeSelectOption value="right">
                    Right of main track
                  </NativeSelectOption>
                  <NativeSelectOption value="left">
                    Left of main track
                  </NativeSelectOption>
                </NativeSelect>
              </label>
              <p className="editor-hint">
                Separate running line with physical station connections. The
                second line opens for reverse traffic; change directions in
                Dispatcher after both lines clear. Track and bridge costs
                include the added line.
              </p>
            </>
          ) : (
            <>
              <label htmlFor="railway-editor-field-5">
                Start
                <NativeSelect
                  id="railway-editor-field-5"
                  value={start}
                  onChange={(e) => setStart(Number(e.target.value))}
                >
                  {network.nodes.map((n) => (
                    <NativeSelectOption key={n.id} value={n.id}>
                      {n.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <label htmlFor="railway-editor-field-6">
                End
                <NativeSelect
                  id="railway-editor-field-6"
                  value={typeof end === 'number' ? end : 'new'}
                  onChange={(e) =>
                    setEnd(
                      e.target.value === 'new'
                        ? { x: -80 * MAP_SCALE, z: 10 * MAP_SCALE }
                        : Number(e.target.value),
                    )
                  }
                >
                  <NativeSelectOption value="new">
                    New endpoint…
                  </NativeSelectOption>
                  {network.nodes.map((n) => (
                    <NativeSelectOption key={n.id} value={n.id}>
                      {n.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <div className="editor-actions">
                <button
                  className="button"
                  aria-pressed={pick === 'start'}
                  onClick={() => setPick('start')}
                >
                  Pick start on map
                </button>
                <button
                  className="button"
                  aria-pressed={pick === 'end'}
                  onClick={() => setPick('end')}
                >
                  Pick end on map
                </button>
              </div>
              {typeof end !== 'number' && (
                <div className="editor-columns">
                  <label htmlFor="railway-editor-field-7">
                    End east / west (m)
                    <Input
                      id="railway-editor-field-7"
                      type="number"
                      value={Number(metres(end.x).toFixed(1))}
                      min={metres(MAP.minX)}
                      max={metres(MAP.maxX)}
                      onChange={(e) =>
                        setEnd({
                          ...end,
                          x: Number(e.target.value) / METRES_PER_UNIT,
                        })
                      }
                    />
                  </label>
                  <label htmlFor="railway-editor-field-8">
                    End north / south (m)
                    <Input
                      id="railway-editor-field-8"
                      type="number"
                      value={Number(metres(end.z).toFixed(1))}
                      min={metres(MAP.minZ)}
                      max={metres(MAP.maxZ)}
                      onChange={(e) =>
                        setEnd({
                          ...end,
                          z: Number(e.target.value) / METRES_PER_UNIT,
                        })
                      }
                    />
                  </label>
                  <label htmlFor="railway-editor-field-9">
                    Track elevation (m)
                    <Input
                      id="railway-editor-field-9"
                      type="number"
                      step=".1"
                      value={Number(
                        metres(
                          end.elevation ??
                            Number(
                              (
                                Math.max(0, height(end.x, end.z)) + 0.36
                              ).toFixed(2),
                            ),
                        ).toFixed(1),
                      )}
                      min={metres(0.36)}
                      max={metres(8)}
                      onChange={(e) =>
                        setEnd({
                          ...end,
                          elevation: Number(e.target.value) / METRES_PER_UNIT,
                        })
                      }
                    />
                  </label>
                </div>
              )}
              <label htmlFor="railway-editor-field-10">
                Bend: {metres(bend).toFixed(0)} m
                <Slider
                  id="railway-editor-field-10"
                  aria-label="Track bend"
                  value={[bend]}
                  min={-60}
                  max={60}
                  step={1}
                  onValueChange={(v) => setBend(Array.isArray(v) ? v[0] : v)}
                />
              </label>
              {typeof end !== 'number' && (
                <label htmlFor="railway-editor-field-11">
                  New station name (optional, +$12,000)
                  <Input
                    id="railway-editor-field-11"
                    value={stationName}
                    maxLength={40}
                    placeholder="Leave blank for a junction"
                    onChange={(e) => setStationName(e.target.value)}
                  />
                </label>
              )}
            </>
          )}
          {destination && (
            <p className="editor-hint">
              Endpoint: {destination.x.toFixed(1)}, {destination.z.toFixed(1)}
            </p>
          )}
          {quote.edge && (
            <p className="editor-metrics">
              {metres(quote.edge.length).toFixed(1)} m ·{' '}
              {(quote.edge.grade * 100).toFixed(1)}% grade ·{' '}
              {quote.edge.radius >= 1e8
                ? 'Straight track'
                : `${metres(quote.edge.radius).toFixed(0)} m minimum radius`}
              {quote.edge.bridgeLength > 0 &&
                ` · automatic bridge ${metres(quote.edge.bridgeLength).toFixed(1)} m`}
            </p>
          )}
          <dl className="construction-cost">
            {(
              [
                ['Track', quote.cost.track],
                ['Earthworks', quote.cost.earthworks],
                ['Bridges', quote.cost.bridges],
                ['Station work', quote.cost.station],
                ['Total', quote.cost.total],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{money(value)}</dd>
              </div>
            ))}
          </dl>
          <div
            className={quote.errors.length ? 'editor-warning' : 'editor-valid'}
          >
            {quote.errors.length
              ? quote.errors.map((e) => <p key={e}>{e}</p>)
              : '✓ Alignment valid. Ready to purchase.'}
          </div>
          <button
            className="button primary editor-full"
            disabled={quote.errors.length > 0 || !quote.edge}
            onClick={() =>
              action(() => {
                const id = sim.build(input);
                setRemove(id);
                setStationName('');
                if (quote.node) {
                  setStart(quote.node.id);
                  setEnd({ x: quote.node.x + 18, z: quote.node.z });
                }
              }, 'Track purchased. Add a station if needed, then configure a service.')
            }
          >
            Build for {money(quote.cost.total)}
          </button>
        </TabsContent>
        <TabsContent value="service">
          <label htmlFor="railway-editor-field-12">
            Assigned locomotive
            <NativeSelect
              id="railway-editor-field-12"
              value={trainId}
              onChange={(e) => {
                const id = Number(e.target.value),
                  s = sim.services[id];
                setTrainId(id);
                setServiceName(s.name);
                setStops([...s.stops]);
                setDwell(s.dwell);
                setPreferred([]);
              }}
            >
              {locomotives.map((l, id) => (
                <NativeSelectOption key={l.name} value={id}>
                  {l.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          <div className="editor-callout">
            <p>
              {train.held
                ? 'On hold'
                : train.stopAtStation
                  ? 'Stopping at next station'
                  : train.status}{' '}
              · {current.name}
            </p>
            <button
              className="button"
              onClick={() =>
                action(
                  () => sim.stopForEditing(trainId),
                  'The train will hold at a station for service editing.',
                )
              }
            >
              Stop at next station
            </button>
            <button
              className="button"
              onClick={() =>
                action(() => {
                  train.held = false;
                  train.stopAtStation = false;
                }, 'Train released.')
              }
            >
              Release train
            </button>
          </div>
          <label htmlFor="railway-editor-field-13">
            Service name
            <Input
              id="railway-editor-field-13"
              value={serviceName}
              maxLength={48}
              onChange={(e) => setServiceName(e.target.value)}
            />
          </label>
          <label htmlFor="railway-editor-field-14">
            Dwell at stops (simulation seconds)
            <Input
              id="railway-editor-field-14"
              type="number"
              value={dwell}
              min={1}
              max={60}
              onChange={(e) => setDwell(Number(e.target.value))}
            />
          </label>
          <p>
            Ordered stops · returns to the first stop. Begin at the station
            where the train is held.
          </p>
          <ol className="service-stop-editor">
            {stops.map((id, index) => (
              <li key={id}>
                <span>
                  {index + 1}. {nodeAt(network, id)?.name ?? 'Missing station'}
                </span>
                <button
                  className="icon-button"
                  disabled={index === 0}
                  aria-label={`Move ${nodeAt(network, id)?.name} up`}
                  onClick={() =>
                    setStops((list) => {
                      const next = [...list];
                      [next[index - 1], next[index]] = [
                        next[index],
                        next[index - 1],
                      ];
                      return next;
                    })
                  }
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon-button"
                  disabled={index === stops.length - 1}
                  aria-label={`Move ${nodeAt(network, id)?.name} down`}
                  onClick={() =>
                    setStops((list) => {
                      const next = [...list];
                      [next[index + 1], next[index]] = [
                        next[index],
                        next[index + 1],
                      ];
                      return next;
                    })
                  }
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Remove ${nodeAt(network, id)?.name} stop`}
                  onClick={() => setStops(stops.filter((n) => n !== id))}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ol>
          <div className="editor-inline">
            <NativeSelect
              aria-label="Station to add"
              value={stop}
              onChange={(e) => setStop(Number(e.target.value))}
            >
              {network.stations.map((s) => (
                <NativeSelectOption key={s.id} value={s.node}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <button
              className="button"
              disabled={stops.includes(stop) || stops.length >= 16}
              onClick={() => setStops([...stops, stop])}
            >
              <Plus size={14} />
              Add stop
            </button>
          </div>
          <label htmlFor="railway-editor-field-15">
            Prefer a specific purchased track
            <NativeSelect
              id="railway-editor-field-15"
              value={preferred[0] ?? ''}
              onChange={(e) =>
                setPreferred(e.target.value ? [e.target.value] : [])
              }
            >
              <NativeSelectOption value="">
                Shortest connected track
              </NativeSelectOption>
              {network.edges
                .filter((e) => e.built)
                .map((e) => (
                  <NativeSelectOption key={e.id} value={e.id}>
                    {e.id} · {e.kind} · {nodeAt(network, e.a).name} →{' '}
                    {nodeAt(network, e.b).name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </label>
          {proposal.error ? (
            <p className="editor-warning">{proposal.error}</p>
          ) : (
            <>
              <p className="editor-valid">
                Connected round trip ·{' '}
                {proposal
                  .service!.legs.reduce(
                    (sum, l) => sum + metres(edgeAt(network, l.edge).length),
                    0,
                  )
                  .toFixed(1)}{' '}
                m
              </p>
              <details>
                <summary>Exact track itinerary</summary>
                <ol>
                  {proposal.service!.legs.map((leg, i) => (
                    <li key={i}>
                      {nodeAt(network, leg.from).name} →{' '}
                      {nodeAt(network, leg.to).name} ({leg.edge})
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
          <button
            className="button primary editor-full"
            disabled={!proposal.service}
            onClick={() =>
              action(
                () => sim.assignService(proposal.service!),
                'Service assigned. Release the train to run the highlighted itinerary.',
              )
            }
          >
            Assign service to {locomotives[trainId].name}
          </button>
        </TabsContent>
        <TabsContent value="manage">
          <h3>Crossovers</h3>
          <p className="editor-hint">
            Connect two running lines through a protected diagonal switch. Both
            lines must clear before construction. Direction rules still apply.
          </p>
          {network.edges
            .filter((e) => e.kind === 'parallel')
            .map((e) => {
              const quote = sim.quoteCrossover(e.id);
              return (
                <div className="editor-callout" key={e.id}>
                  <strong>
                    {nodeAt(network, e.a).name} ↔ {nodeAt(network, e.b).name}
                  </strong>
                  <p>
                    {quote.errors.join(' ') ||
                      `Track and switches ${money(quote.cost!.track)} · earthworks ${money(quote.cost!.earthworks)} · bridges ${money(quote.cost!.bridges)}`}
                  </p>
                  <button
                    className="button"
                    disabled={quote.errors.length > 0}
                    onClick={() =>
                      action(() => {
                        sim.buildCrossover(e.id);
                      }, 'Protected crossover built.')
                    }
                  >
                    Build crossover {quote.cost ? money(quote.cost.total) : ''}
                  </button>
                </div>
              );
            })}

          {(network.crossovers ?? []).map((c) => (
            <div className="editor-callout" key={c.id}>
              <strong>{sim.resourceLabel(`block:${c.main}`)} crossover</strong>
              <button
                className="button"
                disabled={!!sim.crossoverRemovalReason(c.id)}
                onClick={() =>
                  action(
                    () => sim.bulldozeCrossover(c.id),
                    'Crossover removed; both running lines remain.',
                  )
                }
              >
                Remove crossover
              </button>
              <p>
                {sim.crossoverRemovalReason(c.id) ??
                  'Unused crossover work can also be refunded from the construction ledger.'}
              </p>
            </div>
          ))}
          <h3>Stations & platforms</h3>
          <label htmlFor="railway-editor-field-16">
            Endpoint
            <NativeSelect
              id="railway-editor-field-16"
              value={stationNode}
              onChange={(e) => setStationNode(Number(e.target.value))}
            >
              {network.nodes.map((n) => (
                <NativeSelectOption key={n.id} value={n.id}>
                  {n.name} ·{' '}
                  {network.stations.find((s) => s.node === n.id)?.platforms
                    .length ?? 0}{' '}
                  platforms
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
          {!network.stations.some((s) => s.node === stationNode) && (
            <label htmlFor="railway-editor-field-17">
              Station name
              <Input
                id="railway-editor-field-17"
                value={workName}
                maxLength={40}
                onChange={(e) => setWorkName(e.target.value)}
              />
            </label>
          )}
          <button
            className="button editor-full"
            onClick={() =>
              action(
                () => sim.addStation(stationNode, workName),
                'Station work completed.',
              )
            }
          >
            {network.stations.some((s) => s.node === stationNode)
              ? 'Add platform'
              : 'Build station'}{' '}
            · {money(sim.stationCost(stationNode))}
          </button>
          <h3>Bulldoze track</h3>
          <label htmlFor="railway-editor-field-18">
            Player-built track
            <NativeSelect
              id="railway-editor-field-18"
              value={remove}
              onChange={(e) => setRemove(e.target.value)}
            >
              <NativeSelectOption value="">Choose track…</NativeSelectOption>
              {network.edges
                .filter((e) => e.built)
                .map((e) => (
                  <NativeSelectOption key={e.id} value={e.id}>
                    {e.id} · {nodeAt(network, e.a).name} →{' '}
                    {nodeAt(network, e.b).name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </label>
          {remove && (
            <p
              className={
                sim.removalReason(remove) ? 'editor-warning' : 'editor-hint'
              }
            >
              {sim.removalReason(remove) ??
                'Unused by any train or service. Demolition gives no refund; refund undo is available below for construction that has never entered service.'}
            </p>
          )}
          <button
            className="button"
            disabled={!remove || !!sim.removalReason(remove)}
            onClick={() =>
              action(() => {
                sim.bulldoze(remove);
                setRemove('');
              }, 'Track removed.')
            }
          >
            <Trash2 size={14} />
            Bulldoze selected track
          </button>
          <h3>Construction ledger</h3>
          <p>
            Net construction spending: <strong>{money(totalSpend)}</strong>
          </p>
          {sim.construction.length === 0 ? (
            <p className="editor-hint">No construction purchases yet.</p>
          ) : (
            <ol className="construction-ledger">
              {[...sim.construction].reverse().map((r) => (
                <li key={r.id}>
                  <div>
                    <strong>
                      #{r.id} {r.action} · {r.edge ?? r.station}
                    </strong>
                    <span>{money(r.amount)}</span>
                  </div>
                  {['build', 'station', 'platform', 'crossover'].includes(
                    r.action,
                  ) &&
                    !r.reversed && (
                      <>
                        <button
                          className="button"
                          disabled={!!sim.undoReason(r)}
                          onClick={() =>
                            action(
                              () => sim.undo(r.id),
                              'Construction undone; its original cost has been refunded.',
                            )
                          }
                        >
                          Undo purchase
                        </button>
                        {sim.undoReason(r) && (
                          <p className="editor-hint">{sim.undoReason(r)}</p>
                        )}
                      </>
                    )}
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
      {message && (
        <output className="editor-feedback" aria-live="polite">
          {message}
        </output>
      )}
    </aside>
  );
}
