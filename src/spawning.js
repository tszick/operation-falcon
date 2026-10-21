import { Vec3 } from './math.js';
import { terrainHeight } from './terrain.js';
export function targetSpawn(m, rng = Math.random) {
  const bearing = rng() * Math.PI * 2,
    radius = (m.kind === 'air' ? 22000 : 18000) + rng() * 10000;
  const position = new Vec3(Math.sin(bearing) * radius, 0, Math.cos(bearing) * radius);
  position.y = m.kind === 'air' ? 1800 + rng() * 1800 : terrainHeight(position.x, position.z) + 8;
  const rawHeading =
      Math.atan2(-position.x, -position.z) + (m.objective === 'escort' ? 0 : (rng() - 0.5) * 0.5),
    heading = Math.atan2(Math.sin(rawHeading), Math.cos(rawHeading));
  const velocity =
    m.kind === 'air'
      ? new Vec3(Math.sin(heading) * m.speed, 0, Math.cos(heading) * m.speed)
      : new Vec3();
  return {
    position,
    velocity,
    heading,
    spawnRadius: radius,
    airspaceRadius: radius + 4000,
    combatSeed: Math.floor(rng() * 0x100000000),
  };
}
