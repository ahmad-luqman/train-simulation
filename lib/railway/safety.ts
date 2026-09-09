import type { Point } from './network';

// Scene units, including animated rods, wheel rotation and carriage sway.
// Coupling contact is permitted within one consist only.
export const SAFETY_MARGIN = 0.12;
export const VEHICLE_RADIUS = 2.8;
export const VERTICAL_CLEARANCE = 3.1;
export type VehicleSpec = {
  kind: 'locomotive' | 'tender' | 'wagon';
  offset: number;
  halfWidth: number;
  halfLength: number;
  bottom: number;
  top: number;
};
export const ENGINE: VehicleSpec = {
  kind: 'locomotive',
  offset: 0,
  halfWidth: 1.02,
  halfLength: 2.45,
  bottom: -0.02,
  top: 2.65,
};
export const TENDER: VehicleSpec = {
  kind: 'tender',
  offset: 3.8,
  halfWidth: 0.9,
  halfLength: 1.72,
  bottom: -0.02,
  top: 1.85,
};
export const WAGON: VehicleSpec = {
  kind: 'wagon',
  offset: 6.8,
  halfWidth: 0.9,
  halfLength: 1.4,
  bottom: -0.03,
  top: 1.9,
};
export function vehicles(cars: number): VehicleSpec[] {
  return [
    ENGINE,
    TENDER,
    ...Array.from({ length: cars }, (_, i) => ({
      ...WAGON,
      offset: 6.8 + i * 3,
    })),
  ];
}
export type Pose = { p: Point; angle: number; edge?: string };
export type Envelope = VehicleSpec &
  Pose & { train: number; vehicle: number; margin: number };
export function envelopes(
  train: number,
  cars: number,
  pose: (offset: number) => Pose,
): Envelope[] {
  return vehicles(cars).map((v, vehicle) => ({
    ...v,
    ...pose(v.offset),
    train,
    vehicle,
    margin: SAFETY_MARGIN,
  }));
}
export function bounds(e: Envelope) {
  const c = Math.abs(Math.cos(e.angle)),
    s = Math.abs(Math.sin(e.angle));
  const x = c * e.halfWidth + s * e.halfLength + e.margin;
  const z = s * e.halfWidth + c * e.halfLength + e.margin;
  return { minX: e.p.x - x, maxX: e.p.x + x, minZ: e.p.z - z, maxZ: e.p.z + z };
}
export function intersects(a: Envelope, b: Envelope): boolean {
  if (
    a.train === b.train ||
    a.p.y + a.top + a.margin < b.p.y + b.bottom - b.margin ||
    b.p.y + b.top + b.margin < a.p.y + a.bottom - a.margin
  )
    return false;
  const axes = (e: Envelope) => [
    { x: Math.cos(e.angle), z: -Math.sin(e.angle) },
    { x: Math.sin(e.angle), z: Math.cos(e.angle) },
  ];
  const [au, av] = axes(a),
    [bu, bv] = axes(b);
  const dot = (u: { x: number; z: number }, v: { x: number; z: number }) =>
    u.x * v.x + u.z * v.z;
  const d = { x: b.p.x - a.p.x, z: b.p.z - a.p.z };
  return [au, av, bu, bv].every(
    (q) =>
      Math.abs(dot(d, q)) <
      a.halfWidth * Math.abs(dot(au, q)) +
        a.halfLength * Math.abs(dot(av, q)) +
        a.margin +
        b.halfWidth * Math.abs(dot(bu, q)) +
        b.halfLength * Math.abs(dot(bv, q)) +
        b.margin,
  );
}
// Spatial hash broad phase. No Three.js objects or reservation IDs participate.
export class OccupancyIndex {
  private cells = new Map<string, Envelope[]>();
  constructor(items: Envelope[] = []) {
    items.forEach((e) => this.add(e));
  }
  private keys(e: Envelope) {
    const b = bounds(e),
      keys: string[] = [];
    for (let x = Math.floor(b.minX / 8); x <= Math.floor(b.maxX / 8); x++)
      for (let z = Math.floor(b.minZ / 8); z <= Math.floor(b.maxZ / 8); z++)
        keys.push(`${x}:${z}`);
    return keys;
  }
  add(e: Envelope) {
    for (const key of this.keys(e)) {
      const cell = this.cells.get(key) ?? [];
      cell.push(e);
      this.cells.set(key, cell);
    }
  }
  conflict(e: Envelope) {
    const checked = new Set<Envelope>();
    for (const key of this.keys(e))
      for (const other of this.cells.get(key) ?? []) {
        if (checked.has(other)) continue;
        checked.add(other);
        if (intersects(e, other)) return other;
      }
    return undefined;
  }
}
export function collision(items: Envelope[]) {
  const index = new OccupancyIndex();
  for (const e of items) {
    const other = index.conflict(e);
    if (other) return [other, e] as const;
    index.add(e);
  }
  return undefined;
}
// A box expanded by an arc-length bound plus r*angular-variation contains every
// translated/rotated pose during that interval (including a polyline vertex).
export function sweptEnvelope(
  e: Envelope,
  travel: number,
  turn: number,
): Envelope {
  return {
    ...e,
    margin: e.margin + travel + Math.hypot(e.halfWidth, e.halfLength) * turn,
  };
}
