import { missionWeather } from './flightEnvironment.js';
import { generateIslands, oceanHeight } from './oceanEnvironment.js';
import { Vec3, clamp } from './math.js';
export const runway = { halfWidth: 45, halfLength: 1600, heading: 0 };
// The runway renderer and ground collision use these same physical hangar boxes.
export const homeHangars = [-900, -650, -400].map((z) => ({
  x: 190,
  z,
  halfWidth: 60,
  height: 22,
  halfLength: 100,
}));
let revision = 0;
export let terrainWorld = { revision: 0, river: null, road: null, canyon: null, peaks: [] };
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
function corridor(anchor, rng) {
  return {
    x: anchor.x,
    z: anchor.z,
    angle: rng() * Math.PI * 2,
    bend: 250 + rng() * 650,
    phase: rng() * 6.28,
  };
}
export function configureTerrain(m, anchor = new Vec3(22000, 0, 0), rng = Math.random) {
  const world = buildTerrain(m, anchor, rng);
  world.weather = missionWeather(m);
  return world;
}
function buildTerrain(m, anchor, rng) {
  if (m.battlefield?.environment) {
    terrainWorld = {
      revision: ++revision,
      skySeed: (revision * 22695477) >>> 0,
      river: null,
      road: null,
      canyon: null,
      peaks: [],
      ...m.battlefield.environment,
    };
    return terrainWorld;
  }
  if (m.noAirfield) {
    terrainWorld = {
      revision: ++revision,
      skySeed: 417,
      noAirfield: true,
      river: null,
      road: null,
      canyon: null,
      peaks: [],
    };
    return terrainWorld;
  }
  if (m.naval || m.id === 'carrier-defense') {
    terrainWorld = {
      revision: ++revision,
      skySeed: (revision * 22695477) >>> 0,
      ocean: true,
      islands: generateIslands(Math.floor(rng() * 4294967296)),
      river: null,
      road: null,
      canyon: null,
      peaks: [],
    };
    return terrainWorld;
  }
  if (m.id === 'practice-bombing') {
    terrainWorld = {
      revision: ++revision,
      skySeed: (revision * 22695477) >>> 0,
      river: null,
      road: null,
      canyon: null,
      peaks: [],
      site: { x: 4500, z: 8500, height: 80 },
    };
    return terrainWorld;
  }
  if (m.id === 'canyon') {
    terrainWorld = {
      revision: ++revision,
      skySeed: (revision * 22695477) >>> 0,
      river: null,
      road: null,
      canyon: {
        x: 12000,
        z: -12000,
        angle: Math.PI / 2,
        bend: 650,
        phase: 0,
        width: 550,
        depth: 750,
        training: true,
      },
      peaks: [{ x: 11611, z: 3000, height: 1450, radius: 2600, platform: 0 }],
    };
    return terrainWorld;
  }
  const river =
    m.id === 'bridge' || rng() < 0.55
      ? {
          ...corridor(m.id === 'bridge' ? anchor : { x: anchor.x + 5500, z: anchor.z + 4000 }, rng),
          width: 70 + rng() * 230,
          level: 25 + rng() * 35,
        }
      : null;
  if (
    river &&
    ['bunker', 'sam'].includes(m.id) &&
    Math.abs(pathCoordinates(river, anchor.x, anchor.z).across) < 2500
  ) {
    river.x += Math.sin(river.angle) * 6000;
    river.z -= Math.cos(river.angle) * 6000;
  }
  const road =
    m.id === 'convoy' || m.id === 'bridge' || rng() < 0.65
      ? { ...corridor(anchor, rng), width: 14 }
      : null;
  if (m.id === 'bridge' && road) {
    road.angle = river.angle + Math.PI / 2;
    road.bend = 0;
  }
  const canyon =
    rng() < 0.35
      ? {
          ...corridor({ x: anchor.x + 7000, z: anchor.z - 5000 }, rng),
          width: 400 + rng() * 800,
          depth: 220 + rng() * 380,
        }
      : null;
  const peaks = [];
  if (['bunker', 'sam'].includes(m.id))
    peaks.push({
      x: anchor.x,
      z: anchor.z,
      height: 850 + rng() * 650,
      radius: 2000 + rng() * 1500,
      platform: 130,
    });
  if (rng() < 0.55)
    peaks.push({
      x: anchor.x + 5000 + rng() * 8000,
      z: anchor.z - 6000 + rng() * 12000,
      height: 900 + rng() * 1500,
      radius: 2000 + rng() * 2500,
      platform: 0,
    });
  if (road && m.id !== 'bridge') {
    road.detours = peaks
      .map((p) => {
        const { along, across } = pathCoordinates(road, p.x, p.z);
        return {
          along,
          spread: p.radius * 1.6,
          offset: -(Math.sign(across) || 1) * Math.max(0, p.radius * 1.55 - Math.abs(across)),
        };
      })
      .filter((d) => Math.abs(d.offset) > 1);
    road.keepAnchor = m.id === 'convoy';
  }
  if (river) {
    // Route the river around protected airfields instead of cutting holes in water.
    river.detours = [];
    river.keepAnchor = m.id === 'bridge';
    const avoid = (point, radius) => {
      const { along, across } = pathCoordinates(river, point.x, point.z);
      if (Math.abs(across) < radius)
        river.detours.push({
          along,
          spread: radius * 1.8,
          offset: -(Math.sign(across) || 1) * (radius * 1.7 - Math.abs(across)),
        });
    };
    const homeClearance = Math.hypot(Math.sin(river.angle) * 6500, Math.cos(river.angle) * 12000);
    avoid({ x: 0, z: 0 }, homeClearance);
    if (['airbase', 'air-superiority'].includes(m.id)) avoid(anchor, 1900);
  }
  terrainWorld = {
    revision: ++revision,
    skySeed: (revision * 22695477) >>> 0,
    river,
    road,
    canyon,
    peaks,
    bridge: m.id === 'bridge' ? { span: river.width + 70 } : null,
    site: ['airbase', 'air-superiority'].includes(m.id)
      ? { x: anchor.x, z: anchor.z, height: 180 }
      : null,
  };
  return terrainWorld;
}
function pathOffset(path, t) {
  let offset = path.bend * (Math.sin(t / 6000 + path.phase) - Math.sin(path.phase));
  if (path.training)
    offset +=
      420 * Math.sin(t / 1400) * smooth((t + 1800) / 1800) * (1 - smooth((t - 7500) / 3000));
  for (const d of path.detours || [])
    offset +=
      d.offset *
      (Math.exp(-(((t - d.along) / d.spread) ** 2)) -
        (path.keepAnchor
          ? Math.exp(-((d.along / d.spread) ** 2)) * Math.exp(-((t / 4500) ** 2))
          : 0));
  return offset;
}
export function pathPoint(path, t) {
  const offset = pathOffset(path, t),
    c = Math.cos(path.angle),
    s = Math.sin(path.angle);
  return new Vec3(path.x + c * t - s * offset, 0, path.z + s * t + c * offset);
}
export function pathCoordinates(path, x, z) {
  const dx = x - path.x,
    dz = z - path.z,
    c = Math.cos(path.angle),
    s = Math.sin(path.angle),
    along = dx * c + dz * s;
  return { along, across: -dx * s + dz * c - pathOffset(path, along) };
}
export function pathHeading(path, t) {
  const a = pathPoint(path, t),
    b = pathPoint(path, t + 2);
  return Math.atan2(b.x - a.x, b.z - a.z);
}
function landscape(x, z) {
  const distance = Math.hypot(x, z),
    flatten = clamp((distance - 2100) / 2200, 0, 1),
    waves =
      Math.sin(x * 0.00043 + 1.4) * Math.cos(z * 0.00036) +
      0.4 * Math.sin(x * 0.0011 - z * 0.0006) +
      0.16 * Math.sin(z * 0.002 + x * 0.0019);
  let h = Math.max(0, 180 + waves * 240);
  const canyon = terrainWorld.canyon;
  if (canyon) {
    const { along, across } = pathCoordinates(canyon, x, z),
      d = Math.abs(across);
    if (canyon.training) {
      const blend = smooth((along + 3500) / 1500) * (1 - smooth((along - 19000) / 2000)),
        floor = 80 + 25 * Math.sin(along / 2600),
        profile = floor + (850 + 80 * Math.sin(along / 1800) - floor) * smooth((d - 400) / 700);
      h = h * (1 - blend) + profile * blend;
    } else h -= canyon.depth * (1 - smooth((d - canyon.width * 0.25) / canyon.width));
  }
  for (const p of terrainWorld.peaks) {
    const d = Math.max(0, Math.hypot(x - p.x, z - p.z) - p.platform);
    h = Math.max(h, p.height * Math.exp(-2.8 * (d / p.radius) ** 2));
  }
  const river = terrainWorld.river;
  if (river) {
    const d = Math.abs(pathCoordinates(river, x, z).across),
      half = river.width * 0.5,
      blend = 1 - smooth((d - half - 12) / 300),
      bed = river.level + 8 - 16 * (1 - smooth((d - half + 12) / 24));
    h = h * (1 - blend) + bed * blend;
  }
  const site = terrainWorld.site;
  if (site) {
    const blend = 1 - smooth((Math.hypot(x - site.x, z - site.z) - 850) / 650);
    h = h * (1 - blend) + site.height * blend;
  }
  return Math.max(0, h) * flatten;
}
export function terrainHeight(x, z) {
  if (terrainWorld.ocean) return oceanHeight(terrainWorld.islands || [], x, z);
  let base = landscape(x, z);
  const road = terrainWorld.road;
  if (road) {
    const { along, across } = pathCoordinates(road, x, z),
      blend = 1 - smooth((Math.abs(across) - road.width * 0.5) / 18),
      center = pathPoint(road, along);
    base = base * (1 - blend) + landscape(center.x, center.z) * blend;
  }
  if (terrainWorld.noAirfield) return base;
  // Keep the home runway and both three-degree approach corridors unobstructed.
  const across = 1 - smooth((Math.abs(x) - 120) / 480),
    along = smooth((Math.abs(z) - 1600) / 500) * (1 - smooth((Math.abs(z) - 8500) / 2000));
  base *= 1 - across * along;
  for (const f of terrainWorld.airfields || []) {
    const dx = x - f.x,
      dz = z - f.z,
      c = Math.cos(f.heading),
      s = Math.sin(f.heading),
      lateral = dx * c - dz * s,
      longitudinal = dx * s + dz * c,
      blend = Math.max(
        (1 - smooth((Math.abs(lateral) - 70) / 160)) *
          (1 - smooth((Math.abs(longitudinal) - 1800) / 700)),
        (1 - smooth((Math.abs(lateral) - 100) / 400)) *
          (1 - smooth((Math.abs(longitudinal) - 8500) / 2000)),
      );
    base = base * (1 - blend) + f.elevation * blend;
  }
  return base;
}
export function onRunway(p) {
  return Math.abs(p.x) < runway.halfWidth && Math.abs(p.z) < runway.halfLength;
}
export function convoyPose(t, offset = 0) {
  const road = terrainWorld.road;
  if (!road)
    return { position: t.position.clone().add(new Vec3(0, 0, offset)), heading: t.heading || 0 };
  const distance = (t.routeDistance || 0) + offset * (t.routeDirection || 1),
    p = pathPoint(road, distance);
  p.y = terrainHeight(p.x, p.z) + 0.05;
  if (terrainWorld.bridge) {
    const half = terrainWorld.bridge.span * 0.5,
      blend = clamp((half + 220 - Math.abs(distance)) / 220, 0, 1);
    p.y = p.y * (1 - blend) + (terrainWorld.river.level + 16.15) * blend;
  }
  return {
    position: p,
    heading: pathHeading(road, distance) + (t.routeDirection < 0 ? Math.PI : 0),
  };
}
