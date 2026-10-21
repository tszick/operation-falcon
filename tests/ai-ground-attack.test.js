import test from 'node:test';
import assert from 'node:assert/strict';
import { EnemyCombat } from '../src/enemyCombat.js';
import { Weapons } from '../src/weapons.js';
import { aircraft } from '../src/aircraftSpec.js';
import { createAircraft } from '../src/physics.js';
import { Vec3 } from '../src/math.js';
import { configureTerrain, terrainHeight } from '../src/terrain.js';
import { updateTargets } from '../src/targeting.js';
function scene(id = 'f16', team = 'ally') {
  configureTerrain({ objective: 'landing' }, undefined, () => 0.5);
  const p = createAircraft(aircraft.find((a) => a.id === 'f16'));
  p.onGround = true;
  p.airborne = false;
  const t = {
    id: 'F',
    kind: 'air',
    type: 'fighter',
    aircraftId: id,
    team,
    faction: team === 'ally' ? 'west' : 'east',
    alive: true,
    position: new Vec3(0, 900, -6000),
    velocity: new Vec3(0, 0, 170),
    heading: 0,
    cruiseSpeed: 170,
    threats: ['missile', 'gun'],
  };
  const g = {
    id: 'G',
    kind: 'ground',
    type: 'sam',
    team: team === 'ally' ? 'enemy' : 'ally',
    alive: true,
    position: new Vec3(0, terrainHeight(0, 0) + 8, 0),
    velocity: new Vec3(),
    health: 90,
    maxHealth: 90,
    radius: 60,
    threats: [],
  };
  const ai = new EnemyCombat(),
    w = new Weapons({ enemyFire: false });
  ai.activeTime = 10;
  return { p, t, g, ai, w, units: [t, g] };
}
test('both teams select an attackable ground target after the airborne threat is gone', () => {
  for (const team of ['ally', 'enemy']) {
    const x = scene('f16', team);
    assert.equal(x.ai.chooseTarget(x.t, x.p, x.units), x.g);
    const u = x.ai.unit(x.t);
    u.agm = 0;
    u.rounds = 0;
    u.bombs = 0;
    assert.equal(x.ai.chooseTarget(x.t, x.p, x.units), null);
  }
});
test('a fighter cannot invent an AGM or fire its air-to-air missile at the ground', () => {
  const x = scene('f15');
  for (let i = 0; i < 60 * 10; i++) x.ai.update(x.p, x.units, x.w, 1 / 60);
  assert.equal(x.w.projectiles.filter((p) => ['aam', 'agm'].includes(p.type)).length, 0);
  assert.equal(x.ai.unit(x.t).agm, 0);
});
test('actual AGMs from either team consume the correct store and physically destroy the battery', () => {
  for (const team of ['ally', 'enemy']) {
    const x = scene('f16', team);
    x.t.position.z = -3500;
    for (let i = 0; i < 120 * 90 && x.g.alive; i++) {
      updateTargets(x.units, 1 / 120);
      x.ai.update(x.p, x.units, x.w, 1 / 120);
      x.w.update(x.p, x.units, 1 / 120);
    }
    const launches = x.w.events.filter((e) => e.type === 'missile-launch');
    assert.ok(launches.some((e) => e.weapon === 'agm' && e.profile === 'maverick'));
    assert.equal(
      launches.some((e) => e.profile === 'aim9m'),
      false,
    );
    assert.ok(x.ai.unit(x.t).agm < 2);
    assert.equal(x.g.alive, false);
    assert.equal(x.p.damage, 0);
  }
});
test('gun-only fighter executes real repeated strafing passes and damages a ground battery', () => {
  const x = scene('f15');
  let passes = 0,
    last = '';
  for (let i = 0; i < 120 * 600 && x.g.alive; i++) {
    updateTargets(x.units, 1 / 120);
    x.ai.update(x.p, x.units, x.w, 1 / 120);
    x.w.update(x.p, x.units, 1 / 120);
    const stage = x.t.groundAttack?.stage;
    if (stage === 'egress' && stage !== last) passes++;
    last = stage;
  }
  assert.ok(x.w.events.some((e) => e.type === 'gun' && e.sourceId === 'F'));
  assert.ok(x.g.health < 90);
  assert.equal(x.g.alive, false);
  assert.ok(passes > 0);
  assert.ok(x.t.position.y > terrainHeight(x.t.position.x, x.t.position.z) + 100);
});
test('an imminent battery on the protected route can override an old airborne assignment', () => {
  const x = scene(),
    lead = {
      id: 'T',
      kind: 'air',
      type: 'transport',
      team: 'ally',
      alive: true,
      position: new Vec3(0, 1200, -3000),
      velocity: new Vec3(0, 0, 160),
    },
    enemy = { ...x.t, id: 'E', team: 'enemy', position: new Vec3(0, 2500, 16000), aiTargetId: 'T' };
  x.t.defendId = 'T';
  x.t.aiTargetId = 'E';
  x.g.threats = ['flak', 'gun'];
  assert.equal(x.ai.chooseTarget(x.t, x.p, [...x.units, lead, enemy]), x.g);
  enemy.position.z = -1000;
  assert.equal(x.ai.chooseTarget(x.t, x.p, [...x.units, lead, enemy]), enemy);
});
test('unreachable, neutral, pending and destroyed targets cannot attract a fighter away from its escort', () => {
  const x = scene();
  x.g.position.z = 100000;
  assert.equal(x.ai.chooseTarget(x.t, x.p, x.units), null);
  x.g.position.z = 0;
  for (const patch of [{ team: 'neutral' }, { alive: false }, { pending: true }, { retreat: {} }]) {
    const g = { ...x.g, ...patch };
    assert.equal(x.ai.chooseTarget(x.t, x.p, [x.t, g]), null);
  }
});
test('an AGM cannot bypass the common radar or minimum-range launch constraints', () => {
  const x = scene();
  x.g.position = x.t.position.clone().add(new Vec3(0, 0, 100));
  x.g.position.y = 0;
  x.t.position.y = 100;
  for (let i = 0; i < 180; i++) x.ai.update(x.p, x.units, x.w, 1 / 60);
  assert.equal(x.w.projectiles.filter((p) => p.type === 'agm').length, 0);
  assert.equal(x.ai.unit(x.t).agm, 2);
});

test('aircraft gun projectiles use the player base damage on either side, while ground guns retain their profile', () => {
  for (const team of ['ally', 'enemy']) {
    const x = scene('f15', team);
    x.ai.launch('gun', x.t, x.g, x.w, x.ai.unit(x.t));
    assert.equal(x.w.projectiles[0].damage, 18);
    const ground = { ...x.g, team, threats: ['gun'] };
    x.ai.launch('gun', ground, x.t, x.w, x.ai.unit(ground));
    assert.equal(x.w.projectiles[1].damage, 1.8);
  }
});
