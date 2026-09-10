import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Simulation } from './simulation';
import {
  CARGO,
  RECIPES,
  STORAGE,
  TARIFF,
  accounts,
  loadCargo,
  unloadCargo,
  tickEconomy,
  validateEconomy,
  acceptContract,
  borrow,
  repay,
  refit,
  supply,
  type Cargo,
} from './economy';
import { advance, assertSeparated, poses, samePoses } from './test-helpers';
import { planService } from './network';
import { carriage } from './models';
import { Box3 } from 'three';
function clock(s: Simulation, seconds: number) {
  s.elapsed += seconds;
  tickEconomy(s);
}
function town(s: Simulation, node: number) {
  return s.economy.towns.find((t) => t.node === node)!;
}
function reconcile(s: Simulation) {
  validateEconomy(s);
  assert.equal(
    s.treasury,
    s.economy.ledger.reduce((n, l) => n + l.amount, 0),
  );
  for (const cargo of CARGO)
    assert.equal(
      s.economy.created[cargo] -
        s.economy.used[cargo] -
        s.economy.consumed[cargo],
      s.economy.towns.reduce(
        (n, t) => n + t.stock[cargo] + t.received[cargo],
        0,
      ) +
        s.economy.services.reduce(
          (n, t) => n + (t.manifest?.cargo === cargo ? t.manifest.quantity : 0),
          0,
        ),
    );
}
void test('all three supply chains move finite raw stock through processing and town consumption', () => {
  for (const [source, processor, consumer, input, output, wagon] of [
    [2, 7, 4, 'timber', 'lumber', 'flat'],
    [3, 4, 5, 'grain', 'flour', 'hopper'],
    [0, 4, 1, 'coal', 'goods', 'hopper'],
  ] as const) {
    const s = new Simulation(),
      t = s.trains[0];
    s.economy.services[0].wagon = wagon;
    const before = town(s, source).stock[input];
    loadCargo(s, t, source, processor);
    assert.equal(town(s, source).stock[input], before - 42);
    unloadCargo(s, t, processor);
    assert.equal(town(s, processor).stock[input], 42);
    clock(s, 105);
    assert.equal(town(s, processor).stock[input], 0);
    assert.equal(town(s, processor).stock[output], 42);
    s.economy.services[0].wagon = output === 'lumber' ? 'flat' : 'box';
    loadCargo(s, t, processor, consumer);
    assert.equal(town(s, processor).stock[output], 0);
    unloadCargo(s, t, consumer);
    assert.equal(town(s, consumer).stock[output], 42);
    const income = t.revenue;
    loadCargo(s, t, consumer, source);
    assert.equal(
      s.economy.services[0].manifest,
      null,
      'Consumers cannot re-export paid deliveries',
    );
    assert.equal(t.revenue, income);
    clock(s, 105);
    assert.equal(town(s, consumer).stock[output], 0);
    assert.equal(s.economy.consumed[output], 42);
    reconcile(s);
  }
});
void test('storage caps pause production and processing without losing input', () => {
  const s = new Simulation(),
    t = s.trains[6];
  clock(s, 1000);
  assert.equal(town(s, 2).stock.timber, STORAGE);
  assert.equal(town(s, 7).stock.lumber, 0);
  for (let i = 0; i < 5; i++) {
    loadCargo(s, t, 2, 7);
    unloadCargo(s, t, 7);
    clock(s, 105);
  }
  assert.equal(town(s, 7).stock.lumber, STORAGE);
  const raw = town(s, 7).stock.timber;
  assert.ok(raw > 0);
  clock(s, 100);
  assert.equal(town(s, 7).stock.timber, raw);
  assert.equal(s.economy.used.timber, STORAGE);
  reconcile(s);
});
void test('partial rejection retains cargo, earns only its tariff, and cannot be paid twice', () => {
  const s = new Simulation(),
    t = s.trains[6];
  loadCargo(s, t, 2, 7);
  town(s, 7).stock.timber = 165;
  s.economy.created.timber += 165;
  unloadCargo(s, t, 7);
  assert.equal(t.delivered, 15);
  assert.equal(t.revenue, 15 * TARIFF.timber);
  assert.equal(s.economy.services[6].manifest?.quantity, 27);
  assert.match(s.economy.services[6].warning, /rejected/);
  unloadCargo(s, t, 7);
  assert.equal(t.delivered, 15);
  reconcile(s);
  clock(s, 100);
  unloadCargo(s, t, 7);
  assert.equal(t.delivered, 42);
  unloadCargo(s, t, 7);
  assert.equal(t.revenue, 42 * TARIFF.timber);
  reconcile(s);
});
void test('wagons, loading dwell and destination acceptance constrain real loads', () => {
  const s = new Simulation(),
    t = s.trains[0];
  s.economy.services[0].wagon = 'box';
  loadCargo(s, t, 2, 7);
  assert.equal(t.load, 0);
  assert.equal(s.economy.services[0].emptyRuns, 1);
  refit(s, 0, 'flat');
  s.services[0].dwell = 1;
  loadCargo(s, t, 2, 7);
  assert.equal(s.economy.services[0].manifest?.quantity, 12);
  assert.equal(t.load, 22);
  const before = s.save();
  assert.throws(() => refit(s, 0, 'hopper'), /empty/);
  assert.deepEqual(s.save(), before);
  assert.equal(s.addCar(0), true);
  assert.equal(t.load, 17);
  unloadCargo(s, t, 4);
  assert.equal(t.delivered, 0, 'Wrong call retains the manifest');
  unloadCargo(s, t, 7);
  refit(s, 0, 'hopper');
  loadCargo(s, t, 0, 1);
  assert.equal(s.economy.services[0].manifest, null);
  reconcile(s);
});
void test('finite passenger queues debit the source and wait for destination capacity to recover', () => {
  const s = new Simulation(),
    t = s.trains[0];
  s.services[0].dwell = 10;
  for (let i = 0; i < 2; i++) {
    loadCargo(s, t, 0, 1);
    unloadCargo(s, t, 1);
  }
  assert.equal(t.delivered, 90);
  assert.equal(town(s, 0).stock.passengers, 0);
  assert.equal(town(s, 1).received.passengers, 90);
  loadCargo(s, t, 0, 1);
  assert.equal(s.economy.services[0].manifest, null);
  clock(s, 5);
  assert.equal(town(s, 0).stock.passengers, 2);
  assert.equal(town(s, 1).received.passengers, 88);
  reconcile(s);
});
void test('contracts complete once, miss with the stated penalty, and allow recovery', () => {
  const s = new Simulation(),
    t = s.trains[6];
  acceptContract(s, 0);
  assert.throws(() => acceptContract(s, 0), /already/);
  loadCargo(s, t, 2, 7);
  unloadCargo(s, t, 7);
  assert.equal(s.economy.contracts[0].status, 'completed');
  assert.equal(
    s.economy.ledger.filter((l) => l.category === 'contract').length,
    1,
  );
  unloadCargo(s, t, 7);
  assert.equal(
    s.economy.ledger.filter((l) => l.category === 'contract').length,
    1,
  );
  acceptContract(s, 0);
  clock(s, 1801);
  assert.equal(s.economy.contracts[1].status, 'failed');
  assert.equal(
    s.economy.ledger.filter((l) => l.category === 'penalty').at(-1)?.amount,
    -1000,
  );
  acceptContract(s, 0);
  loadCargo(s, t, 2, 7);
  unloadCargo(s, t, 7);
  assert.equal(s.economy.contracts[2].status, 'completed');
  reconcile(s);
});
void test('all expenses, loans, principal repayments and purchases reconcile independently of profit', () => {
  const s = new Simulation();
  for (let i = 0; i < 4; i++) borrow(s);
  let before = s.save();
  assert.throws(() => borrow(s), /limit/);
  assert.deepEqual(s.save(), before);
  clock(s, 60);
  assert.equal(
    s.economy.ledger.find((l) => l.category === 'interest')?.amount,
    -200,
  );
  for (const category of ['fuel', 'crew', 'maintenance', 'infrastructure'])
    assert.ok(s.economy.ledger.some((l) => l.category === category));
  const profit = accounts(s.economy).profit;
  repay(s);
  assert.equal(s.economy.debt, 75000);
  assert.equal(accounts(s.economy).profit, profit);
  s.addCar(0);
  assert.equal(accounts(s.economy).profit, profit);
  reconcile(s);
  // Operating overdrafts survive saves and do not silently erase debt or halt dispatch.
  clock(s, 120000);
  assert.ok(s.treasury < 0);
  before = s.save();
  assert.throws(() => repay(s), /cash/);
  assert.deepEqual(s.save(), before);
  s.economy.mode = 'unlimited';
  assert.equal(s.addCar(1), true);
  assert.equal(s.treasury, 0);
  assert.ok(s.economy.ledger.some((l) => l.category === 'sandbox'));
  reconcile(s);
  const copy = new Simulation();
  copy.restore(s.save());
  assert.deepEqual(copy.save(), s.save());
});
void test('construction purchases and unused refunds share the company cash ledger', () => {
  const s = new Simulation();
  s.trains.forEach((t) => (t.held = true));
  const edge = s.build({
    start: 1,
    end: 2,
    bend: -12,
    kind: 'loop',
    parent: '1-2',
  });
  const record = s.construction.find((c) => c.edge === edge)!;
  assert.equal(s.economy.ledger.at(-1)?.amount, -record.amount);
  s.undo(record.id);
  assert.equal(s.treasury, 425000);
  assert.equal(s.economy.ledger.at(-1)?.category, 'refund');
  reconcile(s);
});
void test('economy state rejects corrupt cargo, clocks, cash, debt and contracts atomically', () => {
  const s = new Simulation();
  acceptContract(s, 0);
  loadCargo(s, s.trains[6], 2, 7);
  const good = s.save();
  const mutations: ((v: ReturnType<Simulation['save']>) => void)[] = [
    (v) => v.economy.towns[0].stock.coal++,
    (v) => v.economy.services[6].manifest!.quantity++,
    (v) => (v.economy.services[6].manifest!.destination = 2),
    (v) => (v.economy.services[6].wagon = 'box'),
    (v) => v.economy.ledger[0].balance++,
    (v) => (v.economy.debt = 25000),
    (v) => v.economy.second++,
    (v) => v.economy.contracts[0].reward++,
    (v) => v.trains[6].revenue++,
    (v) => v.treasury++,
  ];
  for (const mutate of mutations) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.throws(() => s.restore(bad));
    assert.deepEqual(s.save(), good);
  }
});
void test('version 5 migration preserves physical poses and historic accounts with no invented manifest', () => {
  const old = new Simulation();
  advance(old, 40);
  const legacy = old.save() as unknown as Record<string, unknown>;
  legacy.version = 5;
  delete legacy.economy;
  const before = poses(old, 0);
  const s = new Simulation();
  s.restore(legacy);
  samePoses(before, poses(s, 0));
  assert.equal(s.treasury, old.treasury);
  assert.equal(s.delivered, old.delivered);
  assert.ok(s.economy.services.every((service) => service.manifest === null));
  assert.equal(s.save().version, 6);
  assert.equal(legacy.version, 5);
  reconcile(s);
});
void test('mixed freight and passengers sustain full-fleet progress and conservation in both 1800-second windows', () => {
  const s = new Simulation();
  acceptContract(s, 0);
  acceptContract(s, 1);
  acceptContract(s, 2);
  const windows: number[][] = [];
  for (let window = 0; window < 2; window++) {
    for (let tick = 0; tick < 36000; tick++) {
      s.step(0.05);
      assertSeparated(s);
    }
    windows.push(s.trains.map((t) => t.motion.calls));
    reconcile(s);
  }
  s.trains.forEach((t, i) => {
    assert.ok(
      windows[0][i] > 0 && windows[1][i] > windows[0][i],
      `Mixed service ${i} stalled`,
    );
    assert.equal(t.motion.physical.emergencies, 0);
  });
  for (const r of RECIPES)
    assert.ok(
      s.economy.used[r.input] > 0,
      `${r.input} processor never received cargo`,
    );
  assert.ok(s.economy.consumed.lumber > 0);
  assert.ok(s.economy.consumed.flour + s.economy.consumed.goods > 0);
  const copy = new Simulation();
  copy.restore(s.save());
  advance(s, 30);
  advance(copy, 30);
  assert.deepEqual(copy.save(), s.save());
});
void test('fixed-step economy and in-transit manifests resume deterministically at all game speeds', () => {
  const s = new Simulation();
  s.trains.forEach((t) => (t.held = t.id !== 6));
  acceptContract(s, 0);
  advance(s, 60);
  assert.ok(s.economy.services[6].manifest);
  const saved = s.save();
  const variants = [1, 3, 8].map((speed) => {
    const copy = new Simulation();
    copy.restore(saved);
    copy.speed = speed;
    for (let i = 0; i < 2400 / speed; i++) copy.step(0.05);
    return copy.save();
  });
  assert.deepEqual(variants[0], variants[1]);
  assert.deepEqual(variants[0], variants[2]);
});
void test('freight wagon families stay within the existing physical vehicle envelope', () => {
  for (const wagon of ['coaches', 'flat', 'hopper', 'box'] as const) {
    const bounds = new Box3().setFromObject(carriage('#446644', 1, wagon));
    assert.ok(bounds.max.x - bounds.min.x <= 1.71);
    assert.ok(bounds.max.z - bounds.min.z <= 2.66);
    assert.ok(bounds.max.y < 1.9);
  }
});
void test('accepted deliveries to a full consumer cannot create a profitable return load', () => {
  const s = new Simulation();
  for (const c of ['lumber', 'flour', 'goods'] as Cargo[])
    assert.equal(supply(town(s, 1), c), 0);
  s.economy.services[0].wagon = 'box';
  s.services[0] = planService(s.network, 0, 'Supply shops', [4, 1], 3.5);
  loadCargo(s, s.trains[0], 4, 1);
  assert.equal(s.trains[0].load, 0);
  assert.equal(s.trains[0].revenue, 0);
  reconcile(s);
});
void test('over-serving exhausts demand while matching wagon capacity and dwell improves operating profit', () => {
  const base = new Simulation(),
    upgraded = new Simulation();
  for (let i = 0; i < 3; i++) assert.equal(upgraded.addCar(0), true);
  for (const s of [base, upgraded]) {
    s.services[0].dwell = 9;
    loadCargo(s, s.trains[0], 0, 1);
    unloadCargo(s, s.trains[0], 1);
    clock(s, 60);
    reconcile(s);
  }
  assert.ok(upgraded.trains[0].delivered > base.trains[0].delivered);
  assert.ok(
    accounts(upgraded.economy, 0).profit > accounts(base.economy, 0).profit,
  );
  // The upgrade costs capital; direct operating profit correctly excludes it.
  assert.ok(upgraded.treasury < base.treasury);
  const t = base.trains[0];
  loadCargo(base, t, 0, 1);
  unloadCargo(base, t, 1);
  const revenue = t.revenue;
  loadCargo(base, t, 0, 1);
  unloadCargo(base, t, 1);
  const lastRevenue = t.revenue;
  loadCargo(base, t, 0, 1);
  unloadCargo(base, t, 1);
  assert.equal(t.revenue, lastRevenue);
  assert.ok(lastRevenue - revenue < 54 * TARIFF.passengers);
  assert.match(base.economy.services[0].warning, /Empty/);
  reconcile(base);
});
