import { Vec3, Quat, clamp, DEG } from './math.js';
import { roadSurface } from './terrainFeatures.js';
import { terrainHeight, terrainWorld, pathCoordinates } from './terrain.js';
const vehicleTypes = new Set(['truck', 'convoy', 'mobile-sam', 'mobile-jammer', 'drone-command']);
export const isGroundVehicle = (t) => vehicleTypes.has(typeof t === 'string' ? t : t.type);
// Six wheel contact points shared by the truck-based vehicle models.
export const vehicleWheelContacts = [-1.65, 1.65].flatMap((x) =>
  [-4, -1.8, 3.5].map((z) => new Vec3(x, 0.15, z)),
);
export function vehicleSupportHeight(x, z) {
  const height = terrainHeight(x, z);
  for (const road of [terrainWorld.road, ...(terrainWorld.cityRoads || [])]) {
    if (!road) continue;
    const { along, across } = pathCoordinates(road, x, z);
    if (
      Math.abs(across) > road.width * 0.5 + 0.25 ||
      along < (road.min ?? -Infinity) ||
      along > (road.max ?? Infinity)
    )
      continue;
    // Use the same pavement/deck height as the rendered road, including bridge ramps.
    return Math.max(height, roadSurface(road, new Vec3(x, 0, z)));
  }
  return height;
}
export function vehicleGroundPose(position, heading = 0, heightAt = vehicleSupportHeight) {
  const yaw = Quat.euler(heading, 0, 0),
    sample = (x, z) => {
      const p = yaw.rotate(new Vec3(x, 0, z)).add(position);
      return heightAt(p.x, p.z);
    },
    front = (sample(-1.65, 3.5) + sample(1.65, 3.5)) * 0.5,
    rear = (sample(-1.65, -4) + sample(1.65, -4)) * 0.5,
    left = [-4, -1.8, 3.5].reduce((sum, z) => sum + sample(-1.65, z), 0) / 3,
    right = [-4, -1.8, 3.5].reduce((sum, z) => sum + sample(1.65, z), 0) / 3,
    pitch = clamp(Math.atan2(front - rear, 7.5), -40 * DEG, 40 * DEG),
    bank = clamp(-Math.atan2((right - left) * Math.cos(pitch), 3.3), -35 * DEG, 35 * DEG),
    rotation = Quat.euler(heading, pitch, bank),
    contacts = vehicleWheelContacts.map((p) => rotation.rotate(p)),
    y = Math.max(...contacts.map((p) => heightAt(position.x + p.x, position.z + p.z) - p.y)) + 0.2;
  return { position: new Vec3(position.x, y, position.z), heading, pitch, bank, rotation };
}
// Stable local detail windows move only after a vehicle travels to a new 150 m tile.
export function groundVehiclePatches(targets, cx = 0, cz = 0) {
  const patches = new Map();
  for (const t of targets) {
    if (!t.alive || t.exited || !isGroundVehicle(t)) continue;
    const x = Math.round(t.position.x / 150) * 150,
      z = Math.round(t.position.z / 150) * 150;
    if (Math.abs(x - cx) > 48000 || Math.abs(z - cz) > 48000) continue;
    const key = `${x}:${z}`,
      radius = t.type === 'convoy' ? 180 : 100;
    patches.set(key, { x, z, radius: Math.max(radius, patches.get(key)?.radius || 0) });
  }
  return [...patches.values()].sort((a, b) => a.x - b.x || a.z - b.z);
}
