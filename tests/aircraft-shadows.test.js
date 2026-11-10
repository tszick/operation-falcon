import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AircraftShadows,
  aircraftShadowOpacity,
  shadowReceiverHeight,
} from '../src/rendering/aircraftShadows.js';
import { Vec3, Quat } from '../src/math.js';
import { configureTerrain } from '../src/terrain.js';
const mesh = { points: [new Vec3(-8, 0, -10), new Vec3(8, 0, 10)] };
const entry = (height) => ({ mesh, position: new Vec3(0, height, 80), q: new Quat(), scale: 1 });
const renderer = { surfaceMode: 'grass', camera: new Vec3(0, 20, 0), local: (v) => v };
test('daylight aircraft shadows keep full strength through 100 m and fade continuously to zero at 200 m', () => {
  const full = aircraftShadowOpacity(0, 'grass');
  for (const h of [1, 25, 50, 100]) assert.equal(aircraftShadowOpacity(h, 'grass'), full);
  assert.equal(aircraftShadowOpacity(150, 'grass'), full / 2);
  assert.ok(aircraftShadowOpacity(199, 'grass') > 0);
  for (const h of [200, 201, 800, Infinity, NaN])
    assert.equal(aircraftShadowOpacity(h, 'grass'), 0);
  assert.equal(aircraftShadowOpacity(20, 'night'), 0);
  assert.equal(aircraftShadowOpacity(20, 'vector'), 0);
  assert.ok(aircraftShadowOpacity(20, 'winter') < full);
});
test('shadow geometry lies on the receiver and follows the sun direction, with transparent feathered edges', () => {
  const shadows = new AircraftShadows(),
    data = shadows.build(renderer, [entry(50)], [], () => 0);
  assert.ok(data.length > 0);
  let minAlpha = 1,
    maxAlpha = 0,
    meanX = 0;
  for (let i = 0; i < data.length; i += 4) {
    assert.ok(Math.abs(data[i + 1] + 19.6) < 1e-5);
    meanX += data[i];
    minAlpha = Math.min(minAlpha, data[i + 3]);
    maxAlpha = Math.max(maxAlpha, data[i + 3]);
  }
  assert.ok(meanX / (data.length / 4) > 15);
  assert.equal(minAlpha, 0);
  assert.ok(Math.abs(maxAlpha - 0.42) < 1e-6);
  const storage = shadows.storage;
  assert.equal(shadows.build(renderer, [entry(201)], [], () => 0).length, 0);
  assert.equal(shadows.storage, storage);
  assert.equal(
    shadows.build({ ...renderer, surfaceMode: 'night' }, [entry(50)], [], () => 0).length,
    0,
  );
});
test('shadows adapt to a slope and disappear when no receiving surface exists', () => {
  const shadow = new AircraftShadows(),
    data = shadow.build(renderer, [entry(50)], [], (x) => x * 0.1);
  for (let i = 0; i < data.length; i += 4)
    assert.ok(Math.abs(data[i + 1] + 20 - (data[i] * 0.1 + 0.4)) < 1e-4);
  assert.equal(shadow.build(renderer, [entry(30)], [], () => null).length, 0);
});
test('an ocean carrier deck receives a shadow while open water does not', () => {
  configureTerrain({ id: 'carrier-defense' }, new Vec3(), () => 0.3);
  const ship = { position: new Vec3(0, 0, 0), heading: Math.PI / 2 };
  assert.equal(shadowReceiverHeight(0, 0, [ship]), 20);
  assert.equal(shadowReceiverHeight(5000, 5000, []), null);
});
