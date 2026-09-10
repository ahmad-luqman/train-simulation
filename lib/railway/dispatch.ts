import { ENGINES, type FleetUnit, UPGRADES } from './fleet';
import { newPhysicalMotion, type PhysicalMotion } from './traffic';
import { METRES_PER_UNIT } from './units';
export { METRES_PER_UNIT } from './units';
import {
  edgeAt,
  pointOnEdge,
  type RailNetwork,
  type RouteLeg,
  type TrackEdge,
} from './network';

// One scene unit represents 5.555... metres; the original 2.5 units/s is 50 km/h.
export const TICK = 0.05;
export const BRAKE = 0.85;
export const TURNOUT_CLEARANCE = 2;
export const consistLength = (cars: number) => 5.3 + cars * 3;
export const speedKmh = (velocity: number) => velocity * METRES_PER_UNIT * 3.6;
export type PathSection = RouteLeg & { length: number };
export type WaitReason = {
  kind:
    | 'block'
    | 'junction'
    | 'platform'
    | 'departure'
    | 'headway'
    | 'direction'
    | 'hold'
    | 'depot'
    | 'capacity'
    | 'collision';
  message: string;
  owner?: number;
  resource?: string;
};
export type Motion = {
  physical: PhysicalMotion;
  velocity: number;
  history: PathSection[];
  reversed: boolean;
  started: boolean;
  travelled: number;
  wait?: WaitReason;
  waitingSince: number | null;
  departureDue: number;
  lateness: number;
  departures: number;
  onTime: number;
  calls: number;
};
export type DispatchSettings = {
  priority: 'passenger' | 'freight';
  firstDeparture: number;
  interval: number;
  headway: number;
  platforms: Record<string, string>;
};
export type Reservation = {
  resource: string;
  owner: number;
  releaseAt: number | null;
};
export type DispatchState = {
  reservations: Reservation[];
  lastDepartures: Record<string, number>;
  overrides: number[];
};
export const newMotion = (): Motion => ({
  physical: newPhysicalMotion(),
  velocity: 0,
  history: [],
  reversed: false,
  started: false,
  travelled: 0,
  waitingSince: null,
  departureDue: 0,
  lateness: 0,
  departures: 0,
  onTime: 0,
  calls: 0,
});
export const defaultDispatch = (id: number): DispatchSettings => ({
  priority: [1, 5, 7, 10, 11].includes(id) ? 'passenger' : 'freight',
  firstDeparture: 0,
  interval: 0,
  headway: 2,
  platforms: {},
});
export function performance(
  id: number,
  cars: number,
  load: number,
  edge: TrackEdge,
  from: number,
  unit?: FleetUnit,
) {
  const spec = ENGINES[unit?.engine ?? id];
  const upgrade = UPGRADES[unit?.upgrade ?? 'none'];
  const factor = unit
    ? Math.max(0.4, Math.min(1, unit.condition / 40)) *
      (unit.fuel < 5 || unit.water < 5 ? 0.55 : 1)
    : 1;
  const mass =
    spec.mass +
    cars * (16 + load * 0.16) * (unit?.upgrade === 'capacity' ? 1.15 : 1);
  const grade =
    ((edge.points.at(-1)!.y - edge.points[0].y) / edge.length) *
    (from === edge.a ? 1 : -1);
  const traction = (spec.traction * upgrade.traction * factor) / mass;
  return {
    mass,
    acceleration: Math.max(
      0.06,
      traction - 0.025 - (grade * 9.81) / METRES_PER_UNIT,
    ),
    limit:
      Math.min(
        spec.speed * 0.25 * upgrade.speed * factor,
        Math.sqrt(Math.max(1, edge.radius) * 0.23),
      ) /
      (1 + (cars - 3) * 0.025),
  };
}
export function advanceVelocity(
  velocity: number,
  limit: number,
  remaining: number,
  acceleration: number,
) {
  // Reserve a tick of reaction distance so discrete integration stops short of the boundary.
  const safe = Math.max(
    0,
    Math.sqrt(2 * BRAKE * Math.max(0, remaining)) - BRAKE * TICK,
  );
  const target = Math.min(limit, safe);
  return target < velocity
    ? Math.max(target, velocity - BRAKE * TICK)
    : Math.min(target, velocity + acceleration * TICK);
}
export function pathPosition(
  network: RailNetwork,
  current: RouteLeg,
  distance: number,
  history: PathSection[],
) {
  let leg = current;
  let d = distance;
  for (let i = history.length - 1; d < 0 && i >= 0; i--) {
    leg = history[i];
    d += history[i].length;
  }
  const edge = edgeAt(network, leg.edge);
  const forward = leg.from === edge.a;
  const at = (v: number) => pointOnEdge(edge, forward ? v : edge.length - v);
  const p = at(Math.max(0, d));
  const q = at(Math.min(edge.length, Math.max(0, d) + 0.1));
  const back = at(Math.max(0, Math.min(edge.length, d) - 0.1));
  const tangent = { x: q.x - back.x, y: q.y - back.y, z: q.z - back.z };
  const magnitude = Math.hypot(tangent.x, tangent.y, tangent.z) || 1;
  if (d < 0) {
    p.x += (tangent.x / magnitude) * d;
    p.y += (tangent.y / magnitude) * d;
    p.z += (tangent.z / magnitude) * d;
  }
  return { p, angle: Math.atan2(-tangent.x, -tangent.z), edge: edge.id };
}
export function circularWaits(
  waits: { id: number; owner?: number; owners?: number[] }[],
): number[][] {
  const graph = new Map(
    waits.map((w) => [
      w.id,
      w.owners ?? (w.owner === undefined ? [] : [w.owner]),
    ]),
  );
  let serial = 0;
  const indices = new Map<number, number>(),
    low = new Map<number, number>(),
    stack: number[] = [],
    onStack = new Set<number>(),
    cycles: number[][] = [];
  const visit = (id: number) => {
    indices.set(id, serial);
    low.set(id, serial++);
    stack.push(id);
    onStack.add(id);
    for (const other of graph.get(id) ?? []) {
      if (!indices.has(other)) {
        visit(other);
        low.set(id, Math.min(low.get(id)!, low.get(other)!));
      } else if (onStack.has(other))
        low.set(id, Math.min(low.get(id)!, indices.get(other)!));
    }
    if (low.get(id) === indices.get(id)) {
      const component: number[] = [];
      let other: number;
      do {
        other = stack.pop()!;
        onStack.delete(other);
        component.push(other);
      } while (other !== id);
      if (component.length > 1) cycles.push(component.sort((a, b) => a - b));
    }
  };
  for (const id of graph.keys()) if (!indices.has(id)) visit(id);
  return cycles.sort((a, b) => a[0] - b[0]);
}
