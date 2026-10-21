import test from 'node:test';
import assert from 'node:assert/strict';
import { panoramaCoordinates, horizonBottom, horizonTop, horizonRange } from '../src/horizon.js';
import { Vec3 } from '../src/math.js';
const direction = (bearing, elevation) =>
  new Vec3(
    Math.sin(bearing) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(bearing) * Math.cos(elevation),
  );
test('the mountain panorama wraps continuously at both the north seam and antipode', () => {
  for (const centre of [0, Math.PI, -Math.PI, Math.PI * 2]) {
    const left = panoramaCoordinates(direction(centre - 1e-7, 0.04), 6000),
      right = panoramaCoordinates(direction(centre + 1e-7, 0.04), 6000);
    assert.ok(Math.abs(left.u - right.u) < 1e-6);
    assert.ok(Math.abs(left.v - right.v) < 1e-9);
  }
  for (let heading = -Math.PI * 2; heading < Math.PI * 2; heading += 0.13) {
    const a = panoramaCoordinates(direction(heading, 0)),
      b = panoramaCoordinates(direction(heading + Math.PI * 2, 0));
    assert.ok(a.u >= 0 && a.u <= 1);
    assert.ok(Math.abs(a.u - b.u) < 1e-12);
  }
});
test('altitude lowers the distant mountain skyline without changing its world bearing', () => {
  const v = 0.6,
    bearing = 0.8,
    base = v * (horizonTop - horizonBottom) + horizonBottom;
  for (const altitude of [0, 1000, 6000, 12000, 20000]) {
    const elevation = base - Math.atan2(altitude, horizonRange),
      p = panoramaCoordinates(direction(bearing, elevation), altitude);
    assert.ok(Math.abs(p.v - v) < 1e-12);
    assert.ok(Math.abs(p.u - panoramaCoordinates(direction(bearing, base), 0).u) < 1e-12);
  }
  const overhead = panoramaCoordinates(new Vec3(0, 1, 0), 6000);
  assert.ok(overhead.v > 1, 'the panorama must not cover the zenith');
  assert.ok(Number.isFinite(overhead.u));
});
