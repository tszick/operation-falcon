import { armament } from '../src/armament.js';
import { weaponProfile, weaponProfiles } from '../src/weaponDynamics.js';
import { mass, massBreakdown } from '../src/performance.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft } from '../src/aircraftSpec.js';
import { createAircraft, stepAircraft } from '../src/physics.js';
import { Vec3, Quat, DEG, attitude } from '../src/math.js';
import { createDamage } from '../src/damage.js';
import { calmWeather } from '../src/flightEnvironment.js';
import { departureMotion } from '../src/maneuverDynamics.js';
import { atmosphere } from '../src/atmosphere.js';
function flight(bank = 0) {
  const s = createAircraft(aircraft.find((a) => a.id === 'f16'));
  Object.assign(s, {
    position: new Vec3(0, 3000, 0),
    velocity: new Vec3(0, 0, 220),
    orientation: Quat.euler(0, 0.08, bank * DEG),
    onGround: false,
    airborne: true,
    gear: false,
    flaps: false,
    flapPosition: 0,
    throttle: 0.7,
    engineSpool: 0.7,
    condition: createDamage(42),
  });
  return s;
}
test('uniform wind translates a banked flight without changing air-relative turn dynamics', () => {
  for (const bank of [-80, -45, 45, 80])
    for (const wind of [new Vec3(12, 0, 20), new Vec3(-20, 0, -12)]) {
      const calm = flight(bank),
        windy = flight(bank);
      windy.weather = { ...calmWeather(), wind };
      windy.velocity.add(wind);
      for (let i = 0; i < 120; i++) {
        stepAircraft(calm, { pitch: 0.3 });
        stepAircraft(windy, { pitch: 0.3 });
      }
      for (const axis of ['x', 'y', 'z', 'w'])
        assert.ok(
          Math.abs(calm.orientation[axis] - windy.orientation[axis]) < 1e-9,
          `bank ${bank} quaternion ${axis}`,
        );
      assert.ok(calm.airVelocity.distance(windy.airVelocity) < 1e-6);
      assert.ok(windy.position.clone().sub(calm.position).distance(wind) < 1e-6);
      assert.ok(Math.abs(calm.g - windy.g) < 1e-8);
    }
});
test('braked stationary aircraft cannot steer on the spot solely because a headwind provides airspeed', () => {
  const s = createAircraft(aircraft.find((a) => a.id === 'f16'));
  s.condition = createDamage(42);
  s.weather = { ...calmWeather(), wind: new Vec3(0, 0, -15) };
  for (let i = 0; i < 120; i++) stepAircraft(s, { yaw: 1, brake: true });
  assert.ok(Math.abs(attitude(s.orientation).heading / DEG) < 0.01);
  assert.ok(s.speed < 0.01);
  assert.equal(s.crashed, false);
});
test('nosewheel steering authority follows ground speed for identical initial taxi motion', () => {
  const states = [];
  for (const wind of [-12, 0, 12]) {
    const s = createAircraft(aircraft.find((a) => a.id === 'f16'));
    s.velocity = new Vec3(0, 0, 10);
    s.weather = { ...calmWeather(), wind: new Vec3(0, 0, wind) };
    stepAircraft(s, { yaw: 1 });
    states.push(attitude(s.orientation).heading);
  }
  assert.ok(Math.max(...states) - Math.min(...states) < 1e-12);
});
test('spin recovery unloads positive and negative angles of attack with opposite pitch inputs', () => {
  for (const alpha of [0.5, -0.5]) {
    const rates = [];
    for (const pitch of [-0.6, 0.6]) {
      const s = flight();
      s.spin = { rate: 0.6, severity: 1, active: true };
      for (let i = 0; i < 120; i++)
        departureMotion(s, { pitch, yaw: -0.5 }, { alpha, beta: 0, stalled: true }, 1 / 120);
      rates.push(Math.abs(s.spin.rate));
    }
    const correct = alpha > 0 ? rates[0] : rates[1],
      wrong = alpha > 0 ? rates[1] : rates[0];
    assert.ok(correct < 0.04);
    assert.ok(wrong > correct * 3);
  }
});
test('touchdown logs distinguish wind-relative IAS from ground speed in headwind and tailwind', () => {
  for (const wind of [-20, 20]) {
    const s = flight();
    Object.assign(s, {
      position: new Vec3(0, 2.01, -1000),
      velocity: new Vec3(0, -2, 100),
      orientation: Quat.euler(0, 3 * DEG, 0),
      gear: true,
      flaps: true,
      flapPosition: 1,
      throttle: 0,
      engineSpool: 0,
      landingMode: 'on',
      weather: { ...calmWeather(), wind: new Vec3(0, 0, wind) },
    });
    stepAircraft(s, {});
    const contact = s.lastTouchdown;
    assert.ok(contact);
    const v = contact.velocity,
      w = contact.windMps,
      expected =
        Math.hypot(v.x - w.x, v.y - w.y, v.z - w.z) *
        Math.sqrt(atmosphere(contact.position.y).density / 1.225) *
        3.6;
    assert.ok(Math.abs(contact.iasKmh - expected) < 1e-8);
    assert.ok(Math.abs(contact.iasKmh - contact.speedKmh) > 50);
  }
});

test('fast mass calculation equals the detailed readout as fuel, gun rounds and stores change', () => {
  for (const spec of aircraft) {
    const s = createAircraft(spec);
    for (const fraction of [1, 0.5, 0]) {
      s.fuel = spec.fuelCapacity * fraction;
      for (const key of Object.keys(s.ammo)) s.ammo[key] = Math.floor(s.ammo[key] * fraction);
      assert.equal(mass(s), massBreakdown(s).totalKg, spec.id);
    }
  }
});
test('cached weapon profiles track in-place changes, replacement equipment and removed weapons', () => {
  const base = aircraft.find((s) => s.id === 'f16'),
    preset = armament(base),
    mount = { ...preset.weapons.aam };
  const spec = {
    ...base,
    configuredArmament: { ...preset, weapons: { ...preset.weapons, aam: mount } },
  };
  mount.name = 'AIM-9M Sidewinder';
  assert.equal(weaponProfile(spec, 'aam'), weaponProfiles.aim9m);
  mount.name = 'AIM-120 AMRAAM';
  assert.equal(weaponProfile(spec, 'aam'), weaponProfiles.aim120);
  spec.configuredArmament.weapons.aam = { name: 'AIM-9L Sidewinder', quantity: 2 };
  assert.equal(weaponProfile(spec, 'aam'), weaponProfiles.aim9l);
  delete spec.configuredArmament.weapons.aam;
  assert.equal(weaponProfile(spec, 'aam'), null);
});
test('negative-angle spin feedback points to the matching unloading control', () => {
  const s = flight();
  s.orientation = Quat.euler(0, -0.6, 0);
  s.assist = false;
  s.spin = { rate: 0.6, severity: 1, active: true };
  stepAircraft(s, {});
  assert.ok(s.spin.active);
  assert.ok(s.alpha < 0);
  assert.match(s.warning, /S: TEHERMENTESÍTS/);
});
