import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cockpitInteriorGeometry,
  clipCabinPolygon,
  projectCabinShape,
  cabinCameraPoint,
} from '../src/cockpitInteriorGeometry.js';
import { Quat, Vec3, right, up, forward } from '../src/math.js';
test('near-plane clipping preserves the visible part instead of dropping a whole panel', () => {
  const result = clipCabinPolygon(
    [
      [-1, -1, -1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, -1],
    ],
    0.1,
  );
  assert.equal(result.length, 4);
  assert.ok(result.every((p) => p[2] >= 0.1));
  assert.equal(
    clipCabinPolygon([
      [-1, 0, -1],
      [1, 0, -1],
      [0, 1, -1],
    ]).length,
    0,
  );
});
test('interior includes solid walls, floor and structure, with transparency restricted to HUD glass and two floor windows', () => {
  const geometry = cockpitInteriorGeometry();
  for (const part of [
    'floor',
    'sidewall',
    'side-console',
    'windshield-post',
    'canopy-rail',
    'hud-mount',
    'rudder-pedal',
    'control-stick',
  ]) {
    const shapes = geometry.filter((s) => s.part === part);
    assert.ok(shapes.length > 0, part);
    assert.ok(shapes.every((s) => s.fill !== 'none'));
  }
  assert.equal(geometry.filter((s) => s.part === 'floor-window-glass').length, 2);
  assert.ok(
    geometry
      .filter((s) => s.fill === 'none')
      .every((s) => ['hud-glass', 'floor-window-glass'].includes(s.part)),
  );
  assert.ok(geometry.every((s) => s.points.every((p) => p.every(Number.isFinite))));
});
test('look-down and side views keep finite visible occluding surfaces through the complete head range', () => {
  const geometry = cockpitInteriorGeometry();
  for (const yaw of [-1.745, -1.1, -0.5, 0, 0.5, 1.1, 1.745])
    for (const pitch of [-0.785, 0, 1.134]) {
      const projected = geometry
        .map((s) => projectCabinShape(s, 1280, 720, yaw, pitch))
        .filter(Boolean);
      assert.ok(projected.length > 0);
      assert.ok(projected.every((s) => s.points.every((p) => p.every(Number.isFinite))));
    }
  assert.ok(
    geometry
      .filter((s) => s.part === 'floor')
      .some((floor) => {
        const down = projectCabinShape(floor, 1280, 720, 0, -0.785);
        return down && down.points.some(([x, y]) => x >= 0 && x <= 1280 && y > 0 && y < 720);
      }),
  );
  for (const yaw of [-Math.PI / 2, Math.PI / 2])
    assert.ok(
      geometry
        .filter((s) => s.part === 'sidewall')
        .some((s) => {
          const p = projectCabinShape(s, 1280, 720, yaw, -0.3);
          return p && p.points.some(([x, y]) => x >= 0 && x <= 1280 && y >= 0 && y <= 720);
        }),
    );
});
test('interior uses exactly the same eye rotation as the world and instrument plane', () => {
  const q = Quat.euler(0.6, -0.4, 0),
    p = new Vec3(0.3, -0.5, 1.2),
    v = cabinCameraPoint([p.x, p.y, p.z], 0.6, -0.4);
  [p.dot(right(q)), p.dot(up(q)), p.dot(forward(q))].forEach((n, i) =>
    assert.ok(Math.abs(v[i] - n) < 1e-12),
  );
});

test('retained cabin geometry does no DOM work for an unchanged head view and reuses its paths', async () => {
  const { updateCockpitInterior } = await import('../src/rendering/cockpitInterior.js');
  let created = 0,
    writes = 0;
  const doc = {
    createElementNS() {
      created++;
      return {
        style: {},
        setAttribute() {
          writes++;
        },
      };
    },
  };
  const svg = {
    ownerDocument: doc,
    replaceChildren() {
      writes++;
    },
    setAttribute() {
      writes++;
    },
  };
  updateCockpitInterior(svg, 1280, 720, 0, 0);
  const count = created,
    firstWrites = writes;
  updateCockpitInterior(svg, 1280, 720, 0, 0);
  assert.equal(writes, firstWrites);
  assert.equal(created, count);
  updateCockpitInterior(svg, 1280, 720, 1.3, -0.4);
  assert.equal(created, count);
  assert.ok(writes > firstWrites);
});

test('a clipped open outline remains a single segment instead of gaining a near-plane closing line', async () => {
  const { clipCabinEdge } = await import('../src/cockpitInteriorGeometry.js');
  const clipped = clipCabinEdge([
    [-1, 0, -1],
    [1, 0, 1],
  ]);
  assert.equal(clipped.length, 2);
  assert.ok(clipped.every((p) => p[2] >= 0.04 - 1e-12));
  assert.deepEqual(
    clipCabinEdge([
      [0, 0, -2],
      [1, 0, -1],
    ]),
    [],
  );
  const shape = {
    open: true,
    points: [
      [-0.5, 0, 0.5],
      [0.5, 0, 1],
    ],
  };
  assert.equal(projectCabinShape(shape, 1280, 720).points.length, 2);
});
