import { Vec3, clamp } from './math.js';
const TAU = Math.PI * 2,
  SEGMENTS = 32;
const RINGS = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.16, 1.4, 1.7];
const meshes = new WeakMap(),
  indices = new WeakMap();
export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296;
}
export function generateIslands(seed) {
  const rng = seededRandom(seed),
    islands = [];
  for (let iz = -9; iz <= 9; iz++)
    for (let ix = -9; ix <= 9; ix++) {
      const x = (ix + (rng() - 0.5) * 0.55) * 8000,
        z = (iz + (rng() - 0.5) * 0.55) * 8000,
        radiusX = 450 + rng() * 1250,
        radiusZ = radiusX * (0.55 + rng() * 0.55),
        radius = Math.max(radiusX, radiusZ) * 1.18;
      // Keep the carrier, catapult/deck approach and initial destroyer spawn navigable.
      if (
        Math.hypot(Math.max(0, Math.abs(x) - 2400), Math.max(0, Math.abs(z) - 9500)) <
        radius + 500
      )
        continue;
      if (Math.hypot(x - 13000, z - 19500) < radius + 1300) continue;
      islands.push({
        x,
        z,
        radiusX,
        radiusZ,
        radius,
        heading: rng() * TAU,
        height: 35 + rng() * 240,
        phase: rng() * TAU,
      });
    }
  return islands;
}
function barycentric(a, b, c, x, z) {
  const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(d) < 1e-10) return null;
  const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d,
    v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d,
    w = 1 - u - v;
  return Math.min(u, v, w) >= -1e-8 ? u * a.y + v * b.y + w * c.y : null;
}
export function islandGeometry(island) {
  if (meshes.has(island)) return meshes.get(island);
  const c = Math.cos(island.heading),
    s = Math.sin(island.heading),
    levels = [],
    faces = [],
    sectors = Array.from({ length: SEGMENTS }, () => []);
  for (const radius of RINGS)
    levels.push(
      Array.from({ length: SEGMENTS }, (_, j) => {
        const angle = (j * TAU) / SEGMENTS,
          shore =
            1 +
            0.1 * Math.sin(angle * 3 + island.phase) +
            0.06 * Math.cos(angle * 5 - island.phase),
          x = Math.cos(angle) * shore * radius * island.radiusX,
          z = Math.sin(angle) * shore * radius * island.radiusZ,
          y =
            radius <= 1 ? island.height * (1 - radius * radius) ** 2 : (-650 * (radius - 1)) / 0.7;
        return new Vec3(island.x + x * c + z * s, y, island.z - x * s + z * c);
      }),
    );
  const add = (points, j) => {
    const normal = points[1]
      .clone()
      .sub(points[0])
      .cross(points[2].clone().sub(points[0]))
      .normalize();
    if (normal.y < 0) normal.scale(-1);
    const center = points.reduce((p, v) => p.add(v), new Vec3()).scale(1 / 3),
      light = 0.58 + 0.42 * Math.max(0, normal.dot(new Vec3(-0.36, 0.86, -0.36))),
      water = center.y < 0,
      deep = clamp(-center.y / 650, 0, 1),
      rgb = water
        ? [22 + deep * 3, 155 - deep * 78, 164 - deep * 57]
        : [219 * light, 188 * light, 126 * light];
    const face = {
      points,
      normal,
      center,
      color: 'rgb(' + rgb.map(Math.round).join(',') + ')',
      ocean: true,
    };
    faces.push(face);
    if (!water) sectors[j].push(face);
  };
  for (let k = 0; k < RINGS.length - 1; k++)
    for (let j = 0; j < SEGMENTS; j++) {
      const next = (j + 1) % SEGMENTS;
      add([levels[k][j], levels[k + 1][j], levels[k + 1][next]], j);
      if (k) add([levels[k][j], levels[k + 1][next], levels[k][next]], j);
    }
  const result = { faces, sectors };
  meshes.set(island, result);
  return result;
}
function spatialIndex(islands) {
  if (indices.has(islands)) return indices.get(islands);
  const index = new Map();
  for (const island of islands)
    for (
      let x = Math.floor((island.x - island.radius) / 4000);
      x <= Math.floor((island.x + island.radius) / 4000);
      x++
    )
      for (
        let z = Math.floor((island.z - island.radius) / 4000);
        z <= Math.floor((island.z + island.radius) / 4000);
        z++
      ) {
        const key = x + ':' + z;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(island);
      }
  indices.set(islands, index);
  return index;
}
export function oceanHeight(islands, x, z) {
  let height = 0;
  for (const island of spatialIndex(islands).get(
    Math.floor(x / 4000) + ':' + Math.floor(z / 4000),
  ) || []) {
    const dx = x - island.x,
      dz = z - island.z;
    if (dx * dx + dz * dz > island.radius * island.radius) continue;
    const c = Math.cos(island.heading),
      s = Math.sin(island.heading),
      angle =
        (Math.atan2((dx * s + dz * c) / island.radiusZ, (dx * c - dz * s) / island.radiusX) + TAU) %
        TAU,
      sector = Math.min(SEGMENTS - 1, Math.floor((angle * SEGMENTS) / TAU));
    for (const face of islandGeometry(island).sectors[sector]) {
      const y = barycentric(...face.points, x, z);
      if (y !== null) {
        height = Math.max(height, y);
        break;
      }
    }
  }
  return height;
}
export function oceanSurface(islands, cx, cz) {
  const corners = [
      new Vec3(cx - 60000, 0, cz - 60000),
      new Vec3(cx + 60000, 0, cz - 60000),
      new Vec3(cx + 60000, 0, cz + 60000),
      new Vec3(cx - 60000, 0, cz + 60000),
    ],
    water = (points) => ({
      points,
      normal: new Vec3(0, 1, 0),
      center: points.reduce((p, v) => p.add(v), new Vec3()).scale(1 / 3),
      color: 'rgb(25,77,107)',
      oceanWater: true,
    });
  const faces = [
    water([corners[0], corners[1], corners[2]]),
    water([corners[0], corners[2], corners[3]]),
  ];
  for (const island of islands)
    if (Math.hypot(island.x - cx, island.z - cz) < 36000 + island.radius)
      faces.push(...islandGeometry(island).faces);
  return faces;
}
export function seaSegmentClear(from, to, islands, clearance = 350) {
  const dx = to.x - from.x,
    dz = to.z - from.z,
    d2 = dx * dx + dz * dz;
  return islands.every((island) => {
    const t = clamp(
      ((island.x - from.x) * dx + (island.z - from.z) * dz) / Math.max(1e-9, d2),
      0,
      1,
    );
    return (
      Math.hypot(from.x + t * dx - island.x, from.z + t * dz - island.z) > island.radius + clearance
    );
  });
}
export function planSeaRoute(from, goal, islands, clearance = 450) {
  if (seaSegmentClear(from, goal, islands, clearance)) return [goal.clone()];
  const nearby = islands.filter((island) => !seaSegmentClear(from, goal, [island], 6000));
  const nodes = [from.clone(), goal.clone()];
  for (const island of nearby)
    for (let j = 0; j < 12; j++) {
      const angle = (j * TAU) / 12,
        radius = (island.radius + clearance) / Math.cos(Math.PI / 12) + 20;
      nodes.push(
        new Vec3(island.x + Math.cos(angle) * radius, 0, island.z + Math.sin(angle) * radius),
      );
    }
  const cost = nodes.map(() => Infinity),
    prior = nodes.map(() => -1),
    done = new Set();
  cost[0] = 0;
  for (let count = 0; count < nodes.length; count++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!done.has(i) && (current < 0 || cost[i] < cost[current])) current = i;
    if (current < 0 || !Number.isFinite(cost[current])) break;
    if (current === 1) {
      const route = [];
      for (let i = 1; i > 0; i = prior[i]) route.unshift(nodes[i]);
      return route;
    }
    done.add(current);
    for (let i = 1; i < nodes.length; i++)
      if (!done.has(i) && seaSegmentClear(nodes[current], nodes[i], nearby, clearance)) {
        const next = cost[current] + nodes[current].distance(nodes[i]);
        if (next < cost[i]) {
          cost[i] = next;
          prior[i] = current;
        }
      }
  }
  return [];
}
const shipRoutes = new WeakMap();
export function moveOceanShip(ship, goal, islands, revision, dt) {
  let plan = shipRoutes.get(ship);
  if (!plan || plan.revision !== revision || plan.goal.distance(goal) > 100) {
    plan = {
      revision,
      goal: goal.clone(),
      points: planSeaRoute(ship.position, goal, islands),
      index: 0,
      speed: ship.seaCruiseSpeed || ship.velocity.length() || 10,
    };
    shipRoutes.set(ship, plan);
    ship.seaCruiseSpeed = plan.speed;
  }
  while (plan.points[plan.index] && ship.position.distance(plan.points[plan.index]) < 70)
    plan.index++;
  const next = plan.points[plan.index];
  if (!next) {
    ship.velocity = new Vec3();
    return;
  }
  const desired = Math.atan2(next.x - ship.position.x, next.z - ship.position.z),
    error = Math.atan2(Math.sin(desired - ship.heading), Math.cos(desired - ship.heading));
  ship.heading += clamp(error, -dt * 0.08, dt * 0.08);
  const velocity = new Vec3(
      Math.sin(ship.heading) * plan.speed,
      0,
      Math.cos(ship.heading) * plan.speed,
    ),
    position = ship.position.clone().add(velocity.clone().scale(dt));
  ship.velocity = seaSegmentClear(ship.position, position, islands, 150) ? velocity : new Vec3();
  ship.position.add(ship.velocity.clone().scale(dt));
  ship.position.y = 0;
  ship.seaWaypoint = next.clone();
}
