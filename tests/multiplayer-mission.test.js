import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { roomMissionSnapshot } from '../server/multiplayer-mission.mjs';
import { FlightPrediction } from '../src/multiplayer/prediction.js';
import { missionPresentation, missionFlightNotice } from '../src/multiplayer/missionView.js';
import { packFlight } from '../src/multiplayer/flightState.js';
import { neutralAxes, validCommand } from '../src/multiplayer/protocol.js';
import { Vec3, Quat, forward } from '../src/math.js';
import { applyDamage } from '../src/damage.js';
function setup() {
  const rooms = new MultiplayerRooms(),
    room = rooms.create('cooperative');
  const one = rooms.join(room, 'f16'),
    two = rooms.join(room, 'fa18');
  for (const p of [one, two])
    rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true });
  if (room.players.size >= 2 && [...room.players.values()].every((p) => p.ready))
    rooms.preflight(room, one, { type: 'start', revision: room.lobby.revision });
  return { rooms, room, one, two };
}
function run(rooms, seconds) {
  for (let i = 0; i < seconds * 120; i++) rooms.step();
}
function command(p, combat = {}) {
  return {
    seq: p.received + 1,
    axes: neutralAxes(),
    toggles: [],
    combat: { weapon: 'agm', fire: false, cycle: false, countermeasures: false, ...combat },
  };
}
function clearTargets(room) {
  const fighter = room.combat.targets.find((t) => t.aiControlled);
  applyDamage(fighter.flight, 100, 'fuselage');
  room.combat.targets.find((t) => t.kind === 'ground').alive = false;
}
test('cooperative lobby freezes fuel, physics, weapons and mission time until both pilots join', () => {
  const rooms = new MultiplayerRooms(),
    room = rooms.create('cooperative'),
    one = rooms.join(room, 'f16');
  const position = one.state.position.clone(),
    fuel = one.state.fuel,
    ammo = one.state.ammo.agm;
  rooms.inputs(one, [command(one, { fire: true })]);
  run(rooms, 45);
  assert.equal(one.ack, 1);
  assert.deepEqual(one.state.position, position);
  assert.equal(one.state.fuel, fuel);
  assert.equal(one.state.ammo.agm, ammo);
  assert.equal(room.mission.elapsedTicks, 0);
  assert.equal(room.combat.events.length, 0);
  const two = rooms.join(room, 'fa18');
  assert.ok(two);
  for (const p of [one, two])
    rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true });
  if (room.players.size >= 2 && [...room.players.values()].every((p) => p.ready))
    rooms.preflight(room, one, { type: 'start', revision: room.lobby.revision });
  rooms.step();
  assert.equal(room.mission.phase, 'active');
  assert.equal(room.mission.elapsedTicks, 1);
  assert.ok(room.combat.ai.remaining > 19.9, 'lobby time does not consume preparation time');
  assert.ok(one.state.position.distance(position) > 0);
});
test('the shared mission contains only its two actual targets and does not leak into practice rooms', () => {
  const { rooms, room } = setup();
  assert.deepEqual(room.combat.targets.map((t) => t.id).sort(), ['HOSTILE-ONE', 'RANGE-GROUND']);
  assert.equal(rooms.snapshot(room).mission.objectives.length, 3);
  assert.equal(rooms.snapshot(rooms.create('combat')).mission, null);
  assert.equal(rooms.snapshot(rooms.create('range')).mission, null);
});
test('a real server-earned AGM hit completes the ground objective and shared success waits for the fighter', () => {
  const { rooms, room, one } = setup(),
    ground = room.combat.targets.find((t) => t.kind === 'ground');
  one.state.position = ground.position.clone().add(new Vec3(0, 400, -1200));
  one.state.orientation = Quat.euler(0, -Math.atan2(400, 1200), 0);
  one.state.velocity = forward(one.state.orientation).scale(180);
  rooms.inputs(one, [command(one, { cycle: true })]);
  rooms.step();
  run(rooms, 2);
  assert.equal(one.combat.aim.id, ground.id);
  assert.equal(one.combat.aim.locked, true);
  rooms.inputs(one, [command(one, { fire: true })]);
  rooms.step();
  run(rooms, 4);
  assert.equal(room.mission.objectives[1].status, 'complete');
  assert.equal(room.mission.phase, 'active');
  applyDamage(room.combat.targets.find((t) => t.aiControlled).flight, 100, 'fuselage');
  rooms.step();
  assert.equal(room.mission.phase, 'success');
  assert.equal(one.state.ammo.agm, 1);
  assert.ok(room.mission.participants.find((p) => p.id === one.id).hits > 0);
  assert.ok(room.mission.objectives.every((o) => o.status === 'complete'));
});
test('a lost wingman does not prevent the remaining pilot from completing the primary objectives', () => {
  const { rooms, room, two } = setup();
  two.state.crashed = true;
  rooms.step();
  assert.equal(room.mission.phase, 'active');
  assert.equal(room.mission.objectives[2].status, 'failed');
  clearTargets(room);
  rooms.step();
  assert.equal(room.mission.phase, 'success');
  assert.equal(room.mission.objectives[2].status, 'failed');
});
test('a shared defeat waits for the actual crash and cannot be reversed by later target changes', () => {
  const { rooms, room, one, two } = setup();
  one.state.dying = true;
  two.state.dying = true;
  rooms.step();
  assert.equal(room.mission.phase, 'active');
  one.state.crashed = two.state.crashed = true;
  rooms.step();
  assert.equal(room.mission.phase, 'failed');
  const result = roomMissionSnapshot(room);
  clearTargets(room);
  run(rooms, 2);
  assert.deepEqual(roomMissionSnapshot(room), result);
});
test('the final result freezes physics and ammunition while still acknowledging queued inputs', () => {
  const { rooms, room, one } = setup();
  clearTargets(room);
  rooms.step();
  const result = roomMissionSnapshot(room),
    position = one.state.position.clone(),
    fuel = one.state.fuel;
  rooms.inputs(one, [command(one, { fire: true })]);
  run(rooms, 2);
  assert.equal(one.ack, 1);
  assert.equal(one.state.fuel, fuel);
  assert.deepEqual(one.state.position, position);
  assert.deepEqual(roomMissionSnapshot(room), result);
  assert.equal(rooms.join(room, 'f16'), null);
});
test('disconnects preserve participant identity and cannot grant a replacement aircraft after launch', () => {
  const { rooms, room, one, two } = setup();
  rooms.leave(room, one);
  assert.equal(room.mission.phase, 'active');
  assert.equal(rooms.join(room, 'f16'), null);
  rooms.step();
  assert.equal(one.connected, false);
  assert.equal(room.mission.participants.find((p) => p.id === one.id).lost, false);
  assert.equal(room.mission.objectives[2].status, 'pending');
  clearTargets(room);
  rooms.step();
  assert.equal(room.mission.phase, 'success');
  rooms.leave(room, two);
  rooms.leave(room, one);
  assert.equal(rooms.rooms.size, 1);
  assert.ok([...room.players.values()].every((p) => !p.connected));
});
test('an AI that physically withdraws also clears the airspace objective without giving a fictitious kill', () => {
  const { rooms, room, one } = setup(),
    fighter = room.combat.targets.find((t) => t.aiControlled);
  fighter.exited = true;
  fighter.alive = false;
  rooms.step();
  assert.equal(room.mission.objectives[0].status, 'complete');
  assert.equal(one.combat.kills, 0);
  assert.equal(room.mission.phase, 'active');
});
test('snapshots are isolated result data and clients cannot inject mission progress through controls', () => {
  const { rooms, room, one } = setup(),
    snapshot = rooms.snapshot(room);
  snapshot.mission.objectives[0].status = 'complete';
  snapshot.mission.participants[0].health = 999;
  assert.equal(room.mission.objectives[0].status, 'pending');
  assert.equal(room.mission.participants[0].health, 100);
  assert.equal(validCommand({ ...command(one), mission: { phase: 'success' } }), false);
  assert.equal(validCommand(command(one, { missionComplete: true })), false);
});
test('paused prediction never advances waiting or completed flights, including reconciliation replay', () => {
  const { one } = setup(),
    p = new FlightPrediction(),
    state = { ack: 0, state: packFlight(one.state) };
  p.reset(state);
  p.step(neutralAxes());
  assert.equal(p.pending.length, 1);
  p.simulating = false;
  const sequence = p.sequence;
  p.reconcile(state);
  assert.deepEqual(p.state.position, one.state.position);
  assert.equal(p.step(neutralAxes()), false);
  assert.equal(p.sequence, sequence);
  p.simulating = true;
  p.step(neutralAxes());
  assert.ok(p.state.position.distance(one.state.position) > 0);
});
test('mission presentation keeps optional failures distinct from a successful team result', () => {
  const { rooms, room, two } = setup();
  two.state.crashed = true;
  clearTargets(room);
  rooms.step();
  const view = missionPresentation(rooms.snapshot(room).mission);
  assert.equal(view.phase, 'success');
  assert.equal(view.ended, true);
  assert.equal(view.objectives[2].status, 'failed');
  assert.equal(view.results.length, 2);
  assert.equal(view.results.find((p) => p.callSign === 'Falcon Two').lost, true);
  assert.equal(missionPresentation(null), null);
});

test('queued lobby actions cannot turn into a launch-time shot or leave an acknowledgement gap', () => {
  const rooms = new MultiplayerRooms(),
    room = rooms.create('cooperative'),
    one = rooms.join(room, 'f16');
  rooms.inputs(one, [command(one, { fire: true })]);
  const two = rooms.join(room, 'fa18');
  for (const p of [one, two])
    rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true });
  if (room.players.size >= 2 && [...room.players.values()].every((p) => p.ready))
    rooms.preflight(room, one, { type: 'start', revision: room.lobby.revision });
  rooms.step();
  assert.equal(one.ack, 1);
  assert.equal(one.state.ammo.agm, 2);
  assert.equal(room.combat.events.filter((e) => e.type === 'missile-launch').length, 0);
  assert.equal(rooms.inputs(one, [command(one)]), true);
  rooms.step();
  assert.equal(one.ack, 2);
});

test('cooperative loss messages never offer a forbidden rejoin or replacement aircraft', () => {
  assert.equal(missionFlightNotice(null, true), null);
  assert.equal(missionFlightNotice({ phase: 'active' }, false), null);
  assert.match(missionFlightNotice({ phase: 'active' }, true), /nincs pótrepülő/);
  assert.match(missionFlightNotice({ phase: 'failed' }, true), /előszobába/);
  assert.match(missionFlightNotice({ phase: 'success' }, false), /előszobába/);
});

for (const ending of ['success', 'failed'])
  test(`a fatal aircraft reaches impact after cooperative ${ending} without changing the final result`, () => {
    const { rooms, room, one, two } = setup();
    one.state.position = new Vec3(350, 400, 0);
    one.state.velocity = new Vec3(0, -30, 90);
    applyDamage(one.state, 100, 'fuselage');
    if (ending === 'success') clearTargets(room);
    else {
      room.mission.phase = 'failed';
      room.mission.reason = 'test-final-result';
    }
    rooms.step();
    assert.equal(room.mission.phase, ending);
    assert.equal(one.state.crashed, false);
    const result = roomMissionSnapshot(room),
      healthy = packFlight(two.state),
      startY = one.state.position.y;
    for (let i = 0; i < 120 * 30 && !one.state.crashed; i++) rooms.step();
    assert.equal(one.state.crashed, true);
    assert.ok(one.state.position.y < startY);
    assert.deepEqual(roomMissionSnapshot(room), result);
    assert.deepEqual(packFlight(two.state), healthy);
    assert.equal(
      room.combat.events.filter(
        (e) =>
          e.type === 'explosion' && e.ground && Math.abs(e.position.x - one.state.position.x) < 1,
      ).length,
      1,
    );
    const events = room.combat.eventSequence;
    run(rooms, 1);
    assert.equal(room.combat.eventSequence, events);
  });
