import assert from 'node:assert/strict';
import { Simulation } from './simulation';
import { vehicles, type Pose, type VehicleSpec } from './safety';
export function advance(s: Simulation, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.step(0.05);
}
export function isolated(id = 0) {
  const s = new Simulation();
  s.trains.forEach((t) => (t.held = t.id !== id));
  return s;
}
export function until(s: Simulation, condition: () => boolean, ticks = 12000) {
  for (let i = 0; i < ticks && !condition(); i++) s.step(0.05);
  assert.ok(condition(), 'Scenario did not reach its expected state');
}
export function poses(s: Simulation, id: number) {
  return vehicles(s.trains[id].cars).map((v) =>
    s.vehiclePosition(s.trains[id], v.offset),
  );
}
export function samePoses(
  a: ReturnType<typeof poses>,
  b: ReturnType<typeof poses>,
  tolerance = 0.01,
) {
  assert.equal(a.length, b.length);
  a.forEach((p, i) => {
    assert.ok(
      Math.hypot(p.p.x - b[i].p.x, p.p.y - b[i].p.y, p.p.z - b[i].p.z) <
        tolerance,
      `Vehicle ${i} moved discontinuously`,
    );
    assert.ok(
      Math.abs(
        Math.atan2(
          Math.sin(p.angle - b[i].angle),
          Math.cos(p.angle - b[i].angle),
        ),
      ) < tolerance,
      `Vehicle ${i} rotated discontinuously`,
    );
  });
}
export function sameSave(a: Simulation, b: Simulation) {
  assert.equal(
    JSON.stringify(a.save()) === JSON.stringify(b.save()),
    true,
    'Saved states differ',
  );
}
// Independent SAT oracle, deliberately separate from the runtime collision code.
// Its input includes every rendered vehicle, including the tender and last wagon.
export function assertSeparated(s: Simulation) {
  const boxes = s.trains
    .filter((t) => s.visible(t))
    .flatMap((t) =>
      vehicles(t.cars).map((v) => ({
        ...v,
        ...s.vehiclePosition(t, v.offset),
        train: t.id,
      })),
    );
  assertBodiesSeparated(boxes, s.elapsed);
}
function assertBodiesSeparated(
  boxes: (VehicleSpec & Pose & { train: number })[],
  elapsed: number,
) {
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      if (
        a.train === b.train ||
        a.p.y + a.top <= b.p.y + b.bottom ||
        b.p.y + b.top <= a.p.y + a.bottom
      )
        continue;
      if (Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z) > 6) continue;
      const axes = (angle: number) => [
        [Math.cos(angle), -Math.sin(angle)],
        [Math.sin(angle), Math.cos(angle)],
      ];
      const aa = axes(a.angle),
        bb = axes(b.angle),
        dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1];
      const separated = [...aa, ...bb].some(
        (q) =>
          Math.abs(dot([b.p.x - a.p.x, b.p.z - a.p.z], q)) >=
          a.halfWidth * Math.abs(dot(aa[0], q)) +
            a.halfLength * Math.abs(dot(aa[1], q)) +
            b.halfWidth * Math.abs(dot(bb[0], q)) +
            b.halfLength * Math.abs(dot(bb[1], q)),
      );
      assert.ok(
        separated,
        `Trains ${a.train}/${b.train}, vehicles ${a.offset}/${b.offset}, overlap at ${elapsed}s`,
      );
    }
}

export function stepAndAssertSweep(s: Simulation) {
  const before = s.trains.map((t) => ({
    ...t,
    motion: { ...t.motion, physical: { ...t.motion.physical } },
  }));
  s.step(0.05 / s.speed);
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const bodies = s.trains.flatMap((after, id) => {
      const old = before[id],
        route = old.motion.physical.route ?? after.motion.physical.route;
      if (!s.visible(after) && !s.visible(old)) return [];
      if (!route)
        return vehicles(old.cars).map((v) => ({
          ...v,
          ...s.traffic.pose(s.visible(old) ? old : after, v.offset),
          train: id,
        }));
      const delta = after.motion.travelled - old.motion.travelled;
      const model = old.motion.physical.route ? old : after;
      const at = old.motion.physical.route
        ? old.motion.physical.at
        : after.motion.physical.at - delta;
      return vehicles(model.cars).map((v) => ({
        ...v,
        ...s.traffic.pose(
          {
            ...model,
            motion: {
              ...model.motion,
              physical: { ...model.motion.physical, queued: false, route },
            },
          },
          v.offset,
          at + delta * fraction,
        ),
        train: id,
      }));
    });
    assertBodiesSeparated(bodies, s.elapsed - 0.05 + fraction * 0.05);
  }
}
