import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, Quat, DEG } from '../src/math.js';
import { aircraft } from '../src/aircraftSpec.js';
import { createAircraft } from '../src/physics.js';
import { applyTargetHit, updateTargets } from '../src/targeting.js';
import { EnemyCombat } from '../src/enemyCombat.js';
import { Weapons } from '../src/weapons.js';
import { defensiveFireSolution } from '../src/defensiveGunnery.js';
import { enemyProfile, predictBombImpact } from '../src/weaponDynamics.js';
const spec = aircraft.find((a) => a.id === 'f16');
function player() {
  const s = createAircraft(spec);
  Object.assign(s, {
    position: new Vec3(0, 1800, -600),
    velocity: new Vec3(0, 0, 145),
    airborne: true,
    onGround: false,
    agl: 1800,
  });
  return s;
}
function bomber(team = 'enemy') {
  return {
    id: 'B',
    type: 'bomber',
    kind: 'air',
    team,
    faction: team === 'ally' ? 'west' : 'east',
    aircraftId: team === 'ally' ? 'b52' : 'tu95',
    alive: true,
    position: new Vec3(0, 1800, 0),
    velocity: new Vec3(0, 0, 145),
    heading: 0,
    pitch: 0,
    bank: 0,
    cruiseSpeed: 145,
    radius: 28,
    aiTargetId: 'BASE',
    threats: ['bomb', 'gun'],
  };
}
function base() {
  return {
    id: 'BASE',
    type: 'airbase',
    kind: 'ground',
    team: 'ally',
    alive: true,
    position: new Vec3(0, 3, 20000),
    velocity: new Vec3(),
    health: 320,
    maxHealth: 320,
  };
}
function run(ai, s, units, w, seconds) {
  for (let i = 0; i < 120 * seconds; i++) ai.update(s, units, w, 1 / 120);
}
test('a bomber independently fires aft at the player while retaining a distant ground mission target', () => {
  const s = player(),
    t = bomber(),
    objective = base(),
    ai = new EnemyCombat(),
    w = new Weapons();
  ai.activeTime = 10;
  run(ai, s, [t, objective], w, 2);
  const shots = w.events.filter((e) => e.type === 'gun');
  assert.ok(shots.length > 0);
  assert.ok(
    shots.every((e) => e.targetId === 'PLAYER' && e.mainTargetId === 'BASE' && e.turret === 'tail'),
  );
  assert.equal(t.aiTargetId, 'BASE');
  assert.equal(t.navigationGoal.targetId, 'BASE');
  assert.equal(ai.unit(t).choiceId, 'BASE');
  assert.equal(shots[0].profile, 'gsh23');
  assert.ok(shots[0].position.z < -20);
  assert.ok(shots[0].initialVelocity.z < 0);
});
test('both factions use their own defensive profile and target only hostile aircraft', () => {
  for (const team of ['ally', 'enemy']) {
    const s = player(),
      t = bomber(team),
      other = {
        ...bomber(team === 'ally' ? 'enemy' : 'ally'),
        id: 'AIR',
        type: 'fighter',
        position: new Vec3(0, 1800, -700),
      };
    s.position.x = 20000;
    const solution = defensiveFireSolution(t, s, [t, other, base()]);
    assert.equal(solution.target, other);
    assert.equal(solution.profile.id, team === 'ally' ? 'm61' : 'gsh23');
    assert.equal(solution.profile, enemyProfile(t, 'gun'));
    other.team = team;
    assert.equal(defensiveFireSolution(t, s, [t, other, base()]), null);
  }
});
test('tail guns cannot fire forward, sideways, out of range, at neutral/ground targets or at an inactive player', () => {
  const t = bomber(),
    s = player();
  for (const position of [
    new Vec3(0, 1800, 600),
    new Vec3(600, 1800, 0),
    new Vec3(0, 1800, -4000),
  ]) {
    s.position = position;
    assert.equal(defensiveFireSolution(t, s, [base()]), null);
  }
  s.position = new Vec3(0, 1800, -600);
  s.onGround = true;
  assert.equal(defensiveFireSolution(t, s, []), null);
  s.onGround = false;
  s.position.x = 20000;
  for (const changes of [
    { team: 'neutral' },
    { kind: 'ground' },
    { pending: true },
    { alive: false },
    { exited: true },
  ]) {
    const target = {
      ...bomber('ally'),
      id: 'OTHER',
      position: new Vec3(0, 1800, -600),
      ...changes,
    };
    assert.equal(defensiveFireSolution(t, s, [target]), null);
  }
});
test('the defensive sector rotates with the aircraft, including bank and pitch', () => {
  const t = bomber(),
    s = player();
  t.flight = { orientation: Quat.euler(80 * DEG, 15 * DEG, 45 * DEG) };
  s.position = t.position.clone().add(t.flight.orientation.rotate(new Vec3(0, 0, -650)));
  s.velocity = t.velocity.clone();
  assert.ok(defensiveFireSolution(t, s, []));
  s.position = t.position.clone().add(t.flight.orientation.rotate(new Vec3(0, 0, 650)));
  assert.equal(defensiveFireSolution(t, s, []), null);
});
test('bomb release and defensive gunfire can occur together without retargeting the bomb', () => {
  const s = player(),
    t = bomber(),
    objective = base(),
    ai = new EnemyCombat(),
    w = new Weapons();
  objective.position = predictBombImpact({ spec, position: t.position, velocity: t.velocity });
  ai.activeTime = 10;
  run(ai, s, [t, objective], w, 2);
  assert.ok(w.events.some((e) => e.type === 'bomb-release' && e.targetId === 'BASE'));
  assert.ok(w.events.some((e) => e.type === 'gun' && e.targetId === 'PLAYER'));
  assert.ok(!w.events.some((e) => e.type === 'gun' && e.targetId === 'BASE'));
});
test('defensive rounds are finite, pauses separate bursts and weapons failure blocks the turret', () => {
  const s = player(),
    t = bomber(),
    ai = new EnemyCombat(),
    w = new Weapons();
  ai.activeTime = 10;
  ai.unit(t).rounds = 1;
  run(ai, s, [t, base()], w, 8);
  assert.equal(w.events.filter((e) => e.type === 'gun').length, 1);
  assert.equal(ai.unit(t).rounds, 0);
  const disabled = bomber();
  applyTargetHit(disabled, 'gun', { amount: 1 });
  disabled.flight.condition.parts.weapons = 0.3;
  const ai2 = new EnemyCombat(),
    w2 = new Weapons();
  ai2.activeTime = 10;
  run(ai2, s, [disabled, base()], w2, 3);
  assert.equal(w2.projectiles.length, 0);
});
test('a fired tail-gun burst can actually damage the player behind the bomber', () => {
  const s = player(),
    t = bomber(),
    objective = base(),
    w = new Weapons({ enemyFire: true });
  w.enemyCombat.activeTime = 10;
  for (let i = 0; i < 120 * 5 && !s.damage; i++) {
    s.previousPosition = s.position.clone();
    s.position.add(s.velocity.clone().scale(1 / 120));
    updateTargets([t], 1 / 120);
    w.update(s, [t, objective], 1 / 120);
  }
  assert.ok(s.damage > 0);
  assert.ok(w.events.some((e) => e.type === 'damage-hit' && e.sourceId === 'B'));
  assert.equal(t.aiTargetId, 'BASE');
});
test('a lightly damaged bomber keeps steering and holding altitude under flight physics', () => {
  const s = player(),
    t = bomber(),
    objective = base(),
    ai = new EnemyCombat(),
    w = new Weapons();
  s.position.x = 20000;
  t.position = new Vec3(0, 1800, -8000);
  objective.position = new Vec3(5000, 3, 12000);
  ai.activeTime = 10;
  ai.unit(t).bombs = 0;
  ai.unit(t).rounds = 0;
  ai.update(s, [t, objective], w, 1 / 120);
  applyTargetHit(t, 'gun', { amount: 29.3703 });
  t.flight.condition.seed = 42;
  for (let i = 0; i < 120 * 70; i++) {
    updateTargets([t], 1 / 120);
    ai.update(s, [t, objective], w, 1 / 120);
  }
  assert.equal(t.flight.crashed, false);
  assert.equal(t.flight.dying, false);
  assert.ok(t.position.y > 1300);
  assert.ok(t.position.x > 1000);
  assert.ok(t.flight.damage < 40);
  assert.equal(t.retreat, undefined);
});
