import { configureBattlefieldObserver } from './helpers/battlefield-observer.js';
import { Vec3, Quat } from '../src/math.js';
// Real scenario, physics, weapons and renderer. No audio module or remote connection.
import { aircraft, missions } from '../src/aircraftSpec.js';
import { missionForSide } from '../src/missionSides.js';
import { createTargets, updateTargets, Targeting } from '../src/targeting.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { stepAircraft } from '../src/physics.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { FlightRecorder } from '../src/flightRecorder.js';
import { Renderer } from '../src/renderer.js';
import { FlightInstrumentLayer } from '../src/rendering/flightInstrumentLayer.js';
import { updateHUD } from '../src/hud.js';
import { FrameTelemetry } from '../src/frameTelemetry.js';
if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))
  throw new Error('Local test only');
const query = new URLSearchParams(location.search);
const side = query.get('side') === 'east' ? 'east' : 'west';
const observer = query.get('mode') === 'observer';
const warmup = observer ? Math.max(0, Math.min(420, Number(query.get('at')) || 0)) : 0;
const doc = new DOMParser().parseFromString(await (await fetch('/')).text(), 'text/html');
for (const selector of ['#world', 'header', '#flight-ui'])
  document.body.append(doc.querySelector(selector));
document.body.classList.add('flying');
document.getElementById('flight-ui').hidden = false;
const spec = missionForSide(
    missions.find((m) => m.id === 'taiwan-invasion'),
    side,
  ),
  plane = aircraft.find((a) => a.id === (side === 'west' ? 'fa18' : 'su27')),
  targets = createTargets(spec, plane, { rng: () => 0.4 }),
  s = createMissionAircraft(plane, spec),
  m = new Mission(spec),
  w = new Weapons({ enemyFire: true, random: () => 0.4 }),
  aim = new Targeting(),
  recorder = new FlightRecorder();
if (observer) configureBattlefieldObserver(plane, targets, s);
m.update(s, targets, w, aim);
recorder.start(s, m, targets, w, aim);
const renderer = new Renderer(document.getElementById('world'), { backgroundTerrain: true });
renderer.surfaceMode = 'ocean';
renderer.surfaceLines = false;
await renderer.ready;
const instruments = new FlightInstrumentLayer(renderer);
await instruments.prepareAssets();
const telemetry = new FrameTelemetry(),
  windows = [],
  peaks = {},
  hudPeaks = {},
  hudSpikes = [];
for (const name of ['terrain', 'runway', 'flushMeshes', 'hud']) {
  const draw = renderer[name].bind(renderer);
  renderer[name] = (...args) => {
    const start = performance.now();
    const result = draw(...args);
    peaks[name] = Math.max(peaks[name] || 0, performance.now() - start);
    return result;
  };
}
function tick() {
  if (observer) s.elapsed += 1 / 120;
  else stepAircraft(s, {}, 1 / 120);
  updateTargets(targets, 1 / 120);
  aim.update(s, targets, 1 / 120);
  w.update(s, targets, 1 / 120);
  m.update(s, targets, w, aim);
  for (const event of w.drainEvents()) recorder.event(event.type, event);
  recorder.capture(s, m, targets, w, aim, {});
}
// Warmup uses the same fixed-step AI, collisions, weapons, resupply and waves.
// Only subsequent real-time rAF frames enter FPS statistics.
for (let i = 0; i < warmup * 120 && !m.complete && !m.failed; i++) {
  tick();
  if (i % 120 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
}
let observerCenter;
function renderState(dt) {
  if (!observer) return s;
  const live = targets.filter((t) => t.alive && !t.pending && !t.exited && t.kind === 'air');
  const shots = w.projectiles.filter((p) => !p.interceptor);
  const contacts = shots.length ? shots : live;
  if (!contacts.length) return { ...s, position: new Vec3(0, 4000, -10000), onGround: false };
  const center = new Vec3();
  for (const t of contacts) center.add(t.position);
  center.scale(1 / contacts.length);
  if (!observerCenter) observerCenter = center;
  else {
    const delta = center.sub(observerCenter);
    observerCenter.add(delta.scale(Math.min(1, (400 * dt) / Math.max(1e-9, delta.length()))));
  }
  const flight = live.find((t) => t.flight)?.flight || s;
  return {
    ...flight,
    elapsed: s.elapsed,
    onGround: false,
    crashed: false,
    dying: false,
    position: observerCenter.clone().add(new Vec3(0, 1800, -5500)),
    orientation: Quat.euler(0, -Math.atan2(1800, 5500), 0),
  };
}
let last = performance.now(),
  accumulator = 0,
  ui = 1,
  peakProjectiles = 0,
  peakEffects = 0,
  peakTrails = 0;
function frame(now) {
  const start = performance.now(),
    frameMs = now - last;
  last = now;
  const dt = Math.min(0.1, frameMs / 1000);
  accumulator += dt;
  ui += dt;
  while (accumulator >= 1 / 120) {
    tick();
    accumulator -= 1 / 120;
  }
  const simulationEnd = performance.now();
  renderer.cinematic = !observer && !!s.dying;
  const view = renderState(dt);
  renderer.render(view, targets, w, aim);
  const renderEnd = performance.now();
  let hudMs = 0;
  if (ui >= 0.15) {
    const begin = performance.now();
    updateHUD(view, targets, w, aim, m, true, {
      profile(name, ms) {
        hudPeaks[name] = Math.max(hudPeaks[name] || 0, ms);
        if (ms > 8) {
          hudSpikes.push({ name, ms, seconds: s.elapsed, wave: m.wave });
          if (hudSpikes.length > 16) hudSpikes.shift();
        }
      },
    });
    hudMs = performance.now() - begin;
    ui = 0;
  }
  const instrumentStart = performance.now();
  instruments.render();
  const end = performance.now();
  peakProjectiles = Math.max(peakProjectiles, w.projectiles.length);
  peakEffects = Math.max(peakEffects, w.effects.length);
  peakTrails = Math.max(peakTrails, w.trails.length);
  const report = telemetry.add({
    frameMs,
    cpuMs: end - start,
    simulationMs: simulationEnd - start,
    renderMs: renderEnd - simulationEnd,
    uiMs: end - renderEnd,
    hudMs,
    instrumentMs: end - instrumentStart,
  });
  if (report) {
    windows.push(report);
    if (windows.length > 12) windows.shift();
    document.getElementById('battlefield-performance').textContent = JSON.stringify(
      {
        test: 'LOCALHOST / SILENT / REAL COMBAT',
        mission: spec.name,
        side,
        mode: observer ? 'AI-only observer' : 'player cockpit',
        warmupSeconds: warmup,
        wave: m.wave,
        complete: m.complete,
        failed: m.failed,
        seconds: s.elapsed,
        units: targets.length,
        activeUnits: targets.filter((t) => t.alive && !t.pending && !t.exited).length,
        playerCrashed: s.crashed,
        missionPhase: m.phase,
        peakProjectiles,
        peakEffects,
        peakTrails,
        report,
        windows,
        renderPartsMaxMs: peaks,
        hudPartsMaxMs: hudPeaks,
        recentHUDSpikes: hudSpikes,
        instrumentCosts: instruments.metrics?.costs,
      },
      null,
      2,
    );
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
