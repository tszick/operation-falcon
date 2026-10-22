import { oceanSurface } from './oceanEnvironment.js';
import { terrainTint } from './surfaceStyle.js';
import { Vec3, clamp } from './math.js';
import { terrainHeight, terrainWorld } from './terrain.js';
import { projectFeaturePolygon } from './terrainFeatures.js';
// One connected grid: no overlapping transparent near/far wire meshes or LOD gaps.
// Every LOD samples world-aligned coordinates. Translating a coarse grid with
// the camera used to move distant peak vertices by 450 m at each rebuild.
export function terrainAxis(center) {
  const coordinates = new Set();
  for (let i = -20; i <= 20; i++) coordinates.add(center + i * 450);
  let inner = 9000;
  for (const [outer, step] of [
    [12600, 1800],
    [19800, 3600],
    [34200, 7200],
    [54000, 14400],
  ]) {
    for (const sign of [-1, 1]) {
      const lo = sign < 0 ? center - outer : center + inner,
        hi = sign < 0 ? center - inner : center + outer;
      for (let value = Math.ceil(lo / step) * step; value <= hi; value += step)
        if (Math.abs(value - center) > inner) coordinates.add(value);
    }
    inner = outer;
  }
  return [...coordinates].sort((a, b) => a - b);
}
let sampleRevision = -1,
  sampleCache = new Map();
export function buildTerrainSurface(cx, cz, heightAt = terrainHeight) {
  if (terrainWorld.ocean && heightAt === terrainHeight)
    return oceanSurface(terrainWorld.islands || [], cx, cz);
  const xs = terrainAxis(cx),
    zs = terrainAxis(cz);
  // Explicit peak anchors keep narrow prominent summits from jumping between LOD samples.
  if (heightAt === terrainHeight) {
    for (const [axis, center, values] of [
      ['x', cx, xs],
      ['z', cz, zs],
    ])
      for (const peak of terrainWorld.peaks)
        for (const offset of [-1, -0.5, 0, 0.5, 1]) {
          const value = peak[axis] + offset * peak.radius;
          if (Math.abs(value - center) < 48000 && !values.some((v) => Math.abs(v - value) < 1))
            values.push(value);
        }
    // Preserve narrow flat landing corridors between the coarse terrain samples.
    // Use world-space anchors so camera grid shifts cannot bury a remote runway.
    for (const field of terrainWorld.airfields || []) {
      const c = Math.cos(field.heading || 0),
        s = Math.sin(field.heading || 0);
      for (const lateral of [-500, -100, 100, 500])
        for (const longitudinal of [-10500, -8500, 8500, 10500]) {
          const x = field.x + lateral * c + longitudinal * s,
            z = field.z - lateral * s + longitudinal * c;
          for (const [values, value, center] of [
            [xs, x, cx],
            [zs, z, cz],
          ])
            if (
              Math.abs(value - center) < 48000 &&
              !values.some((v) => Math.abs(v - value) < 0.001)
            )
              values.push(value);
        }
    }
    xs.sort((a, b) => a - b);
    zs.sort((a, b) => a - b);
  }
  if (sampleRevision !== terrainWorld.revision || sampleCache.size > 32000) {
    sampleRevision = terrainWorld.revision;
    sampleCache = new Map();
  }
  const point = (x, z) => {
    if (heightAt !== terrainHeight) return new Vec3(x, heightAt(x, z), z);
    const key = x + ':' + z;
    let p = sampleCache.get(key);
    if (!p) {
      p = new Vec3(x, heightAt(x, z), z);
      sampleCache.set(key, p);
    }
    return p;
  };
  const points = zs.map((z) => xs.map((x) => point(x, z))),
    faces = [];
  const add = (pts) => {
    const normal = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize();
    if (normal.y < 0) normal.scale(-1);
    const light = clamp(normal.dot(new Vec3(-0.36, 0.86, -0.36)), 0, 1);
    faces.push({
      points: pts,
      normal,
      center: pts.reduce((p, v) => p.add(v), new Vec3()).scale(1 / 3),
      color: `rgb(${Math.round(12 + light * 8)},${Math.round(27 + light * 18)},${Math.round(20 + light * 10)})`,
    });
  };
  for (let z = 0; z < points.length - 1; z++)
    for (let x = 0; x < xs.length - 1; x++) {
      const a = points[z][x],
        b = points[z][x + 1],
        c = points[z + 1][x + 1],
        d = points[z + 1][x];
      add([a, b, c]);
      add([a, c, d]);
    }
  return faces;
}
export function terrainGridCenter(camera, previous = null) {
  if (terrainWorld.ocean) {
    const reuse =
      previous?.revision === terrainWorld.revision &&
      Math.abs(camera.x - previous.x) < 2000 &&
      Math.abs(camera.z - previous.z) < 2000;
    return {
      x: reuse ? previous.x : Math.round(camera.x / 3000) * 3000,
      z: reuse ? previous.z : Math.round(camera.z / 3000) * 3000,
      revision: terrainWorld.revision,
    };
  }
  const reuse = previous?.revision === terrainWorld.revision;
  return {
    x:
      reuse && Math.abs(camera.x - previous.x) <= 337.5
        ? previous.x
        : Math.round(camera.x / 450) * 450,
    z:
      reuse && Math.abs(camera.z - previous.z) <= 337.5
        ? previous.z
        : Math.round(camera.z / 450) * 450,
    revision: terrainWorld.revision,
  };
}
export function renderTerrainSurface(r) {
  const center = (r.terrainGridCenter = terrainGridCenter(r.camera, r.terrainGridCenter)),
    cx = center.x,
    cz = center.z,
    key = `${terrainWorld.revision}:${cx}:${cz}`;
  if (r.terrainSurfaceKey !== key) {
    r.terrainSurfaceKey = key;
    r.terrainSurface = buildTerrainSurface(cx, cz);
  }
  if (r.gpuModels?.renderTerrain(r)) return;
  if (r.debugMetrics)
    r.terrainMetrics = { backend: 'Canvas2D', triangles: r.terrainSurface.length };
  const faces = [],
    localCache = new Map();
  for (const face of r.terrainSurface) {
    if (face.oceanWater) continue;
    const screen = projectFeaturePolygon(
      r,
      face.ocean ? face.points.map((p) => new Vec3(p.x, Math.max(0.03, p.y), p.z)) : face.points,
      localCache,
    );
    if (
      screen.length < 3 ||
      screen.every((p) => p.x < 0) ||
      screen.every((p) => p.x > r.w) ||
      screen.every((p) => p.y < 0) ||
      screen.every((p) => p.y > r.h)
    )
      continue;
    faces.push({ ...face, screen, depth: r.local(face.center).z });
  }
  faces.sort((a, b) => b.depth - a.depth);
  const c = r.ctx;
  c.save();
  c.lineJoin = 'round';
  c.lineWidth = 1;
  for (const face of faces) {
    c.beginPath();
    face.screen.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    // Opaque fill covers the far slope, stars and all previously painted grid lines.
    const color =
      !face.ocean && r.surfaceMode && r.surfaceMode !== 'vector'
        ? `rgb(${terrainTint(
            r.surfaceMode,
            face.normal.y,
            face.center.y,
            (Number(face.color.match(/[\d.]+/g)[1]) - 27) / 18,
          )
            .map((v) => Math.round(v * 255))
            .join(',')})`
        : face.color;
    c.fillStyle = color;
    c.fill();
    c.strokeStyle = color;
    c.stroke();
    if (r.surfaceLines === false) continue;
    const alpha = face.depth < 3200 ? 0.72 : face.depth < 10000 ? 0.54 : 0.32;
    c.strokeStyle = `rgba(115,163,96,${alpha})`;
    c.lineWidth = face.depth < 6500 ? 1.05 : 0.8;
    c.stroke();
  }
  c.restore();
}
