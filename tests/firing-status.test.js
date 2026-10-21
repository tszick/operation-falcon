import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft } from '../src/aircraftSpec.js';
import { Vec3, Quat, DEG } from '../src/math.js';
import { createAircraft } from '../src/physics.js';
import { configureTerrain, terrainHeight } from '../src/terrain.js';
import { Weapons } from '../src/weapons.js';
import { Targeting, targetingStatus } from '../src/targeting.js';
import { firingStatus } from '../src/firingStatus.js';
import { fireSolution } from '../src/weaponDynamics.js';
import { navigationJammed } from '../src/electronicWarfare.js';
import { phaseGuide } from '../src/phaseGuide.js';
function setup() {
  configureTerrain({ id: 'radar' }, new Vec3(22000, 0, 0), () => 0.99);
  const s = createAircraft(aircraft.find((a) => a.id === 'f16'));
  s.position = new Vec3(0, 1500, 0);
  s.velocity = new Vec3(0, 0, 180);
  s.orientation = new Quat();
  s.onGround = false;
  s.airborne = true;
  const position = new Vec3(0, 0, 8000);
  position.y = terrainHeight(position.x, position.z) + 3;
  const t = {
      id: 'J',
      name: 'Jelzavaró',
      kind: 'ground',
      type: 'jammer',
      jamRadius: 7000,
      alive: true,
      position,
      velocity: new Vec3(),
    },
    aim = new Targeting(),
    w = new Weapons();
  w.selected = 'agm';
  aim.id = t.id;
  aim.locked = true;
  aim.progress = 2;
  return { s, t, aim, w };
}
test('Maverick in range but outside its launch angle cannot claim an available launch on either cockpit line', () => {
  const { s, t, aim, w } = setup();
  t.position = new Vec3(Math.sin(55 * DEG) * 8000, 1500, Math.cos(55 * DEG) * 8000);
  const solution = fireSolution(s, t, 'agm');
  assert.ok(solution.distance < solution.maxRange);
  assert.equal(solution.status, 'angle');
  assert.doesNotMatch(solution.detail, /SZÓKÖZ: INDÍTÁS/);
  assert.match(solution.detail, /ORROT/);
  const hud = targetingStatus(s, [t], aim, w),
    before = s.ammo.agm;
  assert.match(hud.label, /INDÍTÁS TILTVA.*SZÖG/);
  assert.equal(hud.solution.canLaunch, false);
  assert.match(w.fire(s, [t], aim), /SZÖG/);
  assert.equal(s.ammo.agm, before);
  const steps = phaseGuide(s, { spec: { kind: 'ground' }, phaseId: 'jammer-attack' }, aim, w, [t]);
  assert.match(steps.at(-1).text, /INDÍTÁSI SZÖG/);
  assert.notEqual(steps.at(-1).key, 'SZÓKÖZ');
});
test('the same launch permission covers a damaged system, rearming delay and jammer boundary', () => {
  const { s, t, aim, w } = setup();
  assert.equal(firingStatus(s, [t], aim, w).canFire, true);
  w.cooldown = 0.8;
  assert.equal(firingStatus(s, [t], aim, w).status, 'cooldown');
  assert.match(targetingStatus(s, [t], aim, w).label, /ELŐKÉSZÍTÉSE/);
  w.cooldown = 0;
  s.condition.parts.weapons = 0.2;
  assert.equal(firingStatus(s, [t], aim, w).status, 'disabled');
  assert.match(targetingStatus(s, [t], aim, w).label, /RAKÉTAINDÍTÁS TILTVA/);
  s.condition.parts.weapons = 1;
  s.position.z = 2000;
  assert.equal(firingStatus(s, [t], aim, w).status, 'jammed');
  assert.match(w.fire(s, [t], aim), /JELZAVARÁS/);
  assert.equal(targetingStatus(s, [t], aim, w).state, 'jammed');
});
test('a Maverick launched outside the 7 km denial sphere still hits after the player enters it and loses acquisition', () => {
  const { s, t, aim, w } = setup();
  assert.match(w.fire(s, [t], aim), /INDÍTVA/);
  let entered = false;
  for (let i = 0; i < 120 * 35 && t.alive; i++) {
    s.position.add(s.velocity.clone().scale(1 / 120));
    if (navigationJammed(s, [t])) {
      entered = true;
      aim.update(s, [t], 1 / 120);
      assert.equal(aim.locked, false);
    }
    w.update(s, [t], 1 / 120);
  }
  assert.equal(entered, true);
  assert.equal(t.alive, false);
  assert.equal(w.hits, 1);
});
test('cannon and bombs remain usable inside jammer coverage without a selected or locked target', () => {
  for (const type of ['gun', 'bomb']) {
    const { s, t, aim, w } = setup();
    s.position.z = 2000;
    aim.id = null;
    aim.locked = false;
    w.selected = type;
    assert.equal(navigationJammed(s, [t]), true);
    assert.equal(firingStatus(s, [t], aim, w).canFire, true);
    const before = s.ammo[type];
    assert.ok(w.fire(s, [t], aim));
    assert.equal(s.ammo[type], before - 1);
    assert.equal(w.projectiles.length, 1);
  }
});
