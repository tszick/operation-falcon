import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft } from '../src/aircraftSpec.js';
import { createAircraft, stepAircraft } from '../src/physics.js';
import { Vec3, Quat, attitude } from '../src/math.js';
import { windAt, calmWeather, windHudReadout } from '../src/flightEnvironment.js';
import {
  stepEngine,
  stepBodyRates,
  groundEffectFactor,
  waveDragCoefficient,
  thrustFactor,
} from '../src/flightModel.js';
import { atmosphere } from '../src/performance.js';
function flight(id = 'f16') {
  const s = createAircraft(aircraft.find((a) => a.id === id));
  Object.assign(s, {
    position: new Vec3(0, 3000, 0),
    velocity: new Vec3(0, 0, 180),
    orientation: Quat.euler(0, 0.05, 0),
    onGround: false,
    airborne: true,
    gear: false,
    flaps: false,
    flapPosition: 0,
    throttle: 0.7,
    engineSpool: 0.7,
  });
  return s;
}
test('constant wind changes ground track while identical air-relative motion yields identical aerodynamic forces', () => {
  const a = flight(),
    b = flight(),
    wind = new Vec3(12, 0, -8);
  b.weather = { ...calmWeather(), wind };
  b.velocity.add(wind);
  stepAircraft(a, {});
  stepAircraft(b, {});
  for (const force of ['liftN', 'dragN', 'dynamicPressurePa'])
    assert.ok(Math.abs(a.forces[force] - b.forces[force]) < 1e-8, force);
  assert.ok(Math.abs(a.ias - b.ias) < 1e-10);
  assert.ok(Math.abs(b.position.x - a.position.x - 12 / 120) < 1e-10);
  assert.ok(b.velocity.clone().sub(b.wind).distance(b.airVelocity) < 1e-10);
});
test('headwind increases actual lift at equal ground speed; tailwind reduces it', () => {
  const lift = [];
  for (const z of [-12, 0, 12]) {
    const s = flight();
    s.weather = { ...calmWeather(), wind: { x: 0, y: 0, z } };
    stepAircraft(s, {});
    lift.push(s.forces.liftN);
  }
  assert.ok(lift[0] > lift[1] && lift[1] > lift[2]);
});
test('gust field is reproducible, continuous, and changes with seed and position', () => {
  const w = { wind: { x: 3, z: -1 }, gust: 2, turbulence: 0.4, seed: 77 };
  const p = new Vec3(0, 1000, 0);
  assert.deepEqual(windAt(w, p, 12), windAt(w, p, 12));
  assert.ok(windAt(w, p, 12).distance(windAt(w, p, 12.001)) < 0.01);
  assert.ok(windAt(w, p, 12).distance(windAt({ ...w, seed: 88 }, p, 12)) > 0.01);
});
test('hot engine responds faster than idle engine; response is timestep independent and fuel starvation cuts thrust', () => {
  const cold = flight(),
    hot = flight();
  cold.engineSpool = 0;
  hot.engineSpool = 0.7;
  cold.throttle = hot.throttle = 1;
  for (let i = 0; i < 120; i++) {
    stepEngine(cold, 1 / 120);
    stepEngine(hot, 1 / 120);
  }
  assert.ok(hot.engineSpool > cold.engineSpool + 0.1);
  assert.ok(cold.engineSpool < 0.9);
  const a = flight(),
    b = flight();
  a.engineSpool = b.engineSpool = 0;
  a.throttle = b.throttle = 1;
  for (let i = 0; i < 240; i++) stepEngine(a, 1 / 120);
  for (let i = 0; i < 120; i++) stepEngine(b, 1 / 60);
  assert.ok(Math.abs(a.engineSpool - b.engineSpool) < 0.003);
  a.fuel = 0;
  assert.equal(stepEngine(a, 1 / 120, true), 0);
});

test('released controls decay smoothly; a heavy bomber retains rotation longer than a fighter', () => {
  const fighter = flight(),
    bomber = flight('b52');
  fighter.bodyRates = { pitch: 0, roll: 1, yaw: 0 };
  bomber.bodyRates = { pitch: 0, roll: 1, yaw: 0 };
  for (let i = 0; i < 12; i++) {
    stepBodyRates(fighter, { pitch: 0, roll: 0, yaw: 0 }, 1 / 120);
    stepBodyRates(bomber, { pitch: 0, roll: 0, yaw: 0 }, 1 / 120);
  }
  assert.ok(fighter.bodyRates.roll > 0);
  assert.ok(bomber.bodyRates.roll > fighter.bodyRates.roll * 1.5);
  for (let i = 0; i < 240; i++) stepBodyRates(bomber, { pitch: 0, roll: 0, yaw: 0 }, 1 / 120);
  assert.ok(bomber.bodyRates.roll < 0.001);
  const a = flight(),
    b = flight();
  for (let i = 0; i < 120; i++) stepBodyRates(a, { pitch: 0.2, roll: 1, yaw: 0.1 }, 1 / 120);
  for (let i = 0; i < 60; i++) stepBodyRates(b, { pitch: 0.2, roll: 1, yaw: 0.1 }, 1 / 60);
  assert.ok(Math.abs(a.bodyRates.roll - b.bodyRates.roll) < 1e-12);
});

test('ground effect reduces induced drag near the surface without adding energy or phantom lift', () => {
  const near = flight(),
    far = flight();
  for (const [s, height] of [
    [near, 3],
    [far, 100],
  ]) {
    s.position = new Vec3(0, height, 0);
    s.velocity = new Vec3(0, 0, 100 / Math.sqrt(atmosphere(height).density / 1.225));
    s.orientation = Quat.euler(0, 0.1, 0);
    stepAircraft(s, {});
  }
  assert.ok(near.forces.dragN < far.forces.dragN * 0.95);
  assert.ok(Math.abs(near.forces.liftN - far.forces.liftN) < 0.001);
  assert.ok(near.forces.groundEffectFactor >= 0.25 && near.forces.groundEffectFactor < 1);
  assert.ok(groundEffectFactor(near.spec, 100) > 0.999);
  assert.equal(groundEffectFactor(near.spec, 1, Math.PI / 2), 1);
});

test('wave drag grows continuously through transonic speeds and stays finite beyond Mach one', () => {
  const s = flight();
  assert.equal(waveDragCoefficient(s.spec, 0.6), 0);
  assert.ok(waveDragCoefficient(s.spec, 1.05) > waveDragCoefficient(s.spec, 0.85));
  assert.ok(waveDragCoefficient(s.spec, 1.05) > waveDragCoefficient(s.spec, 2));
  assert.ok(
    Math.abs(waveDragCoefficient(s.spec, 0.99999) - waveDragCoefficient(s.spec, 1.00001)) < 0.00001,
  );
  for (const m of [0, 0.8, 1, 1.2, 2, 3, 5])
    assert.ok(Number.isFinite(waveDragCoefficient(s.spec, m)));
  const a = atmosphere(10000);
  assert.ok(thrustFactor(s.spec, a, 0.8) < thrustFactor(s.spec, atmosphere(0), 0.8));
});

test('layered atmosphere matches reference density and is continuous at its layer boundaries', () => {
  for (const [height, density] of [
    [0, 1.225],
    [11000, 0.3639],
    [20000, 0.08803],
    [32000, 0.01323],
  ])
    assert.ok(Math.abs(atmosphere(height).density - density) < 0.0001);
  for (const h of [11000, 20000, 32000, 47000])
    assert.ok(Math.abs(atmosphere(h - 0.01).density - atmosphere(h + 0.01).density) < 0.00001);
});

test('headwind shortens the physical takeoff roll; tailwind lengthens it at the same rotation IAS', () => {
  const distances = [];
  for (const z of [-8, 0, 8]) {
    const s = createAircraft(aircraft.find((a) => a.id === 'f16'));
    s.fuel *= 0.5;
    s.throttle = 1;
    s.afterburner = true;
    s.weather = { ...calmWeather(), wind: { x: 0, y: 0, z } };
    for (let i = 0; i < 120 * 70 && !s.airborne && !s.crashed; i++)
      stepAircraft(s, { pitch: s.ias > 65 && attitude(s.orientation).pitch < 0.13 ? 0.7 : 0 });
    assert.equal(s.crashed, false);
    assert.equal(s.airborne, true);
    distances.push(s.position.z + 1320);
  }
  assert.ok(distances[0] < distances[1] && distances[1] < distances[2], JSON.stringify(distances));
});

test('HUD wind uses meteorological from-direction, km/h and the configured gust amplitude', () => {
  const s = flight();
  s.wind = new Vec3(0, 0, -10);
  s.weather.gust = 1;
  assert.equal(windHudReadout(s).text, 'SZÉL 0° 36 KM/H · ±4');
  s.wind = new Vec3(5, 0, 0);
  assert.ok(windHudReadout(s).text.startsWith('SZÉL 270° 18 KM/H'));
  s.wind = new Vec3();
  assert.equal(windHudReadout(s).text, 'SZÉLCSEND');
});
