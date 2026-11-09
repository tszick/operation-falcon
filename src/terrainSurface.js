import { createRunwayTerrainClipper } from './runwayTerrain.js';
import { forestCanopyFaces } from './forests.js';
import { TerrainBuildQueue } from './terrainBuildQueue.js';
import { packedTerrainBuffers } from './rendering/shared/terrainData.js';
import { groundVehiclePatches } from './vehicleGrounding.js';
import { refinedTerrainTriangles } from './terrainRefinement.js';
import { oceanSurface } from './oceanEnvironment.js';
import { terrainTint, surfaceStyle } from './surfaceStyle.js';
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
const terrainLight = new Vec3(-0.36, 0.86, -0.36);
let sampleRevision = -1,
  sampleCache = new Map();
export function buildTerrainSurface(
  cx,
  cz,
  heightAt = terrainHeight,
  { vehiclePatches = [] } = {},
) {
  if (terrainWorld.ocean && heightAt === terrainHeight)
    return oceanSurface(terrainWorld.islands || [], cx, cz);
  const xs = terrainAxis(cx),
    zs = terrainAxis(cz);
  const fields =
    heightAt === terrainHeight
      ? [
          ...(terrainWorld.noAirfield ? [] : [{ x: 0, z: 0, heading: 0, elevation: 0 }]),
          ...(terrainWorld.airfields || []),
        ]
      : [];
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
    for (const field of fields) {
      const c = Math.cos(field.heading || 0),
        s = Math.sin(field.heading || 0);
      const anchors = [];
      for (const lateral of [-500, -100, 100, 500])
        for (const longitudinal of [-10500, -8500, 8500, 10500])
          anchors.push([lateral, longitudinal]);
      // Keep the runway itself inside a sampled flat patch at every camera LOD.
      for (const lateral of [-70, 70])
        for (const longitudinal of [-1800, 1800]) anchors.push([lateral, longitudinal]);
      for (const [lateral, longitudinal] of anchors) {
        const x = field.x + lateral * c + longitudinal * s,
          z = field.z - lateral * s + longitudinal * c;
        for (const [values, value, center] of [
          [xs, x, cx],
          [zs, z, cz],
        ])
          if (Math.abs(value - center) < 48000 && !values.some((v) => Math.abs(v - value) < 0.001))
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
  // Drape vegetation onto the rendered triangles, rather than the denser analytic
  // height field, so a canopy edge cannot intersect the coarser ground mesh.
  const interval = (values, value) => {
    let lo = 0,
      hi = values.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (values[mid] <= value) lo = mid;
      else hi = mid;
    }
    return Math.min(values.length - 2, lo);
  };
  const surfaceAt = (x, z) => {
    const ix = interval(xs, x),
      iz = interval(zs, z);
    const x0 = xs[ix],
      x1 = xs[ix + 1],
      z0 = zs[iz],
      z1 = zs[iz + 1];
    const tx = (x - x0) / (x1 - x0),
      tz = (z - z0) / (z1 - z0);
    const a = point(x0, z0).y,
      b = point(x1, z0).y,
      c = point(x1, z1).y,
      d = point(x0, z1).y;
    return tx >= tz ? a + (b - a) * tx + (c - b) * tz : a + (c - d) * tx + (d - a) * tz;
  };
  const points = zs.map((z) => xs.map((x) => point(x, z))),
    faces = [];
  const addFace = (pts) => {
    const [a, b, c] = pts,
      abx = b.x - a.x,
      aby = b.y - a.y,
      abz = b.z - a.z,
      acx = c.x - a.x,
      acy = c.y - a.y,
      acz = c.z - a.z;
    const normal = new Vec3(
      aby * acz - abz * acy,
      abz * acx - abx * acz,
      abx * acy - aby * acx,
    ).normalize();
    if (normal.y < 0) normal.scale(-1);
    const light = clamp(normal.dot(terrainLight), 0, 1);
    faces.push({
      points: pts,
      normal,
      center: new Vec3()
        .add(a)
        .add(b)
        .add(c)
        .scale(1 / 3),
      color: `rgb(${Math.round(12 + light * 8)},${Math.round(27 + light * 18)},${Math.round(20 + light * 10)})`,
    });
  };
  const clipRunways = createRunwayTerrainClipper(fields);
  const add = (pts) => {
    for (const triangle of clipRunways(pts)) addFace(triangle);
  };
  if (vehiclePatches.length) {
    for (const triangle of refinedTerrainTriangles(xs, zs, point, vehiclePatches)) add(triangle);
    if (heightAt === terrainHeight)
      faces.push(...forestCanopyFaces(cx, cz, terrainWorld, terrainHeight, surfaceAt));
    return faces;
  }
  for (let z = 0; z < points.length - 1; z++)
    for (let x = 0; x < xs.length - 1; x++) {
      const a = points[z][x],
        b = points[z][x + 1],
        c = points[z + 1][x + 1],
        d = points[z + 1][x];
      add([a, b, c]);
      add([a, c, d]);
    }
  if (heightAt === terrainHeight)
    faces.push(...forestCanopyFaces(cx, cz, terrainWorld, terrainHeight, surfaceAt));
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
const workerQueues = new WeakMap();
function terrainQueue(r) {
  if (workerQueues.has(r)) return workerQueues.get(r);
  let queue = null;
  if (typeof Worker !== 'undefined') {
    try {
      queue = new TerrainBuildQueue(
        new Worker(new URL('./terrainWorker.js', import.meta.url), { type: 'module' }),
      );
    } catch {
      /* Synchronous rendering remains available if workers are unavailable. */
    }
  }
  workerQueues.set(r, queue);
  return queue;
}
export function terrainSnapshot() {
  const world = {};
  for (const key of [
    'revision',
    'skySeed',
    'noAirfield',
    'ocean',
    'islands',
    'canyon',
    'peaks',
    'road',
    'river',
    'site',
    'bridge',
    'bridges',
    'cityRoads',
    'bridgeRevision',
    'airfields',
  ])
    if (terrainWorld[key] !== undefined) world[key] = terrainWorld[key];
  return world;
}
function terrainJob(r, position, targets) {
  const center = (r.terrainGridCenter = terrainGridCenter(position, r.terrainGridCenter)),
    cx = center.x,
    cz = center.z,
    patches = terrainWorld.ocean ? [] : groundVehiclePatches(targets, cx, cz),
    patchKey = patches.map((p) => `${p.x},${p.z},${p.radius}`).join(';'),
    key = `${terrainWorld.revision}:${cx}:${cz}:${patchKey}:${r.surfaceLines !== false}`;
  return {
    key,
    revision: terrainWorld.revision,
    cx,
    cz,
    patches,
    wire: r.surfaceLines !== false,
    world: terrainSnapshot(),
  };
}
function installPreparedTerrain(r, ready) {
  r.terrainBuffers = ready;
  r.terrainSurface = [];
  r.terrainSurfaceKey = ready.key;
  r.terrainRevision = ready.revision;
  r.terrainDeferred = true;
  r.terrainWorkerMs = ready.buildMs;
  r.terrainRebuilt = true;
  if (ready.farmlandPixels && r.terrainFarmlandRevision !== ready.revision) {
    r.terrainFarmland = ready.farmlandPixels;
    r.terrainFarmlandRevision = ready.revision;
  }
  if (ready.materials && r.terrainMaterialRevision !== ready.revision) {
    r.terrainMaterials = ready.materials;
    r.terrainMaterialRevision = ready.revision;
  }
  delete ready.materials;
  // Keep the geometry buffer record small after the atlas has a separate owner.
  delete ready.farmlandPixels;
}
// GPU entry points wait for the first mesh and atlas without blocking the UI.
// A failed/unavailable worker leaves the existing synchronous renderer available.
export function prepareInitialTerrain(r, position, targets = []) {
  if (r.terrainSurface && r.terrainRevision === terrainWorld.revision) return true;
  const queue = r.gpuModels ? terrainQueue(r) : null;
  if (!queue || queue.failed) return true;
  const job = terrainJob(r, position, targets);
  job.atlas = r.terrainFarmlandRevision !== terrainWorld.revision;
  if (r.gpuModels.name === 'WebGPU' && r.terrainMaterialRevision !== terrainWorld.revision)
    job.materials = [
      r.surfaceMode === 'ocean' ? 'terrain-sand' : surfaceStyle(r.surfaceMode).texture,
      'concrete',
      'asphalt',
      'hangar',
      'aircraft',
      'camo',
    ].filter((kind) => !r.gpuModels.textures?.has(kind));
  queue.request(job);
  if (queue.failed) return true;
  const ready = queue.take(terrainWorld.revision);
  if (ready) installPreparedTerrain(r, ready);
  return r.terrainRevision === terrainWorld.revision && !!r.terrainSurface;
}
export function renderTerrainSurface(r, targets = []) {
  const job = terrainJob(r, r.camera, targets),
    { key, cx, cz, patches } = job;
  const start = performance.now(),
    queue = r.gpuModels ? terrainQueue(r) : null;
  r.terrainRebuilt = false;
  const buildSync = () => {
    r.terrainSurface = buildTerrainSurface(cx, cz, terrainHeight, { vehiclePatches: patches });
    r.terrainBuffers = r.gpuModels
      ? packedTerrainBuffers(r.terrainSurface, { wire: r.surfaceLines !== false })
      : null;
    r.terrainSurfaceKey = key;
    r.terrainRevision = terrainWorld.revision;
    r.terrainDeferred = false;
    r.terrainRebuilt = true;
  };
  // CPU/worker-error fallback; normal GPU entry points prepare the first mesh asynchronously.
  if (!r.terrainSurface || r.terrainRevision !== terrainWorld.revision) buildSync();
  else if (r.terrainSurfaceKey !== key) {
    if (queue && !queue.failed) {
      queue.request(job);
      const ready = queue.take(terrainWorld.revision);
      if (ready) installPreparedTerrain(r, ready);
    } else buildSync();
  }
  if (r.gpuModels?.renderTerrain(r)) {
    r.terrainFrameMs = performance.now() - start;
    return;
  }
  // Reconstruct Vec3 faces only for the CPU fallback, not for the normal GPU path.
  if (r.terrainDeferred || r.terrainSurfaceKey !== key) buildSync();
  r.terrainFrameMs = performance.now() - start;
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
      !face.forest && !face.ocean && r.surfaceMode && r.surfaceMode !== 'vector'
        ? `rgb(${terrainTint(
            r.surfaceMode,
            face.normal.y,
            face.center.y,
            (Number(face.color.match(/[\d.]+/g)[1]) - 27) / 18,
          )
            .map((v) => Math.round(v * 255))
            .join(',')})`
        : face.forest
          ? r.surfaceMode === 'winter'
            ? 'rgb(112,139,126)'
            : 'rgb(24,57,25)'
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
