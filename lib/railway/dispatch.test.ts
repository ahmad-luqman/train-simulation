import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Simulation } from './simulation';
import {
  consistLength,
  defaultDispatch,
  performance,
  speedKmh,
  circularWaits,
} from './dispatch';
import { planService } from './network';
function advance(s: Simulation, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.step(0.05);
}
function isolated(id = 0) {
  const s = new Simulation();
  s.trains.forEach((t) => {
    t.held = t.id !== id;
  });
  return s;
}
function until(s: Simulation, condition: () => boolean, ticks = 10000) {
  for (let i = 0; i < ticks && !condition(); i++) s.step(0.05);
  assert.ok(condition(), 'Scenario did not reach its expected state');
}
function shuttle(
  s: Simulation,
  id: number,
  from: number,
  to: number,
  edge: string,
) {
  s.services[id] = planService(s.network, id, 'Test shuttle', [from, to], 1, [
    edge,
  ]);
  s.trains[id].dwell = 0;
  s.trains[id].motion.departureDue = 0;
  s.trains[id].held = false;
}
function positions(s: Simulation, id: number) {
  return [0, 3.8, 6.8, 9.8].map(
    (offset) => s.vehiclePosition(s.trains[id], offset).p,
  );
}
function comparePositions(
  before: ReturnType<typeof positions>,
  after: ReturnType<typeof positions>,
  tolerance = 0.01,
) {
  before.forEach((p, i) =>
    assert.ok(
      Math.hypot(p.x - after[i].x, p.y - after[i].y, p.z - after[i].z) <
        tolerance,
      `Vehicle ${i} moved discontinuously`,
    ),
  );
}
void test('traction accelerates continuously; mass, uphill grade and curves reduce performance; speed uses actual world scale', () => {
  const s = isolated(),
    t = s.trains[0],
    e = s.track(t);
  s.step(0.05);
  const first = t.motion.velocity;
  s.step(0.05);
  assert.ok(first > 0 && t.motion.velocity > first && t.motion.velocity < 0.1);
  assert.equal(speedKmh(2.5), 50);
  assert.ok(
    performance(0, 6, 100, e, e.a).acceleration <
      performance(0, 3, 60, e, e.a).acceleration,
  );
  const hill = {
    ...e,
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 40, y: 1.6, z: 0 },
    ],
    length: 40,
  };
  assert.ok(
    performance(0, 3, 100, hill, e.a).acceleration <
      performance(0, 3, 100, hill, e.b).acceleration,
  );
  assert.ok(
    performance(0, 3, 100, { ...e, radius: 10 }, e.a).limit <
      performance(0, 3, 100, e, e.a).limit,
  );
});
void test('a six-car train keeps its old block and junction until its rear clears the onward leg', () => {
  const s = isolated(),
    t = s.trains[0];
  t.cars = 6;
  s.stopForEditing(0);
  t.held = false;
  s.stopForEditing(0);
  t.held = false;
  t.stopAtStation = true;
  const incoming = s.track(t).id;
  until(s, () => t.held && t.motion.history.length > 0);
  const node = s.endpoints(t)[0];
  assert.equal(s.occupied.get(incoming), 0);
  assert.equal(
    s.dispatch.reservations.find((r) => r.resource === `junction:${node}`)
      ?.owner,
    0,
  );
  t.held = false;
  until(s, () => t.motion.started && t.distance > consistLength(6) - 0.5);
  assert.equal(s.occupied.get(incoming), 0);
  until(s, () => t.distance > consistLength(6) + 2.1);
  assert.equal(s.occupied.has(incoming), false);
  assert.equal(
    s.dispatch.reservations.some((r) => r.resource === `junction:${node}`),
    false,
  );
});
void test('opposing trains traverse a purchased loop and main track together, with exclusive resources and repeated calls', () => {
  const s = isolated();
  s.trains[0].held = true;
  const parent = s.network.edges.find(
    (e) =>
      !s.quote({ start: e.a, end: e.b, bend: -12, kind: 'loop', parent: e.id })
        .errors.length,
  )!;
  assert.ok(parent);
  const loop = s.build({
    start: parent.a,
    end: parent.b,
    bend: -12,
    kind: 'loop',
    parent: parent.id,
  });
  s.addStation(parent.a, 'Extra platform');
  s.addStation(parent.b, 'Extra platform');
  shuttle(s, 0, parent.a, parent.b, parent.id);
  shuttle(s, 1, parent.b, parent.a, loop);
  let together = false;
  for (let i = 0; i < 6000; i++) {
    s.step(0.05);
    const reservations = s.dispatch.reservations;
    assert.equal(
      new Set(reservations.map((r) => r.resource)).size,
      reservations.length,
    );
    if (
      s.trains[0].distance > consistLength(3) + 2 &&
      s.trains[1].distance > consistLength(3) + 2
    )
      together = true;
  }
  assert.ok(together, 'Independent main and loop blocks did not allow a meet');
  assert.ok(s.trains[0].motion.calls >= 3 && s.trains[1].motion.calls >= 3);
  const restored = new Simulation();
  restored.restore(s.save());
  assert.deepEqual(restored.save(), s.save());
});
void test('8× running brakes before a restrictive junction and never crosses its signal boundary', () => {
  const s = isolated(),
    t = s.trains[0],
    edge = s.track(t),
    end = s.endpoints(t)[1];
  s.dispatch.reservations.push({
    resource: `junction:${end}`,
    owner: 1,
    releaseAt: null,
  });
  let max = 0,
    braked = false;
  s.speed = 8;
  for (let i = 0; i < 300; i++) {
    const previous = t.motion.velocity;
    s.step(0.05);
    max = Math.max(max, t.motion.velocity);
    if (t.motion.velocity < previous) braked = true;
    assert.ok(t.distance <= edge.length - 2 + 1e-8);
  }
  assert.ok(max > 1 && braked);
  assert.ok(t.motion.velocity < 0.01);
  assert.equal(t.motion.wait?.kind, 'junction');
  assert.equal(
    s.dispatch.reservations.find((r) => r.resource === `junction:${end}`)
      ?.owner,
    1,
  );
});
void test('terminal reversal preserves every vehicle position and the occupied block', () => {
  const s = isolated(),
    t = s.trains[0];
  shuttle(s, 0, 0, 1, '0-1');
  t.stopAtStation = true;
  until(s, () => t.held);
  const before = positions(s, 0);
  t.held = false;
  t.dwell = 0;
  until(s, () => t.motion.started);
  assert.equal(t.motion.reversed, true);
  comparePositions(before, positions(s, 0));
  assert.equal(s.occupied.get('0-1'), 0);
  until(s, () => t.motion.calls >= 3);
});
void test('reassigning a station service preserves the actual approach of all wagons', () => {
  const s = isolated(),
    t = s.trains[0];
  t.stopAtStation = true;
  until(s, () => t.held);
  const before = positions(s, 0),
    incoming = t.motion.history.at(-1)!.edge;
  s.assignService(planService(s.network, 0, 'Changed route', [1, 2], 2));
  comparePositions(before, positions(s, 0), 1e-9);
  assert.equal(s.occupied.get(incoming), 0);
  const restore = new Simulation();
  restore.restore(s.save());
  comparePositions(before, positions(restore, 0), 1e-9);
});
void test('platform queues name the blocking train and an extra platform allows the queued departure', () => {
  const s = isolated(),
    t = s.trains[0];
  s.dispatch.reservations.push({
    resource: 'platform:platform-1',
    owner: 1,
    releaseAt: null,
  });
  advance(s, 1);
  assert.equal(t.motion.wait?.kind, 'platform');
  assert.equal(t.motion.wait.owner, 1);
  assert.equal(t.distance, 0);
  s.addStation(1, 'Ashford');
  s.step(0.05);
  assert.ok(t.motion.started);
  const assigned = s.dispatch.reservations.find(
    (r) => r.owner === 0 && r.resource.startsWith('platform:'),
  )!;
  assert.notEqual(assigned.resource, 'platform:platform-1');
});
void test('departure slots, minimum headway and platform preferences persist and hold trains until ready', () => {
  const s = isolated(),
    t = s.trains[0],
    settings = {
      ...defaultDispatch(0),
      firstDeparture: 10,
      interval: 30,
      headway: 20,
      platforms: { '1': 'platform-1' },
    };
  s.configureDispatch(0, settings);
  advance(s, 9);
  assert.equal(t.distance, 0);
  assert.equal(t.motion.wait?.kind, 'departure');
  s.dispatch.lastDepartures['0-1:0'] = 5;
  advance(s, 2);
  assert.equal(t.motion.wait?.kind, 'headway');
  advance(s, 15);
  assert.ok(t.distance > 0);
  assert.ok(t.motion.lateness >= 14.9);
  const restored = new Simulation();
  restored.restore(s.save());
  assert.deepEqual(restored.save(), s.save());
  advance(s, 80);
  advance(restored, 80);
  assert.deepEqual(restored.save(), s.save());
});
void test('passenger priority, aging and dispatch-next override arbitrate contested departures without bypassing safety', () => {
  const make = () => {
    const s = isolated();
    shuttle(s, 0, 0, 1, '0-1');
    shuttle(s, 1, 0, 1, '0-1');
    return s;
  };
  const normal = make();
  normal.step(0.05);
  assert.equal(normal.occupied.get('0-1'), 1);
  const override = make();
  override.prioritize(0);
  override.step(0.05);
  assert.equal(override.occupied.get('0-1'), 0);
  assert.equal(override.trains[1].motion.started, false);
  const aged = make();
  aged.elapsed = 100;
  aged.trains[0].motion.waitingSince = 0;
  aged.step(0.05);
  assert.equal(aged.occupied.get('0-1'), 0);
});
void test('direction commands reject occupied track atomically and explain prohibited departures', () => {
  const s = isolated();
  s.setDirection('0-1', 'b-to-a');
  advance(s, 1);
  assert.equal(s.trains[0].motion.wait?.kind, 'direction');
  s.setDirection('0-1', 'both');
  advance(s, 1);
  const before = s.save();
  assert.throws(() => s.setDirection('0-1', 'a-to-b'), /complete train/);
  assert.deepEqual(s.save(), before);
});
void test('dense traffic exposes circular waits, and a physical turn-back frees the bottleneck without dropping its block', () => {
  assert.deepEqual(
    circularWaits([
      { id: 0, owner: 1 },
      { id: 1, owner: 2 },
      { id: 2, owner: 0 },
      { id: 3, owner: 1 },
    ]),
    [[0, 1, 2]],
  );
  const s = new Simulation();
  advance(s, 100);
  assert.ok(s.dispatcherSnapshot().cycles.length > 0);
  const t = s.trains.find(
    (t) =>
      s.canTurnBack(t.id) &&
      !s.dispatch.reservations.some(
        (r) =>
          r.resource === `platform:platform-${t.motion.history.at(-1)?.from}`,
      ),
  )!;
  assert.ok(t);
  const before = positions(s, t.id),
    edge = t.motion.history.at(-1)!.edge;
  s.turnBack(t.id);
  comparePositions(before, positions(s, t.id), 1e-9);
  assert.equal(s.occupied.get(edge), t.id);
  until(s, () => t.held);
  assert.equal(s.occupied.get(edge), t.id);
  assert.ok(t.motion.calls >= 2);
});
void test('parallel recovery changes only the next route section while preserving the physical approach', () => {
  const s = isolated(),
    parent = s.network.edges.find(
      (e) =>
        !s.quote({
          start: e.a,
          end: e.b,
          bend: -12,
          kind: 'loop',
          parent: e.id,
        }).errors.length,
    )!;
  const loop = s.build({
    start: parent.a,
    end: parent.b,
    bend: -12,
    kind: 'loop',
    parent: parent.id,
  });
  shuttle(s, 0, parent.a, parent.b, parent.id);
  s.trains[0].held = true;
  s.useParallel(0, loop);
  assert.equal(s.services[0].legs[0].edge, loop);
  assert.equal(s.services[0].legs[1].edge, parent.id);
  s.trains[0].held = false;
  advance(s, 1);
  assert.throws(() => s.useParallel(0, parent.id), /Stop before departure/);
});
void test('invalid motion, reservations, timetables and direction saves fail without mutating the live railway', () => {
  const s = isolated();
  advance(s, 28);
  const before = s.save();
  for (const mutate of [
    (v: typeof before) => {
      v.trains[0].motion.velocity = -1;
    },
    (v: typeof before) => {
      v.dispatch.reservations.push({ ...v.dispatch.reservations[0] });
    },
    (v: typeof before) => {
      v.dispatch.reservations = v.dispatch.reservations.filter(
        (r) => !r.resource.startsWith('block:'),
      );
    },
    (v: typeof before) => {
      v.trains[0].motion.history[0].edge = 'missing';
    },
    (v: typeof before) => {
      v.services[0].dispatch = { ...defaultDispatch(0), headway: NaN };
    },
    (v: typeof before) => {
      v.network.edges[0].direction = 'invalid' as 'both';
    },
  ]) {
    const bad = structuredClone(before);
    mutate(bad);
    assert.throws(() => s.restore(bad));
    assert.deepEqual(s.save(), before);
  }
});
void test('version 2 saves migrate in place with original balances and positions and retain their input', () => {
  const original = isolated();
  advance(original, 5);
  const current = original.save();
  const legacy = {
    ...current,
    version: 2,
    trains: current.trains.map(({ motion: _motion, ...t }) => t),
  };
  const input = structuredClone(legacy),
    restored = new Simulation();
  restored.restore(legacy);
  assert.deepEqual(legacy, input);
  assert.equal(restored.trains[0].distance, original.trains[0].distance);
  assert.equal(restored.treasury, original.treasury);
  assert.equal(restored.occupied.get('0-1'), 0);
  advance(restored, 100);
  assert.ok(restored.trains[0].delivered > 0);
});
void test('station schedules survive service edits and a one-way planner finds the permitted return path', () => {
  const s = isolated();
  s.configureDispatch(0, { ...defaultDispatch(0), interval: 30 });
  s.stopForEditing(0);
  s.assignService(planService(s.network, 0, 'New stops', [0, 3], 4));
  assert.equal(s.settings(0).interval, 30);
  assert.equal(s.trains[0].motion.departureDue, 30);
  s.setDirection('0-1', 'a-to-b');
  const planned = planService(s.network, 1, 'Directed service', [0, 1], 2);
  assert.ok(planned.legs.some((l) => l.edge === '0-1' && l.from === 0));
  assert.ok(!planned.legs.some((l) => l.edge === '0-1' && l.from === 1));
});
void test('save/load at every stage of a reversing long train retains all physical reservations', () => {
  const s = isolated(),
    t = s.trains[0];
  shuttle(s, 0, 0, 1, '0-1');
  t.cars = 6;
  for (let i = 0; i < 1800; i++) {
    s.step(0.05);
    if (i % 11 !== 0) continue;
    const restored = new Simulation();
    restored.restore(JSON.parse(JSON.stringify(s.save())));
    assert.deepEqual(restored.save(), s.save());
    comparePositions(positions(s, 0), positions(restored, 0), 1e-9);
    restored.step(0.05);
    const expected = new Simulation();
    expected.restore(s.save());
    expected.step(0.05);
    assert.deepEqual(restored.save(), expected.save());
  }
  assert.ok(t.motion.calls >= 3);
});
