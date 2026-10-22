import { Vec3 } from '../../math.js';
import { terrainWorld, terrainHeight, pathPoint, pathCoordinates } from '../../terrain.js';
import { roadSection, riverSection, roadWet, terrainFeaturePaths } from '../../terrainFeatures.js';
const caches = new WeakMap();
export function featureWindow(camera, previous = null) {
  const altitude = camera.y - terrainHeight(camera.x, camera.z),
    same = previous?.revision === terrainWorld.revision,
    high = same ? (previous.high ? altitude > 3800 : altitude > 4200) : altitude > 4000,
    centers = {};
  for (const [kind, path] of terrainFeaturePaths()) {
    const along = path.city ? 0 : pathCoordinates(path, camera.x, camera.z).along,
      old = previous?.centers[kind];
    centers[kind] =
      same && old !== undefined && Math.abs(along - (old + 250)) <= 375
        ? old
        : Math.floor(along / 500) * 500;
  }
  return {
    revision: terrainWorld.revision,
    high,
    centers,
    key: [terrainWorld.revision, high, ...Object.entries(centers).flat()].join(':'),
  };
}
export function buildFeatureBuffers(camera, window = featureWindow(camera)) {
  let cache = caches.get(terrainWorld);
  if (!cache || cache.size > 5000) {
    cache = new Map();
    caches.set(terrainWorld, cache);
  }
  const tiles = [],
    patches = [];
  let count = 0;
  for (const [pathId, path] of terrainFeaturePaths()) {
    const kind = pathId === 'river' ? 'river' : 'road',
      step = path.city
        ? window.high
          ? 300
          : 150
        : kind === 'river'
          ? window.high
            ? 200
            : 100
          : window.high
            ? 90
            : 30,
      extent = kind === 'river' ? 36000 : 10000,
      center = window.centers[pathId];
    for (
      let t = Math.max(path.min ?? -Infinity, Math.floor((center - extent - 1000) / step) * step);
      t < Math.min(path.max ?? Infinity, center + extent + 1000);
      t += step
    ) {
      const key = [pathId, step, t].join(':');
      let values = cache.get(key);
      if (!values) {
        values = [];
        const quad = (points, color, detail = 0) => {
          for (const i of [0, 1, 2, 0, 2, 3])
            values.push(
              points[i].x,
              points[i].y,
              points[i].z,
              ...color,
              kind === 'river' ? 0 : 1,
              detail,
            );
        };
        if (kind === 'river') {
          const pts = riverSection(path, t, step),
            shore = riverSection(path, t, step, path.width + 18);
          quad(pts, [32 / 255, 80 / 255, 91 / 255]);
          for (const [a, b] of [
            [0, 3],
            [1, 2],
          ]) {
            const bank = [pts[a], pts[b], shore[b].clone(), shore[a].clone()];
            for (let i = 2; i < 4; i++) bank[i].y = terrainHeight(bank[i].x, bank[i].z) + 0.3;
            quad(bank, [57 / 255, 75 / 255, 64 / 255]);
          }
        } else {
          const p = pathPoint(path, t),
            skip =
              path.min !== undefined ? t < path.min || t > path.max : Math.hypot(p.x, p.z) < 4500;
          if (!skip && !roadWet(path, t) && !roadWet(path, t + step)) {
            quad(roadSection(path, t, step, path.width + 5), [86 / 255, 83 / 255, 70 / 255]);
            quad(roadSection(path, t, step, path.width), [21 / 255, 29 / 255, 32 / 255]);
            const outer = roadSection(path, t, step, path.width - 0.7),
              inner = roadSection(path, t, step, path.width - 1.05);
            for (const [a, b] of [
              [0, 3],
              [1, 2],
            ])
              quad([outer[a], outer[b], inner[b], inner[a]], [189 / 255, 188 / 255, 160 / 255], 1);
            for (let mark = t; mark < t + step; mark += 12)
              quad(roadSection(path, mark, 3, 0.18), [216 / 255, 209 / 255, 167 / 255], 2);
          }
        }
        values = new Float32Array(values);
        cache.set(key, values);
      }
      tiles.push(values);
      count += (values.length / 8) * 9;
      const bounds = {
        x: [Infinity, -Infinity],
        y: [Infinity, -Infinity],
        z: [Infinity, -Infinity],
      };
      for (let i = 0; i < values.length; i += 8)
        for (const [j, k] of ['x', 'y', 'z'].entries()) {
          bounds[k][0] = Math.min(bounds[k][0], values[i + j]);
          bounds[k][1] = Math.max(bounds[k][1], values[i + j]);
        }
      // The original Canvas path uses the main ribbon midpoint for terrain visibility.
      const centerKey = key + ':center';
      let center = cache.get(centerKey);
      if (!center && values.length) {
        center = new Vec3();
        for (const i of [0, 8, 16, 40])
          center.add(new Vec3(values[i], values[i + 1], values[i + 2]));
        center.scale(0.25);
        cache.set(centerKey, center);
      }
      patches.push({
        center,
        maxDepth: kind === 'river' ? 36000 : 10500,
        radius: values.length
          ? Math.hypot(
              ...['x', 'y', 'z'].map((k) =>
                Math.max(Math.abs(bounds[k][0] - center[k]), Math.abs(bounds[k][1] - center[k])),
              ),
            )
          : 0,
      });
    }
  }
  const vertices = new Float32Array(count);
  let offset = 0;
  for (const [id, tile] of tiles.entries())
    for (let i = 0; i < tile.length; i += 8) {
      vertices.set(tile.subarray(i, i + 8), offset);
      vertices[offset + 8] = id;
      offset += 9;
    }
  return { vertices, patches, key: window.key };
}
// Match the fragment fade, including the whole patch sphere at the boundary.
// Invisible ribbons must not launch expensive procedural terrain sight rays.
export function featurePatchInView(r, patch) {
  if (!patch.center) return false;
  const p = r.local(patch.center),
    radius = patch.radius;
  return (
    p.z - radius < patch.maxDepth &&
    p.z + radius >= 1 &&
    Math.abs(p.x) <= (p.z * r.w) / (2 * r.focal) + radius * Math.hypot(1, r.w / (2 * r.focal)) &&
    Math.abs(p.y) <= (p.z * r.h * 0.53) / r.focal + radius * Math.hypot(1, (r.h * 0.53) / r.focal)
  );
}
