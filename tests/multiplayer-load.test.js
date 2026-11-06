import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatLoadPilot } from './helpers/combat-load-pilot.js';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { unpackFlight } from '../src/multiplayer/flightState.js';
import { validCommand } from '../src/multiplayer/protocol.js';
function fixture() {
  const rooms = new MultiplayerRooms(),
    room = rooms.create('arena'),
    one = rooms.join(room, 'f16'),
    two = rooms.join(room, 'fa18');
  for (const p of [one, two])
    rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true });
  rooms.preflight(room, one, { type: 'start', revision: room.lobby.revision });
  const snapshot = rooms.snapshot(room);
  return { snapshot, id: one.id, state: unpackFlight(snapshot.players[0].state) };
}
test('combat load pilot uses ordinary valid inputs and cannot mutate flight state or replenish stores', () => {
  const { snapshot, id, state } = fixture(),
    pilot = new CombatLoadPilot(),
    before = structuredClone(state);
  const c = pilot.command(state, snapshot, id);
  assert.equal(validCommand({ seq: 1, ...c }), true);
  assert.deepEqual(structuredClone(state), before);
  assert.equal(c.combat.fire, false);
  assert.equal(c.combat.cycle, true);
  assert.equal(pilot.command(state, snapshot, id).combat.cycle, false);
});
test('combat load pilot respects fatal states and finite ammunition, and spaces decoys', () => {
  const { snapshot, id, state } = fixture(),
    pilot = new CombatLoadPilot();
  state.dying = true;
  assert.equal(pilot.command(state, snapshot, id), null);
  state.dying = false;
  state.ammo.aam = 0;
  state.ammo.gun = 0;
  state.incomingMissiles = 1;
  const first = pilot.command(state, snapshot, id);
  assert.equal(first.combat.weapon, 'gun');
  assert.equal(first.combat.fire, false);
  assert.equal(first.combat.countermeasures, true);
  assert.equal(pilot.command(state, snapshot, id).combat.countermeasures, false);
  state.elapsed += 3;
  assert.equal(pilot.command(state, snapshot, id).combat.countermeasures, true);
  snapshot.mission.phase = 'success';
  assert.equal(pilot.command(state, snapshot, id), null);
});
