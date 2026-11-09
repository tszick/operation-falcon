import { presentationMemory } from './presentationMemory.js';
import { StallTrace } from './stallTrace.js';
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
    this.trace = new StallTrace();
    this.reset();
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
  reset() {
    this.telemetry = new FrameTelemetry();
    this.windows = [];
    this.peakProjectiles = 0;
    this.renderParts = {};
    this.instrumentParts = {};
    this.renderWindow = {};
    this.instrumentWindow = {};
    this.stalls = [];
    this.previousWork = null;
    this.trace?.reset();
    if (this.panel) this.panel.textContent = 'LOCALHOST / SILENT PERFORMANCE TEST\nMeasuring…';
  }
  bindRenderer(renderer) {
    this.renderer = renderer;
    if (renderer.gpuModels) renderer.gpuModels.profile = true;
    if (renderer.ctx.surface) renderer.ctx.surface.profile = true;
    for (const name of ['terrain', 'runway', 'flushMeshes', 'hud']) {
      const draw = renderer[name].bind(renderer);
      renderer[name] = (...args) => {
        const start = performance.now(),
          result = draw(...args);
        const ms = performance.now() - start;
        this.renderParts[name] = Math.max(this.renderParts[name] || 0, ms);
        this.renderWindow[name] = Math.max(this.renderWindow[name] || 0, ms);
        return result;
      };
    }
  }
  frame(sample, client, instruments, instrumentLayer) {
    for (const [name, ms] of instruments?.costs || []) {
      this.instrumentParts[name] = Math.max(this.instrumentParts[name] || 0, ms);
      this.instrumentWindow[name] = Math.max(this.instrumentWindow[name] || 0, ms);
    }
    if (client.latest.mission?.phase === 'waiting') return;
    if (sample.frameMs > 50) {
      this.stalls.push({
        wallTimeMs: Date.now(),
        startedAt: sample.startedAt,
        previousWork: this.previousWork,
        browserWork: this.trace?.recent(sample.startedAt, Math.max(100, sample.frameMs + 50)),
        frameMs: sample.frameMs,
        cpuMs: sample.cpuMs,
        previousCpuMs: sample.previousCpuMs,
        betweenFramesMs: sample.betweenFramesMs,
        callbackDelayMs: sample.callbackDelayMs,
        visibility: document.visibilityState,
        focused: document.hasFocus?.() ?? null,
      });
      if (this.stalls.length > 24) this.stalls.shift();
    }
    this.previousWork = {
      startedAt: sample.startedAt,
      simulationMs: sample.simulationMs,
      renderMs: sample.renderMs,
      uiMs: sample.uiMs,
      hudMs: sample.hudMs,
      instrumentMs: sample.instrumentMs,
    };
    this.peakProjectiles = Math.max(this.peakProjectiles, client.latest.combat.projectiles.length);
    const report = this.telemetry.add(sample);
    if (!report) return;
    this.windows.push(report);
    if (this.windows.length > 24) this.windows.shift();
    this.panel.textContent = JSON.stringify(
      {
        localhost: true,
        memory: presentationMemory(this.renderer, instrumentLayer),
        decodeFailures: client.metrics.decodeFailures || 0,
        lastDecodeError: client.metrics.lastDecodeError || null,
        visibility: document.visibilityState,
        viewport: [this.renderer?.w, this.renderer?.h],
        pixels: [this.renderer?.canvas?.width, this.renderer?.canvas?.height],
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
        cpuMaxMs: report.maxCpuMs,
        betweenFramesMaxMs: report.maxBetweenFramesMs,
        callbackDelayMaxMs: report.maxCallbackDelayMs,
        recentStalls: this.stalls.slice(-8),
        browserWork: this.trace?.recent(performance.now()),
        gpuAdapter: this.renderer?.ctx?.surface?.runtime?.adapterInfo || {},
        gpuQueueFence: this.renderer?.gpuModels?.queueProbe?.stats || {},
        featureMaskTransfers: this.renderer?.gpuModels?.featureMaskStats || {},
        worldSurfaceTasks: this.renderer?.ctx?.surface?.profileMetrics || {},
        instrumentSurfaceTasks: instruments?.surfaceTasks || {},
        simulationMaxMs: report.maxSimulationMs,
        renderMaxMs: report.maxRenderMs,
        uiMaxMs: report.maxUiMs,
        hudMaxMs: report.maxHudMs,
        instrumentsMaxMs: report.maxInstrumentMs,
        backendTimingPeaksMs: this.renderer?.gpuModels?.timingPeaks || {},
        terrainPreparing: !!this.renderer?.terrainPreparing,
        terrainWorkerBuildMs: Math.round((this.renderer?.terrainWorkerMs || 0) * 100) / 100,
        renderPartsWindowMaxMs: this.renderWindow,
        instrumentPartsWindowMaxMs: this.instrumentWindow,
        renderPartsMaxMs: Object.fromEntries(
          Object.entries(this.renderParts).map(([k, v]) => [k, Math.round(v * 100) / 100]),
        ),
        instrumentPartsMaxMs: Object.fromEntries(
          Object.entries(this.instrumentParts).map(([k, v]) => [k, Math.round(v * 100) / 100]),
        ),
        rttMs: Math.round(client.rtt || 0),
        maxSnapshotApplyMs: Math.round(client.metrics.maxSnapshotApplyMs * 100) / 100,
        maxDecodeMs: Math.round(client.metrics.maxDecodeMs * 100) / 100,
        maxReconcileMs: Math.round(client.metrics.maxReconcileMs * 100) / 100,
        maxHistoryMs: Math.round(client.metrics.maxHistoryMs * 100) / 100,
        maxCombatApplyMs: Math.round(client.metrics.maxCombatApplyMs * 100) / 100,
        pendingCommands: client.prediction.pending.length,
        coalescedSnapshots: client.inbox.coalesced,
      },
      null,
      2,
    );
    this.renderWindow = {};
    this.instrumentWindow = {};
  }
}
