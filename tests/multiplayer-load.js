import { HeadLook } from '../src/headLook.js';
import { MultiplayerDiagnostics } from '../src/multiplayer/diagnostics.js';
import { MultiplayerClient } from '../src/multiplayer/client.js';
import { FlightPrediction } from '../src/multiplayer/prediction.js';
import { CombatLoadPilot } from './helpers/combat-load-pilot.js';
if (typeof document !== 'undefined') await mountLoadTest();
async function mountLoadTest() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
    throw new Error('This load test is restricted to localhost.');
  const query = new URLSearchParams(location.search);
  const flightOnly = query.has('flightOnly');
  // Reuse the real page and all its instruments; do not keep a separate cockpit.
  const response = await fetch('/multiplayer.html');
  if (!response.ok) throw new Error('Multiplayer template unavailable');
  const template = new DOMParser().parseFromString(await response.text(), 'text/html');
  for (const script of template.querySelectorAll('script')) script.remove();
  for (const style of template.head.querySelectorAll('link[rel="stylesheet"]'))
    document.head.append(style);
  document.body.className = template.body.className;
  document.body.replaceChildren(...template.body.childNodes);
  const marker = document.createElement('pre');
  marker.id = 'combat-load-status';
  marker.setAttribute('aria-label', 'Local combat load test');
  Object.assign(marker.style, {
    position: 'fixed',
    right: '12px',
    top: '60px',
    zIndex: 9,
    color: '#ffdd77',
    background: '#071211dd',
    padding: '10px',
    font: '12px monospace',
    pointerEvents: 'none',
  });
  document.body.append(marker);
  const lookControl = document.createElement('label');
  lookControl.style.cssText =
    'position:fixed;right:12px;top:42px;z-index:12;background:#071211;color:#baf37d;font:12px monospace;padding:5px';
  const look = document.createElement('input');
  look.type = 'checkbox';
  look.id = 'combat-look-motion';
  look.checked = query.has('lookMotion');
  lookControl.append(look, ' Continuous head movement');
  document.body.append(lookControl);
  const headUpdate = HeadLook.prototype.update;
  HeadLook.prototype.update = function (dt, now) {
    if (look.checked)
      this.move(Math.cos(now * 0.8) * 300 * dt, Math.sin(now * 0.65) * 100 * dt, now);
    return headUpdate.call(this, dt, now);
  };
  const history = document.createElement('pre');
  history.id = 'load-fps-windows';
  history.setAttribute('aria-label', 'FPS sample windows');
  history.style.cssText =
    'position:fixed;bottom:8px;left:8px;z-index:12;color:#baf37d;background:#071211;font:10px monospace;max-height:150px;overflow:hidden;pointer-events:none';
  document.body.append(history);
  const diagnosticFrame = MultiplayerDiagnostics.prototype.frame;
  MultiplayerDiagnostics.prototype.frame = function (...args) {
    if (this.testHeadMotion !== look.checked) {
      this.reset();
      this.testHeadMotion = look.checked;
    }
    diagnosticFrame.apply(this, args);
    this.panel.dataset.headMotion = String(look.checked);
    const report = this.panel.textContent;
    if (report !== this.testLastReport && report.startsWith('{')) {
      this.testLastReport = report;
      const d = JSON.parse(report),
        client = args[1];
      this.testWindows ||= [];
      this.testWindows.push({
        at: Date.now(),
        headMotion: look.checked,
        pilots: d.pilots,
        alive: client.latest.players.filter((p) => !p.state.dying && !p.state.crashed).length,
        elapsed: d.elapsedSeconds,
        fps: d.fps,
        pixels: d.pixels,
        viewport: d.viewport,
        p95Ms: d.frameP95Ms,
        maxMs: d.maxFrameMs,
        cpuMs: d.cpuMeanMs,
        instrumentMaxMs: d.instrumentsMaxMs,
        terrainPreparing: d.terrainPreparing,
        visibility: d.visibility,
      });
      if (this.testWindows.length > 24) this.testWindows.shift();
      history.textContent = JSON.stringify(this.testWindows);
    }
  };
  const connect = MultiplayerClient.prototype.connect;
  MultiplayerClient.prototype.connect = function (...args) {
    const result = connect.apply(this, args);
    this.socket.addEventListener('close', (event) => {
      marker.dataset.lastClose = JSON.stringify({
        code: event.code,
        reason: event.reason,
        decodeFailures: this.metrics.decodeFailures,
        decodeError: this.metrics.lastDecodeError,
      });
    });
    return result;
  };
  const pilots = new WeakMap(),
    states = new WeakMap();
  const accept = MultiplayerClient.prototype.acceptSnapshot;
  MultiplayerClient.prototype.acceptSnapshot = function (...args) {
    accept.apply(this, args);
    if (!this.latest) return;
    let state = states.get(this);
    if (!state || state.round !== this.round) {
      state = {
        round: this.round,
        pilot: new CombatLoadPilot({ flightOnly }),
        cursor: 0,
        shots: 0,
        hits: 0,
        peakProjectiles: 0,
      };
      states.set(this, state);
    }
    pilots.set(this.prediction, { client: this, state });
    for (const e of this.latest.combat.events) {
      if (e.id <= state.cursor) continue;
      state.cursor = e.id;
      if (['missile-launch', 'gun'].includes(e.type)) state.shots++;
      if (e.type === 'target-hit') state.hits++;
    }
    state.peakProjectiles = Math.max(state.peakProjectiles, this.latest.combat.projectiles.length);
    marker.textContent = JSON.stringify(
      {
        test: 'LOCALHOST / SILENT AUTOPILOT',
        flightOnly,
        headMotion: look.checked,
        pilot: this.latest.players.find((p) => p.id === this.id)?.callSign,
        round: this.round,
        phase: this.latest.mission?.phase,
        elapsed: Math.round(this.latest.mission?.elapsed || 0),
        shots: state.shots,
        hits: state.hits,
        peakProjectiles: state.peakProjectiles,
        binarySnapshots: this.metrics.receivedBinarySnapshots,
        decodeFailures: this.metrics.decodeFailures,
      },
      null,
      2,
    );
  };
  const step = FlightPrediction.prototype.step;
  FlightPrediction.prototype.step = function (axes, toggles, combat) {
    const binding = pilots.get(this);
    const command =
      binding &&
      this.state &&
      binding.state.pilot.command(this.state, binding.client.latest, binding.client.id);
    return command
      ? step.call(this, command.axes, command.toggles, command.combat)
      : step.call(this, axes, toggles, combat);
  };
  await import('../src/multiplayer/page.js');
}
