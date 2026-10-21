import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formationContext,
  coordinatedFlightPlan,
  steerCoordinatedFlight,
  navigationLimits,
} from '../src/formationAI.js';
import { Vec3 } from '../src/math.js';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { createAircraft } from '../src/physics.js';
import { createTargets, updateTargets, applyTargetHit } from '../src/targeting.js';

import { EnemyCombat } from '../src/enemyCombat.js';
import { Weapons } from '../src/weapons.js';
import { combatFlightInput, updateAIDefense } from '../src/aiDefense.js';
function player() {
  const p = createAircraft(aircraft.find((a) => a.id === 'f16'));
  p.position = new Vec3(0, 1700, 0);
  p.velocity = new Vec3(0, 0, 230);
  p.airborne = true;
  p.onGround = false;
  p.agl = 1700;
  return p;
}
function plane(id, number = 2, team = 'ally', flight = 'Falcon') {
  return {
    id,
    kind: 'air',
    type: 'fighter',
    team,
    faction: team === 'ally' ? 'west' : 'east',
    aircraftId: 'f15',
    alive: true,
    position: new Vec3(-550, 1900, -4000),
    velocity: new Vec3(0, 0, 165),
    heading: 0,
    cruiseSpeed: 165,
    radioCallSign: { flight, number },
    threats: ['missile', 'gun'],
  };
}
test('squadrons follow their own One on both teams, including a player-led Falcon flight', () => {
  const p = player();
  p.radioCallSign = { flight: 'Falcon', number: 1 };
  const a = plane('A'),
    r1 = plane('R1', 1, 'enemy'),
    r2 = plane('R2', 2, 'enemy');
  r1.position.z = 1000;
  const c = formationContext(p, [a, r1, r2]);
  assert.equal(coordinatedFlightPlan(a, null, c).leaderId, 'PLAYER');
  assert.equal(coordinatedFlightPlan(r2, null, c).leaderId, 'R1');
  assert.equal(coordinatedFlightPlan(r1, null, c), null);
});
test('a lost or withdrawing leader is replaced by the lowest surviving number without changing callsigns', () => {
  const p = player(),
    one = plane('ONE', 1),
    two = plane('TWO', 2),
    three = plane('THREE', 3);
  one.retreat = { stage: 'home' };
  const plan = coordinatedFlightPlan(three, null, formationContext(p, [one, two, three]));
  assert.equal(plan.leaderId, 'TWO');
  assert.equal(three.radioCallSign.number, 3);
  assert.equal(coordinatedFlightPlan(one, null, formationContext(p, [one, two, three])), null);
});
test('following accelerates gradually and physically catches a faster transport, even with no enemy present', () => {
  const p = player(),
    lead = {
      id: 'T',
      kind: 'air',
      type: 'transport',
      team: 'ally',
      alive: true,
      position: new Vec3(0, 1700, 0),
      velocity: new Vec3(0, 0, 230),
    },
    f = plane('F');
  f.defendId = 'T';
  const ai = new EnemyCombat(),
    w = new Weapons();
  ai.activeTime = 10;
  let highest = 0;
  for (let i = 0; i < 1200; i++) {
    const before = Math.hypot(f.velocity.x, f.velocity.z);
    ai.update(p, [lead, f], w, 0.1);
    const speed = Math.hypot(f.velocity.x, f.velocity.z);
    assert.ok(speed - before <= 0.600001);
    highest = Math.max(highest, speed);
    updateTargets([f], 0.1);
    lead.position.add(lead.velocity.clone().scale(0.1));
  }
  assert.ok(highest > 250);
  assert.ok(f.position.distance(lead.position) < 2500);
  assert.ok(Math.abs(Math.hypot(f.velocity.x, f.velocity.z) - 230) < 25);
  assert.equal(f.coordinatedFlight.role, 'escort');
});
test('combat splits the formation and clearing or withdrawing the enemy produces a rejoin plan', () => {
  const p = player();
  p.radioCallSign = { flight: 'Falcon', number: 1 };
  const f = plane('F'),
    enemy = plane('E', 1, 'enemy', 'Raven');
  enemy.position = new Vec3(0, 2000, 12000);
  const c = formationContext(p, [f, enemy]);
  let plan = coordinatedFlightPlan(f, enemy, c);
  assert.equal(plan.mode, 'combat');
  f.coordinatedFlight = plan;
  enemy.retreat = {};
  plan = coordinatedFlightPlan(f, enemy, c);
  assert.ok(['formation', 'rejoin'].includes(plan.mode));
  enemy.retreat = null;
  enemy.alive = false;
  assert.notEqual(coordinatedFlightPlan(f, enemy, c).mode, 'combat');
});
test('escorts intercept a detected assigned attacker before it reaches the transport, but abandon distant pursuit', () => {
  for (const team of ['ally', 'enemy']) {
    const p = player(),
      f = plane('F', 2, team),
      lead = {
        id: 'T',
        team,
        kind: 'air',
        alive: true,
        position: new Vec3(0, 1700, 0),
        velocity: new Vec3(0, 0, 210),
      },
      enemy = plane('E', 1, team === 'ally' ? 'enemy' : 'ally', 'Other');
    f.defendId = 'T';
    f.position = new Vec3(0, 1900, -1000);
    enemy.position = new Vec3(0, 2000, 20000);
    enemy.aiTargetId = 'T';
    const c = formationContext(p, [f, lead, enemy]);
    assert.equal(coordinatedFlightPlan(f, enemy, c).mode, 'intercept');
    f.position.z = -14000;
    enemy.position.z = 30000;
    assert.equal(coordinatedFlightPlan(f, enemy, c).mode, 'rejoin');
  }
});
test('each wingman has a separate station and cannot hover with a stopped leader', () => {
  const p = player();
  p.radioCallSign = { flight: 'Falcon', number: 1 };
  const two = plane('TWO', 2),
    three = plane('THREE', 3),
    four = plane('FOUR', 4),
    c = formationContext(p, [two, three, four]);
  const positions = [two, three, four].map((t) => coordinatedFlightPlan(t, null, c).position);
  assert.equal(new Set(positions.map((v) => v.x + ':' + v.z)).size, 3);
  p.velocity = new Vec3();
  const plan = coordinatedFlightPlan(two, null, c);
  assert.equal(plan.mode, 'cover-orbit');
  assert.ok(plan.targetSpeed >= plan.minSpeed);
});
test('real aircraft speed and force limits apply, and damaged members still use the normal flight physics', () => {
  const p = player();
  p.radioCallSign = { flight: 'Falcon', number: 1 };
  p.velocity.z = 1000;
  const f = plane('F'),
    limits = navigationLimits(f),
    plan = coordinatedFlightPlan(f, null, formationContext(p, [f]));
  assert.ok(plan.targetSpeed <= limits.maxSpeed);
  const before = f.position.clone();
  steerCoordinatedFlight(f, plan, 1 / 120);
  assert.deepEqual(f.position, before);
  assert.ok(f.velocity.z < 166);
  applyTargetHit(f, 'gun', { amount: 5 });
  f.coordinatedFlight = plan;
  assert.ok(Number.isFinite(combatFlightInput(f).throttle));
});
test('retreat and evasion take precedence over any old formation order', () => {
  const p = player(),
    f = plane('F'),
    w = new Weapons();
  applyTargetHit(f, 'gun', { amount: 40 });
  updateAIDefense(p, [f], w, 0.1);
  assert.ok(f.retreat);
  assert.equal(coordinatedFlightPlan(f, null, formationContext(p, [f])), null);
  const before = f.velocity.clone();
  steerCoordinatedFlight(f, { targetSpeed: 400 }, 0.1);
  assert.deepEqual(f.velocity, before);
});
test('Iron Veil escorts protect Nomad while the ordinary mission keeps its scripted target assignments', () => {
  const m = missions.find((m) => m.id === 'iron-veil'),
    targets = createTargets(m, aircraft[0], { rng: () => 0.5 });
  for (const t of targets.filter((t) => t.id.startsWith('IV-VIPER')))
    assert.equal(t.defendId, 'IV-TRANSPORT');
});

test('targetless surviving leaders on either side patrol their own field instead of coasting off-map', () => {
  for (const side of ['ally', 'enemy']) {
    const p = player();
    p.onGround = true;
    p.airborne = false;
    const f = plane('SURVIVOR', 4, side, 'Wolf'),
      base = {
        id: 'HOME',
        team: side,
        type: 'airbase',
        kind: 'ground',
        alive: true,
        position: new Vec3(),
        velocity: new Vec3(),
        threats: [],
      };
    f.position = new Vec3(25000, 2500, 0);
    f.velocity = new Vec3(300, 0, 0);
    f.heading = Math.PI / 2;
    f.navigationGoal = { position: new Vec3(90000, 2500, 0), targetId: 'DEAD-LEADER' };
    const ai = new EnemyCombat(),
      w = new Weapons();
    ai.activeTime = 10;
    let furthest = 0;
    for (let i = 0; i < 6000; i++) {
      ai.update(p, [base, f], w, 0.1);
      updateTargets([base, f], 0.1);
      furthest = Math.max(furthest, Math.hypot(f.position.x, f.position.z));
    }
    assert.ok(furthest < 40000);
    assert.ok(Math.hypot(f.position.x, f.position.z) < 12000);
    assert.equal(f.navigationGoal.targetId, 'HOME');
    assert.equal(w.projectiles.length, 0);
  }
});

test('a targetless wingman publishes the current leader navigation order for physical flight too', () => {
  const p = player();
  p.onGround = true;
  p.airborne = false;
  const lead = plane('LEAD', 1),
    wing = plane('WING', 2),
    ai = new EnemyCombat(),
    w = new Weapons();
  ai.activeTime = 10;
  ai.update(p, [lead, wing], w, 0.1);
  assert.equal(wing.navigationGoal.targetId, 'LEAD');
  assert.equal(wing.navigationGoal.kind, 'air');
  assert.ok(wing.navigationGoal.position.distance(wing.coordinatedFlight.position) < 0.01);
});
