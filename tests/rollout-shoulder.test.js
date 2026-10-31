import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { createAircraft, stepAircraft } from '../src/physics.js';
import { createDamage } from '../src/damage.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { Vec3, Quat } from '../src/math.js';
import { configureTerrain, runway, homeHangars } from '../src/terrain.js';
import { rolloutSurface, rolloutLateralTolerance, assessTouchdown } from '../src/landing.js';
const spec = aircraft.find((a) => a.id === 'f16'),
  dt = 1 / 120;
function rolling(x = 52, z = 0, speed = 65) {
  configureTerrain({ id: 'landing' }, undefined, () => 0.99);
  const s = createAircraft(spec);
  Object.assign(s, {
    position: new Vec3(x, 2, z),
    previousPosition: new Vec3(x, 2, z),
    velocity: new Vec3(0, 0, speed),
    orientation: new Quat(),
    airborne: true,
    onGround: true,
    landing: { success: true, descent: 1, offset: 0 },
    speed,
    ias: speed,
    throttle: 0,
  });
  s.condition = createDamage(1);
  return s;
}
test('both runway shoulders survive braking after touchdown and can finish landing practice', () => {
  for (const side of [-1, 1]) {
    const s = rolling(side * 52);
    assert.equal(rolloutSurface(s).shoulder, true);
    let warned = false;
    for (let i = 0; i < 120 * 30 && !s.crashed && s.speed >= 0.3; i++) {
      stepAircraft(s, { brake: true }, dt);
      warned ||= s.warning.includes('PÁLYASZÉL');
    }
    assert.equal(s.crashed, false);
    assert.ok(s.speed < 5);
    assert.equal(s.landing.success, true);
    assert.equal(s.damage, 0);
    assert.equal(warned, true);
    const m = new Mission(missions.find((m) => m.id === 'landing'));
    m.update(s, [], new Weapons());
    assert.equal(m.complete, true);
  }
});
test('a real runway touchdown can cross either painted edge while braking without instant destruction', () => {
  for (const sign of [-1, 1]) {
    const s = rolling(sign * 44.5);
    s.onGround = false;
    s.landing = null;
    s.position.y = 2.001;
    s.velocity = new Vec3(sign * 1.5, -1, 65);
    stepAircraft(s, {}, dt);
    assert.equal(s.landing.success, true);
    let crossed = false;
    for (let i = 0; i < 120 * 20 && !s.crashed && s.speed >= 0.3; i++) {
      stepAircraft(s, { brake: true }, dt);
      crossed ||= Math.abs(s.position.x) > runway.halfWidth;
    }
    assert.equal(crossed, true);
    assert.equal(s.crashed, false);
    assert.ok(s.speed < 5);
  }
});
test('shoulder tolerance is limited, includes runway ends, and does not excuse off-runway touchdown', () => {
  assert.equal(rolloutLateralTolerance, 120);
  for (const sign of [-1, 1]) {
    const s = rolling(sign * (runway.halfWidth + 25.1));
    stepAircraft(s, { brake: true }, dt);
    assert.equal(s.crashed, true);
  }
  const end = rolling(0, runway.halfLength + 1);
  stepAircraft(end, { brake: true }, dt);
  assert.equal(end.crashed, false);
  const off = rolling(52);
  off.onGround = false;
  off.landing = null;
  assert.equal(assessTouchdown(off, 1, 65).fatal, true);
  const takeoff = rolling(52);
  takeoff.airborne = false;
  takeoff.landing = null;
  stepAircraft(takeoff, {}, dt);
  assert.equal(takeoff.crashed, true);
});
test('a small shoulder excursion can return to the runway and remains safe briefly without held brake', () => {
  const s = rolling(-52);
  stepAircraft(s, {}, dt);
  assert.equal(s.crashed, false);
  s.position.x = -44;
  stepAircraft(s, { brake: true }, dt);
  assert.equal(s.crashed, false);
  assert.equal(rolloutSurface(s).shoulder, false);
  assert.ok(!s.warning.includes('PÁLYASZÉL'));
});
test('hangar boxes still cause physical ground collisions even at taxi speed; the open shoulder does not', () => {
  for (const h of homeHangars) {
    const s = rolling(h.x - h.halfWidth - 1, h.z, 4);
    stepAircraft(s, { brake: true }, dt);
    assert.equal(s.crashed, true);
    assert.match(s.landing.reasons.join(' '), /hangár/);
  }
  const clear = rolling(65, -900, 4);
  stepAircraft(clear, { brake: true }, dt);
  assert.equal(clear.crashed, false);
});

test('slow rollout has more room on both shoulders and both ends; high speed excursions remain fatal', () => {
  for (const sign of [-1, 1]) {
    for (const [x, z] of [
      [sign * 125, 0],
      [0, sign * (runway.halfLength + 200)],
    ]) {
      const slow = rolling(x, z, 10),
        fast = rolling(x, z, 80);
      assert.equal(rolloutSurface(slow).allowed, true);
      assert.equal(rolloutSurface(fast).allowed, false);
      stepAircraft(slow, { brake: true }, dt);
      stepAircraft(fast, { brake: true }, dt);
      assert.equal(slow.crashed, false);
      assert.equal(fast.crashed, true);
    }
    const beyond = rolling(0, sign * (runway.halfLength + 301), 1);
    stepAircraft(beyond, { brake: true }, dt);
    assert.equal(beyond.crashed, true, 'Even slow overrun tolerance is finite');
  }
});

test('overrun tolerance follows a translated and rotated remote runway', () => {
  const s = rolling(0, 0, 10);
  const rotation = Quat.euler(Math.PI / 2, 0, 0),
    position = new Vec3(12000, 0, 18000);
  s.airfield = {
    position,
    elevation: 0,
    heading: Math.PI / 2,
    halfWidth: 45,
    halfLength: 1600,
    home: false,
  };
  for (const sign of [-1, 1]) {
    s.position = rotation.rotate(new Vec3(0, 2, sign * 1800)).add(position);
    s.velocity = rotation.rotate(new Vec3(0, 0, sign * 10));
    assert.equal(rolloutSurface(s).shoulder, true);
    s.velocity.scale(8);
    assert.equal(rolloutSurface(s).allowed, false);
  }
});

test('takeoff overruns stop within 300 metres even at taxi speed and above descending terrain', () => {
  for (const sign of [-1, 1]) {
    for (const speed of [1, 20, 65]) {
      const s = rolling(0, sign * (runway.halfLength + 290), speed);
      s.velocity.z *= sign;
      s.airborne = false;
      s.landing = null;
      stepAircraft(s, { brake: true }, dt);
      assert.equal(s.crashed, false, 'short aborted takeoff overrun');
      s.position.z = sign * (runway.halfLength + 301);
      s.position.y = 10;
      stepAircraft(s, { brake: true }, dt);
      assert.equal(s.crashed, true, `unbounded takeoff roll at ${speed} m/s`);
    }
  }
});

test('slow takeoff taxi cannot escape sideways and overrun checks follow a remote runway', () => {
  const side = rolling(runway.halfWidth + 1, 0, 1);
  side.airborne = false;
  side.landing = null;
  stepAircraft(side, {}, dt);
  assert.equal(side.crashed, true);
  const s = rolling(0, 0, 10),
    position = new Vec3(12000, 0, 18000),
    rotation = Quat.euler(Math.PI / 2, 0, 0);
  s.airborne = false;
  s.landing = null;
  s.airfield = {
    position,
    elevation: 0,
    heading: Math.PI / 2,
    halfWidth: 45,
    halfLength: 1600,
    home: false,
  };
  s.position = rotation.rotate(new Vec3(0, 2, 1850)).add(position);
  s.velocity = rotation.rotate(new Vec3(0, 0, 10));
  assert.equal(rolloutSurface(s).allowed, true);
  s.position = rotation.rotate(new Vec3(0, 10, 1901)).add(position);
  stepAircraft(s, {}, dt);
  assert.equal(s.crashed, true);
});

test('a loaded B-52 actually rolling beyond either runway end crashes within the finite overrun', () => {
  for (const sign of [-1, 1]) {
    const s = rolling(0, sign * (runway.halfLength - 5), 30);
    s.spec = aircraft.find((a) => a.id === 'b52');
    s.ammo = createAircraft(s.spec).ammo;
    s.fuel = s.spec.fuelCapacity;
    s.airborne = false;
    s.landing = null;
    s.velocity.z *= sign;
    s.orientation = Quat.euler(sign === 1 ? 0 : Math.PI, 0, 0);
    for (let i = 0; i < 120 * 40 && !s.crashed; i++) stepAircraft(s, {}, dt);
    assert.equal(s.crashed, true);
    assert.ok(Math.abs(s.position.z) > runway.halfLength + 299);
    assert.ok(Math.abs(s.position.z) <= runway.halfLength + 301);
  }
});
