import test from 'node:test';
import assert from 'node:assert/strict';
import { VectorContext } from '../src/rendering/webgpu/vectorContext.js';

function context() {
  return Object.assign(Object.create(VectorContext.prototype), {
    canvas: { width: 800, height: 600 },
    coordinateScale: 1,
    globalAlpha: 1,
    matrix: [1, 0, 0, 1, 0, 0],
    projective: null,
    vertices: [],
    batches: [],
    clipRect: [0, 0, 700, 300],
    surface: { schedule() {} },
  });
}
const points = [
  [0, 0],
  [10, 0],
  [0, 10],
];

test('vector batches merge equal clips without copying the clip again or losing texture draw order', () => {
  const c = context(),
    texture = {},
    other = {};
  c.triangles(points, '#fff', { texture });
  const savedClip = c.batches[0].clip;
  c.clipRect = [0, 0, 700, 300];
  // A matching clip need not be copied: the existing snapshot is already safe.
  c.clipRect[Symbol.iterator] = () => {
    throw new Error('redundant clip copy');
  };
  c.triangles(points, '#ff000080', { texture });
  assert.equal(c.batches.length, 1);
  assert.equal(c.batches[0].count, 6);
  assert.equal(c.batches[0].clip, savedClip);
  c.clipRect = [0, 0, 700, 300];
  c.triangles(points, '#fff', { texture: other });
  c.triangles(points, '#fff', { texture });
  assert.deepEqual(
    c.batches.map((b) => [b.first, b.count, b.texture]),
    [
      [0, 6, texture],
      [6, 3, other],
      [9, 3, texture],
    ],
  );
});

test('clip mutations, clipping removal and retained replay preserve independent batch snapshots', () => {
  const c = context();
  c.triangles(points, '#fff');
  c.clipRect[2] = 500;
  c.triangles(points, '#fff');
  c.clipRect = null;
  c.triangles(points, '#fff');
  c.triangles(points, '#fff');
  assert.deepEqual(
    c.batches.map((b) => b.clip),
    [[0, 0, 700, 300], [0, 0, 500, 300], null],
  );
  assert.deepEqual(
    c.batches.map((b) => b.count),
    [3, 3, 6],
  );
  c.clipRect = [20, 30, 400, 200];
  const record = c.capture(() => c.triangles(points, '#00ff00'));
  c.clipRect[0] = 99;
  c.replay(record);
  c.clipRect = [20, 30, 400, 200];
  c.triangles(points, '#ff0000');
  assert.deepEqual(record.batches[0].clip, [20, 30, 400, 200]);
  assert.deepEqual(c.batches.at(-1).clip, [20, 30, 400, 200]);
  assert.equal(c.batches.at(-1).count, 6);
});
