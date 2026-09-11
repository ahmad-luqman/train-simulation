/** Bounded frame samples; intervals measure responsiveness, CPU samples include simulation and render submission, not GPU execution. */
export class FrameMetrics {
  private intervals: number[] = [];
  private costs: number[] = [];
  private cursor = 0;
  constructor(private capacity = 1800) {}
  record(interval: number, cost: number) {
    if (
      !Number.isFinite(interval) ||
      interval <= 0 ||
      !Number.isFinite(cost) ||
      cost < 0
    )
      return;
    this.intervals[this.cursor] = interval;
    this.costs[this.cursor] = cost;
    this.cursor = (this.cursor + 1) % this.capacity;
  }
  reset() {
    this.intervals = [];
    this.costs = [];
    this.cursor = 0;
  }
  snapshot() {
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const costs = [...this.costs].sort((a, b) => a - b);
    const percentile = (values: number[], p: number) =>
      values.length
        ? Math.round(values[Math.ceil(values.length * p) - 1] * 100) / 100
        : 0;
    return {
      samples: sorted.length,
      frameP50: percentile(sorted, 0.5),
      frameP95: percentile(sorted, 0.95),
      frameP99: percentile(sorted, 0.99),
      cpuP95: percentile(costs, 0.95),
    };
  }
}
