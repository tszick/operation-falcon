import { Vec3, clamp } from './math.js';
import { terrainWorld, terrainHeight, pathCoordinates } from './terrain.js';

const random = (x, z, seed) => {
  let n = Math.imul(x ^ seed, 374761393) ^ Math.imul(z, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const cache = new WeakMap();
export function forestPatches(world = terrainWorld) {
  if (cache.has(world)) return cache.get(world);
  const patches = [];
  if (!world.ocean) {
    const seed = world.skySeed || 417;
    for (let z = -4; z < 4; z++)
      for (let x = -4; x < 4; x++) {
        if (random(x, z, seed + 241) > 0.42) continue;
        patches.push({
          x: x * 14000 + 7000 + (random(x, z, seed + 242) - 0.5) * 3500,
          z: z * 14000 + 7000 + (random(x, z, seed + 243) - 0.5) * 3500,
          radiusX: 1300 + random(x, z, seed + 244) * 1700,
          radiusZ: 1100 + random(x, z, seed + 245) * 1800,
          phase: random(x, z, seed + 246) * 6.2831853,
          conifer: random(x, z, seed + 247) > 0.5,
        });
      }
    // A wooded district close enough to the home field to make scenery visible on short flights.
    patches.push({
      x: -4800,
      z: 6200,
      radiusX: 1800,
      radiusZ: 2100,
      phase: random(0, 0, seed + 248) * 6.2831853,
      conifer: false,
    });
  }
  cache.set(world, patches);
  return patches;
}
function corridorClearance(path, x, z, margin) {
  if (!path) return 1;
  const { along, across } = pathCoordinates(path, x, z);
  const distance = Math.hypot(
    across,
    Math.max(0, (path.min ?? -Infinity) - along, along - (path.max ?? Infinity)),
  );
  return smooth(
    (path.width || 14) * 0.5 + margin,
    (path.width || 14) * 0.5 + margin + 100,
    distance,
  );
}
const contexts = new WeakMap();
function coverContext(world) {
  let data = contexts.get(world);
  if (data && data.sourceFields === world.airfields && data.sourceStreets === world.cityRoads)
    return data;
  const streets = world.cityRoads || [];
  data = {
    sourceFields: world.airfields,
    sourceStreets: world.cityRoads,
    streets,
    fields: [...(world.noAirfield ? [] : [{ x: 0, z: 0 }]), ...(world.airfields || [])],
    city: streets.length
      ? {
          minX: Math.min(...streets.map((p) => p.x)) - 700,
          maxX: Math.max(...streets.map((p) => p.x)) + 700,
          minZ: Math.min(...streets.map((p) => p.z)) - 700,
          maxZ: Math.max(...streets.map((p) => p.z)) + 700,
        }
      : null,
  };
  contexts.set(world, data);
  return data;
}
export function forestCover(patch, x, z, world = terrainWorld) {
  const dx = (x - patch.x) / patch.radiusX,
    dz = (z - patch.z) / patch.radiusZ;
  const angle = Math.atan2(dz, dx),
    radius = Math.hypot(dx, dz);
  const boundary =
    0.86 + 0.08 * Math.sin(angle * 3 + patch.phase) + 0.05 * Math.sin(angle * 7 - patch.phase);
  let cover = 1 - smooth(boundary - 0.1, boundary, radius);
  if (cover <= 0) return 0;
  const { fields, streets, city } = coverContext(world);
  for (const f of fields) {
    const c = Math.cos(f.heading || 0),
      s = Math.sin(f.heading || 0),
      a = x - f.x,
      b = z - f.z;
    const across = Math.abs(a * c - b * s),
      along = Math.abs(a * s + b * c);
    cover *= Math.max(smooth(550, 850, across), smooth(2400, 2800, along));
  }
  if (world.site) cover *= smooth(1700, 2100, Math.hypot(x - world.site.x, z - world.site.z));
  if (city && x > city.minX && x < city.maxX && z > city.minZ && z < city.maxZ) return 0;
  cover *= corridorClearance(world.road, x, z, 90) * corridorClearance(world.river, x, z, 100);
  for (const street of streets) cover *= corridorClearance(street, x, z, 80);
  if (world.canyon) {
    const p = world.canyon;
    cover *= smooth(p.width, p.width + 300, Math.abs(pathCoordinates(p, x, z).across));
  }
  return cover;
}
export function forestAt(x, z, world = terrainWorld) {
  let best = null,
    cover = 0;
  for (const p of forestPatches(world)) {
    if (Math.abs(x - p.x) > p.radiusX || Math.abs(z - p.z) > p.radiusZ) continue;
    const value = forestCover(p, x, z, world);
    if (value > cover) {
      best = p;
      cover = value;
    }
  }
  return { patch: best, cover };
}
export function rasterForests(pixels, size, extent, world = terrainWorld) {
  const scale = size / extent;
  for (const p of forestPatches(world)) {
    const loX = Math.max(0, Math.floor((p.x - p.radiusX + extent * 0.5) * scale));
    const hiX = Math.min(size - 1, Math.ceil((p.x + p.radiusX + extent * 0.5) * scale));
    const loZ = Math.max(0, Math.floor((p.z - p.radiusZ + extent * 0.5) * scale));
    const hiZ = Math.min(size - 1, Math.ceil((p.z + p.radiusZ + extent * 0.5) * scale));
    for (let v = loZ; v <= hiZ; v++)
      for (let u = loX; u <= hiX; u++) {
        const cover = forestCover(
          p,
          (u + 0.5) / scale - extent * 0.5,
          (v + 0.5) / scale - extent * 0.5,
          world,
        );
        if (cover <= 0) continue;
        const i = (v * size + u) * 4;
        pixels[i] = p.conifer ? 250 : 240;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
        pixels[i + 3] = Math.round(128 + cover * 127);
      }
  }
}
function heightFromCover(patch, x, z, cover) {
  const broad = 19 + 4 * Math.sin(x * 0.013 + patch.phase) * Math.cos(z * 0.017);
  const crown = 3 * Math.sin(x * 0.077 + Math.sin(z * 0.021)) * Math.cos(z * 0.063);
  return Math.max(0, (broad + crown + (patch.conifer ? 5 : 0)) * cover);
}
export function canopyHeight(patch, x, z, world = terrainWorld) {
  return heightFromCover(patch, x, z, forestCover(patch, x, z, world));
}
// Only analytic samples persist. Rendered vertices still follow the current terrain LOD.
let sampling = { key: null, source: null, patches: new Map() };
function sampleStore(world, heightAt) {
  const key = JSON.stringify([
    world.revision,
    world.skySeed,
    world.noAirfield,
    world.peaks,
    world.road,
    world.river,
    world.canyon,
    world.site,
    world.airfields,
    world.cityRoads,
  ]);
  if (sampling.key !== key || sampling.source !== heightAt)
    sampling = { key, source: heightAt, patches: new Map() };
  return sampling.patches;
}
export function forestCanopyFaces(
  cx,
  cz,
  world = terrainWorld,
  heightAt = terrainHeight,
  surfaceAt = heightAt,
) {
  const faces = [],
    step = 110,
    stores = sampleStore(world, heightAt);
  for (const patch of forestPatches(world)) {
    if (Math.hypot(cx - patch.x, cz - patch.z) > 7500 + Math.max(patch.radiusX, patch.radiusZ))
      continue;
    const patchKey = patch.x + ':' + patch.z;
    const samples = stores.get(patchKey) || new Map();
    stores.delete(patchKey);
    stores.set(patchKey, samples);
    if (stores.size > 8) stores.delete(stores.keys().next().value);
    const points = new Map();
    const point = (ix, iz) => {
      const key = ix + ':' + iz;
      if (points.has(key)) return points.get(key);
      const x = ix * step,
        z = iz * step;
      let sample = samples.get(key);
      if (!sample) {
        const h = heightAt(x, z),
          cover = forestCover(patch, x, z, world);
        const slope =
          Math.max(
            Math.abs(heightAt(x + 55, z) - heightAt(x - 55, z)),
            Math.abs(heightAt(x, z + 55) - heightAt(x, z - 55)),
          ) / 110;
        const height =
          heightFromCover(patch, x, z, cover) *
          (1 - smooth(1500, 2100, h)) *
          (1 - smooth(0.3, 0.7, slope));
        sample = { height, cover };
        samples.set(key, sample);
      }
      const value = {
        point: new Vec3(x, surfaceAt(x, z) + sample.height, z),
        height: sample.height,
        cover: sample.cover,
      };
      points.set(key, value);
      return value;
    };
    const triangle = (items) => {
      if (items.every((p) => p.cover < 0.02 || p.height < 0.5)) return;
      const pts = items.map((p) => p.point),
        normal = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[0])).normalize();
      if (normal.y < 0) normal.scale(-1);
      const light = 0.6 + 0.4 * clamp(normal.dot(new Vec3(-0.36, 0.86, -0.36)), 0, 1);
      faces.push({
        points: pts,
        normal,
        center: pts.reduce((a, p) => a.add(p), new Vec3()).scale(1 / 3),
        color: `rgb(${patch.conifer ? 200 : 160},${Math.round(light * 255)},0)`,
        canopyHeights: items.map((p) => p.height),
        forest: true,
        conifer: patch.conifer,
      });
    };
    for (
      let iz = Math.floor((patch.z - patch.radiusZ) / step);
      iz < Math.ceil((patch.z + patch.radiusZ) / step);
      iz++
    )
      for (
        let ix = Math.floor((patch.x - patch.radiusX) / step);
        ix < Math.ceil((patch.x + patch.radiusX) / step);
        ix++
      ) {
        if (Math.hypot(ix * step - cx, iz * step - cz) > 7500) continue;
        const a = point(ix, iz),
          b = point(ix + 1, iz),
          c = point(ix + 1, iz + 1),
          d = point(ix, iz + 1);
        triangle([a, b, c]);
        triangle([a, c, d]);
        if (faces.length >= 14000) return faces;
      }
  }
  return faces;
}
