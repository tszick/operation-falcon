import { overcastPixels } from '../src/environmentSky.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from '../src/math.js';
import { configureTerrain, terrainHeight, terrainWorld } from '../src/terrain.js';
import { buildTerrainSurface, terrainGridCenter } from '../src/terrainSurface.js';
import {
  generateIslands,
  islandGeometry,
  oceanHeight,
  planSeaRoute,
  seaSegmentClear,
  moveOceanShip,
} from '../src/oceanEnvironment.js';
import { cloudLayout, cloudPalette, cloudPixels } from '../src/clouds.js';
import { updateTargets, createTargets } from '../src/targeting.js';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { FlightRecorder } from '../src/flightRecorder.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { Targeting } from '../src/targeting.js';

test('ocean archipelagos vary by seed, cover the flight area and preserve carrier recovery and ship spawn water', () => {
  const islands = generateIslands(127);
  assert.ok(islands.length > 300);
  assert.deepEqual(islands, generateIslands(127));
  assert.notDeepEqual(islands, generateIslands(128));
  assert.ok(Math.max(...islands.map((i) => i.radiusX)) > 1400);
  assert.ok(Math.min(...islands.map((i) => i.radiusX)) < 600);
  for (let x = -1500; x <= 1500; x += 500)
    for (let z = -8500; z <= 8500; z += 500) assert.equal(oceanHeight(islands, x, z), 0);
  assert.equal(oceanHeight(islands, 13000, 19500), 0);
  for (const [x, z] of [
    [0, 0],
    [20000, 0],
    [-18000, 24000],
    [35000, -35000],
  ])
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const nearby = islands.filter(
        (i) =>
          Math.hypot(i.x - x, i.z - z) < 22000 &&
          Math.abs(
            Math.atan2(
              Math.sin(Math.atan2(i.x - x, i.z - z) - angle),
              Math.cos(Math.atan2(i.x - x, i.z - z) - angle),
            ),
          ) <
            Math.PI / 5,
      );
      assert.ok(nearby.length > 0, 'A landmark in every typical forward view');
    }
});
test('sand island triangle heights match collision exactly, including shore and camera tile changes', () => {
  configureTerrain({ naval: true }, undefined, () => 0.3);
  const island = terrainWorld.islands.find((i) => Math.abs(i.x) < 20000 && Math.abs(i.z) < 20000),
    geometry = islandGeometry(island);
  for (const face of geometry.faces.filter((f) => f.center.y > 0)) {
    const p = face.center;
    assert.ok(Math.abs(terrainHeight(p.x, p.z) - p.y) < 1e-6);
    assert.ok(face.normal.y > 0);
  }
  assert.ok(
    geometry.faces.some((f) => f.center.y < 0),
    'Shallow-water bands are included',
  );
  assert.ok(
    geometry.faces.every(
      (f) => Number.isFinite(f.normal.y) && f.points.every((p) => Number.isFinite(p.y)),
    ),
  );
  const a = buildTerrainSurface(island.x, island.z),
    b = buildTerrainSurface(island.x + 3000, island.z);
  assert.ok(
    a.includes(geometry.faces[0]) && b.includes(geometry.faces[0]),
    'World geometry stays anchored between ocean tiles',
  );
  assert.ok(a.length < 60000, 'Keep the visible archipelago bounded');
  let centre = terrainGridCenter(new Vec3(0, 100, 0));
  assert.deepEqual(terrainGridCenter(new Vec3(900, 100, 0), centre), centre);
});
test('a destroyer plans a clear detour around an island and follows it without crossing land', () => {
  const island = {
      x: 0,
      z: 0,
      radiusX: 850,
      radiusZ: 650,
      radius: 1000,
      heading: 0,
      height: 100,
      phase: 0,
    },
    islands = [island],
    start = new Vec3(0, 0, -6000),
    goal = new Vec3(0, 0, 6000),
    route = planSeaRoute(start, goal, islands);
  assert.ok(route.length > 1);
  let previous = start;
  for (const point of route) {
    assert.ok(seaSegmentClear(previous, point, islands, 449));
    previous = point;
  }
  const ship = { position: start.clone(), velocity: new Vec3(0, 0, 10), heading: 0 };
  for (let t = 0; t < 1800; t += 0.5) {
    const from = ship.position.clone();
    moveOceanShip(ship, goal, islands, 1, 0.5);
    assert.ok(seaSegmentClear(from, ship.position, islands, 149));
    assert.equal(oceanHeight(islands, ship.position.x, ship.position.z), 0);
  }
  assert.ok(ship.position.distance(goal) < 100);
  assert.equal(ship.position.y, 0);
});
test('the mission destroyer uses island avoidance through the common movement update', () => {
  const targets = createTargets(
      missions.find((m) => m.naval),
      aircraft.find((a) => a.id === 'fa18'),
      { rng: () => 0.3 },
    ),
    ship = targets.find((t) => t.type === 'destroyer');
  const start = ship.position.clone();
  for (let i = 0; i < 120; i++) {
    updateTargets(targets, 1 / 60);
    assert.equal(terrainHeight(ship.position.x, ship.position.z), 0);
  }
  assert.ok(ship.position.distance(start) > 15);
  assert.ok(ship.seaWaypoint instanceof Vec3);
});
test('cloud layouts are static, seeded, distributed around the sky and have appropriate daytime/night palettes', () => {
  const layout = cloudLayout(23);
  assert.equal(layout, cloudLayout(23));
  assert.notDeepEqual(layout, cloudLayout(24));
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4)
    assert.ok(
      layout.some(
        (c) =>
          Math.abs(Math.atan2(Math.sin(c.bearing - angle), Math.cos(c.bearing - angle))) <
          Math.PI / 5,
      ),
    );
  assert.ok(layout.every((c) => c.elevation > 0 && c.elevation < Math.PI / 2 && c.size > 0));
  assert.ok(cloudPalette('night').opacity < cloudPalette('ocean').opacity);
  assert.notDeepEqual(cloudPalette('sunset'), cloudPalette('grass'));
});
test('a new flight log preserves the generated islands and cloud seed for reconstruction', () => {
  const mission = missions.find((m) => m.naval),
    spec = aircraft.find((a) => a.id === 'fa18'),
    targets = createTargets(mission, spec, { rng: () => 0.42 }),
    state = createMissionAircraft(spec, mission),
    m = new Mission(mission),
    w = new Weapons(),
    aim = new Targeting(),
    recorder = new FlightRecorder();
  m.update(state, targets, w, aim);
  recorder.start(state, m, targets, w, aim);
  const snapshot = recorder.export().metadata.terrain;
  assert.deepEqual(snapshot.islands, terrainWorld.islands);
  assert.equal(snapshot.skySeed, terrainWorld.skySeed);
});

test('cumulus sprites have a soft transparent silhouette without overlapping opaque puff outlines', () => {
  const pixels = cloudPixels('ocean', 0, 128, 64);
  assert.deepEqual(pixels, cloudPixels('ocean', 0, 128, 64));
  const alpha = Array.from(pixels).filter((_, i) => i % 4 === 3);
  assert.ok(
    alpha.some((a) => a === 0) &&
      alpha.some((a) => a > 0 && a < 255) &&
      alpha.some((a) => a === 255),
  );
  assert.notDeepEqual(pixels, cloudPixels('night', 0, 128, 64));
  for (let i = 0; i < pixels.length; i += 4)
    if (pixels[i + 3] > 240)
      assert.ok(pixels[i] > 180 && pixels[i + 1] > 190, 'Daylight cloud stays softly lit');
});

test('winter overcast fades smoothly to fully transparent on every sprite boundary', () => {
  const width = 256,
    height = 128,
    pixels = overcastPixels(width, height);
  let maximum = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      maximum = Math.max(maximum, alpha);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) assert.equal(alpha, 0);
      if (x === 1 || y === 1 || x === width - 2 || y === height - 2) assert.ok(alpha <= 1);
      if (x > 0)
        assert.ok(
          Math.abs(alpha - pixels[(y * width + x - 1) * 4 + 3]) <= 8,
          'No vertical hard edges',
        );
      if (y > 0)
        assert.ok(
          Math.abs(alpha - pixels[((y - 1) * width + x) * 4 + 3]) <= 8,
          'No horizontal hard edges',
        );
    }
  assert.ok(maximum > 20, 'The weather layer remains visible inside its soft boundary');
});
