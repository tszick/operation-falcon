// Keep work inside the previous rAF callback separate from time between callbacks.
// Between-callback time can include network tasks, GPU presentation and browser scheduling.
export class FrameClock {
  constructor() {
    this.reset();
  }
  reset() {
    this.lastEnd = null;
    this.lastCpuMs = 0;
  }
  begin(rafTime, start) {
    this.started = start;
    return {
      callbackDelayMs: Math.max(0, start - rafTime),
      betweenFramesMs: this.lastEnd === null ? 0 : Math.max(0, start - this.lastEnd),
      previousCpuMs: this.lastCpuMs,
    };
  }
  end(time) {
    this.lastCpuMs = Math.max(0, time - this.started);
    this.lastEnd = time;
  }
}
