import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Simulation } from './simulation';
import { advance, assertSeparated, sameSave, until } from './test-helpers';
import {
  conditions,
  forecast,
  inspectionBlocks,
  deferInspection,
  recordAction,
  research,
  researchReason,
  setRegionSetting,
  tickRegion,
  townRate,
  SCENARIOS,
} from './region';
import { replaceEngine, buildDepot } from './fleet';
import { accounts, setMoneyMode, validateEconomy } from './economy';
import { planService } from './network';

void test('campaign starts with two stationary engines, command gates are atomic, sandbox remains unrestricted', () => {
  const sim = new Simulation('campaign');
  assert.equal(sim.fleet.units.filter((u) => u.owned).length, 2);
  assert.ok(sim.trains.every((t) => t.held));
  assert.equal(sim.treasury, 145000);
  const before = sim.save();
  assert.throws(() => replaceEngine(sim, 4, 10), /Industrial steam/);
  assert.throws(() => buildDepot(sim, 3), /Civil engineering/);
  assert.throws(() => setMoneyMode(sim, 'unlimited'), /sandbox/);
  assert.throws(() => setRegionSetting(sim, 'weather', false), /fixed/);
  assert.throws(() => research(sim, 'civil'), /42 units/);
  assert.deepEqual(sim.save(), before);
  const restored = new Simulation();
  restored.restore(before);
  sameSave(sim, restored);
  const sandbox = new Simulation();
  assert.equal(sandbox.fleet.units.filter((u) => u.owned).length, 12);
  setMoneyMode(sandbox, 'unlimited');
  replaceEngine(sandbox, 4, 10);
  assert.equal(sandbox.fleet.units[4].engine, 10);
});

void test('campaign tutorial records successful construction, service, real delivery and paid research', () => {
  const sim = new Simulation('campaign');
  recordAction(sim, 'select');
  const parent = sim.network.edges.find((e) => e.a === 4 && e.b === 7)!;
  const edge = sim.build({
    start: 4,
    end: 7,
    bend: -12,
    kind: 'parallel',
    parent: parent.id,
  });
  sim.setDirection(edge, 'both');
  assert.ok(sim.region.tutorial.includes('build'));
  sim.assignService(
    planService(sim.network, 4, 'Provisions shuttle', [4, 7], 3.5, [
      edge,
      edge,
    ]),
  );
  sim.setHold(3, false);
  sim.setHold(4, false);
  until(sim, () => sim.region.builtDelivered >= 42, 24000);
  assert.ok(sim.region.tutorial.includes('delivery'));
  assert.ok(sim.region.tutorial.includes('service'));
  assert.ok(sim.region.builtDelivered >= 42);
  const cash = sim.treasury;
  research(sim, 'civil');
  assert.equal(sim.treasury, cash - 6000);
  assert.ok(sim.region.tutorial.includes('invest'));
  const after = sim.save();
  assert.throws(() => research(sim, 'civil'), /Already/);
  assert.deepEqual(sim.save(), after);
  const restored = new Simulation();
  restored.restore(after);
  sameSave(sim, restored);
  validateEconomy(sim);
});

void test('town growth needs consecutive supplied windows, caps at three levels, and conserves cargo', () => {
  const sim = new Simulation('campaign');
  // Two complementary departures maintain supply across consecutive windows.
  sim.setHold(3, false);
  sim.setHold(4, false);
  const town = sim.region.towns.find((t) => t.node === 4)!;
  advance(sim, 599);
  assert.equal(town.level, 0);
  advance(sim, 1801);
  assert.ok(town.level >= 1, `No supply-led growth: ${JSON.stringify(town)}`);
  assert.ok(townRate(sim, 4) > 2);
  validateEconomy(sim);
  assert.equal(researchReason(sim, 'civil'), undefined);
  research(sim, 'civil');
  assert.equal(researchReason(sim, 'freight'), undefined);
  research(sim, 'freight');
  sim.stopForEditing(3);
  until(
    sim,
    () =>
      sim.trains[3].held &&
      !sim.trains[3].motion.started &&
      !sim.fleet.units[3].job &&
      !sim.fleet.units[3].detour,
    24000,
  );
  replaceEngine(sim, 3, 10);
  assert.equal(sim.fleet.units[3].engine, 10);
  advance(sim, 1800);
  assert.ok(town.level <= 3);
  const level = town.level;
  sim.trains.forEach((t) => {
    t.held = true;
  });
  advance(sim, 1201);
  assert.equal(town.level, level);
  assert.equal(town.streak, 0);
  validateEconomy(sim);
  const restored = new Simulation();
  restored.restore(sim.save());
  sameSave(sim, restored);
});

void test('weather, seasons, pause and saved continuation are deterministic across frame rates', () => {
  const a = new Simulation('passenger', 67),
    b = new Simulation('passenger', 67);
  for (let i = 0; i < 600; i++) a.step(1 / 60);
  advance(b, 10);
  const sa = a.save(),
    sb = b.save();
  sa.accumulator = 0;
  sb.accumulator = 0;
  assert.deepEqual(sa, sb);
  assert.deepEqual(conditions(a), conditions(b));
  assert.equal(conditions(a, 2700).season, 'winter');
  assert.ok(
    Array.from(
      { length: 30 },
      (_, i) => conditions(a, 2700 + i * 180).weather,
    ).includes('snow'),
  );
  a.paused = true;
  const frozen = a.save();
  a.step(0.2);
  assert.deepEqual(a.save(), frozen);
  const copy = new Simulation();
  copy.restore(a.save());
  a.paused = false;
  advance(a, 100);
  advance(copy, 100);
  sameSave(a, copy);
  const sandbox = new Simulation();
  assert.equal(conditions(sandbox, 2800).weather, 'clear');
  assert.equal(townRate(sandbox, 4), 2);
  assert.equal(forecast(sandbox), null);
  setRegionSetting(sandbox, 'weather', true);
  assert.equal(conditions(sandbox, 2800).season, 'winter');
});

void test('forecast inspections have advance warning, bounded deferral and safe deterministic reopening', () => {
  const sim = new Simulation('river');
  const event = forecast(sim)!;
  assert.ok(event.edge);
  assert.equal(event.start, 420);
  assert.equal(inspectionBlocks(sim, [event.edge!]), false);
  const cash = sim.treasury;
  const profit = accounts(sim.economy).profit;
  deferInspection(sim);
  assert.equal(sim.treasury, cash - 2500);
  assert.equal(accounts(sim.economy).profit, profit - 2500);
  assert.equal(forecast(sim)!.start, 720);
  const saved = sim.save();
  assert.throws(() => deferInspection(sim));
  assert.deepEqual(sim.save(), saved);
  advance(sim, 720);
  assert.equal(inspectionBlocks(sim, [event.edge!]), true);
  const copy = new Simulation();
  copy.restore(sim.save());
  advance(sim, 121);
  advance(copy, 121);
  assert.equal(inspectionBlocks(sim, [event.edge!]), false);
  sameSave(sim, copy);
  validateEconomy(sim);
});

void test('junction challenge counts recovery only after a real wait, intervention and subsequent departure', () => {
  const sim = new Simulation('junction');
  sim.prioritize(4);
  assert.equal(sim.region.interventions.length, 0);
  until(
    sim,
    () =>
      sim.trains.some(
        (t) =>
          t.motion.wait?.kind === 'block' ||
          t.motion.wait?.kind === 'capacity' ||
          t.motion.wait?.kind === 'platform',
      ),
    24000,
  );
  const train = sim.trains.find(
    (t) =>
      t.motion.wait?.kind === 'block' ||
      t.motion.wait?.kind === 'capacity' ||
      t.motion.wait?.kind === 'platform',
  )!;
  const departures = train.motion.departures;
  sim.prioritize(train.id);
  assert.equal(sim.region.resolved, 0);
  until(sim, () => sim.region.resolved > 0, 24000);
  assert.ok(train.motion.departures > departures);
  until(sim, () => !!sim.region.result, SCENARIOS.junction.duration * 20);
  assert.equal(sim.region.result!.outcome, 'won');
  assert.ok(sim.region.result!.bottlenecks.length);
});

void test('mountain freight and passenger scenarios can be won with physical separation and auditable results', () => {
  for (const mode of ['mountain', 'passenger'] as const) {
    const sim = new Simulation(mode);
    for (
      let i = 0;
      i < SCENARIOS[mode].duration * 20 && !sim.region.result;
      i++
    ) {
      sim.step(0.05);
      assertSeparated(sim);
    }
    assert.equal(
      sim.region.result?.outcome,
      'won',
      `${mode}: ${JSON.stringify(sim.region.result)}`,
    );
    assert.ok(sim.region.achievements.includes('scenario-winner'));
    validateEconomy(sim);
    const result = structuredClone(sim.region.result);
    advance(sim, 60);
    assert.deepEqual(sim.region.result, result);
    const copy = new Simulation();
    copy.restore(sim.save());
    sameSave(sim, copy);
  }
});

void test('missed challenges preserve the railway and frozen results while play continues', () => {
  const sim = new Simulation('river');
  advance(sim, SCENARIOS.river.duration + 1);
  assert.equal(sim.region.result?.outcome, 'missed');
  const result = structuredClone(sim.region.result);
  sim.setHold(9, false);
  until(sim, () => sim.delivered > 0, 24000);
  assert.deepEqual(sim.region.result, result);
  const copy = new Simulation();
  copy.restore(sim.save());
  sameSave(sim, copy);
});

void test('version 7 migrates to compatible sandbox and malformed region saves fail atomically', () => {
  const original = new Simulation();
  advance(original, 15);
  const old = original.save() as unknown as Record<string, unknown>;
  old.version = 7;
  delete old.region;
  const migrated = new Simulation();
  migrated.restore(old);
  assert.equal(migrated.save().version, 8);
  assert.equal(migrated.region.mode, 'sandbox');
  assert.equal(migrated.region.delivered, 0);
  assert.deepEqual(migrated.trains, original.trains);
  const sim = new Simulation('campaign');
  for (const mutate of [
    (s: ReturnType<Simulation['save']>) => {
      s.region.seed = -1;
    },
    (s: ReturnType<Simulation['save']>) => {
      s.region.settings.weather = false;
    },
    (s: ReturnType<Simulation['save']>) => {
      s.region.towns[0].level = 99;
    },
    (s: ReturnType<Simulation['save']>) => {
      s.region.research = ['express'];
    },
    (s: ReturnType<Simulation['save']>) => {
      s.region.deferredInspections = [1];
    },
    (s: ReturnType<Simulation['save']>) => {
      s.region.delivered = 1000;
    },
    (s: ReturnType<Simulation['save']>) => {
      s.region.interventions = [{ train: 99, departures: 0 }];
    },
  ]) {
    const before = sim.save(),
      bad = sim.save();
    mutate(bad);
    assert.throws(() => sim.restore(bad));
    assert.deepEqual(sim.save(), before);
  }
});

void test('disabled growth does not bank future supplies or grant passive expansion', () => {
  const sim = new Simulation();
  sim.trains.forEach((t) => {
    t.held = true;
  });
  setRegionSetting(sim, 'growth', true);
  advance(sim, 601);
  assert.ok(sim.region.towns.every((t) => t.level === 0));
  setRegionSetting(sim, 'growth', false);
  assert.ok(sim.region.towns.every((t) => t.supplied === 0 && t.streak === 0));
  tickRegion(sim);
});

void test('river expansion succeeds only with a real bridge purchase and accepted cargo over that line', () => {
  const sim = new Simulation('river');
  const edge = sim.build({
    start: 4,
    end: 7,
    bend: -12,
    kind: 'parallel',
    parent: '4-7',
  });
  sim.setDirection(edge, 'both');
  sim.assignService(
    planService(sim.network, 9, 'River shuttle', [4, 7], 3.5, [edge]),
  );
  sim.setHold(9, false);
  for (
    let i = 0;
    i < SCENARIOS.river.duration * 20 && !sim.region.result;
    i++
  ) {
    sim.step(0.05);
    assertSeparated(sim);
  }
  assert.equal(sim.region.result?.outcome, 'won');
  assert.ok(sim.region.builtDelivered >= 84);
  assert.ok(
    sim.economy.ledger.some((l) => l.category === 'delivery' && l.builtTrack),
  );
  validateEconomy(sim);
});

void test('active inspection denies new admissions without changing reservations or moving held trains', () => {
  const sim = new Simulation('river');
  // Select a reproducible seed whose first inspection is the shuttle's bridge.
  while (forecast(sim)?.edge !== '4-7' && sim.region.seed < 2100)
    sim.region.seed++;
  assert.equal(forecast(sim)?.edge, '4-7');
  sim.assignService(
    planService(sim.network, 9, 'Inspection shuttle', [4, 7], 3.5, ['4-7']),
  );
  advance(sim, 420);
  sim.setHold(9, false);
  advance(sim, 20);
  assert.equal(sim.trains[9].motion.physical.route, undefined);
  assert.match(sim.trains[9].motion.wait?.message ?? '', /inspection/i);
  const restored = new Simulation();
  restored.restore(sim.save());
  until(sim, () => sim.delivered > 0, 24000);
  assert.ok(sim.elapsed > 540);
  validateEconomy(sim);
});

void test('the entire campaign tutorial and regional objective are reachable through real commands', () => {
  const sim = new Simulation('campaign');
  recordAction(sim, 'select');
  const edge = sim.build({
    start: 4,
    end: 7,
    bend: -12,
    kind: 'parallel',
    parent: '4-7',
  });
  sim.setDirection(edge, 'both');
  sim.assignService(
    planService(sim.network, 4, 'Provisions shuttle', [4, 7], 3.5, [edge]),
  );
  sim.setHold(3, false);
  sim.setHold(4, false);
  for (let i = 0; i < 7200 * 20 && !sim.region.result; i++) {
    sim.step(0.05);
    assertSeparated(sim);
    if (i % 20 === 0) {
      for (const t of sim.trains) if (t.motion.wait) sim.prioritize(t.id);
      for (const id of ['civil', 'freight'] as const)
        if (!researchReason(sim, id)) research(sim, id);
    }
  }
  assert.equal(sim.region.result?.outcome, 'won', JSON.stringify(sim.region));
  assert.equal(sim.region.tutorial.length, 6);
  assert.ok(sim.region.achievements.includes('valley-graduate'));
  validateEconomy(sim);
  const copy = new Simulation();
  copy.restore(sim.save());
  sameSave(sim, copy);
});

void test('full fleet remains separated and makes progress through weather and inspection cycles', () => {
  const sim = new Simulation();
  for (const key of ['weather', 'growth', 'events'] as const)
    setRegionSetting(sim, key, true);
  for (let window = 0; window < 2; window++) {
    const calls = sim.trains.map((t) => t.motion.calls);
    for (let i = 0; i < 36000; i++) {
      const departures = sim.trains.map((t) => t.motion.departures);
      sim.step(0.05);
      assertSeparated(sim);
      for (const t of sim.trains)
        if (t.motion.departures > departures[t.id])
          assert.equal(
            inspectionBlocks(
              sim,
              t.motion.physical.route?.legs.map((l) => l.edge) ?? [],
            ),
            false,
          );
    }
    assert.ok(
      sim.trains.every((t) => t.motion.calls > calls[t.id]),
      `No progress in window ${window}`,
    );
    validateEconomy(sim);
    const copy = new Simulation();
    copy.restore(sim.save());
    sameSave(sim, copy);
  }
});
