import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft } from '../src/aircraftSpec.js';
import { missions } from './fixtures/scenarios.js';
import { createAircraft, stepAircraft, STEP } from '../src/physics.js';
import {
  createDamage,
  applyDamage,
  damageResponse,
  damageStage,
  toggleActuator,
  actuatorFault,
  damageMotion,
  advanceCrashSequence,
} from '../src/damage.js';
import { Vec3, Quat } from '../src/math.js';
import { approachSpeeds } from '../src/performance.js';
import { Weapons } from '../src/weapons.js';
import { Targeting, createTargets, applyTargetHit, updateTargets } from '../src/targeting.js';
import { Mission } from '../src/mission.js';
const flight = (id = 'f16', seed = 1) => {
  const s = createAircraft(aircraft.find((a) => a.id === id));
  s.condition = createDamage(seed);
  s.position = new Vec3(0, 2000, 0);
  s.velocity = new Vec3(0, 0, 150);
  s.orientation = new Quat();
  s.onGround = false;
  s.airborne = true;
  s.gear = false;
  s.flaps = false;
  s.throttle = 0.8;
  return s;
};
test('damage has increasing stages, lost lift and thrust, extra drag and weaker controls', () => {
  const s = flight(),
    healthy = damageResponse(s),
    stages = [];
  for (const target of [20, 45, 70, 90]) {
    applyDamage(s, target - s.damage);
    stages.push(damageStage(s).id);
    const r = damageResponse(s);
    assert.ok(
      r.lift < healthy.lift &&
        r.engine < healthy.engine &&
        r.pitchControl < healthy.pitchControl &&
        r.drag > healthy.drag,
    );
    assert.equal(s.crashed, false);
    assert.equal(s.dying, false);
  }
  assert.deepEqual(stages, ['light', 'moderate', 'severe', 'critical']);
});
test('left and right wing wounds generate opposite rolling torque, with no fresh frame randomness', () => {
  const left = flight('f16', 1),
    right = flight('f16', 2);
  applyDamage(left, 55);
  applyDamage(right, 55);
  let a, b;
  for (let i = 0; i < 120; i++) {
    left.elapsed += STEP;
    right.elapsed += STEP;
    a = damageMotion(left, 12000, 12000, 0.5, 50000, STEP);
    b = damageMotion(right, 12000, 12000, 0.5, 50000, STEP);
  }
  assert.ok(a.roll < -0.01);
  assert.ok(b.roll > 0.01);
  const clone = flight('f16', 1);
  applyDamage(clone, 55);
  for (let i = 0; i < 120; i++) {
    clone.elapsed += STEP;
    damageMotion(clone, 12000, 12000, 0.5, 50000, STEP);
  }
  assert.deepEqual(clone.condition.rates, left.condition.rates);
});
test('hydraulic faults freeze the selected actuator in its current position and do not toggle randomly', () => {
  const s = flight('f16', 1);
  applyDamage(s, 65);
  const jammed = s.condition.actuator,
    before = s[jammed];
  assert.ok(actuatorFault(s, jammed));
  for (let i = 0; i < 30; i++) {
    assert.match(toggleActuator(s, jammed), /HIDRAULIKA/);
    assert.equal(s[jammed], before);
  }
  const other = ['gear', 'flaps', 'airbrake'].find((key) => key !== jammed);
  assert.equal(toggleActuator(s, other), '');
});
test('weapon failure rejects missile release without consuming ammunition or making a launch event', () => {
  const s = flight();
  applyDamage(s, 80);
  const w = new Weapons(),
    before = s.ammo.aam;
  assert.match(w.fire(s, [], new Targeting()), /FEGYVERRENDSZER HIBA/);
  assert.equal(s.ammo.aam, before);
  assert.equal(w.projectiles.length, 0);
  assert.equal(w.drainEvents().length, 0);
});
test('damaged wings increase stall reference speed rather than imposing an arbitrary altitude/speed clamp', () => {
  const s = flight(),
    healthy = approachSpeeds(s).stall;
  applyDamage(s, 60);
  assert.ok(approachSpeeds(s).stall > healthy * 1.15);
  const before = s.position.clone();
  stepAircraft(s, {});
  assert.ok(s.position.distance(before) < 10);
  assert.ok(s.velocity.length() > 100);
});
test('a failed engine produces asymmetric yaw only for a twin-engine aircraft', () => {
  const twin = flight('f15'),
    single = flight('f16');
  applyDamage(twin, 55, { part: 'engineLeft' });
  applyDamage(single, 55, { part: 'engineLeft' });
  for (let i = 0; i < 120; i++) {
    damageMotion(twin, 0, 18000, 0, 150000, STEP);
    damageMotion(single, 0, 12000, 0, 100000, STEP);
  }
  assert.ok(twin.condition.rates.yaw < -0.001);
  assert.equal(single.condition.rates.yaw, 0);
});
test('fatal damage does not end the flight in midair; all 25 aircraft fall to actual terrain contact', () => {
  for (const spec of aircraft) {
    const s = flight(spec.id);
    applyDamage(s, 100);
    assert.equal(s.dying, true);
    assert.equal(s.crashed, false);
    assert.equal(damageResponse(s).control, 0);
    let steps = 0;
    for (; steps < 120 * 180 && !s.crashed; steps++)
      stepAircraft(s, { throttle: 1, pitch: 1, roll: 1 });
    assert.ok(steps > 120, spec.id);
    assert.equal(s.crashed, true, spec.id);
    assert.equal(s.impactPending, true);
    assert.ok(Number.isFinite(s.position.x + s.position.y + s.position.z));
    assert.equal(s.velocity.length(), 0);
  }
});
test('fatal controls are ignored and explosion is emitted only on impact, exactly once', () => {
  const a = flight(),
    b = flight();
  applyDamage(a, 100);
  applyDamage(b, 100);
  for (let i = 0; i < 120; i++) {
    stepAircraft(a, { pitch: 1, roll: 1, throttle: 1 });
    stepAircraft(b, {});
  }
  assert.deepEqual(a.position, b.position);
  assert.deepEqual(a.orientation, b.orientation);
  const w = new Weapons();
  w.update(a, [], STEP);
  assert.equal(w.effects.length, 0);
  for (let i = 0; i < 120 * 180 && !a.crashed; i++) stepAircraft(a, {});
  w.update(a, [], STEP);
  assert.equal(w.drainEvents().filter((e) => e.type === 'explosion').length, 1);
  w.update(a, [], STEP);
  assert.equal(w.drainEvents().length, 0);
});
test('a fatal ground failure reaches impact instead of remaining stuck in a dying state', () => {
  const s = createAircraft(aircraft[0]);
  applyDamage(s, 100);
  stepAircraft(s, {});
  assert.equal(s.crashed, true);
  assert.equal(s.impactPending, true);
});
test('air targets survive a single gun hit, deteriorate over several hits, then visibly fall and explode on terrain', () => {
  const targets = createTargets(missions[1], aircraft[0]),
    t = targets[0],
    w = new Weapons(),
    s = flight();
  assert.equal(applyTargetHit(t, 'gun'), false);
  assert.equal(t.alive, true);
  assert.equal(t.flight.damage, 18);
  for (let i = 0; i < 5; i++) applyTargetHit(t, 'gun');
  assert.equal(t.alive, false);
  assert.equal(t.falling, true);
  for (let i = 0; i < 120 * 180 && !t.impactReady; i++) updateTargets(targets, STEP);
  assert.equal(t.flight.crashed, true);
  assert.equal(t.impactReady, true);
  w.update(s, targets, STEP);
  assert.equal(w.drainEvents().filter((e) => e.type === 'explosion' && e.ground).length, 1);
  w.update(s, targets, STEP);
  assert.equal(w.drainEvents().length, 0);
});
test('mission offers an emergency phase but does not report failure before fatal aircraft reaches terrain', () => {
  const s = flight(),
    m = new Mission(missions[1]),
    w = new Weapons(),
    targets = createTargets(missions[1]);
  applyDamage(s, 50);
  m.update(s, targets, w);
  assert.equal(m.phaseId, 'emergency');
  applyDamage(s, 50);
  m.update(s, targets, w);
  assert.equal(m.phaseId, 'dying');
  assert.equal(m.complete, false);
  for (let i = 0; i < 120 * 180 && !s.crashed; i++) stepAircraft(s, {});
  m.update(s, targets, w);
  assert.equal(m.phaseId, 'failed');
});

test('crash report waits for the impact animation, never a timer that expires in midair', () => {
  const s = flight();
  applyDamage(s, 100);
  assert.equal(advanceCrashSequence(s, 999), false);
  assert.equal(s.crashElapsed, 0);
  for (let i = 0; i < 120 * 180 && !s.crashed; i++) stepAircraft(s, {});
  assert.equal(advanceCrashSequence(s, 4.9), false);
  assert.equal(advanceCrashSequence(s, 0.2), true);
});
