import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceProbe } from '../scripts/ai-service-playtest.mjs';
import { updateAIResupply, aiServiceSeconds } from '../src/aiResupply.js';
import { Weapons } from '../src/weapons.js';
import { aircraft } from '../src/aircraftSpec.js';
import { createAircraft } from '../src/physics.js';
import { Vec3 } from '../src/math.js';
import { applyTargetHit } from '../src/targeting.js';
import { battleObjectives } from '../src/missionObjectives.js';
import { visibleTargets } from '../src/electronicWarfare.js';
const setup = () => {
  const p = createAircraft(aircraft.find((a) => a.id === 'f16')),
    t = {
      id: 'F',
      type: 'fighter',
      kind: 'air',
      aircraftId: 'f16',
      team: 'enemy',
      alive: true,
      position: new Vec3(12000, 2200, 15000),
      velocity: new Vec3(0, 0, 160),
      heading: 0,
      cruiseSpeed: 160,
      threats: ['missile', 'gun'],
    },
    w = new Weapons({ enemyFire: true }),
    u = w.enemyCombat.unit(t);
  u.missiles = 0;
  return { p, t, w, u };
};
test('AI on either side physically lands, stops, services, taxis back and takes off from its own airfield', () => {
  for (const side of ['ally', 'enemy']) {
    const r = serviceProbe({ side });
    assert.equal(r.success, true, JSON.stringify(r));
    assert.equal(r.crashed, false);
    assert.equal(r.stores.missiles, r.stores.initialMissiles);
    assert.ok(r.fuel > r.fuelCapacity * 0.9);
    const phases = r.timeline.map((a) => a.stage);
    assert.deepEqual(phases, [
      'align',
      'final',
      'rollout',
      'servicing',
      'taxi',
      'takeoff',
      'combat',
    ]);
    const a = r.timeline.find((a) => a.stage === 'servicing'),
      b = r.timeline.find((a) => a.stage === 'taxi');
    assert.ok(b.time - a.time >= aiServiceSeconds - 0.01);
    assert.equal(a.ammo.aam, 0);
    assert.ok(b.ammo.aam > 0);
  }
});
test('a repairable AI stays damaged until a real runway stop and ground service', () => {
  const r = serviceProbe({ damage: 40 });
  assert.equal(r.success, true);
  assert.equal(r.damageAfter, 0);
  assert.equal(r.timeline.find((a) => a.stage === 'servicing').damage, 40);
  assert.equal(r.timeline.find((a) => a.stage === 'taxi').damage, 0);
});
test('a heavy bomber lands and replenishes bombs without acquiring air-to-air missiles', () => {
  const r = serviceProbe({ id: 'b52' });
  assert.equal(r.success, true);
  assert.equal(r.stores.bombs, r.stores.initialBombs);
  assert.equal(r.stores.missiles, 0);
});
test('with no airfield, ammunition withdrawal returns after off-map service and never retires the aircraft', () => {
  for (const side of ['ally', 'enemy']) {
    const r = serviceProbe({ side, field: false });
    assert.equal(r.success, true, JSON.stringify(r));
    assert.equal(r.alive, true);
    assert.deepEqual(
      r.timeline.map((a) => a.stage),
      ['outbound', 'servicing', 'combat'],
    );
    assert.equal(r.stores.missiles, r.stores.initialMissiles);
  }
});
test('terminal missions and lost player aircraft cannot advance a service timer or respawn an AI', () => {
  for (const reason of ['missionEnded', 'crashed', 'dying']) {
    const x = setup();
    x.t.flight = createAircraft(x.p.spec);
    x.t.exited = true;
    x.t.service = { stage: 'servicing', remaining: 0.01, homeId: null };
    if (reason === 'missionEnded') x.w.missionEnded = true;
    else x.p[reason] = true;
    updateAIResupply(x.p, [x.t], x.w, x.w.enemyCombat, 100);
    assert.equal(x.t.service.remaining, 0.01);
    assert.equal(x.u.missiles, 0);
    assert.equal(x.t.exited, true);
  }
});
test('an AI waiting off-map for ammunition is hidden but still blocks a destroy-all mission victory', () => {
  const x = setup(),
    base = {
      id: 'BASE',
      type: 'airbase',
      kind: 'ground',
      team: 'ally',
      alive: true,
      position: new Vec3(),
    };
  x.t.exited = true;
  x.t.service = { stage: 'servicing', remaining: 60 };
  assert.equal(visibleTargets(x.p, [x.t]).length, 0);
  assert.equal(
    battleObjectives({ spec: { objective: 'defend-base' } }, x.p, [base, x.t], x.w).complete,
    false,
  );
});
test('serious damage without a friendly field is still permanent withdrawal, and fatal damage never services', () => {
  const x = setup();
  x.u.missiles = x.u.initialMissiles;
  applyTargetHit(x.t, 'gun', { amount: 40 });
  x.w.update(x.p, [x.t], 0.1);
  assert.equal(x.t.service, undefined);
  assert.ok(x.t.retreat);
  applyTargetHit(x.t, 'aam', { amount: 100 });
  x.w.update(x.p, [x.t], 0.1);
  assert.equal(x.t.service, undefined);
  assert.equal(x.t.flight.dying, true);
});
test('an AI supports its already-launched guided shot before normal ammunition withdrawal', () => {
  const x = setup();
  x.w.projectiles = [{ sourceId: x.t.id, profile: { guidance: 'sarh' }, seekerLost: false }];
  updateAIResupply(x.p, [x.t], x.w, x.w.enemyCombat, 0.1);
  assert.equal(x.t.service, undefined);
  x.w.projectiles = [];
  updateAIResupply(x.p, [x.t], x.w, x.w.enemyCombat, 0.1);
  assert.equal(x.t.service.stage, 'outbound');
});

test('an empty damaged AI with no airfield cannot turn permanent withdrawal into a free repair', () => {
  const x = setup();
  applyTargetHit(x.t, 'gun', { amount: 40 });
  x.w.update(x.p, [x.t], 0.1);
  assert.equal(x.t.service, undefined);
  assert.ok(x.t.retreat);
  assert.notEqual(x.t.retreat.reason, 'resupply');
});
test('damage sustained during an off-map ammunition return switches to permanent withdrawal', () => {
  const x = setup();
  x.w.update(x.p, [x.t], 0.1);
  assert.equal(x.t.service.stage, 'outbound');
  applyTargetHit(x.t, 'gun', { amount: 40 });
  x.w.update(x.p, [x.t], 0.1);
  assert.equal(x.t.service, undefined);
  assert.notEqual(x.t.retreat.reason, 'resupply');
});
test('destruction of a servicing airfield cancels the parked aircraft without replenishment or respawn', () => {
  const x = setup(),
    base = {
      id: 'B',
      type: 'airbase',
      kind: 'ground',
      team: 'enemy',
      alive: false,
      position: new Vec3(),
    };
  x.t.flight = createAircraft(x.p.spec);
  x.t.service = { stage: 'servicing', remaining: 1, homeId: 'B' };
  updateAIResupply(x.p, [base, x.t], x.w, x.w.enemyCombat, 2);
  assert.equal(x.t.alive, false);
  assert.equal(x.t.service, undefined);
  assert.equal(x.u.missiles, 0);
});
