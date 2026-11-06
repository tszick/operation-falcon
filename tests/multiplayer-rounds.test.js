import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { defaultSelection } from '../src/multiplayer/preflight.js';
import { neutralAxes } from '../src/multiplayer/protocol.js';
import { MultiplayerClient } from '../src/multiplayer/client.js';
import { SnapshotInbox } from '../src/multiplayer/snapshotInbox.js';
import { Spectator, pilotStatus } from '../src/multiplayer/spectator.js';
import { missionPresentation } from '../src/multiplayer/missionView.js';
function setup(scenario = 'arena', count = 3) {
  const rooms = new MultiplayerRooms(),
    room = rooms.create(scenario),
    pilots = Array.from({ length: count }, (_, i) => rooms.join(room, i % 2 ? 'fa18' : 'f16'));
  return { rooms, room, pilots };
}
function send(rooms, room, p, type, extra = {}) {
  return rooms.preflight(room, p, { type, revision: room.lobby.revision, ...extra });
}
function start(rooms, room, pilots) {
  for (const p of pilots) send(rooms, room, p, 'ready', { ready: true });
  assert.equal(
    send(
      rooms,
      room,
      pilots.find((p) => p.id === room.lobby.hostId),
      'start',
    ),
    null,
  );
}
function win(rooms, room, pilots) {
  for (const p of pilots.slice(1)) p.state.crashed = true;
  rooms.step();
  assert.equal(room.mission.phase, 'success');
}
test('a completed arena returns to the same room with fresh aircraft and preserved equipment, identity and sessions', () => {
  const { rooms, room, pilots } = setup();
  const one = pilots[0],
    selection = defaultSelection('fa18');
  selection.loadout.gun = false;
  selection.fuelFraction = 0.4;
  send(rooms, room, one, 'configure', { selection });
  start(rooms, room, pilots);
  one.state.ammo.aam = 0;
  one.state.damage = 12;
  win(rooms, room, pilots);
  const code = room.code,
    token = one.sessionToken,
    oldMission = room.mission,
    worldRevision = room.world.revision;
  assert.equal(send(rooms, room, pilots[1], 'rematch'), 'not-host');
  assert.equal(send(rooms, room, one, 'rematch'), null);
  assert.equal(room.code, code);
  assert.equal(one.sessionToken, token);
  assert.equal(room.players.get(one.id), one);
  assert.equal(room.round, 2);
  assert.equal(room.mission.phase, 'waiting');
  assert.equal(oldMission.phase, 'success');
  assert.ok(room.world.revision > worldRevision);
  assert.equal(one.state.damage, 0);
  assert.equal(one.state.ammo.gun, 0);
  assert.ok(one.state.ammo.aam > 0);
  assert.equal(one.combat.weapons.selected, 'aam');
  assert.equal(one.state.fuel, one.state.spec.fuelCapacity * 0.4);
  assert.equal(room.combat.targets.length, 0);
  assert.equal(room.combat.events.length, 0);
  assert.ok(pilots.every((p) => !p.state.crashed && !p.ready));
  start(rooms, room, pilots);
  assert.equal(room.mission.elapsedTicks, 0);
  assert.equal(room.mission.participants.length, 3);
});
test('an active round cannot be reset and stale lobby approvals cannot launch a rematch', () => {
  const { rooms, room, pilots } = setup();
  start(rooms, room, pilots);
  const state = pilots[0].state;
  assert.equal(send(rooms, room, pilots[0], 'rematch'), 'round-active');
  assert.equal(pilots[0].state, state);
  win(rooms, room, pilots);
  const revision = room.lobby.revision;
  send(rooms, room, pilots[0], 'rematch');
  assert.equal(
    rooms.preflight(room, pilots[0], { type: 'ready', revision, ready: true }),
    'lobby-changed',
  );
  assert.equal(room.mission.phase, 'waiting');
});
test('host disconnect transfers leadership during combat, result review and reconnect without stealing it back', () => {
  const { rooms, room, pilots } = setup();
  start(rooms, room, pilots);
  rooms.leave(room, pilots[0]);
  assert.equal(room.lobby.hostId, pilots[1].id);
  rooms.resume(room, pilots[0].sessionToken);
  assert.equal(room.lobby.hostId, pilots[1].id);
  win(rooms, room, pilots);
  rooms.leave(room, pilots[1]);
  assert.equal(room.lobby.hostId, pilots[0].id);
  const oldToken = pilots[1].sessionToken;
  send(rooms, room, pilots[0], 'rematch');
  assert.equal(room.players.size, 2);
  assert.equal(rooms.resume(room, oldToken), null);
  assert.equal(rooms.join(room, 'f16').callSign, 'Falcon Two');
});
test('round changes discard queued old controls without acknowledging or replaying them in the fresh aircraft', () => {
  const { rooms, room, pilots } = setup();
  start(rooms, room, pilots);
  const p = pilots[0];
  win(rooms, room, pilots);
  const command = {
    seq: 1,
    axes: { ...neutralAxes(), pitch: 1 },
    toggles: ['gear'],
    combat: { weapon: 'gun', fire: true, cycle: true, countermeasures: true },
  };
  assert.equal(rooms.inputs(p, [command], 1), true);
  send(rooms, room, p, 'rematch');
  assert.equal(p.ack, 1);
  assert.equal(p.queue.length, 0);
  assert.equal(rooms.inputs(p, [{ ...command, seq: 2 }], 1), false);
  start(rooms, room, pilots);
  const ammo = p.state.ammo.gun;
  rooms.step();
  assert.equal(p.state.ammo.gun, ammo);
  assert.equal(p.ack, 1);
  assert.equal(
    rooms.inputs(
      p,
      [
        {
          ...command,
          seq: 2,
          axes: neutralAxes(),
          toggles: [],
          combat: { weapon: 'gun', fire: false, cycle: false, countermeasures: false },
        },
      ],
      2,
    ),
    true,
  );
  rooms.step();
  assert.equal(p.ack, 2);
});
test('defense rematches rebuild the airbase, opposing units and ground starts for every retained pilot', () => {
  const { rooms, room, pilots } = setup('cooperative');
  send(rooms, room, pilots[0], 'mission', { missionId: 'defend-base' });
  start(rooms, room, pilots);
  const base = room.combat.targets.find((t) => t.id === 'BASE');
  base.alive = false;
  base.health = 0;
  rooms.step();
  assert.equal(room.mission.phase, 'failed');
  send(rooms, room, pilots[0], 'rematch');
  const fresh = room.combat.targets.find((t) => t.id === 'BASE');
  assert.notEqual(fresh, base);
  assert.equal(fresh.alive, true);
  assert.equal(fresh.health, fresh.maxHealth);
  assert.ok(pilots.every((p) => p.state.onGround && Math.abs(p.state.position.z) < 1600));
  assert.equal(
    room.combat.targets.filter((t) => t.team === 'enemy' && t.kind === 'air' && t.alive).length,
    3,
  );
});
test('the client resets prediction, interpolation and combat history on round boundaries and rejects older snapshots', () => {
  const { rooms, room, pilots } = setup();
  start(rooms, room, pilots);
  let callbacks = 0;
  const c = new MultiplayerClient({ onRound: () => callbacks++ });
  c.id = pilots[0].id;
  c.prediction.reset(rooms.snapshot(room).players[0]);
  c.acceptSnapshot(rooms.snapshot(room), false);
  c.prediction.step(neutralAxes());
  const old = rooms.snapshot(room);
  win(rooms, room, pilots);
  send(rooms, room, pilots[0], 'rematch');
  c.acceptSnapshot(rooms.snapshot(room), true);
  assert.equal(callbacks, 1);
  assert.equal(c.round, 2);
  assert.equal(c.prediction.pending.length, 0);
  assert.equal(c.prediction.outgoing.length, 0);
  assert.equal(c.history.frames.length, 1);
  assert.equal(c.combat.frames.length, 1);
  c.acceptSnapshot(old, true);
  assert.equal(c.round, 2);
  assert.equal(c.latest.mission.phase, 'waiting');
  assert.equal(callbacks, 1);
});
test('snapshot coalescing never carries previous-round explosions into the new scene', () => {
  const tasks = [],
    out = [],
    inbox = new SnapshotInbox(
      (s) => out.push(s),
      (task) => tasks.push(task),
    );
  inbox.offer({ round: 1, tick: 10, combat: { events: [{ id: 99 }], eventSequence: 99 } }, 0);
  inbox.offer({ round: 2, tick: 11, combat: { events: [], eventSequence: 0 } }, 1);
  inbox.offer({ round: 1, tick: 10, combat: { events: [{ id: 100 }], eventSequence: 100 } }, 2);
  tasks.shift()();
  assert.equal(out.length, 1);
  assert.equal(out[0].round, 2);
  assert.deepEqual(out[0].combat.events, []);
});
test('spectating waits for impact, cycles living pilots, follows AI replacements and leaves real ownership untouched', () => {
  const s = new Spectator(),
    snapshot = {
      players: [
        { id: 'one', state: {} },
        { id: 'two', connected: false, state: {} },
        { id: 'three', state: {} },
        { id: 'four', state: { dying: true } },
      ],
    },
    own = { dying: true, crashed: false };
  assert.deepEqual(s.update(snapshot, 'one', own), []);
  assert.equal(s.choose('two', snapshot, 'one', own), false);
  own.crashed = true;
  assert.equal(s.update(snapshot, 'one', own).length, 2);
  assert.equal(s.id, 'two');
  s.cycle(1, snapshot, 'one', own);
  assert.equal(s.id, 'three');
  s.cycle(1, snapshot, 'one', own);
  assert.equal(s.id, 'two');
  snapshot.players[1].state.crashed = true;
  s.update(snapshot, 'one', own);
  assert.equal(s.id, 'three');
  assert.equal(own.crashed, true);
  s.reset();
  assert.equal(s.id, null);
  assert.equal(pilotStatus({ state: {}, connected: false }), 'AI irányítja');
  assert.equal(pilotStatus({ state: { crashed: true }, connected: false }), 'Kiesett');
});
test('results expose authoritative kills and friendly hits independently of the victory flag', () => {
  const { rooms, room, pilots } = setup();
  start(rooms, room, pilots);
  pilots[0].combat.hits = 7;
  pilots[0].combat.kills = 2;
  pilots[0].combat.friendlyHits = 1;
  win(rooms, room, pilots);
  const view = missionPresentation(rooms.snapshot(room).mission),
    row = view.results.find((p) => p.id === pilots[0].id);
  assert.equal(row.hits, 7);
  assert.equal(row.kills, 2);
  assert.equal(row.friendlyHits, 1);
  assert.equal(row.lost, false);
});
