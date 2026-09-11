import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { Simulation } from '../lib/railway/simulation';
import { SaveStore } from '../lib/railway/save-store';
import { validateEconomy, accounts } from '../lib/railway/economy';
import { validateFleet } from '../lib/railway/fleet';
import { validateRegion } from '../lib/railway/region';
import { assertSeparated } from '../lib/railway/test-helpers';
const sim = new Simulation('sandbox', 67);
sim.region.settings.growth = true;
sim.region.settings.weather = true;
sim.region.settings.events = true;
const storage = new Map<string, string>();
const store = new SaveStore({
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => {
    storage.set(key, value);
  },
});
const start = performance.now(),
  windows = [];
let calls = sim.trains.map((t) => t.motion.calls);
for (let window = 0; window < 6; window++) {
  const started = performance.now();
  for (let tick = 0; tick < 12000; tick++) {
    sim.step(0.05);
    assertSeparated(sim);
  }
  validateEconomy(sim);
  validateFleet(sim);
  validateRegion(sim);
  await store.autosave(sim.save());
  await store.write('manual-1', sim.save(), 'Soak checkpoint');
  const saved = (await store.load('manual-1')).state;
  sim.restore(saved);
  assert.deepEqual(sim.save(), saved);
  sim.paused = true;
  sim.step(60);
  assert.deepEqual(sim.save(), saved);
  sim.paused = false;
  if (window === 2 || window === 5) {
    for (const train of sim.trains)
      assert.ok(
        train.motion.calls > calls[train.id],
        `Train ${train.id} stalled in 1800-second window`,
      );
    calls = sim.trains.map((t) => t.motion.calls);
  }
  windows.push({
    simulatedSeconds: sim.elapsed,
    milliseconds: performance.now() - started,
    calls: sim.trains.map((t) => t.motion.calls),
    storedBytes: [...storage.values()].reduce(
      (n, s) => n + Buffer.byteLength(s),
      0,
    ),
    heapMB: process.memoryUsage().heapUsed / 1024 / 1024,
  });
}
const result = {
  measuredAt: new Date().toISOString(),
  platform: `${platform()} ${arch()}`,
  cpu: cpus()[0]?.model,
  simulatedSeconds: sim.elapsed,
  milliseconds: performance.now() - start,
  windows,
  accounts: accounts(sim.economy),
  scope:
    '60 simulated minutes, twelve trains with weather/events/growth, independent geometric separation every tick, save/restore and pause checks every ten minutes, all-service progress in each half. Timings include validation and storage; Node heap is not GPU memory or a real-time browser soak.',
};
const json = JSON.stringify(result, null, 2) + '\n';
if (process.argv[2]) writeFileSync(process.argv[2], json);
else process.stdout.write(json);
