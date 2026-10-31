import { roadSurface } from '../src/terrainFeatures.js';
import { pathPoint } from '../src/terrain.js';
import { Renderer } from '../src/renderer.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from '../src/math.js';
import {
  vehicleGroundPose,
  vehicleWheelContacts,
  vehicleSupportHeight,
  groundVehiclePatches,
} from '../src/vehicleGrounding.js';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { createTargets, updateTargets } from '../src/targeting.js';
import { terrainHeight, terrainWorld } from '../src/terrain.js';
import { groundInstances, groundHit, groundCollisionBounds } from '../src/groundModels.js';
import { buildTerrainSurface, terrainGridCenter } from '../src/terrainSurface.js';
import { refinedTerrainTriangles } from '../src/terrainRefinement.js';
function surfaceHeight(faces, x, z) {
  for (const {
    points: [a, b, c],
  } of faces) {
    const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z),
      u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / det,
      v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det;
    if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8) return u * a.y + v * b.y + (1 - u - v) * c.y;
  }
  return NaN;
}

test('vehicle wheels follow longitudinal and cross slopes at every heading without burying the body', () => {
  for (const [sx, sz] of [
    [0, 0],
    [0.3, 0],
    [-0.2, 0.25],
    [0.15, -0.4],
  ])
    for (let heading = 0; heading < 6.28; heading += 0.4) {
      const heightAt = (x, z) => 120 + sx * x + sz * z,
        pose = vehicleGroundPose(new Vec3(35, -999, 60), heading, heightAt),
        gaps = vehicleWheelContacts.map((p) => {
          const w = pose.rotation.rotate(p).add(pose.position);
          return w.y - heightAt(w.x, w.z);
        });
      assert.ok(Math.min(...gaps) > 0.19);
      assert.ok(Math.max(...gaps) < 0.7, JSON.stringify({ sx, sz, heading, gaps }));
      assert.ok(
        Math.abs(
          Math.hypot(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w) - 1,
        ) < 1e-10,
      );
    }
});

test('every campaign grounds mobile vehicles and each convoy truck with matching rotated hit geometry', () => {
  const spec = aircraft.find((a) => a.id === 'f16');
  for (const mission of missions) {
    const targets = createTargets(mission, spec, { rng: () => 0.3 });
    updateTargets(targets, 1 / 120);
    for (const t of targets.filter((t) =>
      ['convoy', 'mobile-sam', 'mobile-jammer', 'drone-command'].includes(t.type),
    )) {
      const instances = groundInstances(t),
        bounds = groundCollisionBounds(t);
      for (const instance of instances) {
        const gaps = vehicleWheelContacts.map((p) => {
          const w = instance.rotation.rotate(p).add(instance.position);
          return w.y - vehicleSupportHeight(w.x, w.z);
        });
        assert.ok(Math.min(...gaps) > 0.19, mission.id + '/' + t.type);
        for (const vertex of instance.mesh.points) {
          const w = instance.rotation.rotate(vertex).add(instance.position);
          for (const axis of ['x', 'y', 'z'])
            assert.ok(w[axis] >= bounds[axis][0] - 1e-8 && w[axis] <= bounds[axis][1] + 1e-8);
        }
        const center = instance.rotation.rotate(new Vec3(0, 3, 0)).add(instance.position),
          a = instance.rotation.rotate(new Vec3(0, 3, -20)).add(instance.position),
          b = instance.rotation.rotate(new Vec3(0, 3, 20)).add(instance.position);
        assert.ok(center.y > instance.position.y);
        assert.ok(groundHit(t, a, b), mission.id + '/' + t.type);
      }
    }
  }
});

test('local terrain detail removes metre-scale vehicle burial without globally increasing terrain density', () => {
  const spec = aircraft.find((a) => a.id === 'f16'),
    mission = missions.find((m) => m.id === 'convoy');
  let reproduced = false;
  for (const seed of [0.1, 0.3, 0.7]) {
    const targets = createTargets(mission, spec, { rng: () => seed }),
      vehicles = targets.filter((t) =>
        ['mobile-sam', 'mobile-jammer', 'drone-command'].includes(t.type),
      ),
      c = terrainGridCenter(vehicles[0].position),
      coarse = buildTerrainSurface(c.x, c.z),
      patches = groundVehiclePatches(targets, c.x, c.z),
      refined = buildTerrainSurface(c.x, c.z, terrainHeight, { vehiclePatches: patches });
    assert.ok(
      refined.length < coarse.length * 1.8,
      `local detail grew too much: ${refined.length}/${coarse.length}`,
    );
    for (const t of vehicles) {
      const exact = terrainHeight(t.position.x, t.position.z),
        before = surfaceHeight(coarse, t.position.x, t.position.z),
        after = surfaceHeight(refined, t.position.x, t.position.z);
      if (before - exact > 5) reproduced = true;
      assert.ok(Math.abs(after - exact) < 0.3, `${seed}/${t.type}: ${after - exact}`);
    }
  }
  assert.equal(reproduced, true, 'test must reproduce the old buried vehicle geometry');
});

test('adaptive detail has no cracks or T-junctions on shared cell edges and preserves surface coverage', () => {
  const triangles = refinedTerrainTriangles(
      [-450, 0, 450],
      [-450, 0, 450],
      (x, z) => new Vec3(x, 0, z),
      [{ x: 40, z: 30, radius: 100 }],
    ),
    edges = new Map();
  let area = 0;
  for (const [a, b, c] of triangles) {
    area += Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) * 0.5;
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = [[p.x, p.z].join(','), [q.x, q.z].join(',')].sort().join(':');
      const entry = edges.get(key) || { count: 0, p, q };
      entry.count++;
      edges.set(key, entry);
    }
  }
  assert.equal(area, 900 * 900);
  for (const { count, p, q } of edges.values()) {
    const boundary =
      (p.x === q.x && Math.abs(p.x) === 450) || (p.z === q.z && Math.abs(p.z) === 450);
    assert.equal(count, boundary ? 1 : 2, JSON.stringify({ p, q, count }));
  }
});

test('vehicle detail windows are stable within a tile, apply to any mission, and change at tile boundaries', () => {
  const t = { type: 'mobile-jammer', alive: true, position: new Vec3(0, 0, 0) };
  const first = groundVehiclePatches([t]);
  t.position.x = 30;
  assert.deepEqual(groundVehiclePatches([t]), first);
  t.position.x = 90;
  assert.notDeepEqual(groundVehiclePatches([t]), first);
  t.type = 'convoy';
  assert.equal(groundVehiclePatches([t])[0].radius, 180);
  t.alive = false;
  assert.deepEqual(groundVehiclePatches([t]), []);
  assert.ok(terrainWorld.revision >= 0);
});

test('the real renderer terrain entry point receives vehicle detail and reuses stationary geometry', () => {
  const targets = createTargets(
      missions.find((m) => m.id === 'convoy'),
      aircraft.find((a) => a.id === 'f16'),
      { rng: () => 0.3 },
    ),
    vehicle = targets.find((t) => t.type === 'mobile-sam'),
    r = { camera: vehicle.position.clone(), gpuModels: { renderTerrain: () => true } };
  Renderer.prototype.terrain.call(r, targets);
  const mesh = r.terrainSurface,
    key = r.terrainSurfaceKey;
  assert.ok(key.split(':').length >= 4);
  assert.ok(
    Math.abs(
      surfaceHeight(mesh, vehicle.position.x, vehicle.position.z) -
        terrainHeight(vehicle.position.x, vehicle.position.z),
    ) < 0.3,
  );
  Renderer.prototype.terrain.call(r, targets);
  assert.equal(r.terrainSurface, mesh);
  vehicle.position.x += 180;
  Renderer.prototype.terrain.call(r, targets);
  assert.notEqual(r.terrainSurface, mesh);
});

test('vehicle support includes rendered asphalt thickness and the bridge deck rather than bare soil', () => {
  createTargets(
    missions.find((m) => m.id === 'convoy'),
    aircraft.find((a) => a.id === 'f16'),
    { rng: () => 0.3 },
  );
  for (const distance of [-6000, -200, 0, 200]) {
    const p = pathPoint(terrainWorld.road, distance);
    assert.ok(
      Math.abs(
        vehicleSupportHeight(p.x, p.z) -
          Math.max(terrainHeight(p.x, p.z), roadSurface(terrainWorld.road, p)),
      ) < 1e-6,
    );
  }
});
