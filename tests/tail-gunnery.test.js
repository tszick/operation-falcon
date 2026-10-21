import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { Vec3, Quat, forward } from '../src/math.js';
import { createAircraft } from '../src/physics.js';
import {
  defaultLoadout,
  configureAircraft,
  plannedDeparture,
  validateLoadout,
} from '../src/loadoutPlanner.js';
import { mass, ammoMass } from '../src/performance.js';
import { createMissionAircraft, serviceAircraft, defaultMissionFuel } from '../src/missionStart.js';
import { HeadLook } from '../src/headLook.js';
import { setRearView, tailGunPose, tailGunStatus } from '../src/tailGunnery.js';
import { Weapons } from '../src/weapons.js';
import { firingStatus } from '../src/firingStatus.js';
const bomber = (id) => aircraft.find((a) => a.id === id);
function scene(id = 'tu95') {
  const s = createAircraft(bomber(id));
  Object.assign(s, {
    position: new Vec3(0, 3000, 0),
    velocity: new Vec3(0, 0, 170),
    orientation: new Quat(),
    onGround: false,
    airborne: true,
    agl: 3000,
  });
  return s;
}
test('both approved bombers have their own compatible bomb bays and separate aft ammunition', () => {
  for (const id of ['b52', 'tu95']) {
    const spec = bomber(id),
      s = scene(id);
    assert.ok(spec);
    assert.equal(s.spec.hasAB, false);
    assert.equal(s.ammo.gun, 0);
    assert.equal(s.ammo.aam, 0);
    assert.equal(s.ammo.agm, 0);
    assert.equal(s.ammo.bomb, 12);
    assert.equal(s.ammo.tailGun, 1800);
    assert.equal(validateLoadout(spec, defaultLoadout(spec)).valid, true);
  }
});
test('chosen tail ammunition changes planned and flying mass without consuming a store station', () => {
  for (const id of ['b52', 'tu95']) {
    const spec = bomber(id),
      choice = defaultLoadout(spec),
      full = plannedDeparture(spec, choice),
      n = choice.stations.length;
    choice.tailGun = 100;
    const partial = plannedDeparture(spec, choice),
      s = createAircraft(configureAircraft(spec, choice));
    assert.equal(choice.stations.length, n);
    assert.equal(s.ammo.tailGun, 100);
    assert.equal(partial.tailGunAmmoKg, ammoMass(spec, 'tailGun', 100));
    assert.ok(Math.abs(full.totalKg - partial.totalKg - ammoMass(spec, 'tailGun', 1700)) < 1e-7);
    assert.equal(mass(s), partial.totalKg);
    choice.tailGun = 1801;
    assert.equal(validateLoadout(spec, choice).valid, false);
    choice.tailGun = -1;
    assert.equal(validateLoadout(spec, choice).valid, false);
  }
});
test('V-equivalent mode change is supported only for real tail-gun aircraft and retains normal head-look behavior', () => {
  const s = scene(),
    head = new HeadLook(),
    f = createAircraft(aircraft.find((a) => a.id === 'f16'));
  assert.equal(setRearView(f, head, true), false);
  assert.equal(setRearView(s, head, true), true);
  assert.ok(forward(tailGunPose(s).orientation).z < -0.99);
  head.move(80, -10, 0);
  for (let i = 0; i < 100; i++) head.update(0.01, i * 0.01);
  assert.ok(head.yaw > 0.2);
  setRearView(s, head, false);
  assert.equal(s.rearView, false);
  assert.equal(head.rear, false);
  assert.equal(head.hold, false);
  head.move(80, 0, 2);
  for (let i = 0; i < 150; i++) head.update(0.01, 2 + i * 0.01);
  assert.ok(Math.abs(head.yaw) < 0.001);
});
test('rear trigger always fires only the aft gun, independent of selected bomb or missile', () => {
  const s = scene(),
    head = new HeadLook(),
    w = new Weapons({ random: () => 0.5 });
  setRearView(s, head, true);
  w.selected = 'bomb';
  const before = { ...s.ammo },
    weight = mass(s);
  assert.equal(firingStatus(s, [], {}, w).canFire, true);
  assert.match(w.fire(s, [], {}), /FAROKGÉPÁGYÚ/);
  assert.equal(s.ammo.tailGun, before.tailGun - 1);
  assert.equal(s.ammo.bomb, before.bomb);
  assert.equal(w.projectiles[0].type, 'gun');
  assert.ok(w.projectiles[0].position.z < -20);
  assert.ok(w.projectiles[0].velocity.z < 0);
  assert.ok(Math.abs(weight - mass(s) - ammoMass(s.spec, 'tailGun', 1)) < 1e-7);
  assert.equal(w.events[0].station, 'tail');
  assert.equal(w.fire(s, [], {}), null);
});
test('empty, damaged, grounded, training or out-of-sector tail guns cannot create projectiles', () => {
  for (const mode of ['empty', 'damage', 'ground', 'training', 'arc']) {
    const s = scene(),
      head = new HeadLook(),
      w = new Weapons();
    setRearView(s, head, true);
    if (mode === 'empty') s.ammo.tailGun = 0;
    if (mode === 'damage') s.condition.parts.weapons = 0.3;
    if (mode === 'ground') s.onGround = true;
    if (mode === 'training') s.training = true;
    if (mode === 'arc') s.rearAim = { yaw: 1.1, pitch: 1.1 };
    assert.equal(tailGunStatus(s).canFire, false, mode);
    const before = { ...s.ammo };
    w.fire(s, [], {});
    assert.equal(w.projectiles.length, 0);
    assert.deepEqual(s.ammo, before);
  }
});
test('rear aim changes the fired direction without turning the aircraft and can really damage a target aft', () => {
  const s = scene(),
    head = new HeadLook(),
    w = new Weapons({ random: () => 0.5 });
  setRearView(s, head, true);
  s.rearAim = { yaw: 0.2, pitch: 0.1 };
  const before = { ...s.orientation };
  assert.ok(tailGunPose(s).inArc);
  w.fire(s, [], {});
  assert.deepEqual({ ...s.orientation }, before);
  assert.ok(w.projectiles[0].velocity.x < 0);
  const s2 = scene(),
    w2 = new Weapons({ random: () => 1 }),
    target = {
      id: 'REAR',
      aircraftId: 'mig29',
      kind: 'air',
      type: 'fighter',
      team: 'enemy',
      alive: true,
      radius: 28,
      position: new Vec3(0, 3000, -200),
      velocity: new Vec3(),
      heading: 0,
    };
  setRearView(s2, new HeadLook(), true);
  w2.fire(s2, [target], {});
  for (let i = 0; i < 240 && !w2.damageHits; i++) w2.update(s2, [target], 1 / 120);
  assert.equal(w2.damageHits, 1);
  assert.ok(target.damage > 0);
});
test('training removes all aft ammunition; intermediate servicing restores the chosen load rather than the maximum', () => {
  const spec = bomber('tu95'),
    choice = defaultLoadout(spec);
  choice.tailGun = 250;
  const configured = configureAircraft(spec, choice),
    landing = missions.find((m) => m.objective === 'landing'),
    s = createMissionAircraft(configured, landing);
  assert.equal(s.ammo.tailGun || 0, 0);
  const armed = scene();
  Object.assign(armed, createAircraft(configured));
  armed.ammo.tailGun = 0;
  serviceAircraft(armed);
  assert.equal(armed.ammo.tailGun, 250);
  assert.equal(armed.rearView, undefined);
  assert.equal(
    defaultMissionFuel(
      missions.find((m) => m.id === 'air-superiority'),
      bomber('b52'),
    ),
    0.9,
  );
});
