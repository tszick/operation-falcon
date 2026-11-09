// Local diagnostics only: bounded browser task attribution and network timing.
// Observer callbacks arrive after the work; timestamps, not callback order,
// connect them to a stalled frame. No browser entries or script objects are kept.
export class StallTrace {
  constructor(Observer = globalThis.PerformanceObserver) {
    this.entries = [];
    this.network = [];
    this.supported = [];
    this.observers = [];
    for (const type of ['long-animation-frame', 'longtask']) {
      if (!Observer?.supportedEntryTypes?.includes(type)) continue;
      try {
        const observer = new Observer((list) => {
          for (const entry of list.getEntries()) this.record(entry);
        });
        observer.observe({ type });
        this.observers.push(observer);
        this.supported.push(type);
      } catch {
        // Partial browser implementations must not interrupt the game.
      }
    }
  }
  reset() {
    this.entries.length = 0;
    this.network.length = 0;
    for (const observer of this.observers) observer.takeRecords?.();
  }
  record(entry) {
    const scripts = Array.from(entry.scripts || [], (s) => ({
      duration: s.duration,
      forcedLayoutMs: s.forcedStyleAndLayoutDuration || 0,
      function: String(s.sourceFunctionName || '').slice(0, 80),
      source: String(s.sourceURL || '')
        .split('?')[0]
        .split('/')
        .pop()
        .slice(0, 100),
      invoker: String(s.invoker || '').slice(0, 100),
    }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 4);
    this.entries.push({
      type: entry.entryType,
      start: entry.startTime,
      duration: entry.duration,
      blockingMs: entry.blockingDuration || 0,
      renderStart: entry.renderStart || 0,
      styleAndLayoutStart: entry.styleAndLayoutStart || 0,
      scripts,
    });
    if (this.entries.length > 32) this.entries.shift();
  }
  recordNetwork(kind, start, duration) {
    this.network.push({ kind, start, duration });
    if (this.network.length > 256) this.network.shift();
  }
  recent(now, windowMs = 5000) {
    const since = now - windowMs;
    const network = this.network.filter((e) => e.start + e.duration >= since && e.start <= now);
    return {
      supported: this.supported,
      tasks: this.entries.filter((e) => e.start + e.duration >= since && e.start <= now).slice(-8),
      network: {
        samples: network.length,
        totalMs: network.reduce((n, e) => n + e.duration, 0),
        maxMs: Math.max(0, ...network.map((e) => e.duration)),
        slowest: [...network].sort((a, b) => b.duration - a.duration).slice(0, 4),
      },
    };
  }
  disconnect() {
    for (const observer of this.observers) observer.disconnect();
    this.observers.length = 0;
  }
}
