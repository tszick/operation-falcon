import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { missionPresentation, summarizeParticipants } from '../src/multiplayer/missionView.js';
import { updateRoomMission } from '../server/multiplayer-mission.mjs';
import { neutralAxes, EVENT_LIMIT } from '../src/multiplayer/protocol.js';
function setup() {
  const rooms = new MultiplayerRooms(),
    room = rooms.create('cooperative');
  const pilots = Array.from({ length: 5 }, () => rooms.join(room, 'f16'));
  for (const p of pilots)
    rooms.preflight(room, p, { type: 'ready', ready: true, revision: room.lobby.revision });
  rooms.preflight(room, pilots[0], { type: 'start', revision: room.lobby.revision });
  return { rooms, room, pilots };
}
test('actual gun expenditure survives event eviction without counting empty-trigger attempts', () => {
  const {
    rooms,
    room,
    pilots: [p],
  } = setup();
  room.combat.targets = [];
  room.combat.ai.units = [];
  const initial = p.state.ammo.gun;
  for (let i = 0; i < 2400; i++) {
    rooms.inputs(p, [
      {
        seq: p.received + 1,
        axes: neutralAxes(),
        toggles: [],
        combat: {
          weapon: 'gun',
          fire: true,
          cycle: false,
          countermeasures: false,
        },
      },
    ]);
    rooms.step();
  }
  const used = initial - p.state.ammo.gun;
  assert.ok(used > EVENT_LIMIT);
  assert.equal(p.combat.gunRounds, used);
  assert.equal(room.mission.participants[0].gunRounds, used);
  assert.equal(room.combat.events.length, EVENT_LIMIT);
  assert.equal(p.combat.missiles + p.combat.bombs, 0);
  p.state.ammo.gun = 0;
  const before = p.combat.gunRounds;
  for (let i = 0; i < 20; i++) {
    rooms.inputs(p, [
      {
        seq: p.received + 1,
        axes: neutralAxes(),
        toggles: [],
        combat: {
          weapon: 'gun',
          fire: true,
          cycle: false,
          countermeasures: false,
        },
      },
    ]);
    rooms.step();
  }
  assert.equal(p.combat.gunRounds, before);
});
test('five-pilot results survive host migration, AI recovery, final aftermath and reset between rounds', () => {
  const { rooms, room, pilots } = setup();
  for (let round = 1; round <= 3; round++) {
    const host = room.players.get(room.lobby.hostId);
    rooms.leave(room, host);
    assert.notEqual(room.lobby.hostId, host.id);
    assert.equal(rooms.resume(room, host.sessionToken), host);
    Object.assign(host.combat, {
      gunRounds: 10 * round,
      missiles: round,
      bombs: 2,
      hits: 3,
      friendlyHits: 1,
    });
    pilots[4].state.crashed = true;
    for (const t of room.combat.targets) {
      t.alive = false;
      if (t.flight) t.flight.dying = true;
    }
    updateRoomMission(room);
    assert.equal(room.mission.phase, 'success');
    const result = rooms.snapshot(room).mission;
    const view = missionPresentation(result);
    assert.equal(view.summary.pilots, 5);
    assert.equal(view.summary.lost, 1);
    assert.equal(view.summary.gunRounds, round * 10);
    assert.equal(view.summary.friendlyHits, 1);
    assert.equal(view.summary.missiles, round);
    assert.equal(view.summary.bombs, 2);
    assert.ok(view.reason);
    host.combat.gunRounds++;
    rooms.step();
    assert.deepEqual(rooms.snapshot(room).mission, result, 'completed results stay frozen');
    const nextHost = room.players.get(room.lobby.hostId);
    assert.equal(
      rooms.preflight(room, nextHost, { type: 'rematch', revision: room.lobby.revision }),
      null,
    );
    assert.ok(
      pilots.every(
        (p) => p.combat.gunRounds === 0 && p.combat.missiles === 0 && p.combat.bombs === 0,
      ),
    );
    for (const p of pilots)
      rooms.preflight(room, p, { type: 'ready', ready: true, revision: room.lobby.revision });
    rooms.preflight(room, nextHost, { type: 'start', revision: room.lobby.revision });
    assert.equal(room.mission.phase, 'active');
  }
});
test('a successful co-op result retains optional failure, and aggregate results do not mutate participants', () => {
  const { room, pilots } = setup();
  pilots[1].state.crashed = true;
  for (const t of room.combat.targets) {
    t.alive = false;
    if (t.flight) t.flight.dying = true;
  }
  updateRoomMission(room);
  const view = missionPresentation(room.mission);
  assert.equal(view.ended, true);
  assert.equal(view.summary.lost, 1);
  assert.equal(view.objectives.find((o) => o.label.includes('opcion')).status, 'failed');
  const original = structuredClone(room.mission.participants);
  summarizeParticipants(room.mission.participants);
  assert.deepEqual(room.mission.participants, original);
});

test('all five co-op pilots start in distinct formation slots without spawn collisions', () => {
  const { rooms, room, pilots } = setup();
  for (let i = 0; i < pilots.length; i++)
    for (let j = i + 1; j < pilots.length; j++)
      assert.ok(pilots[i].state.position.distance(pilots[j].state.position) > 150);
  for (let i = 0; i < 120; i++) rooms.step();
  assert.ok(pilots.every((p) => !p.state.dying && !p.state.crashed));
  assert.equal(
    room.combat.events.some((e) => e.type === 'collision'),
    false,
  );
});
test('actual bomb release is counted once while repeated cooldown attempts do not inflate use', () => {
  const {
    rooms,
    room,
    pilots: [p],
  } = setup();
  room.combat.targets = [];
  room.combat.ai.units = [];
  const initial = p.state.ammo.bomb;
  assert.ok(initial > 0);
  for (let i = 0; i < 5; i++) {
    rooms.inputs(p, [
      {
        seq: p.received + 1,
        axes: neutralAxes(),
        toggles: [],
        combat: {
          weapon: 'bomb',
          fire: true,
          cycle: false,
          countermeasures: false,
        },
      },
    ]);
    rooms.step();
  }
  assert.equal(p.state.ammo.bomb, initial - 1);
  assert.equal(p.combat.bombs, 1);
  assert.equal(room.mission.participants[0].bombs, 1);
});
