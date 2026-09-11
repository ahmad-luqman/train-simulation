import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FrameMetrics } from './performance';
void test('frame reporting includes real stalls, bounds retained samples and rejects invalid data', () => {
  const metrics = new FrameMetrics(100);
  for (let i = 1; i <= 100; i++) metrics.record(i, i / 2);
  assert.deepEqual(metrics.snapshot(), {
    samples: 100,
    frameP50: 50,
    frameP95: 95,
    frameP99: 99,
    cpuP95: 47.5,
  });
  for (let i = 0; i < 100; i++) metrics.record(250, 10);
  metrics.record(NaN, 1);
  metrics.record(0, 0);
  assert.equal(metrics.snapshot().samples, 100);
  assert.equal(metrics.snapshot().frameP95, 250);
  metrics.reset();
  assert.equal(metrics.snapshot().samples, 0);
});
