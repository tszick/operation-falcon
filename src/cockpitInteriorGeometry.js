import { hudGlassPoints } from './hudGlassGeometry.js';
import { cabinSurfaceVisible } from './cabinOcclusion.js';
// Eye-centred airframe coordinates: +X right, +Y up, +Z forward.
// Solid panels occlude the world; canopy, combiner and floor windows remain open.
const palette = {
  hull: '#1c2025',
  wall: '#292e34',
  deck: '#394149',
  edge: '#77838e',
  trim: '#a4adb5',
  control: '#343b43',
};
export function cockpitFloorWindows(half) {
  const inner = Math.max(0.3, half - 0.655),
    outer = half - 0.04;
  return [-1, 1].map((side) => ({
    x0: Math.min(side * inner, side * outer),
    x1: Math.max(side * inner, side * outer),
    z0: 0.13,
    z1: 1.17,
  }));
}
function cutFloor(rect, hole) {
  const x0 = Math.max(rect.x0, hole.x0),
    x1 = Math.min(rect.x1, hole.x1),
    z0 = Math.max(rect.z0, hole.z0),
    z1 = Math.min(rect.z1, hole.z1);
  if (x0 >= x1 || z0 >= z1) return [rect];
  return [
    { x0: rect.x0, x1: x0, z0: rect.z0, z1: rect.z1 },
    { x0: x1, x1: rect.x1, z0: rect.z0, z1: rect.z1 },
    { x0, x1, z0: rect.z0, z1: z0 },
    { x0, x1, z0: z1, z1: rect.z1 },
  ].filter((r) => r.x1 - r.x0 > 1e-8 && r.z1 - r.z0 > 1e-8);
}
export function cockpitInteriorGeometry(aspect = 16 / 9) {
  const shapes = [];
  const face = (part, points, fill = palette.hull, stroke = palette.edge, width = 1) =>
    shapes.push({ part, points, fill, stroke, width });
  const closedFace = (part, points, fill, center) => {
    const a = points[1].map((v, i) => v - points[0][i]),
      b = points[2].map((v, i) => v - points[0][i]);
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const c = points[0].map((v, i) => v - center[i]);
    const outward = n.reduce((sum, v, i) => sum + v * c[i], 0) >= 0 ? 1 : -1;
    if (outward < 0) points.reverse();
    face(part, points, fill);
    shapes.at(-1).frontFacing =
      outward * n.reduce((sum, v, i) => sum + v * points[0][i], 0) < -1e-10;
  };
  const box = (part, x0, y0, z0, x1, y1, z1, fill = palette.control) => {
    const p = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ];
    for (const indices of [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [3, 2, 6, 7],
      [0, 3, 7, 4],
      [1, 5, 6, 2],
    ])
      closedFace(
        part,
        indices.map((i) => p[i]),
        fill,
        [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      );
  };
  const beam = (part, a, b, r, fill = palette.deck) => {
    const delta = b.map((v, i) => v - a[i]),
      length = Math.hypot(...delta),
      n = delta.map((v) => v / length);
    const seed = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const cross = (u, v) => [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const c = cross(n, seed),
      scale = r / Math.hypot(...c),
      u = c.map((v) => v * scale),
      v = cross(n, u);
    const corners = (p) =>
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([su, sv]) => p.map((q, i) => q + su * u[i] + sv * v[i]));
    const p = [...corners(a), ...corners(b)];
    for (const f of [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [3, 2, 6, 7],
      [0, 3, 7, 4],
      [1, 5, 6, 2],
    ])
      closedFace(
        part,
        f.map((i) => p[i]),
        fill,
        a.map((v, i) => (v + b[i]) / 2),
      );
  };
  const half = Math.max(0.82, Math.min(1.2, aspect / 1.6));
  const floorWindows = cockpitFloorWindows(half);
  // Short plates keep painter-order occlusion local: a single eye-crossing
  // floor polygon could otherwise paint over the more distant rudder pedals.
  for (let iz = 0; iz < 16; iz++)
    for (let ix = 0; ix < 4; ix++) {
      const x0 = -half + (ix * half) / 2,
        x1 = x0 + half / 2;
      const z0 = -1.4 + (iz * 2.65) / 16,
        z1 = z0 + 2.65 / 16;
      let plates = [{ x0, x1, z0, z1 }];
      for (const hole of floorWindows) plates = plates.flatMap((r) => cutFloor(r, hole));
      for (const r of plates)
        face(
          'floor',
          [
            [r.x0, -0.95, r.z0],
            [r.x1, -0.95, r.z0],
            [r.x1, -0.95, r.z1],
            [r.x0, -0.95, r.z1],
          ],
          palette.hull,
        );
    }
  for (const hole of floorWindows) {
    const { x0, x1, z0, z1 } = hole;
    const corners = [
      [x0, -0.944, z0],
      [x1, -0.944, z0],
      [x1, -0.944, z1],
      [x0, -0.944, z1],
    ];
    face('floor-window-glass', corners, 'none', '#a9c1cc99', 0.8);
    for (let i = 0; i < 4; i++)
      beam('floor-window-frame', corners[i], corners[(i + 1) % 4], 0.009, palette.trim);
  }
  face(
    'forward-bulkhead',
    [
      [-half, -0.95, 1.22],
      [half, -0.95, 1.22],
      [half, -0.36, 1.22],
      [-half, -0.36, 1.22],
    ],
    palette.wall,
  );
  face(
    'rear-bulkhead',
    [
      [-half, -0.95, -1.4],
      [-half, 0.15, -1.4],
      [half, 0.15, -1.4],
      [half, -0.95, -1.4],
    ],
    palette.wall,
  );
  for (const side of [-1, 1]) {
    const outer = side * half,
      inner = side * (half - 0.26);
    face(
      'sidewall',
      [
        [outer, -0.95, -1.4],
        [outer, -0.95, 1.22],
        [outer, -0.22, 1.22],
        [outer, -0.22, -1.4],
      ],
      palette.wall,
    );
    box(
      'side-console',
      Math.min(outer, inner),
      -0.58,
      -0.8,
      Math.max(outer, inner),
      -0.42,
      0.92,
      palette.deck,
    );
    beam('canopy-sill', [outer, -0.22, -1.4], [outer, -0.22, 1.22], 0.035);
    // Front windshield posts continue into longitudinal roof rails.
    const front = [side * half * 0.72, 0.66, 1.08],
      foot = [outer, -0.25, 0.92];
    beam('windshield-post', foot, front, 0.018);
    beam('canopy-rail', front, [side * half * 0.6, 0.83, -0.25], 0.02);
    beam('canopy-rail', [side * half * 0.6, 0.83, -0.25], [side * half * 0.72, 0.53, -1.2], 0.022);
    beam('rear-canopy-frame', [side * half * 0.72, 0.53, -1.2], [outer, -0.22, -1.2], 0.025);
    // Seams and ventilation slots follow the opaque console surface.
    for (const z of [-0.5, -0.15, 0.2, 0.55]) {
      box(
        'console-module',
        Math.min(outer, inner) + 0.035,
        -0.418,
        z,
        Math.max(outer, inner) - 0.035,
        -0.398,
        z + 0.18,
        palette.hull,
      );
      for (let i = 0; i < 3; i++)
        beam(
          'console-line',
          [inner + side * 0.04, -0.393, z + 0.035 + i * 0.05],
          [outer - side * 0.05, -0.393, z + 0.035 + i * 0.05],
          0.0025,
          palette.trim,
        );
    }
    const seamX = side * 0.38,
      opening = floorWindows.find((hole) => seamX > hole.x0 && seamX < hole.x1),
      segments = opening
        ? [
            [-0.9, opening.z0],
            [opening.z1, 1.2],
          ]
        : [[-0.9, 1.2]];
    for (const [from, to] of segments)
      beam('floor-seam', [seamX, -0.943, from], [seamX, -0.943, to], 0.0025, palette.edge);
  }
  const arch = [
    [-half * 0.72, 0.66, 1.08],
    [-half * 0.4, 0.89, 1.04],
    [0, 0.96, 1.02],
    [half * 0.4, 0.89, 1.04],
    [half * 0.72, 0.66, 1.08],
  ];
  for (let i = 1; i < arch.length; i++) beam('windshield-arch', arch[i - 1], arch[i], 0.019);
  // Raised glare shield and structural support under the HUD combiner.
  box('glare-shield', -half, -0.39, 0.94, half, -0.34, 1.19, palette.hull);
  for (const side of [-1, 1]) {
    box(
      'hud-mount',
      side * 0.46 - 0.018,
      -0.34,
      0.97,
      side * 0.46 + 0.018,
      -0.2,
      1.015,
      palette.deck,
    );
    box(
      'rudder-pedal',
      side * 0.24 - 0.09,
      -0.94,
      0.62,
      side * 0.24 + 0.09,
      -0.88,
      0.83,
      palette.control,
    );
  }
  face('hud-glass', hudGlassPoints(aspect), 'none', '#a0b1bc66', 1);
  box('stick-base', -0.06, -0.94, 0.1, 0.12, -0.83, 0.28, palette.wall);
  beam('control-stick', [0.03, -0.85, 0.19], [0.03, -0.49, 0.27], 0.022, palette.control);
  box('stick-grip', -0.014, -0.53, 0.23, 0.075, -0.38, 0.31, palette.hull);
  box('throttle-lever', -half + 0.1, -0.42, -0.13, -half + 0.19, -0.34, 0.08, palette.control);
  return shapes;
}
// A modest forward/up lean lets the pilot look over the glare shield.
// It returns continuously to the normal seat position with the head angle.
export function cabinEyeOffset(pitch = 0) {
  const t = Math.max(0, Math.min(1, (-pitch - 0.08) / 0.53)),
    lean = t * t * (3 - 2 * t);
  return [0, 0.3 * lean, 0.2 * lean];
}
export function cabinCameraRotation(yaw, pitch, eye = [0, 0, 0]) {
  return [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch), ...eye];
}
export function cabinCameraPoint(
  [x, y, z],
  yaw,
  pitch,
  rotation = cabinCameraRotation(yaw, pitch),
) {
  const [cy, sy, cp, sp, ex = 0, ey = 0, ez = 0] = rotation;
  x -= ex;
  y -= ey;
  z -= ez;
  const rx = cy * x - sy * z,
    rz = sy * x + cy * z;
  return [rx, cp * y - sp * rz, sp * y + cp * rz];
}
// Sutherland–Hodgman clipping retains the visible portion of near-plane crossings.
export function clipCabinPolygon(points, near = 0.04) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      inside = a[2] >= near,
      next = b[2] >= near;
    if (inside) out.push(a);
    if (inside !== next) {
      const t = (near - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]);
    }
  }
  return out;
}
export function clipCabinEdge(points, near = 0.04) {
  const [a, b] = points,
    insideA = a[2] >= near,
    insideB = b[2] >= near;
  if (!insideA && !insideB) return [];
  if (insideA && insideB) return points;
  const t = (near - a[2]) / (b[2] - a[2]);
  const crossing = a.map((v, i) => v + (b[i] - v) * t);
  return insideA ? [a, crossing] : [crossing, b];
}
export function projectCabinShape(
  shape,
  width,
  height,
  yaw = 0,
  pitch = 0,
  rotation = cabinCameraRotation(yaw, pitch),
) {
  if (!cabinSurfaceVisible(shape, rotation.slice(4))) return null;
  const cameraPoints = shape.points.map((p) => cabinCameraPoint(p, yaw, pitch, rotation));
  const points = shape.open ? clipCabinEdge(cameraPoints) : clipCabinPolygon(cameraPoints);
  if (points.length < (shape.open ? 2 : 3)) return null;
  const focal = height * 0.8;
  const projected = points.map(([x, y, z]) => [
    width * 0.5 + (focal * x) / z,
    height * 0.53 - (focal * y) / z,
  ]);
  if (
    projected.every(([x]) => x < -4) ||
    projected.every(([x]) => x > width + 4) ||
    projected.every(([, y]) => y < -4) ||
    projected.every(([, y]) => y > height + 4)
  )
    return null;
  return { depth: points.reduce((sum, p) => sum + p[2], 0) / points.length, points: projected };
}
