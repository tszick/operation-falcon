import { Vec3, clamp } from '../math.js';
import { terrainHeight, terrainWorld } from '../terrain.js';
import { surfaceStyle } from '../surfaceStyle.js';
import { meshBounds } from './shared/meshData.js';
import { triangulate } from './shared/shapes.js';
import { carrierDeck } from '../navalData.js';
const sunSlope = 0.36 / 0.86;
// A single, non-overlapping aircraft outline: fuselage, swept wings and tail.
const outline = [
  [0, 0.5],
  [0.07, 0.32],
  [0.09, 0.08],
  [0.5, -0.1],
  [0.5, -0.2],
  [0.1, -0.12],
  [0.07, -0.32],
  [0.24, -0.4],
  [0.24, -0.47],
  [0.04, -0.43],
  [0, -0.5],
  [-0.04, -0.43],
  [-0.24, -0.47],
  [-0.24, -0.4],
  [-0.07, -0.32],
  [-0.1, -0.12],
  [-0.5, -0.2],
  [-0.5, -0.1],
  [-0.09, 0.08],
  [-0.07, 0.32],
];
const indices = triangulate(outline).map((p) => outline.indexOf(p));
export function aircraftShadowOpacity(agl, mode) {
  if (!Number.isFinite(agl) || agl < -2 || agl >= 200 || mode === 'night' || mode === 'vector')
    return 0;
  const t = clamp((agl - 100) / 100, 0, 1),
    strength = mode === 'winter' ? 0.17 : mode === 'sunset' ? 0.3 : 0.42;
  return strength * (1 - t * t * (3 - 2 * t));
}
export function shadowReceiverHeight(x, z, carriers = []) {
  let height = terrainHeight(x, z);
  if (terrainWorld.ocean && height <= 0) height = null;
  for (const ship of carriers) {
    const dx = x - ship.position.x,
      dz = z - ship.position.z,
      c = Math.cos(ship.heading || 0),
      s = Math.sin(ship.heading || 0);
    if (
      Math.abs(c * dx - s * dz) < carrierDeck.halfWidth &&
      Math.abs(s * dx + c * dz) < carrierDeck.halfLength
    )
      height = Math.max(height ?? -Infinity, ship.position.y + carrierDeck.elevation);
  }
  return height;
}
export class AircraftShadows {
  constructor() {
    this.storage = new Float32Array(4096);
  }
  build(renderer, entries, carriers = [], receiver = shadowReceiverHeight) {
    const values = [],
      surface = (x, z) => receiver(x, z, carriers);
    if (surfaceStyle(renderer.surfaceMode).light < 0.6 || renderer.surfaceMode === 'vector')
      return this.storage.subarray(0, 0);
    for (const e of entries) {
      const ground = surface(e.position.x, e.position.z);
      if (ground === null) continue;
      const agl = e.position.y - ground,
        alpha = aircraftShadowOpacity(agl, renderer.surfaceMode);
      if (!alpha) continue;
      const bounds = meshBounds(e.mesh),
        radius = bounds.radius + agl * sunSlope,
        center = renderer.local(e.position);
      if (center.z + radius < 1 || center.z - radius > 6500) continue;
      const project = (x, z, expand = 1) => {
        let wing =
          x < -0.12
            ? (e.condition?.parts.leftWing ?? 1)
            : x > 0.12
              ? (e.condition?.parts.rightWing ?? 1)
              : 1;
        wing = 0.12 + 0.88 * wing;
        const point = e.q
          .rotate(
            new Vec3(
              bounds.mins[0] + bounds.sizes[0] * 0.5 + x * bounds.sizes[0] * wing * expand,
              0,
              bounds.mins[2] + bounds.sizes[2] * (0.5 + z * expand),
            ).scale(e.scale),
          )
          .add(e.position);
        let drop = Math.max(0, point.y - ground),
          y;
        for (let step = 0; step < 3; step++) {
          y = surface(point.x + drop * sunSlope, point.z + drop * sunSlope);
          if (y === null) return null;
          drop = Math.max(0, point.y - y);
        }
        const px = point.x + drop * sunSlope,
          pz = point.z + drop * sunSlope;
        y = surface(px, pz);
        return y === null ? null : new Vec3(px, y + 0.4, pz).sub(renderer.camera);
      };
      const inner = outline.map(([x, z]) => project(x, z)),
        outer = outline.map(([x, z]) => project(x, z, 1.05 + Math.max(0, agl) * 0.0004));
      if (inner.some((p) => !p) || outer.some((p) => !p)) continue;
      const push = (p, a) => values.push(p.x, p.y, p.z, a);
      for (const i of indices) push(inner[i], alpha);
      for (let i = 0; i < outline.length; i++) {
        const j = (i + 1) % outline.length;
        for (const [p, a] of [
          [inner[i], alpha],
          [outer[i], 0],
          [outer[j], 0],
          [inner[i], alpha],
          [outer[j], 0],
          [inner[j], alpha],
        ])
          push(p, a);
      }
    }
    if (values.length > this.storage.length)
      this.storage = new Float32Array(2 ** Math.ceil(Math.log2(values.length)));
    this.storage.set(values);
    return this.storage.subarray(0, values.length);
  }
}
