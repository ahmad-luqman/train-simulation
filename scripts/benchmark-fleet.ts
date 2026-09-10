import { writeFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Simulation } from '../lib/railway/simulation';
import { validateEconomy, accounts } from '../lib/railway/economy';
import { validateFleet } from '../lib/railway/fleet';
import { tunnelAt, bridgeAt } from '../lib/railway/structures';
const sim = new Simulation();
const start = performance.now();
const windows = [];
for (let window = 0; window < 2; window++) {
  for (let tick = 0; tick < 36000; tick++) sim.step(0.05);
  validateEconomy(sim);
  validateFleet(sim);
  windows.push(
    sim.trains.map((t) => ({
      id: t.id,
      calls: t.motion.calls,
      delivered: t.delivered,
    })),
  );
}
const milliseconds = performance.now() - start;
const result = {
  measuredAt: new Date().toISOString(),
  platform: `${platform()} ${arch()}`,
  cpu: cpus()[0]?.model,
  scenario:
    'Default mixed fleet including Alpine Monarch mountain circuit; two 1800-second windows',
  simulatedSeconds: 3600,
  milliseconds,
  millisecondsPerTick: milliseconds / 72000,
  stations: sim.network.stations.length,
  corridors: sim.network.edges.length,
  tunnels: sim.network.edges
    .filter((e) => e.points.some((_, i) => tunnelAt(e.points, i)))
    .map((e) => e.id),
  elevatedSpans: sim.network.edges
    .filter((e) => e.points.some((p) => p.y > 2 && bridgeAt(p)))
    .map((e) => e.id),
  maxGrade: Math.max(...sim.network.edges.map((e) => e.grade)),
  windows,
  cash: sim.treasury,
  accounts: accounts(sim.economy),
  fleet: sim.fleet.units.map((u, id) => ({
    id,
    condition: u.condition,
    fuel: u.fuel,
    water: u.water,
    services: u.serviced,
    downtime: u.downtime,
  })),
  scope:
    'Headless fleet and account reconciliation. Geometric collision and service progress assertions run in the test suite. Browser/GPU acceptance remains unmeasured.',
};
const json = JSON.stringify(result, null, 2) + '\n';
if (process.argv[2]) writeFileSync(process.argv[2], json);
else process.stdout.write(json);
