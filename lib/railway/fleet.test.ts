import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Simulation } from './simulation';
import {
  ENGINES,
  buildDepot,
  editConsist,
  replaceEngine,
  sellEngine,
  resale,
  upgradeEngine,
  wagonCapacity,
} from './fleet';
import { performance } from './dispatch';
import { planService } from './network';
import { loadCargo, validateEconomy } from './economy';
import {
  advance,
  isolated,
  poses,
  samePoses,
  sameSave,
  until,
  assertSeparated,
} from './test-helpers';
import { MAP } from './map';
import { tunnelAt, bridgeAt } from './structures';
import { locomotive } from './models';
import { ENGINE } from './safety';
import { assertModelEnvelope } from './model-envelope';

void test('engine classes have measured mountain traction, economy and express tradeoffs with matching wheel arrangements', () => {
  const s = new Simulation(),
    edge = s.network.edges.find((e) => e.id === '1-10')!;
  const freight = performance(9, 6, 100, edge, edge.a),
    express = performance(5, 6, 100, edge, edge.a);
  assert.ok(freight.acceleration > express.acceleration * 1.25);
  assert.ok(
    performance(5, 3, 20, s.network.edges[0], 0).limit >
      performance(0, 3, 20, s.network.edges[0], 0).limit,
  );
  assert.ok(ENGINES[2].fuelRate < ENGINES[9].fuelRate);
  for (const [i, spec] of ENGINES.entries()) {
    const model = locomotive(spec.color, i);
    assertModelEnvelope(model, ENGINE);
    assert.equal(
      model.userData.wheels.length,
      spec.type
        .split(' ')[0]
        .split('-')
        .map(Number)
        .reduce((a, b) => a + b, 0),
    );
  }
});
void test('replace, sell and repurchase preserve service identity, cargo and accounts; invalid purchases are atomic', () => {
  const s = isolated();
  loadCargo(s, s.trains[0], 0, 1);
  const manifest = structuredClone(s.economy.services[0].manifest),
    service = structuredClone(s.services[0]),
    before = poses(s, 0),
    cash = s.treasury,
    credit = resale(s, 0);
  replaceEngine(s, 0, 10);
  assert.equal(s.treasury, cash + credit - ENGINES[10].price);
  assert.deepEqual(s.economy.services[0].manifest, manifest);
  assert.deepEqual(s.services[0], service);
  samePoses(before, poses(s, 0));
  const good = s.save();
  assert.throws(() => sellEngine(s, 0), /cargo/);
  assert.deepEqual(s.save(), good);
  assert.throws(() => replaceEngine(s, 0, 999));
  assert.deepEqual(s.save(), good);
  const restored = new Simulation();
  restored.restore(good);
  sameSave(s, restored);
  validateEconomy(s);
  const empty = isolated();
  sellEngine(empty, 0);
  assert.equal(empty.fleet.units[0].owned, false);
  advance(empty, 10);
  assert.equal(empty.visible(empty.trains[0]), false);
  restored.restore(empty.save());
  sameSave(empty, restored);
  replaceEngine(empty, 0, 2);
  empty.trains[0].held = false;
  until(empty, () => empty.trains[0].motion.calls > 0);
  validateEconomy(empty);
});
void test('ordered mixed consists load only matching capacity and preserve inventory through upgrades and replacement', () => {
  const s = isolated();
  editConsist(s, 0, ['coaches', 'hopper', 'flat']);
  assert.equal(wagonCapacity(s, 0, 'coal'), 18);
  loadCargo(s, s.trains[0], 0, 4);
  assert.equal(s.economy.services[0].manifest?.cargo, 'coal');
  assert.equal(s.economy.services[0].manifest?.quantity, 18);
  const good = s.save();
  assert.throws(() => editConsist(s, 0, ['box', 'box', 'box']));
  assert.deepEqual(s.save(), good);
  const restored = new Simulation();
  restored.restore(good);
  sameSave(s, restored);
  const cap = isolated();
  upgradeEngine(cap, 0, 'capacity');
  assert.equal(wagonCapacity(cap, 0), 64);
  loadCargo(cap, cap.trains[0], 0, 1);
  replaceEngine(cap, 0, 5);
  assert.equal(cap.fleet.units[0].upgrade, 'capacity');
  restored.restore(cap.save());
  validateEconomy(cap);
});
void test('station supplies and preventive servicing create real downtime, respect pause and survive mid-job restore', () => {
  const s = isolated(),
    u = s.fleet.units[0];
  s.trains[0].held = true;
  u.condition = 50;
  u.fuel = 10;
  u.water = 15;
  s.step(0.05);
  assert.equal(u.job?.kind, 'service');
  const good = s.save(),
    copy = new Simulation();
  copy.restore(good);
  sameSave(s, copy);
  s.paused = true;
  s.step(0.25);
  assert.deepEqual(s.save(), good);
  s.paused = false;
  advance(s, 40);
  advance(copy, 40);
  sameSave(s, copy);
  assert.equal(u.condition, 100);
  assert.equal(u.water, 100);
  assert.equal(u.fuel, 100);
  assert.equal(u.serviced, 1);
  assert.ok(u.downtime >= 34);
  assert.ok(s.treasury < 425000);
  validateEconomy(s);
  const neglected = isolated(),
    n = neglected.fleet.units[0];
  n.autoService = false;
  n.condition = 15;
  neglected.trains[0].held = true;
  advance(neglected, 40);
  assert.equal(n.condition, 15);
  assert.equal(n.serviced, 0);
  const edge = neglected.network.edges[0];
  assert.ok(
    performance(0, 3, 50, edge, edge.a, n).limit <
      performance(0, 3, 50, edge, edge.a).limit,
  );
});
void test('automatic workshop transfer returns to original service without carrying diversion cargo or losing authority', () => {
  const s = isolated(1),
    t = s.trains[1],
    u = s.fleet.units[1];
  s.services[1] = planService(s.network, 1, 'Alpine passenger', [1, 2], 3.5);
  const original = structuredClone(s.services[1]);
  u.condition = 55;
  u.serviceRequested = true;
  until(s, () => !!u.detour);
  assert.equal(u.detour!.origin, 1);
  const copy = new Simulation();
  copy.restore(s.save());
  sameSave(s, copy);
  for (let i = 0; i < 36000 && (u.detour || u.serviced === 0); i++) {
    s.step(0.05);
    assertSeparated(s);
    assert.equal(s.economy.services[1].manifest, null);
  }
  assert.equal(u.serviced, 1);
  assert.equal(u.detour, undefined);
  assert.deepEqual(s.services[1], original);
  assert.equal(s.endpoints(t)[0], 1);
  copy.restore(s.save());
  sameSave(s, copy);
});
void test('workshop construction, affordability and corrupt fleet saves reject atomically', () => {
  const s = isolated();
  buildDepot(s, 1);
  assert.ok(s.fleet.depots.includes(1));
  const good = s.save();
  assert.throws(() => buildDepot(s, 1));
  assert.deepEqual(s.save(), good);
  for (const mutate of [
    (v: ReturnType<Simulation['save']>) => {
      v.fleet.units[0].engine = 99;
    },
    (v: ReturnType<Simulation['save']>) => {
      v.fleet.units[0].water = NaN;
    },
    (v: ReturnType<Simulation['save']>) => {
      v.fleet.units[0].consist.pop();
    },
    (v: ReturnType<Simulation['save']>) => {
      v.fleet.depots.push(999);
    },
    (v: ReturnType<Simulation['save']>) => {
      v.fleet.units[0].job = { kind: 'service', remaining: 500, node: 0 };
    },
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.throws(() => s.restore(bad));
    assert.deepEqual(s.save(), good);
  }
  s.treasury = 0;
  const poor = s.save();
  assert.throws(() => upgradeEngine(s, 0, 'reliability'));
  assert.throws(() => buildDepot(s, 2));
  assert.deepEqual(s.save(), poor);
});
void test('version 6 fleet migration retains physical state and creates matching wagon records', () => {
  const s = isolated();
  advance(s, 35);
  const old = structuredClone(s.save()) as unknown as {
    version: number;
    fleet?: unknown;
  };
  old.version = 6;
  delete old.fleet;
  const copy = new Simulation();
  copy.restore(old);
  samePoses(poses(s, 0), poses(copy, 0));
  assert.deepEqual(copy.services, s.services);
  assert.equal(copy.treasury, s.treasury);
  assert.equal(copy.save().version, 8);
  assert.deepEqual(copy.fleet.units[6].consist, ['flat', 'flat', 'flat']);
});
void test('mountain expansion adds six stations, uphill/downhill routes, real covered tunnels and elevated viaducts', () => {
  const s = new Simulation();
  assert.equal(s.network.stations.length, 14);
  assert.equal(s.network.edges.length, 22);
  assert.ok(
    (MAP.maxX - MAP.minX) * (MAP.maxZ - MAP.minZ) >
      2 * (172 * 2.4) * (145 * 2.4),
  );
  const platforms = s.network.stations.flatMap((st) => st.platforms);
  assert.equal(new Set(platforms).size, platforms.length);
  const alpine = s.network.edges.filter((e) => e.a >= 8 || e.b >= 8);
  assert.ok(alpine.every((e) => e.grade > 0 && e.grade <= 0.041));
  assert.ok(alpine.some((e) => e.points.some((_, i) => tunnelAt(e.points, i))));
  assert.ok(alpine.some((e) => e.points.some((p) => p.y > 5 && bridgeAt(p))));
  for (const n of s.network.nodes.filter((n) => n.id >= 8))
    assert.ok(
      planService(s.network, 0, 'Mountain tour', [4, n.id], 3.5).legs.length,
    );
  const copy = new Simulation();
  copy.restore(s.save());
  sameSave(s, copy);
});
void test('a loaded six-wagon mountain train traverses gradients and tunnels with safe repeated calls', () => {
  const s = isolated(10),
    t = s.trains[10];
  s.services[10] = planService(
    s.network,
    10,
    'Ridge railway',
    [9, 10, 11],
    3.5,
  );
  t.cars = 6;
  s.fleet.units[10].consist = Array(6).fill('coaches');
  let highest = 0,
    lowest = 100,
    tunnel = false;
  for (let i = 0; i < 48000; i++) {
    s.step(0.05);
    assertSeparated(s);
    if (s.visible(t)) {
      const p = s.vehiclePosition(t, 0).p;
      highest = Math.max(highest, p.y);
      lowest = Math.min(lowest, p.y);
      const section = s.traffic.currentSection(t);
      tunnel ||=
        section.kind === 'running' &&
        section.points.some((_, j) => tunnelAt(section.points, j));
    }
  }
  assert.ok(highest - lowest > 7);
  assert.ok(tunnel);
  assert.ok(t.motion.calls >= 3);
  assert.equal(t.motion.physical.emergencies, 0);
  const copy = new Simulation();
  copy.restore(s.save());
  sameSave(s, copy);
});
