import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import { MAP, MAP_SCALE } from './map';
import { Simulation } from './simulation';
import { sample } from './topology';
import { planService } from './network';
import {
  advance,
  isolated,
  until,
  poses,
  samePoses,
  sameSave,
  stepAndAssertSweep,
} from './test-helpers';

void test('larger valley expands town spacing and construction area without scaling vehicles', () => {
  const original = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL('./fixtures/phase3-initial.json.gz', import.meta.url),
      ),
    ).toString(),
  );
  const s = new Simulation();
  assert.ok(
    Math.abs(
      ((MAP.maxX - MAP.minX) * (MAP.maxZ - MAP.minZ)) / (172 * 145) -
        MAP_SCALE ** 2,
    ) < 1e-12,
  );
  for (const n of s.network.nodes) {
    assert.equal(n.x, original.network.nodes[n.id].x * MAP_SCALE);
    assert.equal(n.z, original.network.nodes[n.id].z * MAP_SCALE);
  }
  for (const e of s.network.edges)
    assert.ok(
      e.length >
        original.network.edges.find((old: { id: string }) => old.id === e.id)
          .length *
          2.2,
    );
  assert.equal(s.network.stations[4].platforms.length, 4);
  assert.ok(
    s.network.stations
      .filter((station) => station.node !== 4)
      .every((station) => station.platforms.length === 3),
  );
});
void test('through platforms join shared arrivals and tangent-connected return loops inside the expanded valley', () => {
  const s = new Simulation();
  for (const station of s.network.stations)
    for (const platform of station.platforms) {
      const berth = s.topology.sections.get(platform)!,
        arrival = s.topology.sections.get(`arrival:${platform}`)!,
        departure = s.topology.sections.get(`departure:${platform}`)!;
      assert.deepEqual(arrival.points.at(-1), berth.points[0]);
      assert.deepEqual(departure.points[0], berth.points.at(-1));
      const a = sample(berth, berth.length - 0.1).angle,
        b = sample(departure, 0.1).angle;
      assert.ok(Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.03);
      assert.ok(departure.radius >= 16 - 1e-6);
      assert.ok(
        departure.points.every(
          (p) => Math.abs(p.x) < MAP.halfWidth && Math.abs(p.z) < MAP.halfDepth,
        ),
      );
      assert.equal(arrival.a, `yard-entry:${station.node}`);
      assert.equal(departure.b, `yard-exit:${station.node}`);
    }
});
void test('six-car services keep the locomotive at the head through station exits and repeated calls', () => {
  const s = isolated(),
    t = s.trains[0];
  s.services[0] = planService(s.network, 0, 'Leading engine', [0, 1], 1, [
    '0-1',
  ]);
  t.cars = 6;
  t.dwell = 0;
  t.motion.departureDue = 0;
  let traversedReturn = false;
  for (let i = 0; i < 24000; i++) {
    const wasVisible = s.visible(t);
    const before = s.vehiclePosition(t, 0),
      travelled = t.motion.travelled;
    stepAndAssertSweep(s);
    assert.equal(t.motion.reversed, false);
    if (
      wasVisible &&
      t.motion.travelled > travelled &&
      t.motion.physical.route
    ) {
      const after = s.vehiclePosition(t, 0),
        dx = after.p.x - before.p.x,
        dz = after.p.z - before.p.z;
      assert.ok(
        dx * -Math.sin(before.angle) + dz * -Math.cos(before.angle) > -1e-6,
        'Engine moved tail-first or teleported',
      );
    }
    traversedReturn ||= s.traffic.currentSection(t).id.startsWith('departure:');
  }
  assert.ok(traversedReturn && t.motion.calls >= 3);
  assert.equal(t.motion.physical.emergencies, 0);
});
void test('manual backing preserves every vehicle, restores at its return berth, then resumes locomotive-first', () => {
  const s = isolated(),
    t = s.trains[0];
  t.cars = 6;
  until(
    s,
    () =>
      s.traffic.currentSection(t).kind === 'running' && t.motion.velocity > 1,
  );
  t.held = true;
  s.step(0.05);
  const before = poses(s, 0);
  s.turnBack(0);
  samePoses(before, poses(s, 0), 1e-8);
  until(s, () => t.held && !t.motion.started, 24000);
  assert.equal(t.motion.physical.berthReverse, true);
  const restored = new Simulation();
  restored.restore(s.save());
  sameSave(s, restored);
  const returned = poses(s, 0);
  t.held = false;
  t.dwell = 0;
  until(s, () => t.motion.started);
  samePoses(returned, poses(s, 0));
  assert.equal(t.motion.reversed, false);
  restored.restore(s.save());
  advance(s, 30);
  advance(restored, 30);
  sameSave(s, restored);
});
void test('v4 map saves are rejected atomically and their input remains untouched', () => {
  const s = new Simulation(),
    before = JSON.stringify(s.save()),
    old = { ...s.save(), version: 4 };
  const original = JSON.stringify(old);
  assert.throws(
    () => s.restore(old),
    /different map or physical station layout/,
  );
  assert.equal(JSON.stringify(s.save()), before);
  assert.equal(JSON.stringify(old), original);
});
