import { assertSeparated } from './test-helpers';
import { vehicles } from './safety';
import { planService, edgeAt } from './network';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cities, corridors, locomotives } from './data';
import { edgeKey, Simulation } from './simulation';
function advance(sim: Simulation, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) sim.step(0.05);
}
void test('every service follows a connected closed route', () => {
  const tracks = new Set(corridors.map(([a, b]) => edgeKey(a, b)));
  for (const loco of locomotives)
    loco.route.forEach((a, i) => {
      const b = loco.route[(i + 1) % loco.route.length];
      assert.ok(cities[a] && cities[b]);
      assert.ok(tracks.has(edgeKey(a, b)), `${loco.name}: missing ${a}–${b}`);
    });
});
void test('every locomotive completes sustained service and revenue reconciles under dispatch', () => {
  for (let id = 0; id < locomotives.length; id++) {
    const sim = new Simulation();
    sim.economy.services.forEach((service) => (service.wagon = 'coaches'));
    sim.services = locomotives.map((l, id) =>
      planService(sim.network, id, `${l.name} service`, l.route, 3.5),
    );
    sim.trains.forEach((t) => {
      t.held = t.id !== id;
    });
    advance(sim, 900);
    assert.ok(
      sim.trains[id].delivered > 100,
      `${locomotives[id].name} is stuck`,
    );
    assert.equal(
      sim.delivered,
      sim.trains.reduce((n, t) => n + t.delivered, 0),
    );
    assert.equal(
      sim.treasury,
      sim.economy.ledger.reduce((n, entry) => n + entry.amount, 0),
    );
    assert.ok(sim.events.length <= 20);
  }
});
void test('single-track reservations exclude opposing trains at every substep', () => {
  const sim = new Simulation();
  sim.speed = 8;
  for (let n = 0; n < 5000; n++) {
    sim.step(0.1);
    assertSeparated(sim);
    for (const t of sim.trains.filter((t) => sim.visible(t)))
      for (const vehicle of vehicles(t.cars)) {
        const edge = sim.vehiclePosition(t, vehicle.offset).edge!;
        if (edgeAt(sim.network, edge))
          assert.equal(sim.occupied.get(edge), t.id);
      }
  }
});
void test('pause freezes the clock and trains; held trains retain their block', () => {
  const sim = new Simulation();
  advance(sim, 4);
  sim.paused = true;
  const frozen = sim.save();
  advance(sim, 10);
  assert.deepEqual(sim.save(), frozen);
  sim.paused = false;
  const t = sim.trains[0];
  t.held = true;
  const distance = t.distance;
  advance(sim, 20);
  assert.equal(t.distance, distance);
  const [a, b] = sim.endpoints(t);
  assert.equal(sim.occupied.get(edgeKey(a, b)), t.id);
  t.held = false;
  advance(sim, 2);
  assert.notEqual(t.distance, distance);
});
void test('buying wagons charges once, respects capacity and available cash', () => {
  const sim = new Simulation();
  assert.equal(sim.addCar(10), true);
  assert.equal(sim.trains[10].cars, 4);
  assert.equal(sim.treasury, 416500);
  sim.addCar(10);
  sim.addCar(10);
  const cash = sim.treasury;
  assert.equal(sim.addCar(10), false);
  assert.equal(sim.treasury, cash);
  sim.treasury = 8499;
  assert.equal(sim.addCar(0), false);
  assert.equal(sim.trains[0].cars, 3);
  assert.equal(sim.addCar(99), false);
});
void test('save restoration rebuilds reservations and deterministically resumes', () => {
  const original = new Simulation();
  advance(original, 41);
  original.trains[0].held = true;
  original.addCar(5);
  const restored = new Simulation();
  restored.restore(JSON.parse(JSON.stringify(original.save())));
  assert.deepEqual(restored.save(), original.save());
  assert.deepEqual(restored.occupied, original.occupied);
  advance(original, 150);
  advance(restored, 150);
  assert.deepEqual(restored.save(), original.save());
});
void test('invalid saves cannot partially mutate the active simulation', () => {
  const sim = new Simulation();
  advance(sim, 13);
  const before = sim.save();
  for (const mutate of [
    (s: ReturnType<Simulation['save']>) => (s.trains[11].cars = 99),
    (s: ReturnType<Simulation['save']>) => (s.treasury = NaN),
    (s: ReturnType<Simulation['save']>) => (s.trains[0].leg = -1),
  ]) {
    const invalid = structuredClone(before);
    mutate(invalid);
    assert.throws(() => sim.restore(invalid));
    assert.deepEqual(sim.save(), before);
  }
  assert.throws(() => sim.restore(null));
});
