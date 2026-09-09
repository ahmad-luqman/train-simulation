import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Simulation, type SaveState } from './simulation';
import {
  createNetwork,
  edgeAt,
  nodeAt,
  pointOnEdge,
  planService,
  quoteConstruction,
  snapNode,
  type Construction,
} from './network';
import { TrackCurve } from './network-view';
const extension: Construction = {
  start: 3,
  end: { x: -80, z: 10 },
  bend: 0,
  kind: 'track',
  stationName: 'West depot',
};
function advance(s: Simulation, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 20); i++) s.step(0.05);
}
function buildExtension(s = new Simulation()) {
  const id = s.build(extension),
    station = s.network.nodes.find((n) => n.name === 'West depot')!;
  return { s, id, station };
}
void test('shared track lengths preserve the original curves and agree with renderer samples', () => {
  const network = createNetwork();
  for (const e of network.edges) {
    const a = nodeAt(network, e.a),
      b = nodeAt(network, e.b),
      start = new THREE.Vector3(a.x, a.y, a.z),
      end = new THREE.Vector3(b.x, b.y, b.z),
      d = end.clone().sub(start),
      normal = new THREE.Vector3(-d.z, 0, d.x).normalize();
    const old = new THREE.CatmullRomCurve3([
      start,
      start.clone().lerp(end, 0.22).addScaledVector(normal, 2.2),
      start.clone().lerp(end, 0.78).addScaledVector(normal, 2.2),
      end,
    ]);
    assert.ok(Math.abs(e.length - old.getLength()) < 1e-9);
    const view = new TrackCurve(e);
    assert.equal(view.getLength(), e.length);
    for (const fraction of [0, 0.17, 0.5, 0.99, 1]) {
      const expected = pointOnEdge(e, fraction * e.length),
        actual = view.getPointAt(fraction);
      assert.ok(
        Math.hypot(
          actual.x - expected.x,
          actual.y - expected.y,
          actual.z - expected.z,
        ) < 1e-9,
      );
    }
  }
});
void test('fixed simulation ticks give equal results across render frame rates and pause preserves the remainder', () => {
  const a = new Simulation(),
    b = new Simulation();
  for (let i = 0; i < 600; i++) a.step(1 / 60);
  for (let i = 0; i < 200; i++) b.step(0.05);
  const sa = a.save(),
    sb = b.save();
  sa.accumulator = 0;
  sb.accumulator = 0;
  assert.deepEqual(sa, sb);
  a.step(0.013);
  a.paused = true;
  const paused = a.save();
  a.step(0.25);
  assert.deepEqual(a.save(), paused);
});
void test('construction quotes commit geometry and itemized cost once; unused undo fully refunds', () => {
  const s = new Simulation(),
    q = s.quote(extension),
    before = s.treasury;
  assert.deepEqual(q.errors, []);
  const id = s.build(extension),
    e = edgeAt(s.network, id);
  assert.deepEqual(e.points, q.edge!.points);
  assert.deepEqual(e.cost, q.cost);
  assert.equal(before - s.treasury, q.cost.total);
  assert.equal(s.construction[0].amount, q.cost.total);
  assert.equal(s.network.stations.at(-1)!.name, 'West depot');
  assert.equal(s.lengths.get(id), e.length);
  s.undo(1);
  assert.equal(s.treasury, before);
  assert.equal(edgeAt(s.network, id), undefined);
  assert.equal(s.network.nodes.length, 8);
  assert.equal(s.network.stations.length, 8);
  assert.throws(() => s.undo(1));
  assert.equal(s.treasury, before);
});
void test('invalid construction, stale funds and occupied turnout work fail without partial state changes', () => {
  const s = new Simulation();
  for (const input of [
    { ...extension, end: 3 },
    { ...extension, bend: NaN },
    { ...extension, end: { x: -58, z: 26 } },
    { ...extension, end: { x: -80, z: 10, elevation: 8 } },
    { ...extension, end: { x: 100, z: 10 } },
    { ...extension, end: { x: -75, z: 18 }, bend: 60 },
    { start: 0, end: 7, bend: 0, kind: 'track' } as Construction,
  ]) {
    const before = s.save();
    assert.throws(() => s.build(input));
    assert.deepEqual(s.save(), before);
  }
  assert.equal(snapNode(s.network, -56, 28)!.id, 3);
  s.treasury = 1;
  const before = s.save();
  assert.throws(() => s.build(extension), /funds/);
  assert.deepEqual(s.save(), before);
  const moving = new Simulation();
  advance(moving, 0.1);
  const saved = moving.save();
  assert.throws(
    () => moving.build({ ...extension, start: 0, end: { x: -83, z: -38 } }),
    /work area/,
  );
  assert.deepEqual(moving.save(), saved);
});
void test('eligible river crossings quote and build a priced bridge, while river-following alignments fail', () => {
  const s = new Simulation(),
    input: Construction = {
      start: 1,
      end: { x: 40, z: -65 },
      bend: 0,
      kind: 'track',
    };
  const q = s.quote(input);
  assert.deepEqual(q.errors, []);
  assert.ok(q.edge!.bridgeLength > 10);
  assert.ok(q.cost.bridges > 10000);
  const id = s.build(input);
  assert.equal(edgeAt(s.network, id).bridgeLength, q.edge!.bridgeLength);
  assert.ok(
    quoteConstruction(s.network, {
      start: 2,
      end: { x: 26, z: -30 },
      kind: 'track',
      bend: 0,
    }).errors.some((e) => e.includes('Bridges')),
  );
});
void test('a new service follows the exact purchased edge, dwells, earns, and resumes after save/load', () => {
  const { s, id, station } = buildExtension();
  s.trains.forEach((t) => {
    t.held = t.id !== 2;
  });
  s.stopForEditing(2);
  const service = planService(s.network, 2, 'West branch', [3, station.id], 7, [
    id,
  ]);
  s.assignService(service);
  assert.ok(s.services[2].legs.every((l) => l.edge === id));
  s.trains[2].held = false;
  advance(s, 10);
  assert.equal(s.track(s.trains[2]).id, id);
  assert.ok(s.trains[2].distance > 0);
  const restored = new Simulation();
  restored.restore(s.save());
  assert.deepEqual(restored.save(), s.save());
  advance(s, 100);
  advance(restored, 100);
  assert.ok(s.trains[2].delivered > 0);
  assert.deepEqual(restored.save(), s.save());
  assert.throws(() => s.bulldoze(id), /train|service/);
  assert.throws(() => s.undo(1), /train|service/);
});
void test('services reject disconnected destinations and moving reassignment, then hold at a station without teleporting', () => {
  const { s, id, station } = buildExtension();
  s.bulldoze(id);
  assert.throws(
    () => planService(s.network, 2, 'Disconnected', [3, station.id], 3),
    /disconnected/,
  );
  const moving = new Simulation();
  advance(moving, 5);
  const before = moving.save();
  assert.throws(
    () => moving.assignService(moving.services[0]),
    /Stop this train/,
  );
  assert.deepEqual(moving.save(), before);
  moving.stopForEditing(0);
  advance(moving, 60);
  assert.equal(moving.trains[0].held, true);
  assert.equal(moving.trains[0].distance, 0);
  const at = moving.endpoints(moving.trains[0])[0];
  assert.throws(
    () =>
      moving.assignService(
        planService(moving.network, 0, 'Wrong start', [0, 3], 3),
      ),
    /first stop/,
  );
  const next = moving.network.stations.find((st) => st.node !== at)!;
  moving.assignService(
    planService(moving.network, 0, 'Reassigned', [at, next.node], 5),
  );
  assert.equal(moving.endpoints(moving.trains[0])[0], at);
});
void test('a passing loop can be built during live operation and uses its own physical block', () => {
  const s = new Simulation();
  let id = '';
  for (let i = 0; i < 2400 && !id; i++) {
    s.step(0.05);
    if (i % 10 !== 0) continue;
    const protectedTracks = s.protectedEdges();
    for (const e of s.network.edges.filter(
      (e) =>
        e.kind === 'track' &&
        !protectedTracks.has(e.id) &&
        !s.occupied.has(e.id),
    )) {
      const input: Construction = {
        start: e.a,
        end: e.b,
        bend: -12,
        kind: 'loop',
        parent: e.id,
      };
      if (!s.quote(input).errors.length) {
        id = s.build(input);
        break;
      }
    }
  }
  assert.ok(id, 'No passing loop could be constructed while trains operated');
  const loop = edgeAt(s.network, id);
  assert.notEqual(loop.id, loop.block);
  assert.equal(loop.kind, 'loop');
  const parent = edgeAt(s.network, loop.block);
  assert.notDeepEqual(loop.points, parent.points);
  const clone = new Simulation();
  clone.restore(s.save());
  assert.deepEqual(clone.save(), s.save());
  // Retarget a held train at a loop endpoint, explicitly selecting this track.
  let chosen = -1;
  for (let i = 0; i < 6000 && chosen < 0; i++) {
    s.step(0.05);
    chosen =
      s.trains.find(
        (t) => t.distance === 0 && t.dwell > 0 && s.endpoints(t)[0] === loop.a,
      )?.id ?? -1;
    if (chosen >= 0) s.stopForEditing(chosen);
  }
  assert.ok(chosen >= 0);
  s.assignService(
    planService(s.network, chosen, 'Loop shuttle', [loop.a, loop.b], 3, [id]),
  );
  s.trains[chosen].held = false;
  let traversed = false;
  for (let i = 0; i < 2000; i++) {
    s.step(0.05);
    const occupied = new Set<string>();
    for (const t of s.trains)
      if (t.distance > 0) {
        const e = s.track(t);
        assert.ok(!occupied.has(e.id));
        occupied.add(e.id);
        assert.equal(s.occupied.get(e.id), t.id);
      }
    if (s.track(s.trains[chosen]).id === id && s.trains[chosen].distance > 0)
      traversed = true;
  }
  assert.ok(traversed);
  assert.equal(loop.used, true);
});
void test('station/platform undo respects dependencies, counts, funds and stable identifiers', () => {
  const s = new Simulation();
  const id = s.build({ ...extension, stationName: undefined });
  const node = edgeAt(s.network, id).b;
  s.addStation(node, 'West station');
  s.addStation(node, 'West station');
  assert.equal(s.network.stations.at(-1)!.platforms.length, 2);
  assert.throws(() => s.undo(1), /station/);
  assert.throws(() => s.undo(2), /platform/);
  const clone = new Simulation();
  clone.restore(s.save());
  assert.deepEqual(clone.save(), s.save());
  s.undo(3);
  s.undo(2);
  s.undo(1);
  assert.equal(s.treasury, 425000);
  const again = s.build({ ...extension, stationName: undefined });
  assert.notEqual(id, again);
  assert.notEqual(edgeAt(s.network, again).b, node);
});
void test('version 1 saves migrate without modifying input, and unsupported/corrupt version 2 saves fail atomically', () => {
  const original = new Simulation();
  advance(original, 41);
  const current = original.save();
  const v1 = {
    version: 1,
    elapsed: current.elapsed,
    treasury: current.treasury,
    delivered: current.delivered,
    trains: current.trains,
  };
  const copy = structuredClone(v1),
    restored = new Simulation();
  restored.restore(v1);
  assert.deepEqual(v1, copy);
  assert.deepEqual(
    restored.trains.map(({ motion: _motion, ...t }) => t),
    original.trains.map(({ motion: _motion, ...t }) => t),
  );
  const { s } = buildExtension();
  const before = s.save();
  const mutations: ((value: SaveState) => void)[] = [
    (v) => v.network.edges.at(-1)!.length++,
    (v) => v.network.nodes.push({ ...v.network.nodes[0] }),
    (v) =>
      v.network.stations[0].platforms.push(v.network.stations[1].platforms[0]),
    (v) => (v.services[0].legs[0].edge = 'missing'),
    (v) => (v.network.nextNode = 1),
    (v) => (v.network.edges.at(-1)!.points[1].x = NaN),
    (v) => (v.network.edges.at(-1)!.block = '0-1'),
    (v) => (v.construction[0].amount = -100),
  ];
  for (const mutate of mutations) {
    const broken = structuredClone(before);
    mutate(broken);
    assert.throws(() => s.restore(broken));
    assert.deepEqual(s.save(), before);
  }
  assert.throws(() => s.restore({ ...before, version: 99 }));
  assert.deepEqual(s.save(), before);
});
void test('scheduled stops remain ordered when a path transits through another listed station', () => {
  const s = new Simulation();
  // Coalhaven–Riverside transits Grand Junction, which is scheduled later.
  const service = planService(s.network, 0, 'Ordered calls', [0, 7, 4], 4);
  assert.deepEqual(
    service.legs.filter((l) => l.stop).map((l) => l.to),
    [7, 4, 0],
  );
  const transit = service.legs.find((l) => l.to === 4 && !l.stop);
  assert.ok(transit);
  s.stopForEditing(0);
  s.assignService(service);
  const restored = new Simulation();
  restored.restore(s.save());
  assert.deepEqual(restored.services[0], service);
});
void test('the final wagon protects the previous track after the locomotive enters a new leg', () => {
  const { s, id, station } = buildExtension();
  s.stopForEditing(2);
  s.assignService(
    planService(s.network, 2, 'Tail clearance', [3, station.id, 0], 3),
  );
  const t = s.trains[2];
  t.cars = 6;
  // Place the locomotive 20 m into its onward leg: the last wagon still trails
  // 3.3 m back onto the purchased approach. Both must be protected from work.
  const next = s.services[2].legs.findIndex(
    (l, i) => i > 0 && s.services[2].legs[i - 1].edge === id && l.edge !== id,
  );
  assert.ok(next >= 0);
  t.leg = next;
  t.distance = 20;
  const previous = s.services[2].legs[next - 1];
  t.motion.history = [
    { ...previous, length: edgeAt(s.network, previous.edge).length },
  ];
  assert.ok(s.protectedEdges().has(id));
  assert.match(s.removalReason(id)!, /trailing consist/);
});
