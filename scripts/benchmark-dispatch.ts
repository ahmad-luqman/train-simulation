import { cpus, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Simulation } from '../lib/railway/simulation';

// Pure fixed-tick simulation timing; this intentionally makes no WebGL/FPS claim.
const samples: number[] = [];
const started = performance.now();
const s = new Simulation();
const initializationMs = performance.now() - started;
let maximumMoving = 0;
let at1800: number[] = [];
const lastCalls = Array(12).fill(0) as number[];
const longestCallGap = Array(12).fill(0) as number[];
const counts = Array(12).fill(0) as number[];
for (let tick = 0; tick < 72000; tick++) {
  const begin = performance.now();
  s.step(0.05);
  samples.push(performance.now() - begin);
  maximumMoving = Math.max(
    maximumMoving,
    s.trains.filter((t) => t.motion.velocity > 0).length,
  );
  for (const t of s.trains)
    if (t.motion.calls > counts[t.id]) {
      longestCallGap[t.id] = Math.max(
        longestCallGap[t.id],
        s.elapsed - lastCalls[t.id],
      );
      lastCalls[t.id] = s.elapsed;
      counts[t.id] = t.motion.calls;
    }
  if (tick === 35999) at1800 = s.trains.map((t) => t.delivered);
}
const totalTickMs = samples.reduce((a, b) => a + b, 0);
samples.sort((a, b) => a - b);
const percentile = (fraction: number) =>
  samples[Math.floor((samples.length - 1) * fraction)];
const disruptions = new Simulation();
for (let i = 0; i < 3600; i++) disruptions.step(0.05);
const held = disruptions.trains.find((t) => t.motion.started)!;
held.held = true;
for (let i = 0; i < 1800; i++) disruptions.step(0.05);
held.held = false;
const beforeDisruptionRecovery = disruptions.trains.map((t) => t.delivered);
for (let i = 0; i < 36000; i++) disruptions.step(0.05);
const recovered = disruptions.trains.map((t) => t.delivered);
const result = {
  recordedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    os: platform(),
    arch: arch(),
    cpu: cpus()[0].model,
    logicalCpus: cpus().length,
  },
  scope:
    'Headless simulation only. Includes interlocking and swept collision backstop; excludes rendering and independent test oracle.',
  initializationMs,
  simulation: {
    ticks: samples.length,
    simulatedSeconds: 3600,
    initializationMs,
    totalTickMs,
    meanTickMs: totalTickMs / samples.length,
    p50TickMs: percentile(0.5),
    p95TickMs: percentile(0.95),
    p99TickMs: percentile(0.99),
    maxTickMs: samples.at(-1),
    realtimeMultiple: 3600000 / totalTickMs,
  },
  topology: {
    sections: s.topology.sections.size,
    conflictZones: s.topology.zones.length,
  },
  maximumMoving,
  services: s.trains.map((t) => ({
    id: t.id,
    deliveredAt1800: at1800[t.id],
    deliveredAt3600: t.delivered,
    calls: t.motion.calls,
    longestCompletedCallGapSeconds: longestCallGap[t.id],
    secondsSinceLastCall: s.elapsed - lastCalls[t.id],
    emergencyStops: t.motion.physical.emergencies,
  })),
  disruption: {
    heldTrain: held.id,
    holdAtSeconds: 180,
    holdSeconds: 90,
    recoveryWindowSeconds: 1800,
    before: beforeDisruptionRecovery,
    after: recovered,
    emergencyStops: disruptions.trains.reduce(
      (n, t) => n + t.motion.physical.emergencies,
      0,
    ),
  },
};
console.log(JSON.stringify(result, null, 2));
if (
  maximumMoving < 4 ||
  s.trains.some(
    (t) =>
      at1800[t.id] <= 0 ||
      t.delivered <= at1800[t.id] ||
      t.motion.physical.emergencies !== 0,
  ) ||
  recovered.some((n, i) => n <= beforeDisruptionRecovery[i]) ||
  result.disruption.emergencyStops !== 0
)
  process.exitCode = 1;
