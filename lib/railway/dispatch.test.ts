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
import {
  advance,
  isolated,
  until,
  poses,
  samePoses,
  sameSave,
  assertSeparated,
} from './test-helpers';
function shuttle(
  s: Simulation,
  id: number,
  from: number,
  to: number,
  edge: string,
  pinned = true,
) {
  s.services[id] = planService(
    s.network,
    id,
    'Test shuttle',
    [from, to],
    1,
    pinned ? [edge] : [],
  );
  s.trains[id].dwell = 0;
  s.trains[id].motion.departureDue = 0;
  s.trains[id].held = false;
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
void test('six-car rear clearance protects the actual running line and turnout until the final wagon clears', () => {
  const s = isolated(),
    t = s.trains[0];
  t.cars = 6;
  until(s, () => t.motion.started);
  const route = t.motion.physical.route!,
    interval = s.topology
      .intervals(route.sections)
      .find((i) => i.resource === 'block:0-1')!;
  until(s, () => t.motion.physical.at > interval.end + consistLength(6) - 0.2);
  assert.equal(s.occupied.get('0-1'), 0);
  assertSeparated(s);
  until(
    s,
    () =>
      t.motion.physical.at > interval.end + consistLength(6) + 3.1 ||
      !t.motion.started,
  );
  assert.equal(s.occupied.has('0-1'), false);
  assert.ok(
    s.dispatch.reservations.some(
      (r) => r.owner === 0 && r.resource.startsWith('platform:'),
    ),
  );
});
void test('opposing trains automatically choose a purchased passing loop with simultaneous movement and repeated calls', () => {
  const s = isolated();
  s.trains[0].held = true;
  const loop = s.build({
    start: 1,
    end: 2,
    bend: -12,
    kind: 'loop',
    parent: '1-2',
  });
  shuttle(s, 1, 1, 2, '1-2', false);
  shuttle(s, 7, 2, 1, '1-2', false);
  let together = false,
    usedLoop = false;
  for (let i = 0; i < 24000; i++) {
    s.step(0.05);
    assertSeparated(s);
    const resources = s.dispatch.reservations.map((r) => r.resource);
    assert.equal(new Set(resources).size, resources.length);
    together ||=
      s.trains[1].motion.velocity > 0 && s.trains[7].motion.velocity > 0;
    usedLoop ||= [1, 7].some((id) =>
      s.trains[id].motion.physical.route?.legs.some((l) => l.edge === loop),
    );
  }
  assert.ok(together);
  assert.ok(s.trains[1].motion.calls >= 3 && s.trains[7].motion.calls >= 3);
  // Real finite loads change arrival timing. Require the alternate explicitly
  // after preserving the original two-way 1200-second progress assertions.
  s.stopForEditing(1);
  s.stopForEditing(7);
  until(s, () =>
    [1, 7].every((id) => s.trains[id].held && !s.trains[id].motion.started),
  );
  s.setDirection('1-2', 'a-to-b');
  s.trains[1].held = false;
  s.trains[7].held = false;
  let loopTogether = false;
  for (let i = 0; i < 36000; i++) {
    s.step(0.05);
    assertSeparated(s);
    const onLoop = [1, 7].some((id) =>
      s.trains[id].motion.physical.route?.legs.some((l) => l.edge === loop),
    );
    usedLoop ||= onLoop;
    loopTogether ||=
      onLoop &&
      s.trains[1].motion.velocity > 0 &&
      s.trains[7].motion.velocity > 0;
    if (usedLoop && loopTogether) break;
  }
  assert.ok(
    usedLoop && loopTogether,
    'The direction-restricted main must use the loop with concurrent movement',
  );
  const restored = new Simulation();
  restored.restore(s.save());
  sameSave(s, restored);
});
void test('terminal departure keeps the locomotive leading through a physical return loop and preserves all six-car poses', () => {
  const s = isolated(),
    t = s.trains[0];
  t.cars = 6;
  shuttle(s, 0, 0, 1, '0-1');
  t.stopAtStation = true;
  until(s, () => t.held);
  const before = poses(s, 0),
    berth = t.motion.physical.berth;
  t.held = false;
  t.dwell = 0;
  until(s, () => t.motion.started);
  assert.equal(t.motion.reversed, false);
  assert.ok(
    t.motion.physical.route!.sections.some(
      (part) => part.section === `departure:${berth}`,
    ),
  );
  samePoses(before, poses(s, 0));
  assert.ok(
    s.dispatch.reservations.some(
      (r) => r.resource === `platform:${berth}` && r.owner === 0,
    ),
  );
  until(s, () => t.motion.calls >= 3);
  assertSeparated(s);
});
void test('service edits retain every physical platform pose and the occupied approach', () => {
  const s = isolated(),
    t = s.trains[0];
  t.cars = 6;
  t.stopAtStation = true;
  until(s, () => t.held);
  const before = poses(s, 0),
    berth = t.motion.physical.berth!;
  s.assignService(planService(s.network, 0, 'Changed route', [1, 2], 2));
  samePoses(before, poses(s, 0), 1e-9);
  assert.equal(
    s.dispatch.reservations.find((r) => r.resource === `platform:${berth}`)
      ?.owner,
    0,
  );
  const r = new Simulation();
  r.restore(s.save());
  sameSave(s, r);
  samePoses(before, poses(r, 0), 1e-9);
});
void test('platform queues report every blocker and a physical extra platform admits the waiting service', () => {
  const s = isolated(),
    t = s.trains[0];
  for (const p of s.network.stations[1].platforms)
    s.dispatch.reservations.push({
      resource: `platform:${p}`,
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
  const destination = t.motion.physical.route!.destination;
  assert.equal(destination, s.network.stations[1].platforms.at(-1));
  assert.equal(s.topology.sections.get(destination)?.kind, 'platform');
  assertSeparated(s);
});
void test('departure slots, headways, platform preferences and original service intent survive restoration', () => {
  const s = isolated(),
    t = s.trains[0];
  shuttle(s, 0, 0, 1, '0-1');
  s.configureDispatch(0, {
    ...defaultDispatch(0),
    firstDeparture: 10,
    interval: 30,
    headway: 20,
    platforms: { '1': 'platform-1' },
  });
  advance(s, 9);
  assert.equal(t.distance, 0);
  assert.equal(t.motion.wait?.kind, 'departure');
  s.dispatch.lastDepartures['0-1:0'] = 5;
  advance(s, 2);
  assert.equal(t.motion.wait?.kind, 'headway');
  advance(s, 15);
  assert.ok(t.motion.started);
  assert.ok(t.motion.lateness >= 14.9);
  const r = new Simulation();
  r.restore(s.save());
  sameSave(s, r);
  advance(s, 80);
  advance(r, 80);
  sameSave(s, r);
});
void test('passenger priority, bounded aging and dispatch-next arbitrate contested departures without bypassing safety', () => {
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
void test('directions reject occupied track atomically and pinned services explain prohibited departures', () => {
  const s = isolated();
  shuttle(s, 0, 0, 1, '0-1');
  s.setDirection('0-1', 'b-to-a');
  advance(s, 1);
  assert.equal(s.trains[0].motion.started, false);
  assert.match(s.trains[0].motion.wait!.message, /direction/);
  s.setDirection('0-1', 'both');
  advance(s, 2);
  const before = JSON.stringify(s.save());
  assert.throws(() => s.setDirection('0-1', 'a-to-b'), /complete train/);
  assert.equal(JSON.stringify(s.save()), before);
});
void test('all blocking dependencies participate in cycle diagnosis; a protected turn-back preserves service intent', () => {
  assert.deepEqual(
    circularWaits([
      { id: 0, owners: [1, 3] },
      { id: 1, owners: [2] },
      { id: 2, owners: [0] },
      { id: 3, owners: [] },
    ]),
    [[0, 1, 2]],
  );
  const s = isolated(),
    t = s.trains[0];
  t.cars = 6;
  advance(s, 25);
  t.held = true;
  s.step(0.05);
  assert.ok(s.canTurnBack(0));
  const before = poses(s, 0),
    service = JSON.stringify(s.services[0]);
  s.turnBack(0);
  samePoses(before, poses(s, 0), 1e-8);
  assert.equal(JSON.stringify(s.services[0]), service);
  until(s, () => t.held);
  assert.equal(s.endpoints(t)[0], 0);
  assert.equal(JSON.stringify(s.services[0]), service);
  assertSeparated(s);
  t.held = false;
  until(s, () => t.motion.calls >= 2);
});
void test('parallel override changes only the next intent section and preserves the standing physical berth', () => {
  const s = isolated(),
    loop = s.build({
      start: 1,
      end: 2,
      bend: -12,
      kind: 'loop',
      parent: '1-2',
    });
  shuttle(s, 0, 1, 2, '1-2');
  s.configureDispatch(0, { ...defaultDispatch(0), firstDeparture: 20 });
  advance(s, 1);
  const before = poses(s, 0);
  s.useParallel(0, loop);
  samePoses(before, poses(s, 0), 1e-9);
  assert.equal(s.services[0].legs[0].edge, loop);
  assert.equal(s.services[0].legs[1].edge, '1-2');
  advance(s, 21);
  assert.throws(() => s.useParallel(0, '1-2'), /Stop before departure/);
});
void test('invalid motion, reservations, timetables and directions fail without partially restoring', () => {
  const s = isolated();
  advance(s, 28);
  const before = JSON.stringify(s.save());
  for (const mutate of [
    (v: ReturnType<Simulation['save']>) => {
      v.trains[0].motion.velocity = -1;
    },
    (v: ReturnType<Simulation['save']>) => {
      v.dispatch.reservations.push({ ...v.dispatch.reservations[0] });
    },
    (v: ReturnType<Simulation['save']>) => {
      v.dispatch.reservations = v.dispatch.reservations.filter(
        (r) => !r.resource.startsWith('block:'),
      );
    },
    (v: ReturnType<Simulation['save']>) => {
      v.trains[0].motion.physical.route!.sections[0].section = 'missing';
    },
    (v: ReturnType<Simulation['save']>) => {
      v.services[0].dispatch = { ...defaultDispatch(0), headway: NaN };
    },
    (v: ReturnType<Simulation['save']>) => {
      v.network.edges[0].direction = 'invalid' as 'both';
    },
  ]) {
    const bad = s.save();
    mutate(bad);
    assert.throws(() => s.restore(bad));
    assert.equal(JSON.stringify(s.save()), before);
  }
});
void test('legacy versions fail atomically with an explanation and preserve the original input', () => {
  for (const version of [1, 2, 3]) {
    const s = isolated();
    advance(s, 5);
    const v = { ...s.save(), version },
      copy = JSON.stringify(v),
      before = JSON.stringify(s.save());
    assert.throws(() => s.restore(v), /legacy.*physical/);
    assert.equal(JSON.stringify(v), copy);
    assert.equal(JSON.stringify(s.save()), before);
  }
});
void test('station schedules survive edits and one-way planning finds a permitted return', () => {
  const s = isolated();
  s.configureDispatch(0, { ...defaultDispatch(0), interval: 30 });
  s.stopForEditing(0);
  s.assignService(planService(s.network, 0, 'New stops', [0, 3], 4));
  assert.equal(s.settings(0).interval, 30);
  assert.equal(s.trains[0].motion.departureDue, 30);
  s.setDirection('0-1', 'a-to-b');
  const service = planService(s.network, 1, 'Directed service', [0, 1], 2);
  assert.ok(service.legs.some((l) => l.edge === '0-1' && l.from === 0));
  assert.ok(!service.legs.some((l) => l.edge === '0-1' && l.from === 1));
});
void test('save/load across acceleration, turnouts, six-car arrivals and return loops matches uninterrupted operation', () => {
  const s = isolated(),
    t = s.trains[0];
  shuttle(s, 0, 0, 1, '0-1');
  t.cars = 6;
  for (let i = 0; i < 18000; i++) {
    s.step(0.05);
    assertSeparated(s);
    if (i % 137 !== 0) continue;
    const r = new Simulation();
    r.restore(JSON.parse(JSON.stringify(s.save())));
    sameSave(s, r);
    samePoses(poses(s, 0), poses(r, 0), 1e-9);
    for (let j = 0; j < 3; j++) {
      s.step(0.05);
      r.step(0.05);
    }
    sameSave(s, r);
  }
  assert.ok(t.motion.calls >= 3);
});
