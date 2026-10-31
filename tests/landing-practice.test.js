import { seededRandom } from '../src/oceanEnvironment.js';
import { isHostile } from '../src/unitTypes.js';
import { trainingAircraft } from '../src/trainingAircraft.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft } from '../src/aircraftSpec.js';
import { missions } from './fixtures/scenarios.js';
import { createMissionAircraft, landingStart } from '../src/missionStart.js';
import { stepAircraft } from '../src/physics.js';
import { attitude, DEG, Vec3, Quat } from '../src/math.js';
import { evaluateApproach } from '../src/landing.js';
import { terrainHeight, runway, configureTerrain } from '../src/terrain.js';
import { createTargets, Targeting } from '../src/targeting.js';
import { Weapons } from '../src/weapons.js';
import { Mission } from '../src/mission.js';
import { phaseGuide } from '../src/phaseGuide.js';
import { storesMarkup } from '../src/storesDisplay.js';
const practice = missions.find((m) => m.id === 'landing');
test('landing practice always uses the trainer, overriding combat aircraft selections in stable aligned flight, lightly fuelled and unarmed', () => {
  for (const spec of aircraft) {
    const s = createMissionAircraft(spec, practice);
    assert.equal(s.spec.id, 't45');
    const a = attitude(s.orientation);
    assert.equal(s.onGround, false);
    assert.equal(s.airborne, true);
    assert.equal(s.training, true);
    assert.equal(s.position.x, 0);
    assert.equal(s.position.z, -runway.halfLength - landingStart.distance);
    assert.ok(Math.abs(a.heading) < 1e-9 && Math.abs(a.bank) < 1e-9);
    assert.ok(a.pitch > -3 * DEG && a.pitch < 15 * DEG, spec.id);
    assert.equal(s.fuel, trainingAircraft.fuelCapacity * 0.15);
    assert.deepEqual(s.ammo, { gun: 0, aam: 0, agm: 0, bomb: 0 });
    assert.equal(s.afterburner, false);
    assert.ok(s.agl > 250);
    assert.ok(s.ias > 50 && s.velocity.y < 0);
    assert.equal(s.gear, false);
    assert.equal(s.flapPosition, 0);
    for (let i = 0; i < 120 * 10; i++) stepAircraft(s, {});
    assert.equal(s.crashed, false, spec.id);
    assert.equal(s.approach.active, false, spec.id);
    assert.ok(Math.abs(s.position.x) < 1e-5);
  }
});
test('practice allows neutral scenery but has no hostile targets and requires manual N mode', () => {
  const sceneryCases = new Set();
  for (const seed of [1, 2, 3, 4, 5, 42]) {
    const s = createMissionAircraft(aircraft[2], practice),
      w = new Weapons(),
      m = new Mission(practice),
      aim = new Targeting();
    const targets = createTargets(practice, s.spec, { rng: seededRandom(seed) });
    sceneryCases.add(targets.length > 0);
    assert.equal(
      targets.some((t) => isHostile(t, s)),
      false,
    );
    assert.ok(targets.every((t) => t.team === 'neutral' && t.incidental && t.type === 'bridge'));
    m.update(s, targets, w, aim);
    assert.equal(m.phaseId, 'landing-setup');
    assert.equal(m.objectiveComplete, false);
    assert.equal(m.destroyed, false);
    assert.equal(phaseGuide(s, m, aim, w, targets)[0].key, 'N');
    assert.equal(s.approach.active, false);
    s.landingMode = 'on';
    s.approach = evaluateApproach(s);
    m.update(s, targets, w, aim);
    assert.equal(s.approach.active, true);
    assert.equal(m.phaseId, 'landing');
    s.landingMode = 'off';
    s.approach = evaluateApproach(s);
    m.update(s, targets, w, aim);
    assert.equal(m.phaseId, 'landing-setup');
  }
  assert.deepEqual(sceneryCases, new Set([false, true]));
});
test('safe landing alone is not enough until rollout stops; destruction is never required', () => {
  const s = createMissionAircraft(aircraft[2], practice),
    w = new Weapons(),
    m = new Mission(practice);
  s.position = new Vec3(0, 2.001, -1000);
  s.velocity = new Vec3(0, -1, 65);
  s.orientation = Quat.euler(0, 3 * DEG, 0);
  s.gear = true;
  s.flaps = true;
  s.flapPosition = 1;
  stepAircraft(s, {});
  assert.equal(s.landing.success, true);
  m.update(s, [], w);
  assert.equal(m.complete, false);
  assert.equal(m.phaseId, 'rollout');
  s.speed = 0;
  m.update(s, [], w);
  assert.equal(m.complete, true);
  assert.equal(m.destroyed, false);
  assert.match(m.phaseHint, /gyakorlat/);
  assert.ok(m.score > 0);
});
test('unsafe touchdown fails normally and can restart in the same airborne training position', () => {
  const s = createMissionAircraft(aircraft[2], practice),
    w = new Weapons(),
    m = new Mission(practice);
  s.position = new Vec3(0, 2.001, -1000);
  s.velocity = new Vec3(0, -8, 65);
  s.gear = false;
  stepAircraft(s, {});
  assert.equal(s.crashed, true);
  m.update(s, [], w);
  assert.equal(m.complete, false);
  assert.equal(m.phaseId, 'failed');
  const retry = createMissionAircraft(s.spec, practice);
  assert.equal(retry.crashed, false);
  assert.equal(retry.position.z, -7600);
  assert.equal(retry.landingMode, 'off');
  assert.equal(retry.landing, null);
});
test('practice weapons are absent from the schematic and cannot fire even if ammo is injected', () => {
  const s = createMissionAircraft(aircraft[2], practice),
    w = new Weapons();
  assert.match(storesMarkup(s, 'none'), /FEGYVERZET NÉLKÜL/);
  assert.doesNotMatch(storesMarkup(s, 'none'), /data-weapon=/);
  s.ammo.gun = 10;
  w.selected = 'gun';
  assert.match(w.fire(s, [], new Targeting()), /FEGYVERZET NÉLKÜL/);
  assert.equal(s.ammo.gun, 10);
  assert.equal(w.projectiles.length, 0);
});
test('other missions still start on the runway with normal fuel and weapons', () => {
  const s = createMissionAircraft(aircraft[2], missions[0]);
  assert.equal(s.onGround, true);
  assert.equal(s.airborne, false);
  assert.equal(s.position.z, -1320);
  assert.equal(s.fuel, s.spec.fuelCapacity);
  assert.ok(s.ammo.aam > 0);
  assert.equal(s.training, undefined);
});
test('the entire advertised glide path at either runway end is clear, while off-axis hills remain', () => {
  configureTerrain({ id: 'landing' }, undefined, () => 0.99);
  for (const sign of [-1, 1])
    for (let distance = 250; distance <= 7000; distance += 100) {
      const z = sign * (runway.halfLength + distance),
        height = 2 + distance * Math.tan(3 * DEG);
      assert.ok(terrainHeight(0, z) < height - 2);
      assert.ok(terrainHeight(100, z) < height - 2);
    }
  assert.ok(terrainHeight(1200, -4100) > 100);
});
