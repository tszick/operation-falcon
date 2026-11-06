import { FrameTelemetry } from '../frameTelemetry.js';
// Opt-in local measurement only. Nothing is uploaded or persisted.
export class MultiplayerDiagnostics {
  static open() {
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ||
      new URLSearchParams(location.search).get('diagnostics') !== '1'
    )
      return null;
    return new MultiplayerDiagnostics();
  }
  constructor() {
    this.telemetry = new FrameTelemetry();
    this.windows = [];
    this.peakProjectiles = 0;
    this.renderParts = {};
    this.instrumentParts = {};
    this.panel = document.createElement('pre');
    this.panel.id = 'network-diagnostics';
    this.panel.setAttribute('aria-label', 'Local multiplayer performance');
    Object.assign(this.panel.style, {
      position: 'fixed',
      top: '50px',
      left: '12px',
      zIndex: '8',
      padding: '10px',
      maxWidth: '440px',
      whiteSpace: 'pre-wrap',
      background: '#071a15ed',
      color: '#c4ef96',
      font: '12px monospace',
      pointerEvents: 'none',
    });
    this.panel.textContent = 'LOCALHOST / SILENT PERFORMANCE TEST\nMeasuring…';
    document.body.append(this.panel);
  }
  bindRenderer(renderer) {
    for (const name of ['terrain', 'runway', 'flushMeshes', 'hud']) {
      const draw = renderer[name].bind(renderer);
      renderer[name] = (...args) => {
        const start = performance.now(),
          result = draw(...args);
        this.renderParts[name] = Math.max(this.renderParts[name] || 0, performance.now() - start);
        return result;
      };
    }
  }
  frame(sample, client, instruments) {
    for (const [name, ms] of instruments?.costs || [])
      this.instrumentParts[name] = Math.max(this.instrumentParts[name] || 0, ms);
    if (client.latest.mission?.phase === 'waiting') return;
    this.peakProjectiles = Math.max(this.peakProjectiles, client.latest.combat.projectiles.length);
    const report = this.telemetry.add(sample);
    if (!report) return;
    this.windows.push(report);
    if (this.windows.length > 24) this.windows.shift();
    this.panel.textContent = JSON.stringify(
      {
        localhost: true,
        visibility: document.visibilityState,
        pilots: client.latest.players.length,
        fps: report.fps,
        worstWindowFPS: Math.min(...this.windows.map((w) => w.fps)),
        longFramesInLastTwoMinutes: this.windows.reduce((n, w) => n + w.longFrames, 0),
        maxFrameMs: Math.max(...this.windows.map((w) => w.maxFrameMs)),
        peakProjectiles: this.peakProjectiles,
        elapsedSeconds: Math.round(client.latest.time),
        frameP95Ms: report.p95FrameMs,
        longFrames: report.longFrames,
        cpuMeanMs: report.cpuMs,
        simulationMaxMs: report.maxSimulationMs,
        renderMaxMs: report.maxRenderMs,
        uiMaxMs: report.maxUiMs,
        hudMaxMs: report.maxHudMs,
        instrumentsMaxMs: report.maxInstrumentMs,
        renderPartsMaxMs: Object.fromEntries(
          Object.entries(this.renderParts).map(([k, v]) => [k, Math.round(v * 100) / 100]),
        ),
        instrumentPartsMaxMs: Object.fromEntries(
          Object.entries(this.instrumentParts).map(([k, v]) => [k, Math.round(v * 100) / 100]),
        ),
        rttMs: Math.round(client.rtt || 0),
        maxSnapshotApplyMs: Math.round(client.metrics.maxSnapshotApplyMs * 100) / 100,
        maxDecodeMs: Math.round(client.metrics.maxDecodeMs * 100) / 100,
        pendingCommands: client.prediction.pending.length,
        coalescedSnapshots: client.inbox.coalesced,
      },
      null,
      2,
    );
  }
}
