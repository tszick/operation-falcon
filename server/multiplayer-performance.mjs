import { PerformanceObserver } from 'node:perf_hooks';
const rounded = (value) => Math.round(value * 1000) / 1000;
const percentile = (list, fraction) =>
  list.length
    ? [...list].sort((a, b) => a - b)[Math.min(list.length - 1, Math.floor(list.length * fraction))]
    : 0;
// Opt-in local server measurements; no gameplay state, identities or tokens.
export class MultiplayerPerformance {
  constructor(
    report,
    {
      now = performance.now(),
      intervalMs = 5000,
      cpuUsage = () => process.cpuUsage(),
      observeGC = false,
    } = {},
  ) {
    this.readCPU = cpuUsage;
    this.report = report;
    this.intervalMs = intervalMs;
    this.reset(now);
    if (observeGC) {
      this.gcObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) this.recordGC(entry.duration);
      });
      this.gcObserver.observe({ entryTypes: ['gc'] });
    }
  }
  close() {
    this.gcObserver?.disconnect();
  }
  recordGC(ms) {
    this.gcCount++;
    if (this.gc.length < 2048) this.gc.push(ms);
  }
  reset(now) {
    this.start = now;
    this.cpuStart = this.readCPU();
    this.steps = 0;
    this.gc = [];
    this.gcCount = 0;
    this.physics = [];
    this.snapshots = [];
    this.loops = [];
    this.delays = [];
    this.physicsTotal = 0;
    this.cpuTotal = 0;
    this.dropped = 0;
    this.bytes = 0;
    this.maxBytes = 0;
  }
  step(ms) {
    this.steps++;
    this.physicsTotal += ms;
    if (this.physics.length < 2048) this.physics.push(ms);
  }
  snapshot(ms, bytes, recipients) {
    if (this.snapshots.length < 2048) this.snapshots.push(ms);
    this.maxBytes = Math.max(this.maxBytes, bytes);
    this.bytes += bytes * recipients;
  }
  loop(now, elapsedMs, cpuMs, droppedMs, context = {}) {
    this.cpuTotal += cpuMs;
    this.dropped += droppedMs;
    if (this.loops.length < 2048) {
      this.loops.push(cpuMs);
      this.delays.push(Math.max(0, elapsedMs - 8));
    }
    const duration = now - this.start;
    if (duration < this.intervalMs) return;
    const cpu = this.readCPU();
    const report = {
      gcCount: this.gcCount,
      maxGCPauseMs: rounded(Math.max(0, ...this.gc)),
      gcP95Ms: rounded(percentile(this.gc, 0.95)),
      heapUsedMB: rounded(process.memoryUsage().heapUsed / 1048576),
      rooms: context.rooms ?? 0,
      connections: context.connections ?? 0,
      windowMs: rounded(duration),
      simulationHz: rounded((this.steps * 1000) / duration),
      loopBusyPercent: rounded((this.cpuTotal * 100) / duration),
      serverCPUPercent: rounded(
        (((cpu.user - this.cpuStart.user + cpu.system - this.cpuStart.system) / 1000) * 100) /
          duration,
      ),
      physicsMeanMs: rounded(this.physicsTotal / Math.max(1, this.steps)),
      physicsP95Ms: rounded(percentile(this.physics, 0.95)),
      physicsP99Ms: rounded(percentile(this.physics, 0.99)),
      snapshotP95Ms: rounded(percentile(this.snapshots, 0.95)),
      loopP95Ms: rounded(percentile(this.loops, 0.95)),
      schedulerDelayP95Ms: rounded(percentile(this.delays, 0.95)),
      maxSchedulerDelayMs: rounded(Math.max(0, ...this.delays)),
      discardedSimulationMs: rounded(this.dropped),
      maxSnapshotBytes: this.maxBytes,
      downstreamKBps: rounded((this.bytes * 1000) / 1024 / duration),
    };
    this.reset(now);
    this.report(report);
  }
}
