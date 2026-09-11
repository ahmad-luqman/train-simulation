import { MAP } from './map';
import type { DispatchSettings } from './dispatch';
import { cities, corridors } from './data';
import { height, riverX } from './terrain';
import { chooseYard } from './topology';

export const edgeKey = (a: number, b: number) =>
  [a, b].sort((x, y) => x - y).join('-');
export type Point = { x: number; y: number; z: number };
export type NetworkNode = Point & { id: number; name: string; cargo: string };
export type Station = {
  id: string;
  node: number;
  name: string;
  platforms: string[];
  built: boolean;
  yardAngle?: number;
  yardLead?: number;
};
export type Cost = {
  track: number;
  earthworks: number;
  bridges: number;
  station: number;
  total: number;
};
export type TrackEdge = {
  id: string;
  a: number;
  b: number;
  points: Point[];
  length: number;
  grade: number;
  radius: number;
  bridgeLength: number;
  kind: 'track' | 'siding' | 'loop' | 'parallel';
  side?: -1 | 1;
  block: string; // Legacy parent corridor ID, retained for loop construction dependencies.
  direction?: 'both' | 'a-to-b' | 'b-to-a';
  built: boolean;
  used: boolean;
  cost: Cost;
};
export type Crossover = {
  id: string;
  main: string;
  parallel: string;
  position: number;
  cost: Cost;
};
export type RailNetwork = {
  /** Present only on migrated pre-mountain railways; keeps their protected base map explicit. */
  baseline?: 'valley';
  crossovers?: Crossover[];
  nodes: NetworkNode[];
  edges: TrackEdge[];
  stations: Station[];
  nextNode: number;
  nextEdge: number;
  nextPlatform: number;
};
export type Construction = {
  start: number;
  end: number | { x: number; z: number; elevation?: number };
  bend: number;
  kind: TrackEdge['kind'];
  parent?: string;
  stationName?: string;
};
export type Quote = {
  errors: string[];
  edge?: TrackEdge;
  node?: NetworkNode;
  station?: Station;
  cost: Cost;
};
export const zeroCost = (): Cost => ({
  track: 0,
  earthworks: 0,
  bridges: 0,
  station: 0,
  total: 0,
});
export const nodeAt = (network: RailNetwork, id: number) =>
  network.nodes.find((n) => n.id === id)!;
export const edgeAt = (network: RailNetwork, id: string) =>
  network.edges.find((e) => e.id === id)!;
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function snapNode(
  network: RailNetwork,
  x: number,
  z: number,
  radius = 5,
) {
  return network.nodes
    .filter((n) => Math.hypot(n.x - x, n.z - z) <= radius)
    .sort(
      (a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z),
    )[0];
}

// Sampled cubic curves are the single geometry contract, in scene units (see units.ts).
export function curvePoints(a: Point, b: Point, bend: number): Point[] {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const nx = -(b.z - a.z) / (length || 1),
    nz = (b.x - a.x) / (length || 1);
  const controls = [
    a,
    {
      x: a.x + (b.x - a.x) * 0.22 + nx * bend,
      y: a.y + (b.y - a.y) * 0.22,
      z: a.z + (b.z - a.z) * 0.22 + nz * bend,
    },
    {
      x: a.x + (b.x - a.x) * 0.78 + nx * bend,
      y: a.y + (b.y - a.y) * 0.78,
      z: a.z + (b.z - a.z) * 0.78 + nz * bend,
    },
    b,
  ];
  const count = Math.max(32, Math.ceil((length + Math.abs(bend) * 2) * 3));
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count,
      u = 1 - t,
      weights = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return {
      x: controls.reduce((s, p, j) => s + p.x * weights[j], 0),
      y: controls.reduce((s, p, j) => s + p.y * weights[j], 0),
      z: controls.reduce((s, p, j) => s + p.z * weights[j], 0),
    };
  });
}
export function measure(points: Point[]) {
  let length = 0,
    grade = 0,
    radius = 1e9,
    bridgeLength = 0,
    earthworks = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      ds = distance(a, b);
    length += ds;
    grade = Math.max(
      grade,
      Math.abs(b.y - a.y) / Math.max(0.0001, Math.hypot(b.x - a.x, b.z - a.z)),
    );
    if (Math.abs(b.x - riverX(b.z)) < 6.5) bridgeLength += ds;
    else earthworks += Math.abs(b.y - 0.36 - height(b.x, b.z)) * ds;
    if (i < points.length - 1) {
      const c = points[i + 1];
      const twiceArea = Math.abs(
        (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x),
      );
      if (twiceArea > 1e-8)
        radius = Math.min(
          radius,
          (Math.hypot(b.x - a.x, b.z - a.z) *
            Math.hypot(c.x - b.x, c.z - b.z) *
            Math.hypot(c.x - a.x, c.z - a.z)) /
            (2 * twiceArea),
        );
    }
  }
  return { length, grade, radius, bridgeLength, earthworks };
}
export function pointOnEdge(edge: TrackEdge, at: number): Point {
  let remaining = Math.max(0, Math.min(at, edge.length));
  for (let i = 1; i < edge.points.length; i++) {
    const a = edge.points[i - 1],
      b = edge.points[i],
      ds = distance(a, b);
    if (remaining <= ds) {
      const t = ds ? remaining / ds : 0;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      };
    }
    remaining -= ds;
  }
  return { ...edge.points[edge.points.length - 1] };
}
// Preserve the original four-control-point centripetal alignment. Its 200
// segments also preserve version 1 renderer lengths without importing Three.js.
export function legacyCurvePoints(a: Point, b: Point): Point[] {
  const length = Math.hypot(b.x - a.x, b.z - a.z),
    nx = -(b.z - a.z) / length,
    nz = (b.x - a.x) / length;
  const controls = [
    a,
    {
      x: a.x + (b.x - a.x) * 0.22 + nx * 2.2,
      y: a.y,
      z: a.z + (b.z - a.z) * 0.22 + nz * 2.2,
    },
    {
      x: a.x + (b.x - a.x) * 0.78 + nx * 2.2,
      y: b.y,
      z: a.z + (b.z - a.z) * 0.78 + nz * 2.2,
    },
    b,
  ];
  const extrapolate = (p: Point, q: Point) => ({
    x: 2 * p.x - q.x,
    y: 2 * p.y - q.y,
    z: 2 * p.z - q.z,
  });
  return Array.from({ length: 201 }, (_, i) => {
    const position = (i / 200) * 3,
      segment = Math.min(2, Math.floor(position)),
      t = position - segment;
    const p1 = controls[segment],
      p2 = controls[segment + 1],
      p0 = controls[segment - 1] ?? extrapolate(p1, p2),
      p3 = controls[segment + 2] ?? extrapolate(p2, p1);
    const d0 = Math.sqrt(distance(p0, p1)),
      d1 = Math.sqrt(distance(p1, p2)),
      d2 = Math.sqrt(distance(p2, p3));
    const value = (axis: keyof Point) => {
      const x0 = p0[axis],
        x1 = p1[axis],
        x2 = p2[axis],
        x3 = p3[axis];
      const m1 = ((x1 - x0) / d0 - (x2 - x0) / (d0 + d1) + (x2 - x1) / d1) * d1;
      const m2 = ((x2 - x1) / d1 - (x3 - x1) / (d1 + d2) + (x3 - x2) / d2) * d1;
      return (
        x1 +
        m1 * t +
        (-3 * x1 + 3 * x2 - 2 * m1 - m2) * t * t +
        (2 * x1 - 2 * x2 + m1 + m2) * t * t * t
      );
    };
    return { x: value('x'), y: value('y'), z: value('z') };
  });
}
let baselineYards: { yardAngle: number; yardLead: number }[] | undefined;
export function createNetwork(): RailNetwork {
  const nodes = cities.map((c, id) => ({
    ...c,
    id,
    y: (c.elevation ?? 0) + 0.36,
  }));
  const network: RailNetwork = {
    nodes,
    crossovers: [],
    edges: corridors.map(([a, b]) => {
      const points =
          a >= 8 || b >= 8
            ? curvePoints(nodes[a], nodes[b], 12)
            : legacyCurvePoints(nodes[a], nodes[b]),
        metrics = measure(points);
      return {
        id: edgeKey(a, b),
        a,
        b,
        points,
        ...metrics,
        kind: 'track',
        block: edgeKey(a, b),
        built: false,
        used: true,
        cost: zeroCost(),
      };
    }),
    stations: nodes.map((n) => ({
      id: `station-${n.id}`,
      node: n.id,
      name: n.name,
      platforms:
        n.id >= 8
          ? [0, 1, 2].map((i) => `platform-${25 + (n.id - 8) * 3 + i}`)
          : [
              `platform-${n.id}`,
              `platform-${8 + n.id}`,
              `platform-${16 + n.id}`,
              ...(n.id === 4 ? ['platform-24'] : []),
            ],
      built: false,
    })),
    nextNode: nodes.length,
    nextEdge: 1,
    nextPlatform: 25 + (nodes.length - 8) * 3,
  };
  for (const station of network.stations)
    Object.assign(
      station,
      baselineYards?.[station.node] ??
        chooseYard(
          station.node < 8
            ? {
                ...network,
                nodes: network.nodes.filter((n) => n.id < 8),
                edges: network.edges.filter((e) => e.a < 8 && e.b < 8),
                stations: network.stations.filter((s) => s.node < 8),
              }
            : network,
          station.node,
        ),
    );
  baselineYards ??= network.stations.map((s) => ({
    yardAngle: s.yardAngle!,
    yardLead: s.yardLead!,
  }));
  return network;
}
// Houses that exist beside the original railway are protected; vegetation and
// fields can be cleared. Match the town kit grid and its original track setback.
const townObstacles = (() => {
  const baseline = createNetwork();
  return cities
    .flatMap((city, index) =>
      Array.from({ length: index === 4 ? 22 : 12 }, (_, i) => ({
        x: city.x - 10 + (i % 4) * 3.4,
        z: city.z + 5 + Math.floor(i / 4) * 4,
      })),
    )
    .filter(
      (p) =>
        Math.abs(p.x - riverX(p.z)) >= 6.8 &&
        !baseline.edges.some((e) =>
          e.points.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 2),
        ),
    );
})();
export function quoteConstruction(
  network: RailNetwork,
  input: Construction,
): Quote {
  const errors: string[] = [],
    cost = zeroCost();
  if (network.edges.length >= 512 || network.nodes.length >= 256)
    return {
      errors: [
        'The valley construction limit has been reached. Remove unused infrastructure first.',
      ],
      cost,
    };
  const start = nodeAt(network, input.start);
  if (
    !start ||
    !['track', 'siding', 'loop', 'parallel'].includes(input.kind) ||
    !Number.isFinite(input.bend) ||
    Math.abs(input.bend) > 60
  )
    return {
      errors: ['Choose a valid start and a bend between −333 and 333 m.'],
      cost,
    };
  let end: NetworkNode | undefined, node: NetworkNode | undefined;
  if (typeof input.end === 'number') end = nodeAt(network, input.end);
  else if (
    input.end &&
    [input.end.x, input.end.z, input.end.elevation ?? 0].every(Number.isFinite)
  ) {
    const { x, z } = input.end;
    end = snapNode(network, x, z);
    if (!end) {
      node = {
        id: network.nextNode,
        x,
        z,
        y: input.end.elevation ?? Math.max(0, height(x, z)) + 0.36,
        name: input.stationName?.trim() || `Junction ${network.nextNode}`,
        cargo: 'Goods',
      };
      end = node;
    }
  }
  if (!end || end.id === start.id)
    return {
      errors: ['Choose a different endpoint; endpoints snap within 28 m.'],
      cost,
    };
  const parent = input.parent ? edgeAt(network, input.parent) : undefined;
  if (
    (input.kind === 'loop' || input.kind === 'parallel') &&
    (!parent ||
      parent.kind !== 'track' ||
      ![parent.a, parent.b].includes(start.id) ||
      ![parent.a, parent.b].includes(end.id))
  )
    return {
      errors: [
        'A passing loop must join both endpoints of an existing main track.',
      ],
      cost,
    };
  if (
    (input.kind === 'loop' || input.kind === 'parallel') &&
    network.edges.some((e) => e.kind === input.kind && e.block === parent!.id)
  )
    errors.push('This corridor already has that parallel-track preset.');
  if (
    input.kind !== 'loop' &&
    input.kind !== 'parallel' &&
    network.edges.some(
      (e) =>
        (e.a === start.id && e.b === end.id) ||
        (e.b === start.id && e.a === end.id),
    )
  )
    errors.push(
      'These endpoints are already connected. Use the passing-loop preset.',
    );
  if (input.kind === 'siding' && !node)
    errors.push('A siding must end at a new buffer stop.');
  // A loop shares the main track direction, with a fixed outward offset.
  const a =
      input.kind === 'loop' || input.kind === 'parallel'
        ? nodeAt(network, parent!.a)
        : start,
    b =
      input.kind === 'loop' || input.kind === 'parallel'
        ? nodeAt(network, parent!.b)
        : end;
  const points =
      input.kind === 'parallel'
        ? parallelPoints(parent!, input.bend < 0 ? -1 : 1)
        : curvePoints(
            a,
            b,
            input.kind === 'loop' ? (input.bend < 0 ? -12 : 12) : input.bend,
          ),
    metrics = measure(points);
  if (metrics.length < 16 || metrics.length > MAP.maxTrackLength)
    errors.push('Track length must be between 89 and 2,400 m.');
  if (metrics.radius < 10)
    errors.push(
      'Curve radius is below 56 m. Reduce the bend or lengthen the track.',
    );
  if (metrics.grade > 0.04)
    errors.push(
      'Gradient exceeds 4%. Choose a lower endpoint or a longer alignment.',
    );
  if (
    points.some(
      (p) =>
        p.x < MAP.minX || p.x > MAP.maxX || p.z < MAP.minZ || p.z > MAP.maxZ,
    )
  )
    errors.push(
      'Track leaves the buildable valley. Mountains and tunnels are reserved for a later phase.',
    );
  if (
    points.some(
      (p) =>
        Math.abs(p.x - riverX(p.z)) >= 6.5 &&
        Math.abs(p.y - 0.36 - height(p.x, p.z)) > 2.5,
    )
  )
    errors.push('Earthworks exceed 14 m. Choose flatter ground.');
  // Reject running along the river; an automatic bridge must cross both banks.
  if (
    metrics.bridgeLength > 0 &&
    (Math.abs(a.x - riverX(a.z)) < 6.5 ||
      Math.abs(b.x - riverX(b.z)) < 6.5 ||
      (a.x - riverX(a.z)) * (b.x - riverX(b.z)) >= 0 ||
      metrics.bridgeLength > 32)
  )
    errors.push(
      'Bridges must cross between dry banks with a span of at most 178 m.',
    );
  const interior = points.filter(
    (p) => distance(p, a) > 10 && distance(p, b) > 10,
  );
  if (
    interior.some(
      (p) =>
        townObstacles.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < 3) ||
        cities.some(
          (c, i) =>
            Math.abs(p.x - (c.x + (i === 6 ? 13 : -2))) < 10 &&
            Math.abs(p.z - (c.z + 17)) < 4,
        ),
    )
  )
    errors.push('The alignment crosses town buildings. Bend around the town.');
  for (const existing of network.edges) {
    if (
      (input.kind === 'loop' || input.kind === 'parallel') &&
      existing.block === parent!.block
    )
      continue;
    const shared = [existing.a, existing.b]
      .filter((id) => id === a.id || id === b.id)
      .map((id) => nodeAt(network, id));
    if (
      points.some(
        (p, i) =>
          i % 2 === 0 &&
          !shared.some((n) => distance(p, n) < 12) &&
          existing.points.some(
            (q, j) =>
              j % 2 === 0 &&
              Math.hypot(p.x - q.x, p.z - q.z) < 2.7 &&
              Math.abs(p.y - q.y) < 3,
          ),
      )
    ) {
      errors.push(
        `Track clearance conflicts with ${existing.id}. Join at a snapped endpoint.`,
      );
      break;
    }
  }
  cost.track =
    Math.ceil(metrics.length * 220) + (input.kind === 'parallel' ? 5000 : 0);
  cost.earthworks = Math.ceil(Math.max(0, metrics.earthworks - 1e-8) * 90);
  cost.bridges = Math.ceil(metrics.bridgeLength * 1100);
  const name = input.stationName?.trim();
  if (name && (name.length > 40 || !node))
    errors.push(
      'A new station needs a new endpoint and a name of 1–40 characters.',
    );
  const station =
    name && node
      ? {
          id: `station-${node.id}`,
          node: node.id,
          name,
          platforms: [`platform-${network.nextPlatform}`],
          built: true,
        }
      : undefined;
  cost.station = station ? 12000 : 0;
  cost.total = cost.track + cost.earthworks + cost.bridges + cost.station;
  return {
    errors,
    cost,
    node,
    station,
    edge: {
      id: `track-${network.nextEdge}`,
      a: a.id,
      b: b.id,
      points,
      ...metrics,
      kind: input.kind,
      ...(input.kind === 'parallel'
        ? {
            side: input.bend < 0 ? (-1 as const) : (1 as const),
            direction: 'b-to-a' as const,
          }
        : {}),
      block:
        input.kind === 'loop' || input.kind === 'parallel'
          ? parent!.block
          : `track-${network.nextEdge}`,
      built: true,
      used: false,
      cost,
    },
  };
}
// Offset the complete sampled alignment, including its endpoint ports. The
// new line is physical capacity; station movements connect its separate ports.
export function parallelPoints(parent: TrackEdge, side: -1 | 1): Point[] {
  return parent.points.map((p, i) => {
    const a = parent.points[Math.max(0, i - 1)],
      b = parent.points[Math.min(parent.points.length - 1, i + 1)];
    const d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return {
      x: p.x - ((b.z - a.z) / d) * 8 * side,
      y: p.y,
      z: p.z + ((b.x - a.x) / d) * 8 * side,
    };
  });
}
export type RouteLeg = {
  edge: string;
  from: number;
  to: number;
  stop?: boolean;
};
export type Service = {
  id: string;
  trainId: number;
  name: string;
  stops: number[];
  dwell: number;
  legs: RouteLeg[];
  dispatch?: DispatchSettings;
  preferred?: string[];
};
export function shortestPath(
  network: RailNetwork,
  from: number,
  to: number,
  preferred: string[] = [],
): RouteLeg[] | undefined {
  const costs = new Map<number, number>([[from, 0]]),
    previous = new Map<number, RouteLeg>(),
    visited = new Set<number>();
  while (true) {
    const current = [...costs]
      .filter(([id]) => !visited.has(id))
      .sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
    if (!current) return undefined;
    const [id, cost] = current;
    if (id === to) break;
    visited.add(id);
    for (const e of network.edges.filter((e) => e.a === id || e.b === id)) {
      if (
        (e.direction === 'a-to-b' && e.a !== id) ||
        (e.direction === 'b-to-a' && e.b !== id)
      )
        continue;
      const next = e.a === id ? e.b : e.a,
        value = cost + e.length * (preferred.includes(e.id) ? 0.01 : 1);
      if (value < (costs.get(next) ?? Infinity)) {
        costs.set(next, value);
        previous.set(next, { edge: e.id, from: id, to: next });
      }
    }
  }
  const route: RouteLeg[] = [];
  for (let node = to; node !== from;) {
    const leg = previous.get(node);
    if (!leg) return undefined;
    route.unshift(leg);
    node = leg.from;
  }
  return route;
}
export function planService(
  network: RailNetwork,
  trainId: number,
  name: string,
  stops: number[],
  dwell: number,
  preferred: string[] = [],
): Service {
  if (
    !name.trim() ||
    name.trim().length > 48 ||
    stops.length < 2 ||
    stops.length > 16 ||
    new Set(stops).size !== stops.length ||
    !Number.isFinite(dwell) ||
    dwell < 1 ||
    dwell > 60
  )
    throw new Error(
      'Choose 2–16 distinct stations, a service name, and dwell of 1–60 seconds.',
    );
  if (stops.some((id) => !network.stations.some((s) => s.node === id)))
    throw new Error('Every stop needs a station and platform.');
  if (preferred.some((id) => !edgeAt(network, id)))
    throw new Error('A preferred track no longer exists.');
  const legs = stops.flatMap((from, i) => {
    const to = stops[(i + 1) % stops.length],
      path = shortestPath(network, from, to, preferred);
    if (!path)
      throw new Error(
        `${nodeAt(network, to).name} is disconnected from ${nodeAt(network, from).name}.`,
      );
    return path.map((leg, index) => ({
      ...leg,
      stop: index === path.length - 1,
    }));
  });
  if (preferred.some((id) => !legs.some((l) => l.edge === id)))
    throw new Error(
      'A preferred track does not lie on this service. Add a stop beyond it.',
    );
  return {
    id: `service-${trainId}`,
    trainId,
    name: name.trim(),
    stops: [...stops],
    dwell,
    legs,
    ...(preferred.length ? { preferred: [...preferred] } : {}),
  };
}
