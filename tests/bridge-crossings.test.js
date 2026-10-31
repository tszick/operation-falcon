import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3 } from '../src/math.js';
import { aircraft, missions } from '../src/aircraftSpec.js';
import {
  terrainWorld,
  configureTerrain,
  pathPoint,
  roadDeckHeight,
  stopAtBrokenBridge,
} from '../src/terrain.js';
import { roadRiverCrossings, attachRoadBridges } from '../src/bridgeCrossings.js';
import { createTargets, applyTargetHit } from '../src/targeting.js';
import { roadSurface, roadWet } from '../src/terrainFeatures.js';
import { groundInstances, groundHit } from '../src/groundModels.js';
import { featureWindow, buildFeatureBuffers } from '../src/rendering/shared/featureData.js';
import { targetSelectable } from '../src/electronicWarfare.js';
import { advisedTarget } from '../src/targetAdvice.js';
function simpleCrossing() {
  configureTerrain({ id: 'bridge' }, new Vec3(20000, 0, 0), () => 0.3);
  Object.assign(terrainWorld, {
    road: { x: 20000, z: 0, angle: 0, bend: 0, phase: 0, width: 14 },
    river: { x: 20000, z: 0, angle: Math.PI / 2, bend: 0, phase: 0, width: 200, level: 40 },
    bridge: null,
    cityRoads: [],
  });
  return terrainWorld;
}
test('every perpendicular and oblique road crossing gets a correctly sized bridge; dry roads do not', () => {
  const w = simpleCrossing(),
    straight = roadRiverCrossings(w.road, w.river);
  assert.equal(straight.length, 1);
  assert.ok(straight[0].span >= w.river.width + 70);
  assert.ok(Math.abs(straight[0].along) < 0.001);
  w.road.angle = Math.PI / 3;
  const oblique = roadRiverCrossings(w.road, w.river);
  assert.equal(oblique.length, 1);
  assert.ok(oblique[0].span > straight[0].span * 1.9);
  w.road.angle = Math.PI / 2;
  w.road.x += 2000;
  assert.equal(roadRiverCrossings(w.road, w.river).length, 0);
});
test('bridges are real selectable, collidable, destructible targets and are not mandatory objectives', () => {
  simpleCrossing();
  const targets = attachRoadBridges([]),
    t = targets[0];
  assert.equal(targets.length, 1);
  assert.ok(t.incidental && t.alive && targetSelectable(t, {}));
  assert.equal(t.team, 'neutral');
  assert.equal(advisedTarget({ position: new Vec3(), spec: {} }, targets, {}, {}), undefined);
  const instance = groundInstances(t)[0];
  assert.ok(instance.mesh.bounds.z[1] - instance.mesh.bounds.z[0] >= t.bridgeSpan);
  assert.ok(
    groundHit(
      t,
      t.position.clone().add(new Vec3(0, 100, 0)),
      t.position.clone().add(new Vec3(0, -10, 0)),
    ),
  );
  const before = featureWindow(t.position).key;
  assert.equal(applyTargetHit(t, 'bomb'), true);
  assert.equal(t.alive, false);
  assert.equal(terrainWorld.bridges[0].alive, false);
  assert.notEqual(featureWindow(t.position).key, before);
  assert.equal(roadWet(terrainWorld.road, 0), true);
});
test('road deck, bridge model and traffic share one height and destruction removes the raised pavement', () => {
  simpleCrossing();
  const [t] = attachRoadBridges([]),
    road = terrainWorld.road,
    p = pathPoint(road, 0);
  const height = roadSurface(road, p);
  assert.ok(Math.abs(height - (t.position.y + 2.1)) < 0.001);
  assert.equal(roadWet(road, 0), false);
  assert.equal(roadDeckHeight(road, 0, 0), height);
  const intact = buildFeatureBuffers(t.position);
  applyTargetHit(t, 'bomb');
  const broken = buildFeatureBuffers(t.position);
  assert.ok(broken.vertices.length < intact.vertices.length);
  assert.ok(roadSurface(road, p) < height);
  assert.ok(stopAtBrokenBridge(-1000, 1000) < terrainWorld.bridges[0].from);
  assert.ok(stopAtBrokenBridge(1000, -1000) > terrainWorld.bridges[0].to);
});
test('city streets get their own bridges within finite street extents, without lifting unrelated roads', () => {
  const w = simpleCrossing();
  w.cityRoads = [
    { ...w.road, z: 1000, min: -500, max: 500 },
    { ...w.road, z: 2000, min: 1000, max: 2000 },
  ];
  const targets = attachRoadBridges([]);
  assert.equal(targets.length, 2);
  assert.equal(w.bridges.filter((b) => b.pathKey.startsWith('city')).length, 1);
  assert.equal(roadWet(w.cityRoads[0], 0), false);
  const dryPoint = pathPoint(w.cityRoads[1], 1500);
  assert.equal(roadDeckHeight(w.cityRoads[1], 1500, 123), 123);
  assert.ok(Number.isFinite(roadSurface(w.cityRoads[1], dryPoint)));
});
test('the convoy and Iron Veil objective bridges remain unique and keep their mission IDs', () => {
  const player = aircraft.find((a) => a.id === 'f16');
  for (const objective of ['bridge-block', 'iron-veil']) {
    const mission = missions.find((m) => m.objective === objective);
    const targets = createTargets(mission, player, { rng: () => 0.3 });
    const primary = targets.find((t) => t.type === 'bridge' && !t.incidental);
    assert.ok(primary);
    const descriptor = terrainWorld.bridges.find((b) => b.id === primary.id);
    assert.ok(descriptor);
    assert.equal(
      targets.filter((t) => t.type === 'bridge' && t.position.distance(primary.position) < 2)
        .length,
      1,
    );
  }
});
test('all generated mission road/river crossings are represented by live objects without forcing new goals', () => {
  const player = aircraft.find((a) => a.id === 'f16');
  for (const mission of missions)
    for (const seed of [0.2, 0.4, 0.7]) {
      const targets = createTargets(mission, player, { rng: () => seed });
      const ids = targets.map((t) => t.id);
      attachRoadBridges(targets);
      assert.deepEqual(
        targets.map((t) => t.id),
        ids,
      );
      for (const bridge of terrainWorld.bridges || []) {
        const t = targets.find((t) => t.id === bridge.id);
        assert.ok(t?.alive, mission.id);
        assert.ok(t.type === 'bridge' && Number.isFinite(t.bridgeSpan));
        if (t.incidental) assert.equal(t.team, 'neutral');
      }
    }
});
