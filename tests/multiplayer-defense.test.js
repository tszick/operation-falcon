import { neutralAxes } from '../src/multiplayer/protocol.js';
import { weaponProfile } from '../src/weaponDynamics.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { createDefenseScene } from '../server/multiplayer-defense.mjs';
import { defaultSelection } from '../src/multiplayer/preflight.js';
import { packFlight, unpackFlight, applyFlightCommand } from '../src/multiplayer/flightState.js';
import { missionPresentation } from '../src/multiplayer/missionView.js';
import { Vec3, Quat } from '../src/math.js';
import { applyDamage } from '../src/damage.js';
import { withTerrainSnapshot, terrainWorld } from '../src/terrain.js';
function setup(start = true) {
  const rooms = new MultiplayerRooms(),
    room = rooms.create('cooperative');
  room.world.skySeed = 812;
  const one = rooms.join(room, 'f16'),
    two = rooms.join(room, 'fa18');
  assert.equal(
    rooms.preflight(room, one, {
      type: 'mission',
      revision: room.lobby.revision,
      missionId: 'defend-base',
    }),
    null,
  );
  if (start)
    for (const p of [one, two])
      rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true });
  if (room.players.size >= 2 && [...room.players.values()].every((p) => p.ready))
    rooms.preflight(room, one, { type: 'start', revision: room.lobby.revision });
  return { rooms, room, one, two };
}
function clearAir(room) {
  for (const t of room.combat.targets.filter((t) => t.team === 'enemy' && t.kind === 'air'))
    applyDamage(t.flight, 100, 'fuselage');
}
function touchdown(p) {
  const s = p.state;
  Object.assign(s, {
    position: new Vec3(0, 2.001, -1000 - p.slot * 150),
    previousPosition: new Vec3(0, 3, -1000 - p.slot * 150),
    velocity: new Vec3(0, -1, 65),
    orientation: Quat.euler(0, (3 * Math.PI) / 180, 0),
    onGround: false,
    airborne: true,
    gear: true,
    flaps: true,
    flapPosition: 1,
    throttle: 0,
    engineSpool: 0,
    landingMode: 'on',
  });
}
test('defense reuses the canonical bomber, two fighters, two SAMs, bunker and wingman without leaking terrain across rooms', () => {
  const { room, one, two } = setup(false);
  assert.equal(room.combat.targets.filter((t) => t.team === 'enemy' && t.kind === 'air').length, 3);
  assert.equal(
    room.combat.targets.filter((t) => t.team === 'ally' && t.type === 'sam-system').length,
    2,
  );
  assert.ok(room.combat.targets.some((t) => t.type === 'bunker' && t.team === 'ally'));
  assert.equal(
    room.combat.targets.find((t) => t.id === 'ALLY-FIGHTER').displayCallSign,
    'Guardian One',
  );
  assert.equal(room.world.surface, 'winter');
  assert.equal(one.state.onGround, true);
  assert.equal(two.state.gear, true);
  assert.ok(one.state.position.distance(two.state.position) > 100);
  assert.equal(one.state.landing, null);
  const previous = terrainWorld;
  const a = createDefenseScene({ ...room.world, skySeed: 33 }),
    b = createDefenseScene({ ...room.world, skySeed: 33 });
  assert.deepEqual(
    a.targets.map((t) => t.position),
    b.targets.map((t) => t.position),
  );
  assert.equal(terrainWorld, previous);
});
test('late briefing joins and loadout edits stay on the runway, switching back restores the airborne practice scene', () => {
  const { rooms, room, one, two } = setup(false);
  rooms.leave(room, two);
  const next = rooms.join(room, 'fa18');
  assert.equal(next.state.onGround, true);
  const choice = defaultSelection('fa18');
  choice.fuelFraction = 0.4;
  choice.loadout.gun = false;
  rooms.preflight(room, one, {
    type: 'configure',
    revision: room.lobby.revision,
    selection: choice,
  });
  assert.equal(one.state.onGround, true);
  assert.equal(one.state.ammo.gun, 0);
  assert.equal(one.state.fuel, one.state.spec.fuelCapacity * 0.4);
  const revision = room.world.revision;
  rooms.preflight(room, one, {
    type: 'mission',
    revision: room.lobby.revision,
    missionId: 'strike',
  });
  assert.equal(room.world.surface, 'grass');
  assert.ok(room.world.revision > revision);
  assert.equal(one.state.onGround, false);
  assert.equal(
    room.combat.targets.find((t) => t.id === 'BASE'),
    undefined,
  );
});
test('bombers round-trip through real network aircraft state and landing controls cannot directly award a landing', () => {
  const { room, one } = setup();
  const bomber = room.combat.targets.find((t) => t.type === 'bomber');
  const copy = unpackFlight(JSON.parse(JSON.stringify(packFlight(bomber.flight))));
  assert.equal(copy.spec.id, bomber.aircraftId);
  assert.ok(copy.position.distance(bomber.position) < 0.01);
  withTerrainSnapshot(room.world, () =>
    applyFlightCommand(one.state, { toggles: ['landing', 'landingGuide'] }, 1 / 120),
  );
  assert.equal(one.state.landingMode, 'on');
  assert.equal(one.state.landingRouteEnabled, false);
  assert.equal(one.state.landing, null);
});
test('destroyed attackers trigger return, not victory; both surviving pilots must genuinely touch down and stop', () => {
  const { rooms, room, one, two } = setup();
  clearAir(room);
  rooms.step();
  assert.equal(room.mission.stage, 'return');
  assert.equal(room.mission.phase, 'active');
  assert.equal(room.mission.defense.neutralized, 3);
  for (const p of [one, two]) touchdown(p);
  rooms.step();
  assert.equal(one.state.landing.success, true);
  assert.equal(two.state.landing.success, true);
  assert.equal(room.mission.phase, 'active', 'rolling at approach speed is not stopped');
  for (const p of [one, two]) {
    p.state.velocity = new Vec3();
    p.state.speed = 0;
  }
  rooms.step();
  assert.equal(room.mission.phase, 'success');
  assert.equal(room.mission.reason, 'base-defended-and-landed');
  assert.ok(room.mission.participants.every((p) => p.returned));
});
test('a lost pilot does not block the survivor landing, while base destruction overrides air victory', () => {
  const { rooms, room, one, two } = setup();
  two.state.crashed = true;
  clearAir(room);
  rooms.step();
  touchdown(one);
  rooms.step();
  one.state.velocity = new Vec3();
  rooms.step();
  assert.equal(room.mission.phase, 'success');
  assert.equal(room.mission.objectives.find((o) => o.id === 'survival').status, 'failed');
  const x = setup();
  clearAir(x.room);
  x.room.combat.targets.find((t) => t.id === 'BASE').alive = false;
  x.rooms.step();
  assert.equal(x.room.mission.phase, 'failed');
  assert.equal(x.room.mission.reason, 'base-destroyed');
});
test('incoming bombs remain dangerous after the bomber is gone and block premature return clearance', () => {
  const { rooms, room } = setup();
  clearAir(room);
  const w = room.combat.weapons;
  const bomber = room.combat.targets.find((t) => t.type === 'bomber');
  w.projectiles.push({
    id: ++w.sequence,
    type: 'bomb',
    owner: 'enemy',
    targetEntityId: 'BASE',
    sourceId: bomber.id,
    profile: weaponProfile({ id: bomber.aircraftId }, 'bomb'),
    position: new Vec3(10000, 10000, 10000),
    velocity: new Vec3(),
    age: 0,
  });
  rooms.step();
  assert.equal(room.mission.stage, 'combat');
  assert.equal(room.mission.defense.incoming, true);
  w.projectiles = [];
  rooms.step();
  assert.equal(room.mission.stage, 'return');
});
test('both AI coalitions use finite real weapons and keep synchronized battle snapshots bounded', () => {
  const { rooms, room } = setup();
  let cursor = 0,
    friendlyShot = false,
    enemyShot = false;
  for (let i = 0; i < 120 * 100 && room.mission.phase === 'active'; i++) {
    rooms.step();
    for (const e of room.combat.events)
      if (e.id > cursor) {
        if (e.type === 'missile-launch') {
          if (e.owner === 'ally') friendlyShot = true;
          if (e.owner === 'enemy') enemyShot = true;
        }
      }
    cursor = room.combat.eventSequence;
  }
  assert.equal(friendlyShot, true);
  assert.equal(enemyShot, true);
  assert.ok(room.mission.defense.baseHealth >= 0 && room.mission.defense.baseHealth <= 100);
  assert.ok(Buffer.byteLength(JSON.stringify(rooms.snapshot(room))) < 128 * 1024);
  const view = missionPresentation(rooms.snapshot(room).mission);
  assert.equal(view.title, 'Védd meg a repteret');
});

test('a real bomber bomb falls through the shared ballistic solver and damages the shared base', () => {
  const { rooms, room } = setup();
  const base = room.combat.targets.find((t) => t.id === 'BASE'),
    w = room.combat.weapons;
  w.projectiles.push({
    id: ++w.sequence,
    type: 'bomb',
    owner: 'enemy',
    targetEntityId: 'BASE',
    sourceId: 'BOMBER',
    profile: weaponProfile({ id: 'tu95' }, 'bomb'),
    position: base.position.clone().add(new Vec3(0, 30, 0)),
    previous: base.position.clone(),
    velocity: new Vec3(0, -50, 0),
    age: 0,
    damage: 100,
  });
  for (let i = 0; i < 120; i++) rooms.step();
  assert.ok(base.health < base.maxHealth);
  assert.ok(
    room.combat.events.some(
      (e) => e.type === 'target-hit' && e.sourceId === 'BOMBER' && e.targetId === 'BASE',
    ),
  );
});

test('both configured fighter types can take off through ordinary network controls without structural damage', () => {
  const { rooms, room, one, two } = setup();
  for (let i = 0; i < 120 * 40; i++) {
    for (const p of [one, two])
      rooms.inputs(p, [
        {
          seq: p.received + 1,
          axes: {
            ...neutralAxes(),
            throttle: i < 500 ? 1 : 0,
            pitch: p.state.ias > 78 && p.state.position.y < 400 ? 0.3 : 0,
          },
          toggles: i === 0 ? ['afterburner'] : [],
        },
      ]);
    rooms.step();
  }
  for (const p of [one, two]) {
    assert.equal(p.state.crashed, false);
    assert.equal(p.state.onGround, false);
    assert.ok(p.state.position.y > 100);
    assert.equal(p.state.damage, 0);
  }
  assert.equal(room.mission.phase, 'active');
});

test('a disconnected runway pilot is flown by AI through a real takeoff without resetting its inventory', () => {
  const { rooms, room, one } = setup();
  const before = one.state.ammo.aam;
  rooms.leave(room, one);
  for (let i = 0; i < 120 * 25; i++) rooms.step();
  assert.equal(one.connected, false);
  assert.equal(one.state.crashed, false);
  assert.equal(one.state.onGround, false);
  assert.ok(one.state.position.y > 100);
  assert.ok(one.state.ammo.aam <= before);
});

test('a disconnected pilot can resume during landing without resetting gear, fuel or touchdown', () => {
  const { rooms, room, one, two } = setup();
  clearAir(room);
  rooms.step();
  touchdown(two);
  rooms.step();
  const state = two.state,
    fuel = state.fuel,
    token = two.sessionToken,
    landing = state.landing;
  assert.equal(landing.success, true);
  rooms.leave(room, two);
  rooms.step();
  assert.equal(room.lobby.hostId, one.id);
  for (let i = 0; i < 120 * 20 && state.velocity.length() >= 3; i++) rooms.step();
  assert.equal(state.crashed, false);
  assert.ok(state.velocity.length() < 3);
  assert.equal(rooms.resume(room, token), two);
  assert.equal(two.state, state);
  assert.equal(two.state.landing, landing);
  assert.equal(two.state.gear, true);
  assert.ok(two.state.fuel <= fuel);
  assert.equal(room.mission.phase, 'active');
});
