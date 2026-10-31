import test from 'node:test';
import assert from 'node:assert/strict';
import { projection, paddedMatrix } from '../src/rendering/webgpu/backend.js';
import { triangulate, rgba, multiply, transformPoint } from '../src/rendering/shared/shapes.js';
import { rotationMatrix, meshBounds } from '../src/rendering/shared/meshData.js';
import { VectorContext } from '../src/rendering/webgpu/vectorContext.js';
import { Quat, Vec3 } from '../src/math.js';

test('GPU culling bounds enclose every vertex, including planar meshes and separate geometry snapshots', () => {
  const mesh = { points: [new Vec3(-3, 2, 4), new Vec3(6, 2, -8)] };
  const bounds = meshBounds(mesh);
  assert.deepEqual(bounds.mins, [-3, 2, -8]);
  assert.deepEqual(bounds.sizes, [9, 0.01, 12]);
  for (const p of mesh.points) assert.ok(bounds.radius >= p.length());
  assert.equal(meshBounds(mesh), bounds);
  const changed = { points: [...mesh.points, new Vec3(0, 0, 20)] };
  assert.equal(meshBounds(changed).radius, 20);
  assert.equal(meshBounds(mesh).radius, bounds.radius);
});

test('retained HUD panels preserve draw order and physical pixel coordinates without disturbing pending geometry', () => {
  const context = Object.assign(Object.create(VectorContext.prototype), {
    canvas: { width: 200, height: 100 },
    coordinateScale: 2,
    globalAlpha: 1,
    matrix: [1, 0, 0, 1, 0, 0],
    projective: null,
    vertices: [],
    batches: [],
    clipRect: [0, 0, 200, 100],
    surface: { schedule() {} },
  });
  const points = [
    [0, 0],
    [100, 0],
    [0, 50],
  ];
  context.triangles(points, '#ff0000');
  const record = context.capture(() => context.triangles(points, '#00ff00'));
  assert.equal(context.vertices.length, 27);
  assert.deepEqual(
    [record.vertices[0], record.vertices[1], record.vertices[9], record.vertices[10]],
    [-1, 1, 1, 1],
  );
  context.replay(record);
  assert.deepEqual(
    context.batches.map((batch) => batch.first),
    [0, 3],
  );
  assert.deepEqual(context.vertices.slice(29, 33), [0, 1, 0, 1]);
  const animated = context.capture(() => context.replay(record, { x: 20, y: 10, alpha: 0.25 }));
  assert.deepEqual(animated.vertices.slice(0, 2), [-0.8, 0.8]);
  assert.equal(animated.vertices[5], 0.25);
  assert.deepEqual(animated.batches[0].clip, [0, 0, 200, 100]);
  assert.equal(record.vertices[5], 1);
  assert.throws(
    () =>
      context.capture(() => {
        throw new Error('panel failed');
      }),
    /panel failed/,
  );
  assert.equal(context.vertices.length, 54);
});

test('WebGPU projection preserves the camera while mapping the near and far planes to zero and one', () => {
  const near = 1,
    far = 200000,
    p = projection(576, 1280, 720, near, far);
  assert.ok(Math.abs((p[2] * near + p[3]) / near) < 1e-12);
  assert.ok(Math.abs((p[2] * far + p[3]) / far - 1) < 1e-12);
  const x = 80,
    y = -30,
    z = 600;
  assert.ok(Math.abs(((x * p[0]) / z + 1) * 640 - (640 + (x * 576) / z)) < 1e-9);
  assert.ok(Math.abs((1 - ((y * p[1]) / z - 0.06)) * 360 - (720 * 0.53 - (y * 576) / z)) < 1e-9);
});
test('WGSL matrix padding keeps quaternion rotations unchanged and does not pack columns at twelve bytes', () => {
  const q = Quat.euler(0.4, -0.6, 0.2),
    p = new Vec3(3, 5, -8),
    m = paddedMatrix(rotationMatrix(q)),
    expected = q.rotate(p);
  assert.equal(m.length, 12);
  assert.deepEqual([m[3], m[7], m[11]], [0, 0, 0]);
  for (const [i, k] of ['x', 'y', 'z'].entries())
    assert.ok(Math.abs(m[i] * p.x + m[i + 4] * p.y + m[i + 8] * p.z - expected[k]) < 1e-5);
});
test('HUD tessellation preserves a concave polygon area in either winding, including repeated closing vertices', () => {
  const shape = [
    [0, 0],
    [6, 0],
    [6, 2],
    [2, 2],
    [2, 6],
    [0, 6],
    [0, 0],
  ];
  for (const points of [shape, [...shape].reverse()]) {
    const triangles = triangulate(points);
    let area = 0;
    for (let i = 0; i < triangles.length; i += 3) {
      const [a, b, c] = triangles.slice(i, i + 3);
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }
    assert.equal(area, 20);
  }
  assert.deepEqual(
    triangulate([
      [0, 0],
      [0, 0],
      [1, 0],
      [2, 0],
    ]),
    [],
  );
});
test('GPU HUD colour parsing preserves alpha and cockpit integrity colours', () => {
  assert.deepEqual(rgba('#abcdef80'), [171 / 255, 205 / 255, 239 / 255, 128 / 255]);
  assert.deepEqual(rgba('rgba(10,20,30,0.25)'), [10 / 255, 20 / 255, 30 / 255, 0.25]);
  assert.deepEqual(rgba('none'), [0, 0, 0, 0]);
  const color = rgba('hsl(0 100% 50%)');
  assert.deepEqual(color, [1, 0, 0, 1]);
});
test('2D transform composition preserves instrument positions under translation, rotation and scale', () => {
  const angle = 0.35,
    rotation = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0],
    matrix = multiply([1, 0, 0, 1, 40, 90], multiply(rotation, [2, 0, 0, 3, 0, 0]));
  const point = transformPoint(matrix, 5, 7);
  assert.ok(Math.abs(point[0] - (40 + 10 * Math.cos(angle) - 21 * Math.sin(angle))) < 1e-9);
  assert.ok(Math.abs(point[1] - (90 + 10 * Math.sin(angle) + 21 * Math.cos(angle))) < 1e-9);
});

test('GPU colour parsing keeps signed scientific notation in RGB and HSL components', () => {
  assert.deepEqual(rgba('rgba(1e2,2E+1,3e+1,1e-7)'), [100 / 255, 20 / 255, 30 / 255, 1e-7]);
  assert.deepEqual(rgba('hsla(0,100%,50%,7.9e-16)'), [1, 0, 0, 7.9e-16]);
  assert.deepEqual(rgba('rgba(10,20,30,.25)'), [10 / 255, 20 / 255, 30 / 255, 0.25]);
});
