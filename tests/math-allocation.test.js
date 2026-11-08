import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, Quat } from '../src/math.js';
test('allocation-free rotation intermediates match the previous arithmetic exactly for unit and nonunit quaternions', () => {
  let seed = 33;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 4294967296) * 20 - 10;
  };
  for (let i = 0; i < 2000; i++) {
    const q = new Quat(random(), random(), random(), random());
    if (i % 2) q.normalize();
    const v = new Vec3(random(), random(), random()),
      before = { ...v },
      original = { ...q };
    const xyz = new Vec3(q.x, q.y, q.z),
      t = xyz.cross(v).scale(2);
    const expected = v.clone().add(t.clone().scale(q.w)).add(xyz.cross(t));
    const actual = q.rotate(v);
    assert.deepEqual(actual, expected);
    assert.deepEqual({ ...v }, before);
    assert.deepEqual({ ...q }, original);
    assert.notEqual(actual, v);
  }
});
test('vector and quaternion constructors retain their defaults and wire property order', () => {
  assert.equal(JSON.stringify(new Vec3()), '{"x":0,"y":0,"z":0}');
  assert.equal(JSON.stringify(new Quat()), '{"x":0,"y":0,"z":0,"w":1}');
  assert.deepEqual(Object.keys(new Vec3(1, 2, 3)), ['x', 'y', 'z']);
  assert.deepEqual(new Quat().rotate(new Vec3(1, 2, 3)), new Vec3(1, 2, 3));
});
