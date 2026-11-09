import test from 'node:test';
import assert from 'node:assert/strict';
import { orderCabinSurfaces } from '../src/cabinOcclusion.js';
import { cockpitInteriorGeometry } from '../src/cockpitInteriorGeometry.js';
import { Quat, forward } from '../src/math.js';
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function rayHit(shape, ray) {
  const p = shape.points,
    raw = cross(
      p[1].map((v, i) => v - p[0][i]),
      p[2].map((v, i) => v - p[0][i]),
    );
  const length = Math.hypot(...raw);
  if (length < 1e-12) return null;
  const n = raw.map((v) => v / length),
    denom = dot(n, ray);
  if (Math.abs(denom) < 1e-10) return null;
  const t = dot(n, p[0]) / denom;
  if (t <= 0) return null;
  const q = ray.map((v) => v * t);
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length],
      edge = b.map((v, k) => v - a[k]);
    if (
      dot(
        cross(
          edge,
          q.map((v, k) => v - a[k]),
        ),
        n,
      ) <
      -1e-7 * Math.hypot(...edge)
    )
      return null;
  }
  return t;
}
test('static-eye surface order remains back to front along side and downward view rays', () => {
  const geometry = cockpitInteriorGeometry(),
    ordered = orderCabinSurfaces(geometry).filter((s) => s.fill !== 'none');
  assert.ok(ordered.length < 2000);
  for (let yaw = -1.7; yaw <= 1.7; yaw += 0.11)
    for (let pitch = -0.78; pitch <= 0.9; pitch += 0.13) {
      const v = forward(Quat.euler(yaw, pitch, 0)),
        ray = [v.x, v.y, v.z];
      const hits = ordered.map((s) => rayHit(s, ray)).filter((v) => v !== null);
      for (let i = 1; i < hits.length; i++)
        assert.ok(hits[i] <= hits[i - 1] + 1e-5, `${yaw}/${pitch}: ${hits[i - 1]} -> ${hits[i]}`);
    }
});
test('the cockpit does not add a speculative exterior nose into the forward view', () => {
  assert.ok(cockpitInteriorGeometry().every((s) => s.part !== 'aircraft-nose'));
});

test('HUD glass keeps exactly its original perimeter through BSP cuts, without closing internal edges', () => {
  const geometry = cockpitInteriorGeometry(),
    glass = geometry.find((s) => s.part === 'hud-glass');
  const edges = orderCabinSurfaces(geometry).filter((s) => s.part === 'hud-glass');
  assert.ok(edges.length >= 4);
  assert.ok(edges.every((s) => s.open && s.points.length === 2));
  const length = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  let expected = 0,
    actual = 0;
  for (let i = 0; i < glass.points.length; i++)
    expected += length(glass.points[i], glass.points[(i + 1) % glass.points.length]);
  for (const edge of edges) {
    const [a, b] = edge.points;
    actual += length(a, b);
    assert.ok(
      glass.points.some((start, i) => {
        const end = glass.points[(i + 1) % glass.points.length];
        return [a, b].every(
          (p) => Math.abs(length(start, p) + length(p, end) - length(start, end)) < 1e-8,
        );
      }),
      'Every visible segment must lie on an original outer edge',
    );
  }
  assert.ok(Math.abs(actual - expected) < 1e-8, 'No extra or duplicated outline');
});
