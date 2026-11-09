// Diagnostic fence latency includes GPU work and delayed JavaScript callbacks.
// It is not a GPU execution-time measurement. Never wait for it in the render loop.
export class GpuQueueProbe {
  constructor({ now = () => performance.now(), intervalMs = 1000 } = {}) {
    this.now = now;
    this.intervalMs = intervalMs;
    this.lastAt = -Infinity;
    this.stats = { pending: false, samples: 0, lastMs: 0, maxMs: 0, failures: 0 };
  }
  request(queue) {
    const start = this.now();
    if (!queue.onSubmittedWorkDone || this.stats.pending || start - this.lastAt < this.intervalMs)
      return;
    this.lastAt = start;
    this.stats.pending = true;
    try {
      queue.onSubmittedWorkDone().then(
        () => {
          const ms = Math.max(0, this.now() - start);
          Object.assign(this.stats, {
            pending: false,
            samples: this.stats.samples + 1,
            lastMs: ms,
            maxMs: Math.max(this.stats.maxMs, ms),
          });
        },
        () => this.fail(),
      );
    } catch {
      this.fail();
    }
  }
  fail() {
    this.stats.pending = false;
    this.stats.failures++;
  }
}
