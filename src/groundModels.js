import { meshSegmentHit } from './hitGeometry.js';
import { homeHangars } from './terrain.js';
import { renderAirfield } from './runwayVisuals.js';
import { materialFor } from './surfaceStyle.js';
import { Vec3, Quat } from './math.js';
import { terrainWorld, terrainHeight, convoyPose } from './terrain.js';
class Builder {
  constructor() {
    this.points = [];
    this.faces = [];
    this.details = [];
  }
  face(pts) {
    const ids = pts.map((p) => {
      this.points.push(new Vec3(...p));
      return this.points.length - 1;
    });
    this.faces.push(ids);
    return ids;
  }
  line(a, b) {
    this.details.push([this.points.push(new Vec3(...a)) - 1, this.points.push(new Vec3(...b)) - 1]);
  }
  box(x, y, z, w, h, d) {
    const p = [
      [-w, 0, -d],
      [w, 0, -d],
      [w, 0, d],
      [-w, 0, d],
      [-w, h, -d],
      [w, h, -d],
      [w, h, d],
      [-w, h, d],
    ].map((v) => [v[0] + x, v[1] + y, v[2] + z]);
    for (const ids of [
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
      [4, 5, 6, 7],
      [3, 2, 1, 0],
    ])
      this.face(ids.map((i) => p[i]));
  }
  rings(x, z, rings, n = 16) {
    let prev = null;
    for (const [y, r] of rings) {
      const ids = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ids.push(this.points.push(new Vec3(x + Math.cos(a) * r, y, z + Math.sin(a) * r)) - 1);
      }
      if (!prev) this.faces.push([...ids].reverse());
      if (prev)
        for (let i = 0; i < n; i++)
          this.faces.push([prev[i], prev[(i + 1) % n], ids[(i + 1) % n], ids[i]]);
      prev = ids;
    }
    this.faces.push(prev);
  }
  wheel(x, y, z) {
    const start = this.points.length;
    for (const dx of [-0.35, 0.35])
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        this.points.push(new Vec3(x + dx, y + Math.cos(a) * 0.85, z + Math.sin(a) * 0.85));
      }
    this.faces.push(
      Array.from({ length: 10 }, (_, i) => start + i),
      Array.from({ length: 10 }, (_, i) => start + 19 - i),
    );
    for (let i = 0; i < 10; i++)
      this.faces.push([
        start + i,
        start + ((i + 1) % 10),
        start + 10 + ((i + 1) % 10),
        start + 10 + i,
      ]);
  }
  truck(x = 0, z = 0, covered = true) {
    this.box(x, 1, z, 1.5, 1, 5.6);
    this.box(x, 2, z + 3.7, 1.55, 2.7, 1.7);
    this.face([
      [x - 1.3, 3.4, z + 5.42],
      [x + 1.3, 3.4, z + 5.42],
      [x + 1.3, 4.4, z + 5.42],
      [x - 1.3, 4.4, z + 5.42],
    ]);
    this.box(x, 2, z - 1.8, 1.6, covered ? 3.3 : 1.3, 3.6);
    for (const dx of [-1.65, 1.65]) for (const dz of [-4, -1.8, 3.5]) this.wheel(x + dx, 1, z + dz);
  }
  dish(x, y, z) {
    this.line([x, 0, z], [x, y, z]);
    const n = 16,
      r = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2,
        b = ((i + 1) / n) * Math.PI * 2;
      this.face([
        [x, y, z + 1],
        [x + Math.cos(a) * r, y + Math.sin(a) * r, z - 1],
        [x + Math.cos(b) * r, y + Math.sin(b) * r, z - 1],
      ]);
    }
    this.line([x, y, z + 1], [x, y, z - 5]);
    for (const dx of [-5, 5]) this.line([x + dx, y, z - 1], [x, y, z - 5]);
  }
  finish() {
    const unique = [],
      lookup = new Map(),
      remap = this.points.map((p) => {
        const key = `${p.x},${p.y},${p.z}`;
        if (!lookup.has(key)) {
          lookup.set(key, unique.length);
          unique.push(p);
        }
        return lookup.get(key);
      });
    this.points = unique;
    this.faces = this.faces.map((f) => f.map((i) => remap[i]));
    this.details = this.details.map((e) => e.map((i) => remap[i]));
    const bounds = {};
    for (const axis of ['x', 'y', 'z']) {
      const v = this.points.map((p) => p[axis]);
      bounds[axis] = [Math.min(...v), Math.max(...v)];
    }
    return {
      points: this.points,
      faces: this.faces,
      details: this.details,
      bounds,
      radius: Math.max(...this.points.map((p) => p.length())),
    };
  }
}
const cache = new Map();
export function groundMesh(type, span = 220, dimensions = {}) {
  const key =
    type +
    ':' +
    Math.round(span) +
    ':' +
    (dimensions.width || 0) +
    ':' +
    (dimensions.depth || 0) +
    ':' +
    (dimensions.detail || 'near');
  if (cache.has(key)) return cache.get(key);
  const b = new Builder();
  if (type === 'target-range') {
    for (const radius of [25, 50])
      for (let i = 0; i < 64; i++) {
        const a = (i * Math.PI) / 32,
          c = ((i + 1) * Math.PI) / 32;
        b.line(
          [Math.cos(a) * radius, 0.1, Math.sin(a) * radius],
          [Math.cos(c) * radius, 0.1, Math.sin(c) * radius],
        );
      }
    b.line([-50, 0.12, 0], [50, 0.12, 0]);
    b.line([0, 0.12, -50], [0, 0.12, 50]);
    b.box(0, 0.3, 0, 1.8, 1.2, 3.5);
    for (const x of [-2, 2]) b.box(x, 0.1, 0, 0.4, 1.1, 3.7);
    b.box(0, 1.5, -0.3, 1.3, 1, 1.5);
    b.box(0, 2, 3, 0.13, 0.22, 2.5);
  } else if (type === 'carrier' || type === 'destroyer') {
    const carrier = type === 'carrier',
      L = carrier ? 160 : 75,
      W = carrier ? 34 : 9,
      H = carrier ? 20 : 10;
    const lower = [
        [-W * 0.65, 0, -L * 0.88],
        [W * 0.65, 0, -L * 0.88],
        [W * 0.72, 0, L * 0.7],
        [0, 0, L],
        [-W * 0.72, 0, L * 0.7],
      ],
      upper = [
        [-W, H, -L],
        [W, H, -L],
        [W, H, L * 0.72],
        [0, H, L],
        [-W, H, L * 0.72],
      ];
    b.face([...lower].reverse());
    b.face(upper);
    for (let i = 0; i < lower.length; i++) {
      const next = (i + 1) % lower.length;
      b.face([lower[i], lower[next], upper[next], upper[i]]);
    }
    b.box(carrier ? 30 : 6, H + 2, -30, 2.5, 2, 3.5);
    b.box(carrier ? 30 : 6, H + 4, -30, 3, 2, 3);
    if (carrier) {
      b.box(0, H, 0, 36, 0.08, 160);
      b.box(26, H, 12, 7, 19, 28);
      b.box(26, H + 19, 5, 8, 5, 13);
      b.box(26, H + 24, 8, 1.2, 16, 1.2);
      for (const z of [-115, 115]) {
        b.box(-31, H, z, 3, 3, 4);
        b.box(-31, H + 3, z + 3, 1, 1, 5);
      }
    } else {
      b.box(0, H, 0, 6, 12, 23);
      b.box(0, H + 12, 0, 3, 8, 8);
      b.box(0, H + 20, 0, 0.8, 15, 0.8);
      b.box(0, H + 4, -28, 3, 10, 6);
      for (const z of [-48, 43]) {
        b.box(0, H, z, 3, 3, 5);
        b.box(0, H + 3, z + 5, 0.6, 0.6, 6);
      }
      for (const x of [-3, 0, 3])
        for (const z of [26, 30, 34]) b.box(x, H + 0.1, z, 1.2, 0.35, 1.2);
    }
  } else if (type === 'city-building') {
    const w = dimensions.width || 24,
      d = dimensions.depth || 30,
      h = span;
    b.box(0, 0, 0, w, dimensions.detail === 'far' ? h + 2 : h, d);
    if (dimensions.detail !== 'far') b.box(0, h, 0, w * 0.55, 2, d * 0.55);
    if (!dimensions.detail || dimensions.detail === 'near')
      for (let y = 8; y < h; y += Math.max(10, h / 12)) {
        b.line([-w, y, d + 0.05], [w, y, d + 0.05]);
        b.line([w + 0.05, y, -d], [w + 0.05, y, d]);
      }
  } else if (type === 'ballistic-silo') {
    b.box(0, 0, 0, 30, 4, 30);
    b.rings(
      0,
      0,
      [
        [4, 14],
        [6, 14],
        [7, 12],
      ],
      24,
    );
    b.box(38, 0, 5, 12, 9, 18);
    b.box(-26, 0, -32, 10, 5, 8);
    b.line([-13, 7, 0], [13, 7, 0]);
    b.line([0, 7, -13], [0, 7, 13]);
    for (const x of [-40, 60]) b.line([x, 0, -40], [x, 3, -40]);
  } else if (type === 'ballistic') {
    b.rings(
      0,
      0,
      [
        [0, 1.2],
        [12, 1.2],
        [16, 0],
      ],
      12,
    );
    for (const x of [-1, 1]) {
      b.face([
        [0, 0, 0],
        [x * 3, 0, 0],
        [0, 4, 0],
      ]);
      b.face([
        [0, 0, 0],
        [0, 0, x * 3],
        [0, 4, 0],
      ]);
    }
    b.points = b.points.map((p) => new Vec3(p.x, -p.z, p.y - 7));
  } else if (type === 'convoy') {
    for (let i = -2; i <= 2; i++) b.truck(0, i * 30);
  } else if (type === 'truck') b.truck();
  else if (type === 'bunker') {
    b.rings(
      0,
      0,
      [
        [0, 27],
        [5, 29],
        [6, 37],
        [9, 35],
        [13, 25],
        [15, 8],
      ],
      24,
    );
    b.box(0, 0, 27, 7, 5, 5);
    b.box(0, 6, 29, 13, 0.7, 1);
    for (let a = 0; a < 6; a++) {
      const q = (a * Math.PI) / 3;
      b.line([Math.cos(q) * 29, 6, Math.sin(q) * 29], [Math.cos(q) * 32, 8, Math.sin(q) * 32]);
    }
  } else if (type === 'jammer') {
    b.truck(0, 0);
    for (const x of [-2, 2]) {
      b.line([x, 2, -3], [x, 24, -3]);
      for (let y = 10; y < 24; y += 3) b.line([x - 3, y, -3], [x + 3, y, -3]);
    }
    b.box(0, 7, -3, 4, 5, 1);
    b.dish(7, 13, -5);
    b.box(-7, 0, -7, 2.5, 3, 3);
  } else if (type === 'sam-system') {
    b.truck(-8, 0, false);
    b.rings(
      7,
      -2,
      [
        [0, 2.5],
        [2, 2.5],
        [2, 1],
        [18, 1],
        [21, 0],
      ],
      12,
    );
    for (const d of [-1, 1]) {
      b.face([
        [7, 2, -2],
        [7 + d * 3, 2, -2],
        [7, 8, -2],
      ]);
      b.face([
        [7, 2, -2],
        [7, 2, -2 + d * 3],
        [7, 8, -2],
      ]);
    }
    b.box(7, 0, -2, 4, 0.8, 4);
    b.line([-7, 3, -1], [7, 1, -2]);
  } else if (type === 'sam') {
    b.box(0, 0, 0, 4, 1.4, 5);
    b.rings(
      0,
      0,
      [
        [1.4, 3],
        [3, 3],
        [4, 2],
      ],
      12,
    );
    for (const x of [-1.3, -0.45, 0.45, 1.3]) {
      b.face([
        [x - 0.16, 4, 0],
        [x + 0.16, 4, 0],
        [x + 0.16, 12, 9],
        [x - 0.16, 12, 9],
      ]);
    }
    for (const x of [-5, 5])
      for (const z of [-4, 4]) {
        b.wheel(x, 1, z);
        b.line([0, 1, 0], [x, 1, z]);
      }
    b.box(-3, 2, -2, 1, 3, 1);
    b.dish(4, 7, -3);
  } else if (type === 'bridge') {
    const half = span * 0.5;
    b.box(0, 0, 0, 10, 2, half);
    for (const x of [-10, 10]) {
      b.line([x, 4, -half], [x, 4, half]);
      for (let z = -half; z < half; z += 25) {
        b.line([x, 2, z], [x, 4, z]);
        b.line([x, 4, z], [x, 2, Math.min(half, z + 25)]);
      }
    }
    for (const z of [-half * 0.65, 0, half * 0.65]) b.box(0, -18, z, 7, 18, 3);
  } else if (type === 'airbase') {
    b.box(0, -1, 0, 45, 1, 1600);
    for (const z of [-170, -70, 30]) {
      b.box(85, 0, z, 28, 15, 32);
      b.face([
        [57, 15, z - 32],
        [85, 23, z - 32],
        [113, 15, z - 32],
      ]);
      b.face([
        [113, 15, z + 32],
        [85, 23, z + 32],
        [57, 15, z + 32],
      ]);
      b.face([
        [57, 15, z - 32],
        [85, 23, z - 32],
        [85, 23, z + 32],
        [57, 15, z + 32],
      ]);
      b.face([
        [85, 23, z - 32],
        [113, 15, z - 32],
        [113, 15, z + 32],
        [85, 23, z + 32],
      ]);
    }
    b.box(75, 0, 150, 8, 26, 8);
    b.box(75, 26, 150, 13, 6, 12);
    b.dish(75, 38, 150);
    b.truck(60, 220);
  } else b.box(0, 0, 0, 15, 10, 15);
  const mesh = b.finish();
  cache.set(key, mesh);
  return mesh;
}
const instanceCache = new WeakMap();
function preparedInstance(position, heading, mesh) {
  const rotation = Quat.euler(heading, 0, 0),
    inverse = Quat.euler(-heading, 0, 0),
    bounds = mesh.bounds,
    c = Math.cos(heading),
    s = Math.sin(heading),
    xs = [],
    zs = [];
  for (const x of bounds.x)
    for (const z of bounds.z) {
      xs.push(position.x + x * c + z * s);
      zs.push(position.z - x * s + z * c);
    }
  return {
    position,
    heading,
    mesh,
    rotation,
    inverse,
    worldBounds: {
      x: [Math.min(...xs), Math.max(...xs)],
      y: bounds.y.map((y) => position.y + y),
      z: [Math.min(...zs), Math.max(...zs)],
    },
  };
}
export function groundInstances(t, { detail = 'near' } = {}) {
  const key = [
    terrainWorld.revision,
    t.type,
    t.position.x,
    t.position.y,
    t.position.z,
    t.heading,
    t.routeDistance,
    t.routeDirection,
    t.alive,
    t.buildingHeight,
    t.buildingWidth,
    t.buildingDepth,
    terrainWorld.river?.width,
  ].join(':');
  let cached = instanceCache.get(t);
  if (!cached || cached.key !== key) {
    cached = { key, levels: new Map() };
    instanceCache.set(t, cached);
  }
  if (cached.levels.has(detail)) return cached.levels.get(detail);
  let result;
  if (t.type === 'convoy')
    result = [-2, -1, 0, 1, 2].map((i) => {
      const pose = convoyPose(t, i * 30);
      return preparedInstance(pose.position, pose.heading, groundMesh('truck'));
    });
  else {
    const mesh = groundMesh(
        t.type,
        t.city
          ? t.alive
            ? t.buildingHeight
            : 2
          : t.type === 'bridge'
            ? (terrainWorld.river?.width || 180) + 70
            : 220,
        { width: t.buildingWidth, depth: t.buildingDepth, detail },
      ),
      position = t.position.clone();
    if (['carrier', 'destroyer'].includes(t.type)) position.y = 0;
    else if (t.type !== 'bridge') position.y = terrainHeight(position.x, position.z) + 0.5;
    result = [preparedInstance(position, t.heading || 0, mesh)];
  }
  cached.levels.set(detail, result);
  return result;
}
export function buildingDetail(t, camera, focal = 600) {
  const distance = t.position.distance(camera),
    pixels = ((t.buildingHeight || 20) * focal) / Math.max(1, distance);
  return distance < 1800 && pixels >= 12
    ? 'near'
    : distance < 6000 && pixels >= 6
      ? 'medium'
      : 'far';
}
export function renderGroundTarget(renderer, t) {
  const detail = t.city ? buildingDetail(t, renderer.camera, renderer.focal) : 'near';
  for (const instance of groundInstances(t, { detail })) {
    if (t.type === 'airbase')
      renderAirfield(renderer, instance.position, instance.rotation, { lights: t.alive !== false });
    renderer.mesh(
      instance.mesh,
      instance.position,
      instance.rotation,
      1,
      t.alive === false
        ? '#56645b'
        : t.team === 'ally'
          ? '#8dbed4'
          : t.type === 'jammer'
            ? '#e7c994'
            : '#c4aa88',
      null,
      materialFor(t.type),
    );
  }
}
// Collect once per simulation step, rather than resolving instance caches for
// every projectile/object pair. Bounds enclose the exact rotated hit boxes.
const collisionBoundsCache = new WeakMap();
export function groundCollisionBounds(t) {
  const instances = groundInstances(t),
    bounds = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  if (collisionBoundsCache.has(instances)) return collisionBoundsCache.get(instances);
  for (const { worldBounds } of instances)
    for (const axis of ['x', 'y', 'z']) {
      bounds[axis][0] = Math.min(bounds[axis][0], worldBounds[axis][0]);
      bounds[axis][1] = Math.max(bounds[axis][1], worldBounds[axis][1]);
    }
  collisionBoundsCache.set(instances, bounds);
  return bounds;
}
export function sweptBoundsOverlap(bounds, from, to, padding = 0) {
  return (
    Math.max(from.x, to.x) >= bounds.x[0] - padding &&
    Math.min(from.x, to.x) <= bounds.x[1] + padding &&
    Math.max(from.y, to.y) >= bounds.y[0] - padding &&
    Math.min(from.y, to.y) <= bounds.y[1] + padding &&
    Math.max(from.z, to.z) >= bounds.z[0] - padding &&
    Math.min(from.z, to.z) <= bounds.z[1] + padding
  );
}
export function groundHit(t, from, to, padding = 0) {
  // Swept local boxes follow the exact rendered instances, including each truck.
  for (const { position, inverse, mesh, worldBounds } of groundInstances(t)) {
    if (
      ['x', 'y', 'z'].some(
        (axis) =>
          Math.max(from[axis], to[axis]) < worldBounds[axis][0] - padding ||
          Math.min(from[axis], to[axis]) > worldBounds[axis][1] + padding,
      )
    )
      continue;
    const a = inverse.rotate(from.clone().sub(position)),
      b = inverse.rotate(to.clone().sub(position)),
      d = b.clone().sub(a);
    let enter = 0,
      exit = 1;
    for (const axis of ['x', 'y', 'z']) {
      const lo = mesh.bounds[axis][0] - padding,
        hi = mesh.bounds[axis][1] + padding;
      if (Math.abs(d[axis]) < 1e-9) {
        if (a[axis] < lo || a[axis] > hi) {
          enter = 2;
          break;
        }
      } else {
        let p = (lo - a[axis]) / d[axis],
          q = (hi - a[axis]) / d[axis];
        if (p > q) [p, q] = [q, p];
        enter = Math.max(enter, p);
        exit = Math.min(exit, q);
      }
    }
    if (enter <= exit && enter <= 1 && exit >= 0) return true;
  }
  return false;
}

let homeCollisionMesh;
// Triangle-level aircraft contact avoids treating empty space between airport buildings as solid.
export function groundAircraftHit(target, from, to) {
  let instances;
  if (target.type === 'airbase' && target.home && !target.remoteHome) {
    if (!homeCollisionMesh) {
      const builder = new Builder();
      for (const h of homeHangars) builder.box(h.x, 0, h.z, h.halfWidth, h.height, h.halfLength);
      homeCollisionMesh = builder.finish();
    }
    instances = [preparedInstance(new Vec3(), 0, homeCollisionMesh)];
  } else instances = groundInstances(target);
  let best = null;
  for (const instance of instances) {
    if (!sweptBoundsOverlap(instance.worldBounds, from, to, 0.25)) continue;
    const motion = target.previousPosition
        ? target.position.clone().sub(target.previousPosition)
        : new Vec3(),
      a = instance.inverse.rotate(from.clone().add(motion).sub(instance.position)),
      b = instance.inverse.rotate(to.clone().sub(instance.position)),
      hit = meshSegmentHit(instance.mesh, a, b);
    if (hit && (!best || hit.fraction < best.fraction))
      best = { ...hit, point: instance.rotation.rotate(hit.localPoint).add(instance.position) };
  }
  return best;
}
