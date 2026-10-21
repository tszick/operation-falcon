import { Vec3, DEG } from './math.js';
const cache = new Map();
// The same fixed runway markings as the Canvas path, batched into GPU lines.
export function homeRunwayMesh(gates = true) {
  if (cache.has(gates)) return cache.get(gates);
  const points = [],
    details = [],
    line = (a, b) => {
      details.push([points.length, points.length + 1]);
      points.push(new Vec3(...a), new Vec3(...b));
    };
  line([-45, 0.8, -1600], [-45, 0.8, 1600]);
  line([45, 0.8, -1600], [45, 0.8, 1600]);
  line([-45, 0.8, -1600], [45, 0.8, -1600]);
  line([-45, 0.8, 1600], [45, 0.8, 1600]);
  for (let z = -1500; z < 1600; z += 130) line([0, 1, z], [0, 1, z + 55]);
  for (let z = -1500; z < 1600; z += 140) for (const x of [-48, 48]) line([x, 2, z], [x, 5, z]);
  for (const z of [-1450, 1450])
    for (let x = -35; x <= 35; x += 14) line([x, 1, z], [x, 1, z + 60]);
  if (gates)
    for (const z of [-2600, -3600]) {
      const y = (-z - 1600) * Math.tan(3 * DEG) + 3;
      line([-60, y - 12, z], [-60, y + 12, z]);
      line([-60, y + 12, z], [60, y + 12, z]);
      line([60, y + 12, z], [60, y - 12, z]);
    }
  const mesh = { points, details, faces: [], radius: Math.max(...points.map((p) => p.length())) };
  cache.set(gates, mesh);
  return mesh;
}

const surfaces = new Map();
// Separate opaque pavement, so markings remain visible without model edge lines.
export function runwaySurfaceMesh(height = 0.18) {
  if (!surfaces.has(height))
    surfaces.set(height, {
      points: [
        [-45, height, -1600],
        [45, height, -1600],
        [45, height, 1600],
        [-45, height, 1600],
      ].map((p) => new Vec3(...p)),
      faces: [[0, 1, 2, 3]],
      details: [],
      radius: 1601,
    });
  return surfaces.get(height);
}
