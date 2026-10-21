import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, Quat } from '../src/math.js';
import { radarVisibility, radarContact, radarHorizon } from '../src/sensors.js';
import { configureTerrain, terrainWorld } from '../src/terrain.js';
import { unitTypes } from '../src/unitTypes.js';
import { guidedLaunchStatus, weaponProfiles, stepMissile } from '../src/weaponDynamics.js';
import { combatSource } from '../src/unitCombat.js';

const source = () => ({
  ground: true,
  position: new Vec3(),
  velocity: new Vec3(),
  spec: { ...unitTypes['sam-system'], radarCone: 180 },
});
const target = (y) => ({
  kind: 'air',
  position: new Vec3(0, y, 1500),
  velocity: new Vec3(0, 0, -100),
});
test('a generic SAM cannot track or launch below its lower beam, but can reacquire above it', () => {
  configureTerrain({ id: 'landing' }, new Vec3(), () => 0.99);
  const s = source(),
    t = target(8);
  assert.equal(radarVisibility(s, t).reason, 'low-elevation');
  assert.equal(guidedLaunchStatus(s, t, weaponProfiles.sam).canLaunch, false);
  t.position.y = 50;
  assert.equal(radarContact(s, t), true);
  assert.equal(guidedLaunchStatus(s, t, weaponProfiles.sam).canLaunch, true);
  t.position.y = 8;
  assert.equal(radarContact(s, t), false);
});
test('lower radar beam is a local profile rule, not universal low-altitude immunity', () => {
  configureTerrain({ id: 'landing' }, new Vec3(), () => 0.99);
  const t = target(8),
    ground = source();
  assert.equal(radarContact(ground, t), false);
  const airborne = {
    position: new Vec3(0, 100, 0),
    orientation: Quat.euler(0, 0, 0),
    spec: { radarRange: 10000, radarCone: 60 },
  };
  assert.equal(radarContact(airborne, t), true);
  assert.ok(radarHorizon(6, 5) < 20000);
  assert.ok(radarHorizon(1000, 5) > 100000);
});
test('terrain occlusion invalidates both airborne and ground radar contacts and refreshes when the terrain changes', () => {
  configureTerrain({ id: 'landing' }, new Vec3(), () => 0.99);
  const s = source(),
    t = target(900);
  s.position.x = 5000;
  s.position.y = 700;
  t.position.x = 5000;
  assert.equal(radarContact(s, t), true);
  terrainWorld.peaks.push({ x: 5000, z: 800, height: 1400, radius: 500, platform: 0 });
  terrainWorld.revision++;
  assert.equal(radarVisibility(s, t).reason, 'terrain');
  terrainWorld.peaks.length = 0;
  terrainWorld.revision++;
  assert.equal(radarContact(s, t), true);
});
test('ground radar blind sectors and lock loss apply equally to allied and hostile launchers', () => {
  configureTerrain({ id: 'landing' }, new Vec3(), () => 0.99);
  for (const team of ['ally', 'enemy']) {
    const t = {
        id: 'SAM',
        type: 'sam-system',
        kind: 'ground',
        team,
        alive: true,
        position: new Vec3(),
        velocity: new Vec3(),
        faction: team === 'ally' ? 'west' : 'east',
      },
      player = {
        spec: { faction: 'west' },
        position: new Vec3(100000, 1000, 0),
        velocity: new Vec3(),
        airborne: true,
        agl: 1000,
      },
      s = combatSource(t, player);
    assert.equal(radarContact(s, target(8)), false);
    assert.equal(radarContact(s, target(70)), true);
  }
});
test('a supported radar missile loses launch-radar support when target ducks below the beam', () => {
  configureTerrain({ id: 'landing' }, new Vec3(), () => 0.99);
  const s = source(),
    t = target(8),
    p = {
      profile: { ...weaponProfiles.sam, activeRange: 100 },
      position: new Vec3(0, 100, 300),
      velocity: new Vec3(0, 0, 500),
      age: 1,
      travelled: 300,
    };
  stepMissile(p, t, s, 1 / 120);
  assert.equal(p.seekerLost, true);
  assert.match(p.lossReason, /TÁMOGATÁS/);
});
