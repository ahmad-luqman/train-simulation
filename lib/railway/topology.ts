import { MAP } from './map';
import {
  distance,
  measure,
  pointOnEdge,
  type Point,
  type RailNetwork,
  type TrackEdge,
  type RouteLeg,
} from './network';
import { VEHICLE_RADIUS, VERTICAL_CLEARANCE, type Pose } from './safety';

export const BERTH_LENGTH = 45;
export const BERTH_STOP = BERTH_LENGTH - 3;
export const LINE_SPACING = 8;
export type Port = {
  id: string;
  node: number;
  section: string;
  end: 'a' | 'b';
  p: Point;
  outward: Point;
};
export type Section = {
  id: string;
  kind: 'running' | 'turnout' | 'platform' | 'crossover';
  points: Point[];
  cumulative: number[];
  length: number;
  radius: number;
  a: string;
  b: string;
  node?: number;
  edge?: string;
  platform?: string;
};
export type Traversal = { section: string; reverse: boolean };
export type PhysicalRoute = {
  sections: Traversal[];
  from: number;
  to: number;
  destination: string;
  source?: string;
  legs: RouteLeg[];
  nextLeg: number;
  stop: boolean;
  recovering?: boolean;
  automaticRecovery?: boolean;
  crossover?: string;
};
export type Zone = {
  id: string;
  sections: [string, string];
  intervals: [{ start: number; end: number }, { start: number; end: number }];
};
export type RouteInterval = { resource: string; start: number; end: number };
const sub = (a: Point, b: Point) => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const unit = (p: Point) => {
  const d = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / d, y: p.y / d, z: p.z / d };
};
const shift = (a: Point, b: Point, d: number) => ({
  x: a.x + b.x * d,
  y: a.y + b.y * d,
  z: a.z + b.z * d,
});
export function section(
  id: string,
  kind: Section['kind'],
  points: Point[],
  a: string,
  b: string,
  extra: Partial<Section> = {},
): Section {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++)
    cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
  return {
    id,
    kind,
    points,
    cumulative,
    length: cumulative.at(-1)!,
    radius: measure(points).radius,
    a,
    b,
    ...extra,
  };
}
export function sample(s: Section, at: number): Pose {
  const d = Math.max(0, Math.min(s.length, at));
  let lo = 1,
    hi = s.points.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (s.cumulative[m] < d) lo = m + 1;
    else hi = m;
  }
  const a = s.points[lo - 1],
    b = s.points[lo],
    span = s.cumulative[lo] - s.cumulative[lo - 1],
    u = span ? (d - s.cumulative[lo - 1]) / span : 0;
  return {
    p: {
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      z: a.z + (b.z - a.z) * u,
    },
    angle: Math.atan2(a.x - b.x, a.z - b.z),
    edge: s.edge ?? s.id,
  };
}
function cubic(a: Point, b: Point, start: Point, end: Point) {
  const d = Math.max(8, distance(a, b) * 0.6),
    c = shift(a, start, d),
    e = shift(b, end, -d);
  const count = Math.ceil(
    (distance(a, c) + distance(c, e) + distance(e, b)) * 4,
  );
  const points = Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count,
      u = 1 - t;
    return {
      x:
        a.x * u * u * u +
        3 * c.x * u * u * t +
        3 * e.x * u * t * t +
        b.x * t * t * t,
      y:
        a.y * u * u * u +
        3 * c.y * u * u * t +
        3 * e.y * u * t * t +
        b.y * t * t * t,
      z:
        a.z * u * u * u +
        3 * c.z * u * u * t +
        3 * e.z * u * t * t +
        b.z * t * t * t,
    };
  });
  return measure(points).radius >= 6
    ? points
    : tangentArcs(a, b, start, end, 6);
}
// Four circle/straight/circle families. Parallel circle tangents use the centre
// bearing; opposite turns rotate that bearing by asin((leftA-leftB)*r/d).
// Every arc has a fleet-tested minimum radius, so a cubic cusp is never a route.
function tangentArcs(
  a: Point,
  b: Point,
  start: Point,
  end: Point,
  radius: number,
): Point[] {
  start = unit({ ...start, y: 0 });
  end = unit({ ...end, y: 0 });
  const tau = Math.PI * 2,
    mod = (v: number) => {
      const n = ((v % tau) + tau) % tau;
      return n > tau - 1e-8 ? 0 : n;
    };
  let best: Point[] = [];
  let bestLength = Infinity;
  for (const sa of [-1, 1])
    for (const sb of [-1, 1]) {
      const ca = {
          x: a.x - start.z * sa * radius,
          z: a.z + start.x * sa * radius,
        },
        cb = { x: b.x - end.z * sb * radius, z: b.z + end.x * sb * radius };
      const dx = cb.x - ca.x,
        dz = cb.z - ca.z,
        d = Math.hypot(dx, dz),
        offset = (sa - sb) * radius;
      if (d < Math.abs(offset) + 1e-8) continue;
      const heading = Math.atan2(dz, dx) + Math.asin(offset / d),
        nx = -Math.sin(heading),
        nz = Math.cos(heading);
      const pa = { x: ca.x - sa * nx * radius, z: ca.z - sa * nz * radius },
        pb = { x: cb.x - sb * nx * radius, z: cb.z - sb * nz * radius };
      const aa = Math.atan2(a.z - ca.z, a.x - ca.x),
        ab = Math.atan2(pa.z - ca.z, pa.x - ca.x),
        ba = Math.atan2(pb.z - cb.z, pb.x - cb.x),
        bb = Math.atan2(b.z - cb.z, b.x - cb.x);
      const turnA = mod(sa * (ab - aa)),
        turnB = mod(sb * (bb - ba)),
        straight = Math.hypot(pb.x - pa.x, pb.z - pa.z),
        length = radius * (turnA + turnB) + straight;
      if (length >= bestLength) continue;
      const result: Point[] = [];
      let chainage = 0;
      const add = (x: number, z: number, d: number) => {
        if (
          result.length &&
          Math.hypot(x - result.at(-1)!.x, z - result.at(-1)!.z) < 1e-7
        )
          return;
        result.push({ x, y: a.y + ((b.y - a.y) * d) / length, z });
      };
      const na = Math.max(1, Math.ceil((turnA * radius) / 0.15));
      for (let i = 0; i <= na; i++) {
        const angle = aa + (sa * turnA * i) / na;
        add(
          ca.x + radius * Math.cos(angle),
          ca.z + radius * Math.sin(angle),
          (turnA * radius * i) / na,
        );
      }
      chainage = turnA * radius;
      add(pb.x, pb.z, chainage + straight);
      chainage += straight;
      const nb = Math.max(1, Math.ceil((turnB * radius) / 0.15));
      for (let i = 0; i <= nb; i++) {
        const angle = ba + (sb * turnB * i) / nb;
        add(
          cb.x + radius * Math.cos(angle),
          cb.z + radius * Math.sin(angle),
          chainage + (turnB * radius * i) / nb,
        );
      }
      result[0] = { ...a };
      result[result.length - 1] = { ...b };
      best = result;
      bestLength = length;
    }
  if (!best.length)
    throw new Error('No continuous turnout alignment fits these ports.');
  return best;
}
// A fan of nested half-circles turns each complete consist without uncoupling.
// All lanes merge into the outside return road, beyond parked vehicle envelopes.
export const RETURN_OFFSET = -44;
export function departurePoints(
  n: Point,
  angle: number,
  lead: number,
  lane: number,
) {
  const dir = { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
    normal = { x: -dir.z, y: 0, z: dir.x };
  const offset = (lane - 1.5) * LINE_SPACING,
    radius = (offset - RETURN_OFFSET) / 2;
  const local = (along: number, across: number) =>
    shift(shift(n, dir, along), normal, across);
  const points = Array.from(
    { length: Math.ceil((Math.PI * radius) / 0.25) + 1 },
    (_, i) => i,
  );
  const arc = points.map((_, i) => {
    const theta = (Math.PI * i) / (points.length - 1);
    return local(
      lead + BERTH_LENGTH + radius * Math.sin(theta),
      offset - radius + radius * Math.cos(theta),
    );
  });
  const start = lead + BERTH_LENGTH;
  for (let along = start - 1; along > 0; along--)
    arc.push(local(along, RETURN_OFFSET));
  arc.push(local(0, RETURN_OFFSET));
  return arc;
}
export const MAX_PLATFORMS = 4;
export function chooseYard(
  network: RailNetwork,
  node: number,
): { yardAngle: number; yardLead: number } {
  const n = network.nodes.find((n) => n.id === node)!;
  const obstacles = network.edges.flatMap((e) =>
    e.points.filter((_, i) => i % 3 === 0),
  );
  for (const station of network.stations)
    if (station.node !== node && station.yardAngle !== undefined) {
      const p = network.nodes.find((n) => n.id === station.node)!,
        angle = station.yardAngle,
        dir = { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
        normal = { x: -dir.z, y: 0, z: dir.x };
      for (let lane = 0; lane < MAX_PLATFORMS; lane++)
        for (
          let d = (station.yardLead ?? 17) + 15;
          d <= (station.yardLead ?? 17) + 48;
          d += 2
        )
          obstacles.push(
            shift(shift(p, dir, d), normal, (lane - 1.5) * LINE_SPACING),
          );
    }
  for (const lead of [17, 25, 33, 41, 49, 57, 65, 73]) {
    let best = -Infinity,
      selected = 0;
    for (let i = 0; i < 96; i++) {
      const angle = (i * Math.PI) / 48,
        dir = { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
        normal = { x: -dir.z, y: 0, z: dir.x };
      let clearance = 20;
      scan: for (let lane = 0; lane < MAX_PLATFORMS; lane++)
        for (let d = lead + 15; d <= lead + 48; d += 2) {
          const p = shift(
            shift(n, dir, d),
            normal,
            (lane - 1.5) * LINE_SPACING,
          );
          if (
            Math.abs(p.x) > MAP.halfWidth - 10 ||
            Math.abs(p.z) > MAP.halfDepth - 10
          ) {
            clearance = -1;
            break scan;
          }
          for (const q of obstacles)
            if (Math.abs(p.y - q.y) < VERTICAL_CLEARANCE) {
              clearance = Math.min(clearance, Math.hypot(p.x - q.x, p.z - q.z));
              if (clearance < 7.5) break scan;
            }
        }
      if (clearance > best) {
        best = clearance;
        selected = angle;
      }
    }
    if (best >= 7.5) return { yardAngle: selected, yardLead: lead };
  }
  throw new Error(
    'No clear full-length station yard fits here. Choose another station endpoint.',
  );
}
export class Topology {
  sections = new Map<string, Section>();
  ports = new Map<string, Port>();
  running = new Map<string, Traversal[]>();
  zones: Zone[] = [];
  private zoneMap = new Map<string, Zone[]>();
  constructor(
    readonly network: RailNetwork,
    buildConflicts = true,
  ) {
    for (const e of network.edges) {
      const trim = Math.min(12, e.length * 0.2),
        points = [pointOnEdge(e, trim)];
      let d = 0;
      for (let i = 1; i < e.points.length; i++) {
        d += distance(e.points[i - 1], e.points[i]);
        if (d > trim && d < e.length - trim) points.push(e.points[i]);
      }
      points.push(pointOnEdge(e, e.length - trim));
      const s = section(e.id, 'running', points, `${e.id}:a`, `${e.id}:b`, {
        edge: e.id,
      });
      const cross = network.crossovers?.find(
        (c) => c.main === e.id || c.parallel === e.id,
      );
      if (cross) {
        const fraction =
            cross.main === e.id ? cross.position - 0.35 : cross.position + 0.35,
          cut = s.length * fraction;
        const p = sample(s, cut).p,
          split = s.cumulative.findIndex((d) => d > cut);
        const first = section(
          `${e.id}:part0`,
          'running',
          [...s.points.slice(0, split), p],
          s.a,
          `${cross.id}:${e.id}`,
          { edge: e.id },
        );
        const second = section(
          `${e.id}:part1`,
          'running',
          [p, ...s.points.slice(split)],
          first.b,
          s.b,
          { edge: e.id },
        );
        this.sections.set(first.id, first);
        this.sections.set(second.id, second);
        this.running.set(e.id, [
          { section: first.id, reverse: false },
          { section: second.id, reverse: false },
        ]);
      } else {
        this.sections.set(s.id, s);
        this.running.set(e.id, [{ section: s.id, reverse: false }]);
      }
      for (const end of ['a', 'b'] as const) {
        const at = end === 'a' ? 0 : s.length,
          p = sample(s, at).p,
          q = sample(s, end === 'a' ? 0.1 : s.length - 0.1).p;
        this.ports.set(`${e.id}:${end}`, {
          id: `${e.id}:${end}`,
          node: e[end],
          section: this.running.get(e.id)![
            end === 'a' ? 0 : this.running.get(e.id)!.length - 1
          ].section,
          end,
          p,
          outward: unit(sub(q, p)),
        });
      }
    }
    for (const station of network.stations) {
      const n = network.nodes.find((n) => n.id === station.node)!,
        angle = station.yardAngle ?? chooseYard(network, n.id).yardAngle;
      const dir = { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
        normal = { x: -dir.z, y: 0, z: dir.x };
      station.platforms.forEach((platform, i) => {
        const start = shift(
            shift(n, dir, station.yardLead ?? 17),
            normal,
            (i - 1.5) * LINE_SPACING,
          ),
          end = shift(start, dir, BERTH_LENGTH);
        const s = section(
          platform,
          'platform',
          [start, end],
          `${platform}:a`,
          `${platform}:b`,
          { node: n.id, platform },
        );
        this.sections.set(s.id, s);
        this.ports.set(s.a, {
          id: s.a,
          node: n.id,
          section: s.id,
          end: 'a',
          p: start,
          outward: dir,
        });
      });
    }
    for (const station of network.stations) {
      const n = network.nodes.find((n) => n.id === station.node)!,
        angle = station.yardAngle!;
      const exit = `yard-exit:${station.node}`;
      const entry = `yard-entry:${station.node}`;
      const dir = { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
      const throat = shift(n, dir, (station.yardLead ?? 17) - 24);
      for (const platform of station.platforms) {
        const id = `arrival:${platform}`,
          mouth = this.sections.get(platform)!.points[0];
        this.sections.set(
          id,
          section(
            id,
            'turnout',
            cubic(throat, mouth, dir, dir),
            entry,
            `${platform}:a`,
            { node: station.node },
          ),
        );
        this.ports.set(entry, {
          id: entry,
          node: station.node,
          section: id,
          end: 'a',
          p: throat,
          outward: dir,
        });
      }

      for (const [lane, platform] of station.platforms.entries()) {
        const points = departurePoints(n, angle, station.yardLead ?? 17, lane),
          id = `departure:${platform}`;
        points[0] = { ...this.sections.get(platform)!.points.at(-1)! };
        this.sections.set(
          id,
          section(id, 'turnout', points, `${platform}:b`, exit, {
            node: station.node,
          }),
        );
        this.ports.set(exit, {
          id: exit,
          node: station.node,
          section: id,
          end: 'b',
          p: points.at(-1)!,
          outward: { x: Math.cos(angle), y: 0, z: Math.sin(angle) },
        });
      }
    }
    // Each legal transition is an actual sampled path between named ports.
    // Platform-to-platform shunts and running-line U-turns are not implicit edges.
    for (const n of network.nodes) {
      const ports = [...this.ports.values()].filter(
        (p) =>
          p.node === n.id && this.sections.get(p.section)!.kind !== 'platform',
      );
      for (let i = 0; i < ports.length; i++)
        for (let j = i + 1; j < ports.length; j++) {
          const a = ports[i],
            b = ports[j];
          if (a.id.startsWith('yard-') && b.id.startsWith('yard-')) continue;
          const id = `turnout:${a.id}>${b.id}`;
          const points = cubic(
            a.p,
            b.p,
            shift({ x: 0, y: 0, z: 0 }, a.outward, -1),
            b.outward,
          );
          this.sections.set(
            id,
            section(id, 'turnout', points, a.id, b.id, { node: n.id }),
          );
        }
    }
    for (const cross of network.crossovers ?? []) {
      const a = this.sections.get(`${cross.main}:part0`)!,
        b = this.sections.get(`${cross.parallel}:part1`)!;
      const start = sample(a, a.length).p,
        end = sample(b, 0).p;
      const dirA = unit(sub(start, sample(a, a.length - 0.1).p)),
        dirB = unit(sub(sample(b, 0.1).p, end));
      this.sections.set(
        cross.id,
        section(cross.id, 'crossover', cubic(start, end, dirA, dirB), a.b, b.a),
      );
    }
    if (buildConflicts) this.buildZones();
  }
  movement(a: string, b: string): Traversal | undefined {
    const s = [...this.sections.values()].find(
      (s) =>
        s.kind === 'turnout' &&
        ((s.a === a && s.b === b) || (s.a === b && s.b === a)),
    );
    return s ? { section: s.id, reverse: s.b === a } : undefined;
  }
  route(
    source: string | undefined,
    destination: string,
    legs: RouteLeg[],
  ): Traversal[] | undefined {
    const route: Traversal[] = [];
    let port = source
      ? `yard-exit:${this.sections.get(source)!.node}`
      : undefined;
    if (source)
      route.push(
        { section: source, reverse: false },
        { section: `departure:${source}`, reverse: false },
      );
    for (const leg of legs) {
      const e = this.network.edges.find((e) => e.id === leg.edge)!;
      if (
        !e ||
        (e.direction === 'a-to-b' && leg.from !== e.a) ||
        (e.direction === 'b-to-a' && leg.from !== e.b)
      )
        return undefined;
      const reverse = leg.from === e.b,
        start = `${e.id}:${reverse ? 'b' : 'a'}`,
        end = `${e.id}:${reverse ? 'a' : 'b'}`;
      if (port) {
        const movement = this.movement(port, start);
        if (!movement) return undefined;
        route.push(movement);
      }
      const running = this.running.get(e.id)!;
      route.push(
        ...(reverse
          ? [...running].reverse().map((s) => ({ ...s, reverse: true }))
          : running),
      );
      port = end;
    }
    if (!port) return undefined;
    const last = this.movement(
      port,
      `yard-entry:${this.sections.get(destination)!.node}`,
    );
    if (!last) return undefined;
    route.push(
      last,
      { section: `arrival:${destination}`, reverse: false },
      { section: destination, reverse: false },
    );
    return route;
  }
  crossoverRoute(
    source: string | undefined,
    destination: string,
    legs: RouteLeg[],
    id: string,
  ): Traversal[] | undefined {
    if (!source || legs.length !== 1) return undefined;
    const c = this.network.crossovers?.find((c) => c.id === id);
    if (!c) return undefined;
    const main = this.network.edges.find((e) => e.id === c.main)!,
      parallel = this.network.edges.find((e) => e.id === c.parallel)!;
    const from = legs[0].from,
      reverse = from === main.b;
    if (![main.id, parallel.id].includes(legs[0].edge)) return undefined;
    if (
      [main, parallel].some(
        (e) =>
          (e.direction === 'a-to-b' && reverse) ||
          (e.direction === 'b-to-a' && !reverse),
      )
    )
      return undefined;
    const first = reverse ? parallel : main,
      last = reverse ? main : parallel;
    const entry = this.movement(
        `yard-exit:${this.sections.get(source)!.node}`,
        `${first.id}:${reverse ? 'b' : 'a'}`,
      ),
      exit = this.movement(
        `${last.id}:${reverse ? 'a' : 'b'}`,
        `yard-entry:${this.sections.get(destination)!.node}`,
      );
    if (!entry || !exit) return undefined;
    return [
      { section: source, reverse: false },
      { section: `departure:${source}`, reverse: false },
      entry,
      { section: `${first.id}:part${reverse ? 1 : 0}`, reverse },
      { section: id, reverse },
      { section: `${last.id}:part${reverse ? 0 : 1}`, reverse },
      exit,
      { section: `arrival:${destination}`, reverse: false },
      { section: destination, reverse: false },
    ];
  }
  length(route: Traversal[]) {
    return route.reduce((n, t) => n + this.sections.get(t.section)!.length, 0);
  }
  pose(route: Traversal[], at: number): Pose {
    let d = at;
    for (let i = 0; i < route.length; i++) {
      const t = route[i],
        s = this.sections.get(t.section)!;
      if (d <= s.length || i === route.length - 1) {
        const p = sample(s, t.reverse ? s.length - d : d);
        if (t.reverse) p.angle += Math.PI;
        return p;
      }
      d -= s.length;
    }
    throw new Error('Empty physical path.');
  }
  turnBound(route: Traversal[], start: number, end: number) {
    let base = 0,
      turn = 0,
      previous = this.pose(route, start).angle;
    const add = (angle: number) => {
      turn += Math.abs(
        Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous)),
      );
      previous = angle;
    };
    for (const t of route) {
      const s = this.sections.get(t.section)!;
      if (base + s.length >= start && base <= end) {
        const knots = t.reverse
          ? s.cumulative.map((v) => s.length - v).reverse()
          : s.cumulative;
        for (const d of knots)
          if (base + d > start && base + d < end) {
            add(this.pose(route, base + d - 1e-7).angle);
            add(this.pose(route, base + d + 1e-7).angle);
          }
      }
      base += s.length;
    }
    add(this.pose(route, end).angle);
    return turn;
  }
  intervals(route: Traversal[]): RouteInterval[] {
    const intervals: RouteInterval[] = [];
    let base = 0;
    for (const t of route) {
      const s = this.sections.get(t.section)!;
      intervals.push({
        resource: `section:${s.id}`,
        start: base,
        end: base + s.length,
      });
      if (s.edge)
        intervals.push({
          resource: `block:${s.edge}`,
          start: base,
          end: base + s.length,
        });
      for (const zone of this.zoneMap.get(s.id) ?? []) {
        const v = zone.intervals[zone.sections.indexOf(s.id)];
        intervals.push({
          resource: zone.id,
          start: base + (t.reverse ? s.length - v.end : v.start),
          end: base + (t.reverse ? s.length - v.start : v.end),
        });
      }
      base += s.length;
    }
    // The same zone can be encountered on both sides of a turnout. Keep the
    // whole manoeuvre locked, including the portion between those encounters.
    const merged = new Map<string, RouteInterval>();
    for (const i of intervals) {
      const old = merged.get(i.resource);
      if (old) {
        old.start = Math.min(old.start, i.start);
        old.end = Math.max(old.end, i.end);
      } else merged.set(i.resource, { ...i });
    }
    return [...merged.values()].sort(
      (a, b) => a.start - b.start || a.resource.localeCompare(b.resource),
    );
  }
  private buildZones() {
    // Sample the centre-lines at <=1 unit, then inflate by the sample error.
    // A circumcircle bounds every fleet envelope in every heading.
    const grid = new Map<string, { id: string; d: number; p: Point }[]>(),
      pairs = new Map<
        string,
        { ids: [string, string]; lo: number[]; hi: number[] }
      >();
    const reach = 2 * VEHICLE_RADIUS + 1;
    for (const s of this.sections.values()) {
      const count = Math.ceil(s.length);
      for (let i = 0; i <= count; i++) {
        const d = (s.length * i) / count,
          p = sample(s, d).p,
          x = Math.floor(p.x / 8),
          z = Math.floor(p.z / 8);
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++)
            for (const other of grid.get(`${x + dx}:${z + dz}`) ?? []) {
              if (
                other.id === s.id ||
                Math.abs(p.y - other.p.y) > VERTICAL_CLEARANCE ||
                Math.hypot(p.x - other.p.x, p.z - other.p.z) > reach
              )
                continue;
              const ids = [other.id, s.id].sort() as [string, string],
                key = ids.join('|'),
                values = ids[0] === s.id ? [d, other.d] : [other.d, d];
              const pair = pairs.get(key) ?? {
                ids,
                lo: [Infinity, Infinity],
                hi: [-Infinity, -Infinity],
              };
              for (let k = 0; k < 2; k++) {
                pair.lo[k] = Math.min(pair.lo[k], values[k]);
                pair.hi[k] = Math.max(pair.hi[k], values[k]);
              }
              pairs.set(key, pair);
            }
        const key = `${x}:${z}`,
          cell = grid.get(key) ?? [];
        cell.push({ id: s.id, d, p });
        grid.set(key, cell);
      }
    }
    for (const [key, pair] of pairs) {
      const zone: Zone = {
        id: `zone:${key}`,
        sections: pair.ids,
        intervals: pair.ids.map((id, i) => ({
          start: Math.max(0, pair.lo[i] - 1),
          end: Math.min(this.sections.get(id)!.length, pair.hi[i] + 1),
        })) as Zone['intervals'],
      };
      this.zones.push(zone);
      for (const id of pair.ids) {
        const list = this.zoneMap.get(id) ?? [];
        list.push(zone);
        this.zoneMap.set(id, list);
      }
    }
  }
  asEdges(): TrackEdge[] {
    return [...this.sections.values()].map((s) => ({
      id: s.id,
      a: s.node ?? 0,
      b: s.node ?? 0,
      points: s.points,
      ...measure(s.points),
      kind: s.kind === 'platform' ? 'siding' : 'track',
      block: s.id,
      built: false,
      used: true,
      cost: { track: 0, earthworks: 0, bridges: 0, station: 0, total: 0 },
    }));
  }
}
