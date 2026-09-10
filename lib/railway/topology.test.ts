import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Simulation } from './simulation';
import { planService, distance, measure } from './network';
import { Traffic } from './traffic';
import { sample, section, Topology } from './topology';
import {
  advance,
  assertSeparated,
  isolated,
  until,
  sameSave,
} from './test-helpers';
void test('parallel construction adds separated directional running lines, priced bridge capacity and simultaneous opposing traffic', () => {
  const s = isolated();
  s.trains[0].held = true;
  const quote = s.quote({
      start: 4,
      end: 7,
      bend: -12,
      kind: 'parallel',
      parent: '4-7',
    }),
    cash = s.treasury;
  assert.deepEqual(quote.errors, []);
  assert.ok(
    s.quote({ start: 1, end: 2, bend: -12, kind: 'parallel', parent: '1-2' })
      .cost.bridges > 0,
    'Second bridge deck must be priced',
  );
  const line = s.build({
    start: 4,
    end: 7,
    bend: -12,
    kind: 'parallel',
    parent: '4-7',
  });
  assert.equal(cash - s.treasury, quote.cost.total);
  assert.ok(quote.cost.track > 5000);
  s.setDirection('4-7', 'a-to-b');
  for (const [id, stops] of [
    [0, [4, 7]],
    [1, [7, 4]],
  ] as const) {
    s.services[id] = planService(
      s.network,
      id,
      'Double-track shuttle',
      [...stops],
      1,
    );
    s.trains[id].held = false;
    s.trains[id].dwell = 0;
    s.trains[id].motion.departureDue = 0;
  }
  let concurrent = false;
  for (let i = 0; i < 24000; i++) {
    s.step(0.05);
    assertSeparated(s);
    const a = s.traffic.currentSection(s.trains[0]),
      b = s.traffic.currentSection(s.trains[1]);
    if (
      a.edge &&
      b.edge &&
      a.edge !== b.edge &&
      s.trains[0].motion.velocity > 0 &&
      s.trains[1].motion.velocity > 0
    )
      concurrent = true;
  }
  assert.ok(concurrent, 'Distinct running lines were serialized');
  assert.ok(s.trains[0].motion.calls >= 3 && s.trains[1].motion.calls >= 3);
  assert.ok(s.network.edges.find((e) => e.id === line)!.used);
  const r = new Simulation();
  r.restore(s.save());
  sameSave(s, r);
});
void test('crossover purchase creates a connected physical lane change, refuses occupied edits and persists its authority', () => {
  const s = isolated(1),
    line = s.build({
      start: 1,
      end: 2,
      bend: -12,
      kind: 'parallel',
      parent: '1-2',
    });
  s.setDirection(line, 'both');
  const quote = s.quoteCrossover(line),
    cash = s.treasury;
  assert.deepEqual(quote.errors, []);
  const cross = s.buildCrossover(line);
  assert.equal(cash - s.treasury, quote.cost!.total);
  const c = s.topology.sections.get(cross)!;
  assert.equal(c.kind, 'crossover');
  assert.ok(c.radius >= 10);
  s.services[1] = planService(s.network, 1, 'Crossover shuttle', [1, 2], 1);
  s.trains[1].dwell = 0;
  s.trains[1].motion.departureDue = 0;
  s.useCrossover(1, cross);
  until(s, () => s.trains[1].motion.started);
  const route = s.trains[1].motion.physical.route!;
  assert.equal(route.crossover, cross);
  assert.ok(route.sections.some((p) => p.section === cross));
  for (let i = 1; i < route.sections.length; i++) {
    const a = route.sections[i - 1],
      b = route.sections[i],
      sa = s.topology.sections.get(a.section)!,
      sb = s.topology.sections.get(b.section)!;
    assert.ok(
      distance(
        sample(sa, a.reverse ? 0 : sa.length).p,
        sample(sb, b.reverse ? sb.length : 0).p,
      ) < 1e-8,
    );
  }
  const before = JSON.stringify(s.save());
  assert.throws(() => s.setDirection(line, 'b-to-a'), /complete train/);
  assert.equal(JSON.stringify(s.save()), before);
  let crossed = false;
  for (let i = 0; i < 5000 && !s.trains[1].motion.calls; i++) {
    s.step(0.05);
    assertSeparated(s);
    if (s.traffic.currentSection(s.trains[1]).id === cross) {
      crossed = true;
      if (i % 71 === 0) {
        const r = new Simulation();
        r.restore(s.save());
        sameSave(s, r);
      }
    }
  }
  assert.ok(crossed && s.trains[1].motion.calls > 0);
});
void test('turnout conflict geometry includes unconnected diamonds and excludes sufficiently separated decks', () => {
  const s = new Simulation(),
    topology = new Topology(s.network, false);
  topology.sections = new Map([
    [
      'a',
      section(
        'a',
        'running',
        [
          { x: -20, y: 0, z: 0 },
          { x: 20, y: 0, z: 0 },
        ],
        'a0',
        'a1',
      ),
    ],
    [
      'b',
      section(
        'b',
        'running',
        [
          { x: 0, y: 0, z: -20 },
          { x: 0, y: 0, z: 20 },
        ],
        'b0',
        'b1',
      ),
    ],
    [
      'bridge',
      section(
        'bridge',
        'running',
        [
          { x: 0, y: 8, z: -20 },
          { x: 0, y: 8, z: 20 },
        ],
        'c0',
        'c1',
      ),
    ],
  ]);
  topology['buildZones']();
  assert.ok(
    topology.zones.some(
      (z) => z.sections.includes('a') && z.sections.includes('b'),
    ),
  );
  assert.ok(!topology.zones.some((z) => z.sections.includes('bridge')));
  const zone = topology.zones[0];
  assert.ok(zone.intervals[0].start < 20 && zone.intervals[0].end > 20);
});
void test('held-train disruption recovers fleet throughput automatically without replacing any service', () => {
  const s = new Simulation(),
    intent = JSON.stringify(s.services);
  advance(s, 180);
  const train = s.trains.find((t) => t.motion.started)!;
  train.held = true;
  advance(s, 90);
  assertSeparated(s);
  train.held = false;
  const before = s.trains.map((t) => t.motion.calls);
  advance(s, 1800);
  assert.equal(JSON.stringify(s.services), intent);
  s.trains.forEach((t) =>
    assert.ok(
      t.motion.calls > before[t.id],
      `Train ${t.id} did not recover throughput`,
    ),
  );
  assert.ok(s.trains.every((t) => t.motion.physical.emergencies === 0));
});
void test('infeasible pinned direction waits outside conflicts with a specific remedy', () => {
  const s = isolated();
  s.services[0] = planService(s.network, 0, 'Pinned', [0, 1], 1, ['0-1']);
  s.setDirection('0-1', 'b-to-a');
  advance(s, 120);
  assert.equal(s.trains[0].motion.started, false);
  assert.match(s.trains[0].motion.wait!.message, /direction/);
  assertSeparated(s);
});
void test('unused crossover refunds are exact and invalid crossover placement is atomic', () => {
  const s = isolated();
  const line = s.build({
    start: 1,
    end: 2,
    bend: -12,
    kind: 'parallel',
    parent: '1-2',
  });
  const before = JSON.stringify(s.save());
  for (const position of [0, 0.35, 0.65, 1, NaN]) {
    assert.throws(() => s.buildCrossover(line, position));
    assert.equal(JSON.stringify(s.save()), before);
  }
  const cash = s.treasury,
    id = s.buildCrossover(line);
  assert.ok(s.topology.sections.has(id));
  s.undo(s.construction.at(-1)!.id);
  assert.equal(s.treasury, cash);
  assert.ok(!s.topology.sections.has(id));
  const restored = new Simulation();
  restored.restore(s.save());
  sameSave(s, restored);
});
void test('station turnouts have continuous bounded curvature and full six-car standing space', () => {
  const s = new Simulation();
  for (const section of s.topology.sections.values()) {
    if (section.kind === 'turnout')
      assert.ok(section.radius >= 6 - 1e-6, section.id);
    if (section.kind === 'platform') assert.ok(section.length >= 23.3 + 6);
  }
});
void test('following trains use separate parallel running lines concurrently with independent protection', () => {
  const s = isolated();
  s.trains[0].held = true;
  // Declared flat 150-unit capacity fixture: enough running length between
  // throats for two following consists. The shipped short corridors have no
  // guarantee that both locomotive noses occupy their running sections at once.
  s.network.nodes[0] = { ...s.network.nodes[0], x: -75, y: 0.36, z: 0 };
  s.network.nodes[1] = { ...s.network.nodes[1], x: 75, y: 0.36, z: 0 };
  const points = [
    { x: -75, y: 0.36, z: 0 },
    { x: 75, y: 0.36, z: 0 },
  ];
  s.network.edges = [{ ...s.network.edges[0], points, ...measure(points) }];
  Object.assign(s.network.stations[0], {
    yardAngle: Math.PI / 2,
    yardLead: 17,
  });
  Object.assign(s.network.stations[1], {
    yardAngle: Math.PI * 1.5,
    yardLead: 17,
  });
  s.topology = new Topology(s.network);
  s.traffic = new Traffic(s);
  const parallel = s.build({
    start: 0,
    end: 1,
    bend: -12,
    kind: 'parallel',
    parent: '0-1',
  });
  s.setDirection(parallel, 'both');
  for (const [id, edge] of [
    [0, '0-1'],
    [1, parallel],
  ] as const) {
    s.services[id] = planService(
      s.network,
      id,
      'Paired departures',
      [0, 1],
      1,
      [edge],
    );
    s.trains[id].held = false;
    s.trains[id].dwell = 0;
    s.trains[id].motion.departureDue = 0;
  }
  let concurrent = false;
  for (let i = 0; i < 24000; i++) {
    s.step(0.05);
    assertSeparated(s);
    const a = s.traffic.currentSection(s.trains[0]),
      b = s.traffic.currentSection(s.trains[1]);
    if (
      a.edge &&
      b.edge &&
      a.edge !== b.edge &&
      s.trains[0].motion.velocity > 0 &&
      s.trains[1].motion.velocity > 0
    )
      concurrent = true;
  }
  assert.ok(concurrent);
  assert.ok(s.trains[0].delivered > 0 && s.trains[1].delivered > 0);
});
