import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { Simulation } from './simulation';
import {
  collision,
  envelopes,
  ENGINE,
  intersects,
  OccupancyIndex,
  sweptEnvelope,
} from './safety';
import { planService } from './network';
import { pathPosition, consistLength } from './dispatch';
import {
  advance,
  assertSeparated,
  isolated,
  sameSave,
  until,
  stepAndAssertSweep,
} from './test-helpers';
const legacy = (name: string) =>
  JSON.parse(
    gunzipSync(
      readFileSync(new URL(`./fixtures/${name}.json.gz`, import.meta.url)),
    ).toString(),
  ) as ReturnType<Simulation['save']>;
void test('preserved C1/C2 audit fixtures contain real intersections and P1 rejects both atomically', () => {
  for (const name of ['phase3-initial', 'phase3-loop-collision']) {
    const saved = legacy(name);
    const boxes = saved.trains.flatMap((t) => {
      const m = t.motion;
      let leg = saved.services[t.id].legs[t.leg],
        d = t.distance,
        history = m.history;
      if (!m.started && history.length) {
        leg = history.at(-1)!;
        d = history.at(-1)!.length;
        history = history.slice(0, -1);
      }
      return envelopes(t.id, t.cars, (o) => {
        const p = pathPosition(
          saved.network,
          leg,
          d - (m.reversed ? consistLength(t.cars) - o : o),
          history,
        );
        if (m.reversed) p.angle += Math.PI;
        return p;
      });
    });
    assert.ok(
      collision(
        name.includes('loop')
          ? boxes.filter((b) => [1, 7].includes(b.train))
          : boxes,
      ),
    );
    const s = new Simulation(),
      before = JSON.stringify(s.save());
    assert.throws(() => s.restore(saved), /legacy.*physical/);
    assert.equal(JSON.stringify(s.save()), before);
  }
});
void test('C1: depot admission, fresh saves and reset never render overlapping queued trains', () => {
  const s = new Simulation();
  assert.ok(s.trains.every((t) => t.motion.physical.queued && !s.visible(t)));
  for (let i = 0; i < 600; i++) {
    s.step(0.05);
    assertSeparated(s);
  }
  assert.ok(s.trains.filter((t) => s.visible(t)).length >= 4);
  const r = new Simulation();
  r.restore(s.save());
  sameSave(s, r);
  assertSeparated(r);
  const fresh = new Simulation();
  fresh.restore(new Simulation().save());
  assertSeparated(fresh);
});
void test('R1: all twelve simultaneous services deliver in 1800 seconds and continue through a second 1800-second window', () => {
  const s = new Simulation();
  let maximumMoving = 0;
  for (let i = 0; i < 36000; i++) {
    s.step(0.05);
    assertSeparated(s);
    maximumMoving = Math.max(
      maximumMoving,
      s.trains.filter((t) => t.motion.velocity > 0).length,
    );
  }
  const midway = s.trains.map((t) => t.delivered);
  for (let i = 0; i < 36000; i++) {
    s.step(0.05);
    assertSeparated(s);
  }
  s.trains.forEach((t, i) => {
    assert.ok(
      midway[i] > 0 && t.delivered > midway[i],
      `Service ${i} stalled: ${midway[i]} → ${t.delivered}`,
    );
    assert.equal(t.held, false);
    assert.equal(t.motion.physical.emergencies, 0);
  });
  assert.ok(
    maximumMoving >= 4,
    `Only ${maximumMoving} trains moved concurrently`,
  );
  assert.equal(
    s.treasury,
    425000 + s.trains.reduce((n, t) => n + t.revenue, 0),
  );
  assert.ok(s.events.length <= 20);
  assert.equal(
    s.delivered,
    s.trains.reduce((n, t) => n + t.delivered, 0),
  );
});
void test('C2: audited main/loop same-direction arrival remains separated with a held destination train', () => {
  const s = isolated();
  s.trains[0].held = true;
  const loop = s.build({
    start: 1,
    end: 2,
    bend: -12,
    kind: 'loop',
    parent: '1-2',
  });
  for (const [id, edge] of [
    [1, loop],
    [7, '1-2'],
  ] as const) {
    s.services[id] = planService(s.network, id, 'Audit shuttle', [1, 2], 1, [
      edge,
    ]);
    s.trains[id].held = false;
    s.trains[id].dwell = 0;
    s.trains[id].motion.departureDue = 0;
  }
  s.trains[7].stopAtStation = true;
  for (let i = 0; i < 12000; i++) {
    s.step(0.05);
    assertSeparated(s);
  }
  assert.ok(s.trains[1].motion.calls >= 3 && s.trains[7].held);
  assert.equal(
    s.trains[1].motion.physical.emergencies +
      s.trains[7].motion.physical.emergencies,
    0,
  );
});
void test('swept collision backstop catches translation and rotation tunnelling and allows height clearance', () => {
  const a = {
      ...ENGINE,
      p: { x: 0, y: 0, z: 0 },
      angle: 0,
      train: 0,
      vehicle: 0,
      margin: 0.12,
    },
    b = { ...a, p: { x: 5, y: 0, z: 0 }, train: 1 };
  assert.equal(intersects(a, b), false);
  assert.ok(new OccupancyIndex([b]).conflict(sweptEnvelope(a, 10, 0)));
  const rotated = { ...b, p: { x: 2.7, y: 0, z: 0 } };
  assert.ok(
    new OccupancyIndex([rotated]).conflict(sweptEnvelope(a, 0, Math.PI / 2)),
  );
  assert.equal(
    intersects(sweptEnvelope(a, 0.2, 0), { ...b, p: { x: 0, y: 8, z: 0 } }),
    false,
  );
});
void test('P1: v4 geometric overlap and missing/falsified authority fail without changing live state', () => {
  const s = isolated();
  advance(s, 35);
  const before = JSON.stringify(s.save());
  for (const mutate of [
    (v: ReturnType<Simulation['save']>) => {
      v.trains[0].motion.physical.stopTarget = 0;
    },
    (v: ReturnType<Simulation['save']>) => {
      v.trains[0].motion.physical.route!.nextLeg =
        (v.trains[0].motion.physical.route!.nextLeg + 1) %
        v.services[0].legs.length;
    },
    (v: ReturnType<Simulation['save']>) => {
      v.dispatch.reservations = [];
    },
    (v: ReturnType<Simulation['save']>) => {
      const t = structuredClone(v.trains[0]);
      t.id = 1;
      v.trains[1] = t;
    },
    (v: ReturnType<Simulation['save']>) => {
      v.trains[0].motion.physical.route!.sections[1].reverse =
        !v.trains[0].motion.physical.route!.sections[1].reverse;
    },
  ]) {
    const bad = s.save();
    mutate(bad);
    assert.throws(() => s.restore(bad));
    assert.equal(JSON.stringify(s.save()), before);
  }
});
void test('a held conflict stops approaches at their physical braking target at 1×, 3× and 8×', () => {
  for (const speed of [1, 3, 8]) {
    const s = isolated(),
      t = s.trains[0];
    until(
      s,
      () => t.motion.physical.route !== undefined && t.motion.velocity > 1,
    );
    const p = t.motion.physical,
      r = p.route!,
      future = s.topology
        .intervals(r.sections)
        .find(
          (i) =>
            i.resource.startsWith('zone:') &&
            i.start > p.at + 20 &&
            !s.dispatch.reservations.some((res) => res.resource === i.resource),
        );
    assert.ok(future, 'Scenario needs an ungranted downstream movement');
    s.dispatch.reservations.push({
      resource: future.resource,
      owner: 1,
      releaseAt: null,
    });
    s.speed = speed;
    let braked = false,
      previous = t.motion.velocity;
    for (let i = 0; i < 1800 / speed; i++) {
      s.step(0.05);
      if (t.motion.velocity < previous) braked = true;
      previous = t.motion.velocity;
      assert.ok(p.at < future.start - 2.9);
      assertSeparated(s);
    }
    assert.ok(braked && t.motion.velocity < 0.01);
    assert.equal(t.motion.physical.emergencies, 0);
  }
});

void test('independent sub-tick sampling covers every vehicle through opposing loop movements and long-train reversals', () => {
  for (const speed of [1, 3, 8]) {
    const s = isolated();
    s.trains[0].held = true;
    const loop = s.build({
      start: 1,
      end: 2,
      bend: -12,
      kind: 'loop',
      parent: '1-2',
    });
    for (const [id, stops, edge] of [
      [1, [1, 2], '1-2'],
      [7, [2, 1], loop],
    ] as const) {
      s.services[id] = planService(
        s.network,
        id,
        'Sweep shuttle',
        [...stops],
        1,
        [edge],
      );
      s.trains[id].cars = 6;
      s.trains[id].held = false;
      s.trains[id].dwell = 0;
      s.trains[id].motion.departureDue = 0;
    }
    s.speed = speed;
    for (let i = 0; i < 6500; i++) stepAndAssertSweep(s);
    assert.ok(s.trains[1].motion.calls >= 1 && s.trains[7].motion.calls >= 1);
    assert.equal(
      s.trains[1].motion.physical.emergencies +
        s.trains[7].motion.physical.emergencies,
      0,
    );
  }
});
