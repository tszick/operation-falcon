import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { missionForSide } from '../src/missionSides.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { createTargets, updateTargets, applyTargetHit, Targeting } from '../src/targeting.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { EnemyCombat } from '../src/enemyCombat.js';
import { launchDrone, moveAttackDrone, updateDroneOperations } from '../src/droneOps.js';
import { mobileRules as rules } from '../src/mobileUnitData.js';
import { unitTypes } from '../src/unitTypes.js';
import { navigationJammed } from '../src/electronicWarfare.js';
import { groundMesh, groundInstances, groundHit } from '../src/groundModels.js';
import { enemyProfile, weaponProfiles } from '../src/weaponDynamics.js';
import { Vec3, Quat } from '../src/math.js';
import { terrainHeight, convoyPose } from '../src/terrain.js';
import { militaryAircraft } from '../src/aiDefense.js';
function setup(side = 'west') {
  const spec = aircraft.find((a) => a.id === (side === 'west' ? 'f16' : 'mig29')),
    mission = missionForSide(
      missions.find((m) => m.id === 'convoy'),
      side,
    ),
    targets = createTargets(mission, spec, { rng: () => 0.3 }),
    s = createMissionAircraft(spec, mission),
    w = new Weapons({ enemyFire: true, random: () => 0.5 }),
    m = new Mission(mission),
    by = (id) => targets.find((t) => t.id === id);
  return { s, w, m, targets, by, command: by('DRONE-COMMAND'), base: by('BASE') };
}

test('mobile escorts follow the convoy road at distinct gaps and stop when the convoy stops', () => {
  for (const side of ['west', 'east']) {
    const x = setup(side),
      convoy = x.by('CONVOY'),
      jammer = x.by('MOBILE-JAMMER'),
      sam = x.by('MOBILE-SAM');
    const before = jammer.position.clone(),
      baseDistance = x.command.position.distance(x.base.position);
    for (let i = 0; i < 120; i++) updateTargets(x.targets, 1 / 120);
    assert.ok(jammer.position.distance(before) > 10);
    assert.equal(jammer.routeDistance, convoy.routeDistance - 240);
    assert.equal(sam.routeDistance, convoy.routeDistance - 140);
    const roadPosition = convoyPose(jammer).position;
    assert.ok(
      Math.hypot(jammer.position.x - roadPosition.x, jammer.position.z - roadPosition.z) < 1e-6,
    );
    assert.ok(x.command.position.distance(x.base.position) < baseDistance);
    applyTargetHit(convoy, 'bomb', { amount: 1000 });
    updateTargets(x.targets, 1 / 120);
    const stopped = jammer.position.clone();
    for (let i = 0; i < 120; i++) updateTargets(x.targets, 1 / 120);
    assert.equal(jammer.position.distance(stopped), 0);
    assert.equal(jammer.stopped, true);
  }
});

test('mobile jammer uses a smaller moving three-dimensional denial zone and only affects opponents', () => {
  const x = setup(),
    t = x.by('MOBILE-JAMMER');
  assert.equal(t.jamRadius, 3000);
  assert.ok(t.jamRadius < unitTypes.jammer.range);
  x.s.position = t.position.clone().add(new Vec3(0, 2000, 0));
  assert.equal(navigationJammed(x.s, [t]), true);
  t.team = 'ally';
  assert.equal(navigationJammed(x.s, [t]), false);
  t.team = 'enemy';
  x.s.position.y += 1500;
  assert.equal(navigationJammed(x.s, [t]), false);
  x.s.position = t.position.clone();
  t.alive = false;
  assert.equal(navigationJammed(x.s, [t]), false);
});

test('mobile SAM has a genuinely shorter and weaker IR profile, finite stock and actual AI launches on either side', () => {
  for (const team of ['ally', 'enemy']) {
    const x = setup(),
      t = x.by('MOBILE-SAM'),
      combat = new EnemyCombat();
    t.team = team;
    t.followId = null;
    t.position = new Vec3(0, terrainHeight(0, 0) + 1, 0);
    const target = {
      id: 'AIR-TARGET',
      type: 'tanker',
      kind: 'air',
      alive: true,
      team: team === 'ally' ? 'enemy' : 'ally',
      position: new Vec3(0, 1000, 2000),
      velocity: new Vec3(),
      threats: [],
      health: 100,
      maxHealth: 100,
      aircraftId: 'kc135',
      heading: 0,
      agl: 1000,
    };
    x.s.position = new Vec3(50000, 2000, 0);
    const profile = enemyProfile(t, 'aam');
    assert.equal(profile.guidance, 'ir');
    assert.equal(profile.maxRange, 6000);
    assert.ok(profile.maxRange < weaponProfiles.sam.maxRange);
    assert.ok(profile.damage < 50);
    assert.equal(combat.unit(t).missiles, 4);
    for (let i = 0; i < 180; i++) combat.update(x.s, [t, target], x.w, 0.1);
    assert.ok(
      x.w.projectiles.some(
        (p) => p.sourceId === t.id && p.profile.id === 'mobileSam' && p.damage === 26,
      ),
    );
    assert.ok(combat.unit(t).missiles < 4);
  }
});

test('drone launcher obeys preparation, 1–2 active limit, launch interval and eight-round stock', () => {
  const x = setup();
  x.s.elapsed = 119;
  updateDroneOperations(x.s, x.m, x.targets, x.w);
  assert.equal(x.targets.filter((t) => t.type === 'attack-drone').length, 0);
  for (let batch = 0; batch < 4; batch++) {
    x.s.elapsed = 120 + batch * 90;
    updateDroneOperations(x.s, x.m, x.targets, x.w);
    const active = x.targets.filter((t) => t.type === 'attack-drone' && t.alive);
    assert.equal(active.length, 2);
    assert.ok(active.every((d) => d.aiTargetId === 'BASE' && !militaryAircraft(d)));
    x.s.elapsed += 1;
    updateDroneOperations(x.s, x.m, x.targets, x.w);
    assert.equal(x.targets.filter((t) => t.type === 'attack-drone' && t.alive).length, 2);
    active.forEach((d) => applyTargetHit(d, 'gun'));
  }
  x.s.elapsed += 100;
  updateDroneOperations(x.s, x.m, x.targets, x.w);
  assert.equal(x.command.droneStock, 0);
  assert.equal(x.w.events.filter((e) => e.type === 'drone-launch').length, 8);
  const single = setup();
  single.command.droneSalvo = 1;
  single.s.elapsed = 120;
  updateDroneOperations(single.s, single.m, single.targets, single.w);
  assert.equal(single.targets.filter((t) => t.type === 'attack-drone').length, 1);
});

test('drone launchers never target an airborne opponent and stop launching after destruction or mission end', () => {
  const x = setup();
  x.s.elapsed = 120;
  const plane = {
    id: 'PLANE',
    alive: true,
    kind: 'air',
    team: 'ally',
    position: x.command.position.clone().add(new Vec3(0, 1000, 0)),
  };
  x.command.aiTargetId = plane.id;
  updateDroneOperations(x.s, x.m, [x.command, plane], x.w);
  assert.equal(x.w.events.length, 0);
  x.command.alive = false;
  updateDroneOperations(x.s, x.m, x.targets, x.w);
  assert.equal(
    x.targets.some((t) => t.type === 'attack-drone'),
    false,
  );
  x.command.alive = true;
  x.m.complete = true;
  updateDroneOperations(x.s, x.m, x.targets, x.w);
  assert.equal(
    x.targets.some((t) => t.type === 'attack-drone'),
    false,
  );
});

test('a drone flies physically into a ground target, damages it once, and survives controller loss until impact', () => {
  const x = setup();
  x.command.position = x.base.position.clone().add(new Vec3(0, 0, -2000));
  x.command.position.y = terrainHeight(x.command.position.x, x.command.position.z) + 1;
  const drone = launchDrone(x.command, x.base);
  x.targets.push(drone);
  x.command.alive = false;
  const before = x.base.health;
  for (let i = 0; i < 2400 && drone.alive; i++) {
    x.s.elapsed += 0.05;
    updateTargets(x.targets, 0.05);
    updateDroneOperations(x.s, x.m, x.targets, x.w);
  }
  assert.equal(drone.impacted, true);
  assert.ok(drone.drone.travelled > 1900);
  assert.equal(x.base.health, before - rules.droneDamage);
  updateDroneOperations(x.s, x.m, x.targets, x.w);
  assert.equal(x.base.health, before - rules.droneDamage);
  assert.equal(x.base.alive, true);
});

test('drones expire at their physical range or endurance instead of chasing indefinitely', () => {
  const x = setup();
  for (const limit of ['age', 'travelled']) {
    const drone = launchDrone(x.command, x.base);
    drone.drone[limit] = limit === 'age' ? rules.droneEndurance : rules.droneRange;
    moveAttackDrone(drone, x.targets, 0.1);
    assert.equal(drone.alive, false);
    assert.equal(drone.expired, true);
    assert.equal(drone.impacted, undefined);
  }
});

test('actual cannon and air-to-air missile projectiles can destroy a drone without creating a fighter flight model', () => {
  for (const type of ['gun', 'aam']) {
    const x = setup(),
      drone = launchDrone(x.command, x.base);
    drone.position = new Vec3(0, 1200, 300);
    drone.previousPosition = drone.position.clone();
    drone.velocity = new Vec3();
    x.targets = [drone];
    x.w.enemyFire = false;
    x.s.position = new Vec3(0, 1200, 0);
    x.s.velocity = new Vec3();
    x.s.orientation = new Quat();
    x.s.onGround = false;
    x.s.airborne = true;
    x.s.agl = 1200;
    if (type === 'gun') {
      x.w.selected = 'gun';
      assert.ok(x.w.fire(x.s, x.targets, new Targeting()));
    } else
      x.w.projectiles.push({
        id: 1,
        owner: 'ally',
        type: 'aam',
        profile: weaponProfiles.aim9m,
        sourceId: 'PLAYER',
        targetId: drone.id,
        targetEntityId: drone.id,
        position: new Vec3(0, 1200, 100),
        previous: new Vec3(0, 1200, 100),
        velocity: new Vec3(0, 0, 600),
        age: 1,
        travelled: 300,
        armed: true,
        trailTimer: 0,
        trailAnchor: new Vec3(0, 1200, 100),
      });
    assert.ok(type !== 'gun' || x.w.used > 0);
    for (let i = 0; i < 120 && drone.alive; i++) {
      x.w.update(x.s, x.targets, 1 / 120);
      if (type === 'gun' && i % 12 === 0) x.w.fire(x.s, x.targets, new Targeting());
    }
    assert.equal(drone.alive, false, type);
    assert.equal(drone.flight, undefined);
  }
});

test('bridge success waits for command destruction, incoming drone interception, base survival and landing', () => {
  const x = setup();
  x.m.departed = true;
  applyTargetHit(x.by('BRIDGE'), 'bomb');
  const drone = launchDrone(x.command, x.base);
  x.targets.push(drone);
  applyTargetHit(x.command, 'bomb');
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.objectiveComplete, false);
  applyTargetHit(drone, 'gun');
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.objectiveComplete, true);
  assert.equal(x.m.complete, false);
  x.s.airborne = true;
  x.s.onGround = true;
  x.s.speed = 0;
  x.s.landing = { success: true, descent: 1, offset: 0 };
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.complete, true);
  const lost = setup();
  lost.base.health = 0;
  lost.base.alive = false;
  lost.m.update(lost.s, lost.targets, lost.w);
  assert.equal(lost.m.failed, true);
});

test('new models have distinct closed faces, and vehicle hit geometry matches rendered positions', () => {
  const x = setup(),
    signatures = new Set();
  for (const type of ['mobile-sam', 'mobile-jammer', 'drone-command', 'attack-drone']) {
    const mesh = groundMesh(type);
    assert.ok(mesh.faces.length > 10);
    assert.ok(mesh.points.every((p) => Number.isFinite(p.x + p.y + p.z)));
    signatures.add(JSON.stringify(mesh.points));
  }
  assert.equal(signatures.size, 4);
  for (const t of x.targets.filter((t) =>
    ['mobile-sam', 'mobile-jammer', 'drone-command'].includes(t.type),
  )) {
    assert.equal(groundInstances(t).length, 1);
    const p = groundInstances(t)[0]
      .position.clone()
      .add(new Vec3(0, 3, 0));
    assert.ok(groundHit(t, p.clone().add(new Vec3(0, 0, -20)), p.clone().add(new Vec3(0, 0, 20))));
  }
});

test('unopposed convoy-mission drone strikes physically reach and can eventually destroy the defended airfield', () => {
  const x = setup();
  applyTargetHit(x.by('BRIDGE'), 'bomb');
  for (let i = 0; i < 2600 && !x.m.failed; i++) {
    x.s.elapsed += 0.5;
    updateTargets(x.targets, 0.5);
    x.m.update(x.s, x.targets, x.w);
  }
  assert.ok(x.w.events.some((e) => e.type === 'drone-impact'));
  assert.equal(x.base.alive, false);
  assert.equal(x.m.failed, true);
  assert.ok(x.command.droneStock < rules.droneStock);
});

test('a ground SAM cannot fire its air-defence missiles at an assigned ground object', () => {
  const x = setup(),
    sam = x.by('MOBILE-SAM'),
    combat = new EnemyCombat();
  sam.position = new Vec3(0, 1, 2500);
  sam.aiTargetId = x.base.id;
  x.s.position = new Vec3(50000, 1000, 50000);
  for (let i = 0; i < 200; i++) combat.update(x.s, [sam, x.base], x.w, 0.1);
  assert.equal(x.w.projectiles.length, 0);
  assert.equal(combat.unit(sam).missiles, 4);
});
