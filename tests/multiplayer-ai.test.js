import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { AI_ACTIVATION_SECONDS } from '../server/multiplayer-ai.mjs';
import { Vec3, Quat, attitude } from '../src/math.js';
import { applyDamage, createDamage } from '../src/damage.js';
import { weaponProfile } from '../src/weaponDynamics.js';
import { packFlight } from '../src/multiplayer/flightState.js';
import { NetworkCombatView } from '../src/multiplayer/combatView.js';
function setup() {
  const rooms = new MultiplayerRooms(),
    room = rooms.create('combat'),
    one = rooms.join(room, 'f16'),
    two = rooms.join(room, 'fa18');
  const enemy = room.combat.ai.units[0];
  one.state.condition = createDamage(11);
  two.state.condition = createDamage(12);
  enemy.flight.condition = createDamage(13);
  enemy.combatSeed = 1234;
  return { rooms, room, one, two, enemy };
}
function run(rooms, seconds) {
  for (let i = 0; i < seconds * 120; i++) rooms.step();
}
function placement(t, x, y, z, heading = 0) {
  const s = t.state || t.flight;
  s.position = new Vec3(x, y, z);
  s.orientation = Quat.euler(heading, 0.025, 0);
  s.velocity = new Vec3(Math.sin(heading) * 180, 0, Math.cos(heading) * 180);
  if (t.flight) Object.assign(t, { position: s.position, velocity: s.velocity, heading });
}
test('range rooms remain passive and combat rooms own exactly one independent hostile controller', () => {
  const rooms = new MultiplayerRooms(),
    range = rooms.create('range'),
    a = rooms.create('combat'),
    b = rooms.create('combat');
  assert.equal(range.combat.ai.units.length, 0);
  assert.equal(range.combat.targets.length, 2);
  assert.equal(a.combat.ai.units.length, 1);
  assert.equal(a.combat.targets.length, 3);
  assert.notEqual(a.combat.ai.controller, b.combat.ai.controller);
  assert.equal(rooms.create('invalid'), null);
});
test('AI preparation time gives pilots a real grace period without freezing aircraft physics', () => {
  const { rooms, room, enemy } = setup(),
    start = enemy.position.clone();
  run(rooms, AI_ACTIVATION_SECONDS - 0.1);
  assert.equal(room.combat.ai.active, false);
  assert.equal(
    room.combat.events.filter((e) => e.type === 'missile-launch' || e.type === 'gun').length,
    0,
  );
  assert.ok(enemy.position.distance(start) > 1000);
  run(rooms, 0.2);
  assert.equal(room.combat.ai.active, true);
});
test('target selection treats both human entity IDs equally instead of privileging the host', () => {
  for (const closer of ['one', 'two']) {
    const x = setup(),
      { rooms, room, enemy, one, two } = x;
    room.tick = AI_ACTIVATION_SECONDS * 120;
    placement(enemy, 0, 3000, 0);
    placement(one, closer === 'one' ? 1000 : 10000, 3000, 6000);
    placement(two, closer === 'two' ? 1000 : 10000, 3000, 6000);
    rooms.step();
    assert.equal(room.combat.ai.controller.unit(enemy).missionTargetId, x[closer].id);
    assert.notEqual(room.combat.ai.controller.unit(enemy).missionTargetId, 'PLAYER');
    x[closer].state.dying = true;
    rooms.step();
    assert.equal(
      room.combat.ai.controller.unit(enemy).missionTargetId,
      x[closer === 'one' ? 'two' : 'one'].id,
    );
  }
});
test('AI respects radar and weapon ranges rather than launching across the entire world', () => {
  const { rooms, room, enemy, one, two } = setup();
  room.tick = AI_ACTIVATION_SECONDS * 120;
  placement(enemy, 0, 3000, 0);
  placement(one, 0, 3000, 150000);
  placement(two, 1000, 3000, 150000);
  run(rooms, 5);
  assert.equal(
    room.combat.events.filter((e) => e.type === 'missile-launch' || e.type === 'gun').length,
    0,
  );
});
test('shared AI really fires at both pilots using finite stocks and normal launch envelopes', () => {
  const { rooms, room, enemy, one, two } = setup();
  run(rooms, 90);
  const shots = room.combat.events.filter(
    (e) => e.type === 'missile-launch' && e.sourceId === enemy.id,
  );
  assert.ok(shots.some((e) => e.targetId === one.id));
  assert.ok(shots.some((e) => e.targetId === two.id));
  for (const e of shots) {
    assert.ok(e.distanceM <= e.launchRangeM + 1);
    assert.ok(e.distanceM < e.radarRangeM);
    assert.ok(e.time >= AI_ACTIVATION_SECONDS);
  }
  const u = room.combat.ai.controller.unit(enemy);
  assert.equal(enemy.flight.ammo.aam, u.missiles);
  assert.equal(u.initialMissiles - u.missiles, shots.length);
  assert.ok(one.state.damage > 0 || two.state.damage > 0);
  assert.equal(enemy.flight.damage, 0, 'normal AI manoeuvres do not self-destruct');
});
test('AI does not auto-release countermeasures or rewrite controls for human pilots', () => {
  const { rooms, room, enemy, one, two } = setup();
  placement(enemy, 0, 3000, 3000);
  const position = enemy.position.clone().add(new Vec3(0, 0, -1200));
  room.combat.weapons.projectiles.push({
    id: ++room.combat.weapons.sequence,
    type: 'aam',
    owner: 'ally',
    sourceId: one.id,
    targetEntityId: enemy.id,
    profile: weaponProfile(one.state.spec, 'aam'),
    position,
    previous: position.clone(),
    velocity: new Vec3(0, 0, 650),
    age: 1,
    travelled: 1500,
    trailTimer: 0,
    trailAnchor: position.clone(),
    damage: 50,
  });
  const heading = attitude(enemy.flight.orientation).bank;
  run(rooms, 1);
  assert.ok(enemy.flight.countermeasures.used > 0);
  assert.ok(enemy.evasion);
  assert.ok(Math.abs(attitude(enemy.flight.orientation).bank - heading) > 0.01);
  assert.equal(one.state.countermeasures.used, 0);
  assert.equal(two.state.countermeasures.used, 0);
});
test('serious damage and exhausted air-combat stores cause physical withdrawal with no ghost re-entry', () => {
  for (const reason of ['damage', 'empty']) {
    const { rooms, room, enemy } = setup();
    if (reason === 'damage') applyDamage(enemy.flight, 45, { part: 'fuselage' });
    else {
      const u = room.combat.ai.controller.unit(enemy);
      u.missiles = 0;
      u.rounds = 0;
    }
    rooms.step();
    assert.ok(enemy.retreat);
    assert.equal(enemy.retreat.reason, reason === 'damage' ? 'structural-damage' : 'weapons-empty');
    assert.ok(room.combat.events.some((e) => e.type === 'ai-retreat' && e.sourceId === enemy.id));
    enemy.flight.position = enemy.retreat.exit.clone();
    rooms.step();
    assert.equal(enemy.exited, true);
    assert.equal(enemy.alive, false);
    const position = enemy.position.clone();
    run(rooms, 1);
    assert.deepEqual(enemy.position, position);
    const restored = rooms.snapshot(room).combat.targets.find((t) => t.id === enemy.id);
    assert.equal(restored.exited, true);
    assert.equal(restored.aiState, 'withdrawn');
  }
});
test('both client views receive the same AI damage and retain no host-dependent projectile target alias', () => {
  const { rooms, room, enemy, one } = setup();
  run(rooms, 30);
  const missile = room.combat.weapons.projectiles.find((p) => p.sourceId === enemy.id);
  assert.ok(missile);
  assert.equal(missile.targetPlayer, false);
  assert.ok(room.players.has(missile.targetEntityId));
  const originalTarget = missile.targetEntityId;
  const snapshot = JSON.parse(JSON.stringify(rooms.snapshot(room))),
    a = new NetworkCombatView(),
    b = new NetworkCombatView();
  a.accept(snapshot, true);
  b.accept(snapshot, true);
  assert.deepEqual(
    a.sample(snapshot.time).projectiles.map((p) => [p.id, p.targetId]),
    b.sample(snapshot.time).projectiles.map((p) => [p.id, p.targetId]),
  );
  const departing = room.players.get(originalTarget);
  rooms.leave(room, departing);
  rooms.step();
  assert.equal(missile.targetEntityId, originalTarget);
  assert.notEqual(missile.targetEntityId, 'PLAYER');
  assert.equal(packFlight(one.state).countermeasures.used, one.state.countermeasures.used);
});
