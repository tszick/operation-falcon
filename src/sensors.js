import { forward, DEG } from './math.js';
import { terrainHeight, terrainWorld } from './terrain.js';
import { terrainSightCeiling } from './terrainSight.js';
// 4/3 effective Earth radius is a standard-atmosphere approximation. Refraction,
// clutter and classified radar performance are deliberately not simulated in detail.
const earthRadius = (6371000 * 4) / 3;
export const radarHorizon = (a, b) =>
  Math.sqrt(2 * earthRadius * Math.max(0, a)) + Math.sqrt(2 * earthRadius * Math.max(0, b));
const sightCache = new Map();
// Reuse only nearly identical sight rays (<=8 m horizontally, <=1 m vertically).
// Angular floor, range and horizon are still checked on every call.
function clearRadarLine(source, target, a, b) {
  const key = source.id ?? source.spec?.id ?? source.position;
  let cache = sightCache.get(key);
  if (!cache) {
    if (sightCache.size >= 128) sightCache.clear();
    cache = new WeakMap();
    sightCache.set(key, cache);
  }
  const old = cache.get(target),
    coords = [a.x, a.y, a.z, b.x, b.y, b.z];
  if (
    old?.revision === terrainWorld.revision &&
    coords.every((v, i) => Math.abs(v - old.coords[i]) <= (i % 3 === 1 ? 1 : 8))
  )
    return old.clear;
  const ceiling = terrainSightCeiling(a, b),
    distance = Math.hypot(b.x - a.x, b.z - a.z),
    sag = (distance * distance) / (8 * earthRadius);
  let clear = true;
  if (Math.min(a.y, b.y) - sag <= ceiling) {
    const steps = Math.min(512, Math.max(8, Math.ceil(distance / 100)));
    for (let i = 1; i < steps; i++) {
      const f = i / steps,
        x = a.x + (b.x - a.x) * f,
        z = a.z + (b.z - a.z) * f,
        y = a.y + (b.y - a.y) * f - (distance * distance * f * (1 - f)) / (2 * earthRadius);
      if (y < terrainHeight(x, z)) {
        clear = false;
        break;
      }
    }
  }
  cache.set(target, { revision: terrainWorld.revision, coords, clear });
  return clear;
}
export function radarVisibility(source, target) {
  const range = source.spec?.radarRange || 0,
    a = source.position.clone();
  if (source.ground) a.y += source.spec?.radarAntennaHeight ?? 6;
  const b = target.position,
    delta = b.clone().sub(a),
    distance = delta.length(),
    horizontal = Math.hypot(delta.x, delta.z);
  if (distance >= range) return { visible: false, reason: 'range' };
  if (
    source.orientation &&
    forward(source.orientation).dot(delta.clone().scale(1 / Math.max(1e-12, distance))) <=
      Math.cos((source.spec.radarCone ?? 60) * DEG)
  )
    return { visible: false, reason: 'cone' };
  // The upward lower edge belongs to this game's generic SAM radar, not all real
  // radars. Elevated sites can have a larger blind sector below their antenna.
  const elevation =
    Math.atan2(delta.y - (horizontal * horizontal) / (2 * earthRadius), horizontal) / DEG;
  if (
    source.ground &&
    target.kind !== 'ground' &&
    elevation < (source.spec?.radarMinElevation ?? -90)
  )
    return { visible: false, reason: 'low-elevation', elevation };
  if (horizontal > radarHorizon(a.y, b.y)) return { visible: false, reason: 'horizon' };
  if (!clearRadarLine(source, target, a, b)) return { visible: false, reason: 'terrain' };
  return { visible: true, reason: 'contact' };
}
export const radarContact = (source, target) => radarVisibility(source, target).visible;
