// Bounded, low-rate timing summaries for the current mission flight log.
export class FrameTelemetry {
  constructor(intervalMs = 5000) {
    this.intervalMs = intervalMs;
    this.reset();
  }
  reset() {
    this.samples = [];
    this.wallMs = 0;
  }
  add(sample) {
    if (!Number.isFinite(sample.frameMs) || sample.frameMs <= 0) return null;
    this.samples.push(sample);
    this.wallMs += sample.frameMs;
    return this.wallMs >= this.intervalMs || this.samples.length >= 2048 ? this.flush() : null;
  }
  flush() {
    if (!this.samples.length) return null;
    const samples = this.samples,
      round = (x) => Math.round(x * 100) / 100,
      mean = (key) => round(samples.reduce((n, s) => n + (s[key] || 0), 0) / samples.length),
      frames = samples.map((s) => s.frameMs).sort((a, b) => a - b),
      result = {
        frames: samples.length,
        windowMs: round(this.wallMs),
        fps: round((samples.length * 1000) / this.wallMs),
        frameMs: mean('frameMs'),
        p95FrameMs: round(frames[Math.min(frames.length - 1, Math.ceil(frames.length * 0.95) - 1)]),
        maxFrameMs: round(frames.at(-1)),
        longFrames: samples.filter((s) => s.frameMs > 50).length,
        cpuMs: mean('cpuMs'),
        simulationMs: mean('simulationMs'),
        renderMs: mean('renderMs'),
        uiMs: mean('uiMs'),
      };
    this.reset();
    return result;
  }
}
