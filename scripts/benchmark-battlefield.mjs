import { configureBattlefieldObserver } from '../tests/helpers/battlefield-observer.js';
// Local, silent simulation-stage benchmark. This does not measure browser FPS.
import { aircraft, missions } from '../src/aircraftSpec.js';
import { missionForSide } from '../src/missionSides.js';
import { createTargets, updateTargets, Targeting } from '../src/targeting.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { stepAircraft } from '../src/physics.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { FlightRecorder } from '../src/flightRecorder.js';
const seconds = Number(process.argv[2] || 90),
  side = process.argv[3] || 'west',
  observer = process.argv[4] === 'observer';
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 600 || !['west', 'east'].includes(side))
  throw new Error('Usage: node scripts/benchmark-battlefield.mjs [seconds:1..600] [west|east]');
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
const samples = Object.fromEntries(
  ['physics', 'movement', 'aim', 'weapons', 'mission', 'log', 'total'].map((k) => [k, []]),
);
let peakProjectiles = 0,
  peakEffects = 0,
  peakTrails = 0;
for (let i = 0; i < seconds * 120; i++) {
  const begin = performance.now();
  let last = begin;
  const measure = (key, fn) => {
    fn();
    const now = performance.now();
    samples[key].push(now - last);
    last = now;
  };
  measure('physics', () => {
    if (observer) s.elapsed += 1 / 120;
    else stepAircraft(s, {}, 1 / 120);
  });
  measure('movement', () => updateTargets(targets, 1 / 120));
  measure('aim', () => aim.update(s, targets, 1 / 120));
  measure('weapons', () => w.update(s, targets, 1 / 120));
  measure('mission', () => m.update(s, targets, w, aim));
  measure('log', () => {
    for (const event of w.drainEvents()) recorder.event(event.type, event);
    recorder.capture(s, m, targets, w, aim, {});
  });
  samples.total.push(performance.now() - begin);
  peakProjectiles = Math.max(peakProjectiles, w.projectiles.length);
  peakEffects = Math.max(peakEffects, w.effects.length);
  peakTrails = Math.max(peakTrails, w.trails.length);
}
const summary = (values) => {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    meanMs: values.reduce((a, b) => a + b, 0) / values.length,
    p95Ms: sorted[Math.floor(sorted.length * 0.95)],
    p99Ms: sorted[Math.floor(sorted.length * 0.99)],
    maxMs: sorted.at(-1),
  };
};
console.log(
  JSON.stringify(
    {
      mission: spec.name,
      side,
      seconds,
      mode: observer ? 'AI-only observer' : 'neutral player',
      wave: m.wave,
      complete: m.complete,
      failed: m.failed,
      units: targets.length,
      activeUnits: targets.filter((t) => t.alive && !t.pending && !t.exited).length,
      actualSimulationSeconds: s.elapsed,
      playerCrashed: s.crashed,
      peakProjectiles,
      peakEffects,
      peakTrails,
      stages: Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, summary(v)])),
      note: observer
        ? 'CPU simulation only; AI-only battle, restored human seat, ordinary damage, ammunition and resupply. No sound or external connections.'
        : 'CPU simulation only; neutral player controls, ordinary damage and ammunition, no sound or external connections.',
    },
    null,
    2,
  ),
);
