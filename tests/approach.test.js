import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft } from '../src/aircraftSpec.js';
import { createAircraft, stepAircraft, STEP } from '../src/physics.js';
import { Quat, Vec3, DEG } from '../src/math.js';
import { approachSpeeds, approachSpeedAction } from '../src/performance.js';
import { evaluateApproach } from '../src/landing.js';
const f16 = aircraft.find((a) => a.id === 'f16');
function approach() {
  const s = createAircraft(f16);
  s.position = new Vec3(0, 107, -3600);
  s.velocity = new Vec3(0, -3.8, 110);
  s.orientation = Quat.euler(0, 5 * DEG, 0);
  s.airborne = true;
  s.onGround = false;
  s.ias = 110;
  s.speed = 110;
  return s;
}
test('all approach targets leave a lift margin above stall at current fuel and weapon mass', () => {
  for (const spec of aircraft) {
    const s = createAircraft(spec),
      v = approachSpeeds(s);
    assert.ok(v.target >= 1.23 * v.stall - 1e-9, spec.name);
    assert.ok(v.target >= spec.approachSpeed * 3.6);
    const heavy = v.target;
    s.fuel *= 0.2;
    s.ammo.bomb = 0;
    s.ammo.agm = 0;
    s.ammo.aam = 0;
    assert.ok(approachSpeeds(s).target <= heavy);
  }
});
test('loaded interceptor no longer gets the same fixed speed as a light fighter', () => {
  const interceptor = createAircraft(aircraft.find((a) => a.id === 'mig31')),
    light = createAircraft(aircraft.find((a) => a.id === 'gripen'));
  assert.ok(approachSpeeds(interceptor).target > 300);
  assert.ok(approachSpeeds(interceptor).target > approachSpeeds(light).target);
});
test('high speed warning recommends throttle, then airbrake, then a shallower descent', () => {
  const s = approach();
  s.throttle = 0.5;
  assert.match(evaluateApproach(s).warning, /F: GÁZ/);
  s.throttle = 0;
  assert.match(evaluateApproach(s).warning, /B: NYISD/);
  assert.equal(approachSpeedAction(s).key, 'B');
  s.airbrake = true;
  assert.match(evaluateApproach(s).warning, /ENYHÉBB SÜLLYEDÉS/);
  assert.equal(approachSpeedAction(s).key, 'S');
});
test('at the target speed the guide asks to retract the airbrake rather than keep slowing', () => {
  const s = approach();
  s.ias = approachSpeeds(s).target / 3.6;
  s.airbrake = true;
  assert.match(evaluateApproach(s).warning, /LÉGFÉK BE/);
  assert.equal(approachSpeedAction(s).key, 'B');
  s.airbrake = false;
  assert.equal(approachSpeedAction(s).done, true);
});
test('F reaches idle, but it does not clamp or freeze the airspeed', () => {
  const s = approach();
  s.position.y = 3000;
  s.throttle = 1;
  for (let i = 0; i < 4 / STEP; i++) stepAircraft(s, { throttle: -1 });
  assert.equal(s.throttle, 0);
  const speed = s.speed;
  for (let i = 0; i < 120; i++) stepAircraft(s, { throttle: -1 });
  assert.equal(s.throttle, 0);
  assert.notEqual(s.speed, speed);
});
test('airbrake creates actual deceleration beyond idle throttle at the same attitude', () => {
  const clean = approach(),
    braked = approach();
  clean.position.y = braked.position.y = 2000;
  clean.throttle = braked.throttle = 0;
  braked.airbrake = true;
  for (let i = 0; i < 120; i++) {
    stepAircraft(clean, {});
    stepAircraft(braked, {});
  }
  assert.ok(braked.speed < clean.speed - 1);
});
