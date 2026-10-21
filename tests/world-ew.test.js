import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft } from '../src/aircraftSpec.js';
import { missions } from './fixtures/scenarios.js';
import { Vec3, Quat } from '../src/math.js';
import { createAircraft } from '../src/physics.js';
import {
  createTargets,
  updateTargets,
  radarContacts,
  Targeting,
  targetingStatus,
  applyTargetHit,
} from '../src/targeting.js';
import {
  navigationJammed,
  targetMasked,
  sensorTargets,
  jammerMissions,
} from '../src/electronicWarfare.js';
import { Weapons } from '../src/weapons.js';
import { Mission } from '../src/mission.js';
import { phaseGuide } from '../src/phaseGuide.js';
import { renderTacticalMap } from '../src/tacticalMap.js';
import {
  terrainWorld,
  configureTerrain,
  terrainHeight,
  pathCoordinates,
  pathPoint,
  convoyPose,
} from '../src/terrain.js';
import { groundMesh, groundInstances, groundHit } from '../src/groundModels.js';
import { terrainFeatureVisible, roadSection, roadSurface } from '../src/terrainFeatures.js';
const spec = aircraft.find((a) => a.id === 'f16'),
  mission = (id) => missions.find((m) => m.id === id);
function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function setup(id = 'sam-system') {
  const targets = createTargets(mission(id), spec, { rng: seeded(42) }),
    s = createAircraft(spec);
  let j = targets.find((t) => t.type === 'jammer');
  if (!j) {
    const position = targets[0].position.clone().add(new Vec3(1800, 0, 0));
    position.y = terrainHeight(position.x, position.z) + 3;
    j = {
      id: 'J01',
      type: 'jammer',
      name: 'Jelzavaró',
      kind: 'ground',
      alive: true,
      position,
      velocity: new Vec3(),
      jamRadius: 7000,
      threats: [],
    };
    targets.push(j);
  }
  s.position = j.position.clone().add(new Vec3(0, 1000, -8500));
  s.velocity = new Vec3(0, 0, 150);
  s.orientation = new Quat();
  s.airborne = true;
  s.onGround = false;
  s.agl = 1000;
  s.landingMode = 'off';
  return { s, targets, j, t: targets[0] };
}
test('isolated scenarios only place a jammer where configured and it covers a separate jammer that covers their primary objective', () => {
  for (const m of missions) {
    const targets = createTargets(m, spec, { rng: seeded(7) }),
      j = targets.filter((t) => t.type === 'jammer');
    assert.equal(j.length, jammerMissions.has(m.id) ? 1 : 0, m.id);
    if (j.length) {
      assert.notEqual(j[0].id, targets[0].id);
      assert.equal(targets[0].protectedBy, j[0].id);
      assert.ok(targets[0].position.distance(j[0].position) < j[0].jamRadius);
      assert.equal(j[0].threats.length, 0);
    }
  }
});
test('outside denial radius both the active enemy and jammer can be freely selected', () => {
  const { s, targets, j, t } = setup();
  assert.equal(navigationJammed(s, targets), false);
  assert.equal(targetMasked(t, targets), false);
  assert.deepEqual(new Set(sensorTargets(s, targets).map((t) => t.id)), new Set([t.id, j.id]));
  const aim = new Targeting();
  aim.cycle(s, targets);
  assert.equal(aim.id, j.id);
  aim.update(s, targets, 3);
  assert.equal(aim.locked, true);
  aim.cycle(s, targets);
  assert.equal(aim.id, t.id);
  assert.equal(aim.locked, false);
});

test('entering a 3D denial sphere clears acquisition and missile launch even with a stale lock, exit permits reacquisition', () => {
  const { s, targets, j } = setup(),
    aim = new Targeting(),
    w = new Weapons();
  aim.cycle(s, targets);
  aim.update(s, targets, 3);
  s.position = j.position.clone().add(new Vec3(0, 1000, -2000));
  assert.equal(navigationJammed(s, targets), true);
  assert.equal(radarContacts(s, targets).length, 0);
  aim.update(s, targets, 0.1);
  assert.equal(aim.id, null);
  assert.equal(aim.locked, false);
  assert.equal(aim.progress, 0);
  w.selected = 'agm';
  const before = s.ammo.agm;
  assert.match(w.fire(s, targets, { id: j.id, locked: true }), /JELZAVARÁS/);
  assert.equal(s.ammo.agm, before);
  assert.equal(targetingStatus(s, targets, aim, w).state, 'jammed');
  const m = new Mission(mission('sam-system'));
  m.update(s, targets, w, aim);
  assert.match(m.phase, /ZAVARÁS/);
  assert.ok(phaseGuide(s, m, aim, w, targets).every((x) => !/[0-9]+°|Célmagasság/.test(x.text)));
  s.position = j.position.clone().add(new Vec3(0, 1000, -8500));
  assert.equal(navigationJammed(s, targets), false);
  aim.cycle(s, targets);
  aim.update(s, targets, 1);
  assert.equal(aim.locked, false);
  aim.update(s, targets, 1.1);
  assert.equal(aim.locked, true);
});
test('jammer destruction restores sensors in the same position but does not finish the main objective', () => {
  const { s, targets, j, t } = setup(),
    w = new Weapons(),
    m = new Mission(mission('sam-system'));
  s.position = j.position.clone().add(new Vec3(0, 1000, -2000));
  assert.equal(navigationJammed(s, targets), true);
  applyTargetHit(j, 'bomb');
  assert.equal(navigationJammed(s, targets), false);
  assert.equal(targetMasked(t, targets), false);
  assert.ok(sensorTargets(s, targets).includes(t));
  m.update(s, targets, w);
  assert.equal(m.destroyed, false);
  assert.equal(m.objectiveComplete, false);
  applyTargetHit(t, 'bomb');
  m.update(s, targets, w);
  assert.equal(m.destroyed, true);
  assert.equal(m.complete, false);
});
test('a real unguided gun burst can destroy the jammer inside denial range and immediately reveal the primary', () => {
  const { s, targets, j, t } = setup(),
    w = new Weapons();
  s.position = j.position.clone().add(new Vec3(0, 100, -300));
  s.orientation = Quat.euler(0, 0, 0);
  const p = groundInstances(j)[0]
    .position.clone()
    .add(new Vec3(0, 3, 0));
  w.projectiles.push({
    type: 'gun',
    position: p.clone().add(new Vec3(0, 0, -40)),
    velocity: new Vec3(0, 0, 2400),
    age: 0,
    damage: 18,
  });
  assert.equal(navigationJammed(s, targets), true);
  for (let i = 0; i < 5 && j.alive; i++) w.update(s, targets, 1 / 120);
  assert.equal(j.alive, false);
  assert.equal(w.hits, 1);
  assert.equal(w.damageHits, 1);
  assert.equal(t.alive, true);
  assert.equal(navigationJammed(s, targets), false);
  assert.ok(sensorTargets(s, targets).includes(t));
});
test('masked enemy retains its weapons and really fires while its model remains present', () => {
  const { s, targets, j, t } = setup();
  s.position = t.position.clone().add(new Vec3(0, 550, 1100));
  s.agl = 550;
  s.velocity = new Vec3();
  const w = new Weapons({ enemyFire: true });
  w.enemyCombat.activeTime = 10;
  assert.equal(targetMasked(t, targets), false);
  assert.equal(navigationJammed(s, targets), true);
  for (let i = 0; i < 480; i++) w.enemyCombat.update(s, targets, w, 1 / 120);
  assert.ok(w.projectiles.some((p) => p.owner === 'enemy' && p.sourceId === t.id));
  assert.ok(groundInstances(t)[0].mesh.faces.length > 20);
  assert.ok(j.alive && t.alive);
});
test('jammed radar draws only monochrome static and no map, base, own position or enemy glyphs', () => {
  const { s, targets, j } = setup();
  s.position = j.position.clone();
  const texts = [],
    colors = [],
    c = {
      clearRect() {},
      fillRect() {
        colors.push(this.fillStyle);
      },
      fillText(t) {
        texts.push(t);
      },
    };
  const map = renderTacticalMap({ getContext: () => c }, s, targets, new Targeting());
  assert.equal(map.jammed, true);
  assert.equal(map.contacts.length, 0);
  assert.equal(texts.length, 1);
  assert.match(texts[0], /JELZAVARÁS/);
  assert.ok(colors.filter((x) => x.startsWith('rgb')).length > 3000);
  assert.ok(!texts.includes('BASE'));
});
test('river and road occur randomly with varying widths/headings; bridge and convoy force their required feature', () => {
  const seen = { river: new Set(), road: new Set(), canyon: new Set() },
    widths = new Set(),
    angles = new Set();
  for (let seed = 1; seed < 80; seed++) {
    const world = configureTerrain(
      mission('radar'),
      new Vec3(22000, 0, 0),
      seeded(seed * 2654435761),
    );
    for (const key of Object.keys(seen)) seen[key].add(!!world[key]);
    if (world.river) {
      widths.add(world.river.width);
      angles.add(world.river.angle);
    }
  }
  for (const values of Object.values(seen)) assert.deepEqual([...values].sort(), [false, true]);
  assert.ok(widths.size > 5 && angles.size > 5);
  const bridge = createTargets(mission('bridge'), spec, { rng: seeded(55) })[0];
  assert.ok(terrainWorld.river && terrainWorld.road);
  assert.ok(
    Math.abs(pathCoordinates(terrainWorld.river, bridge.position.x, bridge.position.z).across) <
      1e-8,
  );
  assert.ok(bridge.position.y > terrainWorld.river.level);
  assert.ok(terrainHeight(bridge.position.x, bridge.position.z) < terrainWorld.river.level);
  createTargets(mission('convoy'), spec, { rng: seeded(55) });
  assert.ok(terrainWorld.road);
});
test('bunker and flak always occupy a high plateau and runway approaches remain clear on varied generated maps', () => {
  for (const id of ['bunker', 'sam'])
    for (let seed = 1; seed <= 20; seed++) {
      const t = createTargets(mission(id), spec, { rng: seeded(seed) });
      assert.ok(t[0].position.y >= 850, id);
      for (const sign of [-1, 1])
        for (let d = 0; d <= 6000; d += 300) {
          const z = sign * (1600 + d),
            glide = 2 + d * Math.tan(Math.PI / 60);
          assert.ok(terrainHeight(0, z) < glide);
        }
    }
});
test('convoy moves continuously along the generated road, trucks follow bends and stay under jammer coverage', () => {
  const { targets, j, t } = setup('convoy'),
    initial = t.position.clone();
  assert.equal(groundInstances(t).length, 5);
  for (let i = 0; i < 2400; i++) {
    updateTargets(targets, 0.25);
    assert.ok(
      Math.abs(pathCoordinates(terrainWorld.road, t.position.x, t.position.z).across) < 1e-7,
    );
    assert.ok(t.position.distance(j.position) < j.jamRadius);
    assert.ok(t.position.y > terrainHeight(t.position.x, t.position.z));
  }
  assert.ok(initial.distance(t.position) > 100);
  for (const i of [-2, -1, 0, 1, 2]) {
    const pose = convoyPose(t, i * 30),
      center = pathPoint(terrainWorld.road, t.routeDistance + i * 30 * t.routeDirection);
    assert.ok(Math.hypot(pose.position.x - center.x, pose.position.z - center.z) < 1e-7);
  }
});
test('ground models have distinct finite geometry and collision follows rotated trucks instead of an oversized target sphere', () => {
  const signatures = new Set();
  for (const type of [
    'bunker',
    'convoy',
    'truck',
    'bridge',
    'sam',
    'sam-system',
    'jammer',
    'airbase',
  ]) {
    const mesh = groundMesh(type);
    assert.ok(mesh.faces.length > 5);
    assert.ok(mesh.points.every((p) => [p.x, p.y, p.z].every(Number.isFinite)));
    assert.ok(mesh.faces.every((f) => f.every((i) => mesh.points[i])));
    signatures.add(mesh.points.length + ':' + mesh.faces.length);
  }
  assert.ok(signatures.size >= 8);
  const t = { type: 'jammer', position: new Vec3(22000, 0, 20000), heading: Math.PI / 2 };
  const { position } = groundInstances(t)[0];
  assert.equal(
    groundHit(
      t,
      position.clone().add(new Vec3(0, 50, 0)),
      position.clone().add(new Vec3(0, -5, 0)),
    ),
    true,
  );
  assert.equal(
    groundHit(
      t,
      position.clone().add(new Vec3(55, 50, 0)),
      position.clone().add(new Vec3(55, -5, 0)),
    ),
    false,
  );
});
test('terrain features disappear behind a ridge and remain visible from above it', () => {
  configureTerrain(mission('bunker'), new Vec3(22000, 0, 0), () => 0.99);
  const a = new Vec3(17000, 0, 0),
    b = new Vec3(27000, 0, 0),
    height = Math.max(terrainHeight(a.x, a.z), terrainHeight(b.x, b.z)) + 50;
  a.y = b.y = height;
  assert.equal(terrainFeatureVisible(a, b), false);
  a.y = b.y = 3000;
  assert.equal(terrainFeatureVisible(a, b), true);
});
test('a road routes around the mountain instead of drawing directly over the peak; its coordinates and truck headings agree', () => {
  configureTerrain(mission('bunker'), new Vec3(22000, 0, 0), () => 0);
  const road = terrainWorld.road,
    peak = terrainWorld.peaks[0];
  let closest = Infinity;
  for (let t = -7000; t <= 7000; t += 50) {
    const p = pathPoint(road, t);
    closest = Math.min(closest, Math.hypot(p.x - peak.x, p.z - peak.z));
    assert.ok(Math.abs(pathCoordinates(road, p.x, p.z).across) < 1e-7);
  }
  assert.ok(closest > peak.radius * 1.3);
});
test('road ribbons have physical width and sit on terrain, with bridge approaches joining the deck height', () => {
  createTargets(mission('convoy'), spec, { rng: seeded(42) });
  let road = terrainWorld.road;
  for (const t of [-1000, 0, 1000]) {
    const points = roadSection(road, t, 30);
    assert.ok(
      Math.abs(Math.hypot(points[0].x - points[1].x, points[0].z - points[1].z) - road.width) <
        1e-8,
    );
    for (const p of points) assert.ok(Math.abs(p.y - terrainHeight(p.x, p.z) - 0.8) < 1e-8);
  }
  createTargets(mission('bridge'), spec, { rng: seeded(42) });
  road = terrainWorld.road;
  const center = pathPoint(road, 0);
  assert.ok(Math.abs(roadSurface(road, center) - terrainWorld.river.level - 16.1) < 1e-8);
});
