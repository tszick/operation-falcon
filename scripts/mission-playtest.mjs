// Diagnostic flights, not a human skill or mission-difficulty benchmark.
// Checkpoints intentionally skip already-tested objectives; flight, damage,
// missiles, finite stocks and AI use the normal simulation after initialization.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { createTargets, updateTargets, Targeting, radarContacts } from '../src/targeting.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { stepAircraft, STEP } from '../src/physics.js';
import { Vec3, Quat, attitude } from '../src/math.js';
import { combatFlightInput } from '../src/aiDefense.js';
import { terrainHeight } from '../src/terrain.js';
import { decoyKind, deployCountermeasures } from '../src/countermeasures.js';
import { FlightRecorder } from '../src/flightRecorder.js';
import { firingStatus } from '../src/firingStatus.js';
const args = process.argv.slice(2),
  option = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
const mode = option('--mode', 'strike'),
  seed = Number(option('--seed', '17')),
  seconds = Number(option('--seconds', mode === 'escort' ? 500 : 360)),
  out = path.resolve(option('--out', './playtest-output'));
let randomSeed = seed >>> 0;
const random = () => {
  randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0;
  return randomSeed / 4294967296;
};
Math.random = random;
const spec = aircraft.find((a) => a.id === option('--aircraft', 'f16')),
  scenario = missions.find((m) => m.id === 'iron-veil'),
  targets = createTargets(scenario, spec, { rng: random }),
  s = createMissionAircraft(spec, scenario),
  m = new Mission(scenario),
  w = new Weapons({ enemyFire: true, random }),
  aim = new Targeting(),
  by = (id) => targets.find((t) => t.id === id);
m.update(s, targets, w, aim);
if (mode !== 'strike') {
  for (const id of ['IV-SAM1', 'IV-SAM2', 'IV-BRIDGE', 'IV-GUARD1', 'IV-GUARD2'])
    by(id).alive = false;
  m.update(s, targets, w, aim);
  m.serviceCount = 1;
  m.update(s, targets, w, aim);
  if (mode === 'counter') {
    const t = by('IV-TRANSPORT');
    t.position.z = t.exitZ;
    t.exited = true;
    t.alive = false;
    for (const [i, v] of targets.filter((u) => u.id.startsWith('IV-VIPER')).entries()) {
      v.position = new Vec3(t.position.x + (i ? 1200 : -1200), 2400, t.exitZ - 3500 - i * 700);
      v.previousPosition = v.position.clone();
    }
    m.update(s, targets, w, aim);
  }
  s.onGround = false;
  s.airborne = true;
  s.gear = false;
  s.flaps = false;
  s.flapPosition = 0;
  s.position =
    mode === 'escort'
      ? new Vec3(by('IV-TRANSPORT').position.x, 2400, -10000)
      : new Vec3(by('IV-TRANSPORT').position.x, 2500, 40000);
  s.previousPosition = s.position.clone();
  s.velocity = new Vec3(0, 0, 220);
  s.orientation = Quat.euler(0, 0.04, 0);
  s.speed = s.ias = 220;
  s.agl = s.position.y - terrainHeight(s.position.x, s.position.z);
  s.throttle = 0.7;
}
const stopEscort = args.includes('--stop-after-escort'),
  clearOptional = args.includes('--clear-flak');
if (clearOptional) by('IV-FLAK').alive = false;
const recorder = new FlightRecorder();
recorder.start(s, m, targets, w, aim);
recorder.metadata.playtest = {
  mode,
  seed,
  method:
    'scripted diagnostic pilot; no invulnerability; checkpoints explicitly skip previous objectives',
  checkpoint: mode !== 'strike',
  clearOptionalFlak: clearOptional,
};
const shots = [],
  phases = [],
  states = [],
  pilot = { flight: s, cruiseSpeed: 220 },
  launchAt = new Map();
let sampleAt = 0,
  cmAt = 0,
  fireAt = 0,
  lastPhase = '',
  goalId = null,
  lastControls = {};
for (
  let step = 0;
  step < seconds / STEP &&
  !s.crashed &&
  !m.failed &&
  !m.complete &&
  !(stopEscort && m.ironVeil?.counterStarted);
  step++
) {
  const now = s.elapsed,
    air = targets.filter(
      (t) => t.team === 'enemy' && t.kind === 'air' && t.alive && !t.retreat && !t.pending,
    ),
    near = air.sort((a, b) => s.position.distance(a.position) - s.position.distance(b.position))[0];
  let target = null,
    goal = new Vec3(0, 1800, -6000);
  if (mode === 'strike')
    target =
      near && s.position.distance(near.position) < 16000
        ? near
        : ['IV-SAM1', 'IV-SAM2', 'IV-BRIDGE'].map(by).find((t) => t.alive);
  else if (mode === 'escort') {
    const t = by('IV-TRANSPORT');
    target = near;
    goal = new Vec3(t.position.x, 2400, t.position.z + 3000);
  } else target = air.find((t) => t.type === 'bomber') || near;
  if (target) goal = target.position.clone();
  if (goalId !== target?.id) {
    goalId = target?.id;
    recorder.event('test-pilot-target', { id: goalId });
  }
  if (m.aborted) {
    target = null;
    goal = new Vec3(0, 1800, -10000);
  }
  pilot.navigationGoal = { position: goal, kind: target?.kind || 'air' };
  let controls;
  if (s.onGround && !s.landing) {
    s.afterburner = true;
    controls = {
      throttle: 1,
      pitch: s.speed > 78 && attitude(s.orientation).pitch < 0.18 ? 0.12 : 0,
    };
  } else {
    if (s.agl > 100) {
      s.gear = false;
      s.flaps = false;
      s.afterburner = false;
    }
    controls = combatFlightInput(pilot);
  }
  stepAircraft(s, controls, STEP);
  lastControls = controls;
  recorder.time = s.elapsed;
  updateTargets(targets, STEP);
  if (now >= fireAt && !s.onGround && !s.dying) {
    fireAt = now + 0.1;
    const visible =
      target &&
      radarContacts(s, targets).find((c) => c.target === target && c.visible && c.selectable);
    if (visible && aim.id !== target.id) {
      aim.id = target.id;
      aim.progress = 0;
      aim.locked = false;
    }
    if (target) {
      w.selected =
        target.kind === 'air' ? (s.ammo.aam ? 'aam' : 'gun') : s.ammo.agm ? 'agm' : 'bomb';
      const status = firingStatus(s, targets, aim, w),
        previous = launchAt.get(target.id) ?? -1000,
        impact =
          target.kind === 'ground' && w.selected === 'bomb'
            ? s.position.distance(target.position)
            : Infinity;
      if (
        status.canFire &&
        (((w.selected === 'aam' || w.selected === 'agm') && now - previous > 18) ||
          (w.selected === 'gun' && s.position.distance(target.position) < 1100) ||
          (w.selected === 'bomb' && impact < 140))
      ) {
        w.fire(s, targets, aim);
        launchAt.set(target.id, now);
      }
    }
  }
  aim.update(s, targets, STEP);
  if (now >= cmAt) {
    const threat = w.projectiles
      .filter(
        (p) =>
          p.owner === 'enemy' &&
          !p.targetEntityId &&
          ['aam', 'agm'].includes(p.type) &&
          p.position.distance(s.position) < 4000,
      )
      .sort((a, b) => a.position.distance(s.position) - b.position.distance(s.position))[0];
    if (threat) {
      const kind = decoyKind(threat.profile),
        result = deployCountermeasures(s, kind);
      if (result.released)
        recorder.event('test-pilot-countermeasure', { kind, projectile: threat.id });
      cmAt = now + 1.5;
    }
  }
  w.update(s, targets, STEP);
  m.update(s, targets, w, aim);
  for (const event of w.drainEvents()) {
    recorder.event('combat', event);
    if (['missile-launch', 'bomb-release', 'ai-retreat'].includes(event.type))
      shots.push({ t: +s.elapsed.toFixed(2), ...event });
  }
  if (m.phaseId !== lastPhase) {
    phases.push({ t: +s.elapsed.toFixed(2), phase: m.phaseId, damage: s.damage, fuel: s.fuel });
    lastPhase = m.phaseId;
  }
  if (s.elapsed >= sampleAt) {
    sampleAt = s.elapsed + 0.1;
    recorder.capture(s, m, targets, w, aim, controls);
  }
  if (step % (120 * 60) === 0) {
    states.push({
      t: Math.round(s.elapsed),
      player: [s.position.x, s.position.y, s.position.z].map(Math.round),
      damage: s.damage,
      transport: {
        z: by('IV-TRANSPORT').position.z,
        damage: by('IV-TRANSPORT').damage || 0,
        alive: by('IV-TRANSPORT').alive,
      },
      base: by('BASE').health,
    });
  }
}
recorder.capture(s, m, targets, w, aim, lastControls, true);
recorder.finish({
  result: s.crashed
    ? 'test-crash'
    : m.failed
      ? 'test-failed'
      : stopEscort && m.ironVeil?.counterStarted
        ? 'test-stage-complete'
        : 'test-time-limit',
  reason: m.failureReason,
});
const summary = {
  mode,
  seed,
  aircraft: spec.id,
  stageComplete: !!m.ironVeil?.counterStarted,
  clearOptionalFlak: clearOptional,
  duration: +s.elapsed.toFixed(2),
  failed: m.failed,
  reason: m.failureReason,
  crashed: s.crashed,
  dying: s.dying,
  damage: s.damage,
  warning: s.warning,
  fuel: s.fuel,
  ammo: s.ammo,
  phases,
  states,
  shots: shots.map((e) => ({
    t: e.t,
    type: e.type,
    source: e.sourceId,
    target: e.targetId,
    range: e.distanceM,
    reason: e.reason,
  })),
  units: targets.map((t) => ({
    id: t.id,
    alive: t.alive,
    pending: t.pending,
    exited: t.exited,
    health: t.health,
    retired: t.retired,
    retreat: t.retreat?.reason,
    damage: t.damage || 0,
    position: [t.position.x, t.position.y, t.position.z].map(Math.round),
    ai: w.enemyCombat.units.get(t.id),
  })),
};
await mkdir(out, { recursive: true });
await writeFile(path.join(out, `${mode}-${seed}.json`), JSON.stringify(recorder.export()));
await writeFile(path.join(out, `${mode}-${seed}-summary.json`), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
