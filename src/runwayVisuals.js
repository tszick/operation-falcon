import { Vec3, Quat, DEG } from './math.js';
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

const paintCache = new Map();
// Coplanar filled strips have physical width; they are paint, not glowing vectors.
export function runwayPaintMesh(height = 0.26) {
  if (paintCache.has(height)) return paintCache.get(height);
  const points = [],
    faces = [];
  const rect = (x0, z0, x1, z1) => {
    const i = points.length;
    points.push(
      ...[
        [x0, height, z0],
        [x1, height, z0],
        [x1, height, z1],
        [x0, height, z1],
      ].map((p) => new Vec3(...p)),
    );
    faces.push([i, i + 1, i + 2, i + 3]);
  };
  for (const x of [-43, 42]) rect(x, -1580, x + 1, 1580);
  for (let z = -1440; z < 1440; z += 90) rect(-0.9, z, 0.9, z + 36);
  for (const direction of [-1, 1]) {
    const strip = (x0, x1, a, b) =>
      rect(x0, Math.min(direction * a, direction * b), x1, Math.max(direction * a, direction * b));
    // Threshold piano keys, then paired aiming-point blocks for either approach.
    for (const x of [-35, -27, -19, -11, 7, 15, 23, 31]) strip(x, x + 4, 1500, 1550);
    strip(-40, 40, 1574, 1576);
    for (const x of [-27, 18]) strip(x, x + 9, 1220, 1265);
    for (const distance of [920, 1070])
      for (const x of [-31, -24, 20, 27]) strip(x, x + 4, distance, distance + 22);
  }
  const mesh = { points, faces, details: [], radius: 1601 };
  paintCache.set(height, mesh);
  return mesh;
}

let gates;
export function approachGateMesh() {
  if (gates) return gates;
  const points = [],
    details = [];
  for (const z of [-2600, -3600]) {
    const y = (-z - 1600) * Math.tan(3 * DEG) + 3;
    for (const [a, b] of [
      [
        [-60, y - 12, z],
        [-60, y + 12, z],
      ],
      [
        [-60, y + 12, z],
        [60, y + 12, z],
      ],
      [
        [60, y + 12, z],
        [60, y - 12, z],
      ],
    ]) {
      details.push([points.length, points.length + 1]);
      points.push(new Vec3(...a), new Vec3(...b));
    }
  }
  return (gates = { points, details, faces: [], radius: 3601 });
}
let lamps;
export function runwayLamps() {
  if (lamps) return lamps;
  lamps = [];
  for (let z = -1560; z <= 1560; z += 60)
    for (const x of [-48, 48])
      lamps.push({ position: new Vec3(x, 0.65, z), kind: Math.abs(z) > 1000 ? 'caution' : 'edge' });
  for (const end of [-1, 1])
    for (let x = -42; x <= 42; x += 7)
      lamps.push({ position: new Vec3(x, 0.45, end * 1590), kind: end < 0 ? 'south' : 'north' });
  return lamps;
}
const lampMeshes = new Map();
export function runwayLampMesh(kind) {
  if (lampMeshes.has(kind)) return lampMeshes.get(kind);
  const points = [],
    faces = [];
  for (const lamp of runwayLamps().filter((l) => l.kind === kind)) {
    const p = lamp.position,
      start = points.length;
    for (const [x, y, z] of [
      [0, 0.14, 0],
      [-0.18, 0, 0],
      [0, 0, 0.18],
      [0.18, 0, 0],
      [0, 0, -0.18],
      [0, -0.2, 0],
    ])
      points.push(p.clone().add(new Vec3(x, y, z)));
    for (let i = 1; i <= 4; i++) {
      const next = (i % 4) + 1;
      faces.push([start, start + i, start + next], [start + 5, start + next, start + i]);
    }
  }
  const mesh = { points, faces, details: [], radius: 1602 };
  lampMeshes.set(kind, mesh);
  return mesh;
}
export function runwayLampColor(kind, cameraZ) {
  if (kind === 'edge') return '#fff5d8';
  if (kind === 'caution') return '#ffd778';
  return (kind === 'south' ? cameraZ < -1590 : cameraZ > 1590) ? '#62ffac' : '#ff655b';
}
export function renderAirfield(r, position, rotation, { gates = false, lights = true } = {}) {
  r.mesh(runwaySurfaceMesh(), position, rotation, 1, '#68716b', null, 'asphalt');
  r.mesh(
    runwayPaintMesh(),
    position,
    rotation,
    1,
    r.surfaceMode === 'night' ? '#a5adb1' : '#e3e5dd',
    null,
    'paint',
  );
  if (gates) r.mesh(approachGateMesh(), position, rotation, 1, '#c8e4aa', null, 'runway');
  if (!lights) return;
  const cameraZ = new Quat(-rotation.x, -rotation.y, -rotation.z, rotation.w).rotate(
    r.camera.clone().sub(position),
  ).z;
  for (const kind of ['edge', 'caution', 'south', 'north'])
    r.mesh(
      runwayLampMesh(kind),
      position,
      rotation,
      1,
      runwayLampColor(kind, cameraZ),
      null,
      'lamp',
    );
  (r.runwayLightQueue ??= []).push({ position, rotation, cameraZ });
}
// A small optical halo supplements the depth-tested luminous lamp meshes.
// Only nearby visible lights receive halos; geometry remains in the shared depth pass.
export function renderRunwayLightGlows(r) {
  const c = r.ctx,
    night = r.surfaceMode === 'night',
    opacity = night ? 0.65 : 0.16;
  for (const field of r.runwayLightQueue || [])
    for (const lamp of runwayLamps()) {
      const point = field.rotation.rotate(lamp.position).add(field.position);
      const distance = point.distance(r.camera);
      if (distance > 14000) continue;
      const projected = r.projectWorld(point, 12);
      if (!projected) continue;
      const color = runwayLampColor(lamp.kind, field.cameraZ),
        size = night ? 3.5 : 1.8;
      const gradient = c.createRadialGradient(
        projected.x,
        projected.y,
        0,
        projected.x,
        projected.y,
        size,
      );
      gradient.addColorStop(0, color + 'd9');
      gradient.addColorStop(0.2, color + '70');
      gradient.addColorStop(1, color + '00');
      c.save();
      c.globalAlpha = opacity * Math.min(1, (14000 - distance) / 3000);
      c.fillStyle = gradient;
      c.fillRect(projected.x - size, projected.y - size, size * 2, size * 2);
      c.restore();
    }
}
