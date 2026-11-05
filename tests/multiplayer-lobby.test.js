import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import {
  defaultSelection,
  validateSelection,
  validLobbyMessage,
} from '../src/multiplayer/preflight.js';
import { packFlight, unpackFlight } from '../src/multiplayer/flightState.js';
import { mass } from '../src/physics.js';
import { applyDamage } from '../src/damage.js';
function setup() {
  const rooms = new MultiplayerRooms(),
    room = rooms.create('cooperative'),
    one = rooms.join(room, 'f16'),
    two = rooms.join(room, 'fa18');
  return { rooms, room, one, two };
}
function ready(rooms, room, p, value = true) {
  return rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: value });
}
function configure(rooms, room, p, selection) {
  return rooms.preflight(room, p, { type: 'configure', revision: room.lobby.revision, selection });
}
test('two joins do not launch the sortie, and both explicit ready acknowledgements are required', () => {
  const { rooms, room, one, two } = setup();
  for (let i = 0; i < 120; i++) rooms.step();
  assert.equal(room.mission.elapsedTicks, 0);
  assert.equal(room.mission.phase, 'waiting');
  assert.equal(ready(rooms, room, one), null);
  assert.equal(room.mission.phase, 'waiting');
  assert.equal(ready(rooms, room, one, false), null);
  assert.equal(one.ready, false);
  ready(rooms, room, one);
  ready(rooms, room, two);
  assert.equal(room.mission.phase, 'active');
  assert.equal(ready(rooms, room, two, false), 'lobby-locked');
});
test('changing a valid loadout invalidates every readiness and uses real ammo, fuel and mass', () => {
  const { rooms, room, one, two } = setup();
  ready(rooms, room, one);
  const before = mass(two.state),
    selection = defaultSelection('f16');
  selection.loadout.gun = false;
  selection.loadout.stations = selection.loadout.stations.map(() => null);
  selection.fuelFraction = 0.2;
  assert.equal(configure(rooms, room, two, selection), null);
  assert.equal(one.ready, false);
  assert.equal(two.ready, false);
  assert.equal(two.state.spec.id, 'f16');
  assert.equal(two.state.ammo.gun, 0);
  assert.equal(two.state.ammo.aam, 0);
  assert.equal(two.state.fuel, two.state.spec.fuelCapacity * 0.2);
  assert.ok(mass(two.state) < before);
  const remote = unpackFlight(JSON.parse(JSON.stringify(packFlight(two.state))));
  assert.deepEqual(remote.spec.configuredArmament, two.state.spec.configuredArmament);
  assert.equal(mass(remote), mass(two.state));
  selection.loadout.stations[0] = 'aam';
  assert.equal(two.selection.loadout.stations[0], null);
});
test('loadout validation rejects incompatible stations, aircraft and arbitrary inventory or timing fields', () => {
  const selection = defaultSelection('f16');
  assert.equal(validateSelection(selection), true);
  for (const bad of [
    null,
    { ...selection, aircraftId: 'mig29' },
    { ...selection, fuelFraction: 0 },
    { ...selection, fuelFraction: 2 },
    { ...selection, ammo: { aam: 999 } },
    { ...selection, loadout: { ...selection.loadout, gun: 999 } },
    {
      ...selection,
      loadout: { ...selection.loadout, stations: ['agm', ...selection.loadout.stations.slice(1)] },
    },
    { ...selection, loadout: { ...selection.loadout, stations: [] } },
    {
      ...selection,
      loadout: { ...selection.loadout, stations: selection.loadout.stations.map(() => false) },
    },
  ])
    assert.equal(validateSelection(bad), false);
  assert.equal(
    validLobbyMessage({ type: 'ready', revision: 1, ready: true, missionComplete: true }),
    false,
  );
  assert.equal(validLobbyMessage({ type: 'ready', revision: 1, ready: 'true' }), false);
});
test('stale ready and configure messages cannot approve or overwrite a newer shared configuration', () => {
  const { rooms, room, one, two } = setup(),
    revision = room.lobby.revision;
  configure(rooms, room, one, defaultSelection('fa18'));
  assert.equal(
    rooms.preflight(room, two, { type: 'ready', revision, ready: true }),
    'lobby-changed',
  );
  assert.equal(
    rooms.preflight(room, two, { type: 'configure', revision, selection: defaultSelection('f16') }),
    'lobby-changed',
  );
  assert.equal(two.state.spec.id, 'fa18');
  assert.equal(two.ready, false);
  assert.equal(room.mission.phase, 'waiting');
});
test('the host alone chooses the assignment and mission changes clear readiness without inventing optional success', () => {
  const { rooms, room, one, two } = setup();
  ready(rooms, room, two);
  const change = (p) =>
    rooms.preflight(room, p, {
      type: 'mission',
      revision: room.lobby.revision,
      missionId: 'intercept',
    });
  assert.equal(change(two), 'not-host');
  assert.equal(change(one), null);
  assert.equal(two.ready, false);
  assert.equal(room.mission.objectives.find((o) => o.id === 'ground').optional, true);
  ready(rooms, room, one);
  ready(rooms, room, two);
  applyDamage(room.combat.targets.find((t) => t.aiControlled).flight, 100, 'fuselage');
  rooms.step();
  assert.equal(room.mission.phase, 'success');
  assert.equal(room.mission.objectives.find((o) => o.id === 'ground').status, 'failed');
});
test('host departure promotes the remaining pilot and clears all previous approvals', () => {
  const { rooms, room, one, two } = setup();
  ready(rooms, room, two);
  rooms.leave(room, one);
  assert.equal(room.lobby.hostId, two.id);
  assert.equal(two.ready, false);
  assert.equal(room.mission.phase, 'waiting');
  const replacement = rooms.join(room, 'f16');
  assert.ok(replacement);
  assert.equal(room.lobby.hostId, two.id);
  ready(rooms, room, replacement);
  assert.equal(room.mission.phase, 'waiting');
  ready(rooms, room, two);
  assert.equal(room.mission.phase, 'active');
});
test('active flights reject loadout changes atomically, and unrelated practice rooms retain their current behaviour', () => {
  const { rooms, room, one, two } = setup();
  ready(rooms, room, one);
  ready(rooms, room, two);
  const state = one.state;
  assert.equal(configure(rooms, room, one, defaultSelection('fa18')), 'lobby-locked');
  assert.equal(one.state, state);
  const practice = rooms.create('range'),
    p = rooms.join(practice, 'f16'),
    position = p.state.position.clone();
  rooms.step();
  assert.ok(p.state.position.distance(position) > 0);
  assert.equal(rooms.snapshot(practice).lobby, null);
});
test('lobby snapshots contain independent public equipment data and never leak the spawn seed', () => {
  const { rooms, room, one } = setup(),
    snap = rooms.snapshot(room);
  assert.equal(snap.lobby.players[0].spawnSeed, undefined);
  snap.lobby.players[0].selection.loadout.gun = false;
  assert.equal(one.selection.loadout.gun, true);
});
