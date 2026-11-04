import { forestAt, rasterForests } from './forests.js';
import { terrainWorld, terrainHeight, pathCoordinates } from './terrain.js';

// A world-fixed land-use atlas: built once per mission, never per frame or LOD.
export const farmlandExtent = 120000;
export const farmlandSize = 2048;
const hash = (x, z, salt = 0) => {
  let n = Math.imul(x ^ salt, 374761393) ^ Math.imul(z, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const local = (field, x, z) => {
  const dx = x - field.x,
    dz = z - field.z,
    a = field.heading || 0;
  return [dx * Math.cos(a) - dz * Math.sin(a), dx * Math.sin(a) + dz * Math.cos(a)];
};
function pathDistance(path, x, z) {
  const { across, along } = pathCoordinates(path, x, z);
  return Math.hypot(
    across,
    Math.max(0, (path.min ?? -Infinity) - along, along - (path.max ?? Infinity)),
  );
}
export function buildFarmland(world = terrainWorld, heightAt = terrainHeight) {
  const parcels = [],
    pixels = new Uint8Array(farmlandSize * farmlandSize * 4);
  if (world.ocean) return { parcels, pixels };
  const fields = [...(world.noAirfield ? [] : [{ x: 0, z: 0 }]), ...(world.airfields || [])];
  const streets = world.cityRoads || [];
  const paths = [world.road, ...streets].filter(Boolean);
  const city = streets.length
    ? {
        minX: Math.min(...streets.map((p) => p.x)) - 700,
        maxX: Math.max(...streets.map((p) => p.x)) + 700,
        minZ: Math.min(...streets.map((p) => p.z)) - 700,
        maxZ: Math.max(...streets.map((p) => p.z)) + 700,
      }
    : null;
  const seed = world.skySeed || 417;
  for (let iz = -6; iz < 6; iz++)
    for (let ix = -6; ix < 6; ix++) {
      const x = ix * 10000 + 5000,
        z = iz * 10000 + 5000;
      const nearSettlement =
        fields.some((f) => Math.hypot(x - f.x, z - f.z) < 15000) ||
        streets.some((p) => Math.hypot(x - p.x, z - p.z) < 10000);
      const nearRoad = paths.some((p) => pathDistance(p, x, z) < 6000);
      if (hash(ix, iz, seed) > (nearSettlement ? 0.88 : nearRoad ? 0.75 : 0.08)) continue;
      const angle = (Math.floor(hash(ix, iz, seed + 1) * 8) * Math.PI) / 4;
      const c = Math.cos(angle),
        s = Math.sin(angle);
      // Shared boundaries pack fields into a 25–42 km² agricultural district.
      const columns = 6 + Math.floor(hash(ix, iz, seed + 6) * 4);
      const rows = 5 + Math.floor(hash(ix, iz, seed + 7) * 4);
      const districtWidth = 5600 + hash(ix, iz, seed + 8) * 900;
      const districtLength = 5000 + hash(ix, iz, seed + 9) * 1500;
      const boundaries = (count, extent, salt) => {
        const weights = Array.from(
          { length: count },
          (_, i) => 0.7 + hash(ix * 17 + i, iz, seed + salt) * 0.6,
        );
        const sum = weights.reduce((a, b) => a + b, 0),
          edges = [-extent / 2];
        for (const w of weights) edges.push(edges.at(-1) + (w / sum) * extent);
        return edges;
      };
      const xs = boundaries(columns, districtWidth, 10),
        zs = boundaries(rows, districtLength, 11);
      for (let k = 0; k < columns * rows; k++) {
        const col = k % columns,
          row = Math.floor(k / columns);
        const width = xs[col + 1] - xs[col] - 26,
          length = zs[row + 1] - zs[row] - 26;
        const ox = (xs[col] + xs[col + 1]) * 0.5,
          oz = (zs[row] + zs[row + 1]) * 0.5;
        const px = x + ox * c - oz * s,
          pz = z + ox * s + oz * c;
        const radius = Math.hypot(width, length) * 0.5;
        if (forestAt(px, pz, world).cover > 0.05) continue;
        if (
          city &&
          px > city.minX - radius &&
          px < city.maxX + radius &&
          pz > city.minZ - radius &&
          pz < city.maxZ + radius
        )
          continue;
        if (
          fields.some((f) => {
            const [a, b] = local(f, px, pz);
            return Math.abs(a) < 650 + radius && Math.abs(b) < 2100 + radius;
          })
        )
          continue;
        if (world.site && Math.hypot(px - world.site.x, pz - world.site.z) < 2000 + radius)
          continue;
        if (
          world.canyon &&
          Math.abs(pathCoordinates(world.canyon, px, pz).across) < world.canyon.width + radius
        )
          continue;
        if (
          world.river &&
          Math.abs(pathCoordinates(world.river, px, pz).across) <
            world.river.width * 0.5 + radius + 180
        )
          continue;
        if (paths.some((p) => pathDistance(p, px, pz) < radius + (p.width || 14) * 0.5 + 60))
          continue;
        const heights = [
          [0, 0],
          [-width / 2, -length / 2],
          [width / 2, -length / 2],
          [-width / 2, length / 2],
          [width / 2, length / 2],
        ].map(([a, b]) => heightAt(px + a * c - b * s, pz + a * s + b * c));
        if (
          heights.some((h) => !Number.isFinite(h)) ||
          Math.max(...heights) - Math.min(...heights) > Math.min(width, length) * 0.17
        )
          continue;
        const crop = hash(ix * 97 + k, iz, seed + 4);
        const direction = angle + (hash(ix * 97 + k, iz, seed + 5) > 0.5 ? Math.PI / 2 : 0);
        const parcel = {
          x: px,
          z: pz,
          width,
          length,
          angle,
          direction,
          crop,
          district: `${ix}:${iz}`,
        };
        parcels.push(parcel);
        const scale = farmlandSize / farmlandExtent;
        const margin = radius + 180;
        const bounds = [px - margin, px + margin, pz - margin, pz + margin].map((v) =>
          Math.floor((v + farmlandExtent / 2) * scale),
        );
        for (let v = Math.max(0, bounds[2]); v <= Math.min(farmlandSize - 1, bounds[3]); v++)
          for (let u = Math.max(0, bounds[0]); u <= Math.min(farmlandSize - 1, bounds[1]); u++) {
            const dx = (u + 0.5) / scale - farmlandExtent / 2 - px,
              dz = (v + 0.5) / scale - farmlandExtent / 2 - pz;
            // Signed edge distance keeps angled boundaries straight even between atlas texels.
            const distance = Math.min(
              width * 0.5 - Math.abs(dx * c + dz * s),
              length * 0.5 - Math.abs(-dx * s + dz * c),
            );
            const edge = Math.round(Math.max(0, Math.min(1, 0.5 + distance / 256)) * 255);
            const i = (v * farmlandSize + u) * 4;
            if (edge <= pixels[i + 3]) continue;
            pixels[i] = Math.round(crop * 223);
            pixels[i + 1] = Math.round((Math.cos(direction) * 0.5 + 0.5) * 255);
            pixels[i + 2] = Math.round((Math.sin(direction) * 0.5 + 0.5) * 255);
            pixels[i + 3] = edge;
          }
      }
    }
  rasterForests(pixels, farmlandSize, farmlandExtent, world);
  return { parcels, pixels };
}

export function farmlandPalette(mode) {
  if (mode === 'winter')
    return [
      [0.73, 0.77, 0.78],
      [0.84, 0.86, 0.85],
      [0.67, 0.7, 0.68],
      [0.78, 0.8, 0.77],
      [0.76, 0.78, 0.79],
    ];
  if (mode === 'desert')
    return [
      [0.35, 0.4, 0.17],
      [0.6, 0.47, 0.25],
      [0.53, 0.5, 0.21],
      [0.43, 0.32, 0.19],
      [0.68, 0.53, 0.24],
    ];
  return [
    [0.24, 0.37, 0.12],
    [0.44, 0.31, 0.17],
    [0.52, 0.49, 0.2],
    [0.31, 0.43, 0.18],
    [0.48, 0.3, 0.44],
  ];
}
