import { writeFileSync } from 'node:fs';
import { platform, arch, cpus } from 'node:os';
import { Simulation } from '../lib/railway/simulation';
import {
  acceptContract,
  accounts,
  validateEconomy,
} from '../lib/railway/economy';
import { locomotives } from '../lib/railway/data';
const sim = new Simulation();
for (const offer of [0, 1, 2]) acceptContract(sim, offer);
const start = performance.now();
const windows = [];
for (let window = 0; window < 2; window++) {
  for (let tick = 0; tick < 36000; tick++) sim.step(0.05);
  validateEconomy(sim);
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
    'Default mixed fleet, three accepted raw-material contracts, two 1800-second windows',
  simulatedSeconds: 3600,
  milliseconds,
  millisecondsPerTick: milliseconds / 72000,
  cash: sim.treasury,
  debt: sim.economy.debt,
  accounts: accounts(sim.economy),
  entries: sim.economy.ledger.length,
  contracts: sim.economy.contracts,
  created: sim.economy.created,
  processingInputs: sim.economy.used,
  consumed: sim.economy.consumed,
  windows,
  services: sim.trains.map((t) => ({
    name: locomotives[t.id].name,
    wagon: sim.economy.services[t.id].wagon,
    calls: t.motion.calls,
    delivered: t.delivered,
    ...accounts(sim.economy, t.id),
    emptyRuns: sim.economy.services[t.id].emptyRuns,
  })),
  scope:
    'Headless simulation and economy reconciliation only. Independent all-vehicle separation is checked in the full regression suite; this is not a browser/GPU baseline.',
};
const json = JSON.stringify(result, null, 2) + '\n';
if (process.argv[2]) writeFileSync(process.argv[2], json);
else process.stdout.write(json);
