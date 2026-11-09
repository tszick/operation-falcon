import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cockpitHeight,
  cockpitHudFooterY,
  cockpitProjection,
  homography,
  matrix3d,
} from '../src/cockpitGeometry.js';
const project = (m, x, y) => {
  const w = m[3] * x + m[7] * y + m[15];
  return [(m[0] * x + m[4] * y + m[12]) / w, (m[1] * x + m[5] * y + m[13]) / w];
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test('projective panel transform preserves all four corners', () => {
  const q = [
      [12, 30],
      [380, 15],
      [390, 180],
      [0, 170],
    ],
    m = matrix3d(homography(400, 200, q));
  [
    [0, 0],
    [400, 0],
    [400, 200],
    [0, 200],
  ].forEach(([x, y], i) => {
    const v = project(m, x, y);
    close(v[0], q[i][0]);
    close(v[1], q[i][1]);
  });
});
test('vector cockpit leaves at least 74 percent of the view and clears the flight HUD', () => {
  for (const [w, h] of [
    [800, 600],
    [1024, 768],
    [1280, 720],
    [1920, 1080],
  ]) {
    assert.ok(cockpitHeight(w, h) <= h * 0.26);
    assert.ok(cockpitHudFooterY(w, h) + 23 <= h - cockpitHeight(w, h));
    const m = cockpitProjection(w, h);
    [
      [0, 0],
      [w, 0],
      [w, cockpitHeight(w, h)],
      [0, cockpitHeight(w, h)],
    ].forEach(([x, y]) => {
      const v = project(m, x, y);
      close(v[0], x);
      close(v[1], y);
    });
  }
});
test('head rotation moves the airframe opposite the look direction without hiding a crossing panel', () => {
  const w = 1280,
    h = 720,
    x = w / 2,
    y = 0;
  assert.ok(project(cockpitProjection(w, h, 0.3, 0), x, y)[0] < x);
  assert.ok(project(cockpitProjection(w, h, -0.3, 0), x, y)[0] > x);
  assert.ok(project(cockpitProjection(w, h, 0, 0.2), x, y)[1] > y);
  assert.ok(project(cockpitProjection(w, h, 0, -0.2), x, y)[1] < y);
  const crossing = cockpitProjection(w, h, 1.1, 0);
  const depths = [0, w].map((x) => crossing[3] * x + crossing[15]);
  assert.ok(depths.some((z) => z > 0) && depths.some((z) => z < 0));
  assert.ok(cockpitProjection(w, h, Math.PI, 0)[15] < 0);
  for (const yaw of [-1.7, -0.8, 0, 0.8, 1.7])
    for (const pitch of [-0.7, 0, 1.1]) {
      const matrix = cockpitProjection(w, h, yaw, pitch);
      assert.ok(matrix.every(Number.isFinite));
    }
});

test('cockpit view matches the world camera at combined yaw and pitch', async () => {
  const { Quat, Vec3, right, up, forward } = await import('../src/math.js');
  const w = 1280,
    h = 720,
    deck = cockpitHeight(w, h),
    focal = h * 0.8;
  const q = Quat.euler(0.32, -0.15, 0),
    m = cockpitProjection(w, h, 0.32, -0.15);
  for (const [x, y] of [
    [0, 0],
    [w, 0],
    [w, deck],
    [0, deck],
  ]) {
    const v = new Vec3(x - w / 2, h * 0.53 - (h - deck + y), focal),
      z = v.dot(forward(q));
    const actual = project(m, x, y);
    close(actual[0], w / 2 + (focal * v.dot(right(q))) / z);
    close(actual[1], h * 0.53 - (focal * v.dot(up(q))) / z - (h - deck));
  }
});
