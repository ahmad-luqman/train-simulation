import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { cpus, platform, arch } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Simulation } from '../lib/railway/simulation';
import {
  SCENARIOS,
  recordAction,
  research,
  researchReason,
  validateRegion,
  type SessionMode,
} from '../lib/railway/region';
import { validateEconomy } from '../lib/railway/economy';
import { validateFleet } from '../lib/railway/fleet';
import { planService } from '../lib/railway/network';
const sessions = [];
for (const mode of ['campaign', ...Object.keys(SCENARIOS)] as SessionMode[]) {
  const sim = new Simulation(mode);
  if (mode === 'campaign' || mode === 'river') {
    recordAction(sim, 'select');
    const edge = sim.build({
      start: 4,
      end: 7,
      bend: -12,
      kind: 'parallel',
      parent: '4-7',
    });
    sim.setDirection(edge, 'both');
    const id = mode === 'campaign' ? 4 : 9;
    sim.assignService(
      planService(sim.network, id, 'River shuttle', [4, 7], 3.5, [edge]),
    );
    sim.setHold(id, false);
    if (mode === 'campaign') sim.setHold(3, false);
  }
  const start = performance.now();
  let ticks = 0;
  for (; ticks < 144000 && !sim.region.result; ticks++) {
    sim.step(0.05);
    if (ticks % 20 === 0) {
      if (mode === 'campaign' || mode === 'junction')
        for (const t of sim.trains) if (t.motion.wait) sim.prioritize(t.id);
      if (mode === 'campaign')
        for (const id of ['civil', 'freight'] as const)
          if (!researchReason(sim, id)) research(sim, id);
    }
  }
  const milliseconds = performance.now() - start;
  validateEconomy(sim);
  validateFleet(sim);
  validateRegion(sim);
  assert.equal(sim.region.result?.outcome, 'won', mode);
  sessions.push({
    mode,
    seed: sim.region.seed,
    simulatedSeconds: sim.elapsed,
    milliseconds,
    millisecondsPerTick: milliseconds / ticks,
    result: sim.region.result,
    research: sim.region.research,
    tutorial: sim.region.tutorial,
    towns: sim.region.towns.filter((t) => t.level > 0),
    cash: sim.treasury,
  });
}
const report = {
  measuredAt: new Date().toISOString(),
  platform: `${platform()} ${arch()}`,
  cpu: cpus()[0]?.model,
  sessions,
  scope:
    'Deterministic campaign and four scenario completions using real commands, reconciled economy/fleet/region. Physical separation is asserted per tick in tests. Browser/GPU acceptance is not measured here.',
};
const json = JSON.stringify(report, null, 2) + '\n';
if (process.argv[2]) writeFileSync(process.argv[2], json);
else process.stdout.write(json);
