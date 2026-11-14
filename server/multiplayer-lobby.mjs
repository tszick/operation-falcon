import { createDefenseScene, defensePlayer } from './multiplayer-defense.mjs';
import { createRoomAI } from './multiplayer-ai.mjs';
import { createRoomCombat } from './multiplayer-combat.mjs';
import { defaultSelection, validLobbyMessage } from '../src/multiplayer/preflight.js';
import { spawnAircraft } from '../src/multiplayer/flightState.js';
import { createPlayerCombat } from './multiplayer-combat.mjs';
import { createRoomMission, startRoomMission } from './multiplayer-mission.mjs';
export function createRoomLobby(scenario) {
  return ['cooperative', 'arena'].includes(scenario)
    ? { revision: 1, hostId: null, missionId: scenario === 'arena' ? 'arena' : 'strike' }
    : null;
}
export function invalidateReadiness(room) {
  if (!room.lobby) return;
  room.lobby.revision++;
  for (const p of room.players.values()) p.ready = false;
}
export function joinRoomLobby(room, p) {
  p.selection = defaultSelection(p.state.spec.id);
  p.ready = false;
  if (!room.lobby) return;
  if (room.lobby.missionId === 'defend-base') p.state = defensePlayer(room, p);
  room.lobby.hostId ||= p.id;
  invalidateReadiness(room);
}
export function leaveRoomLobby(room) {
  if (!room.lobby) return;
  if (!room.players.get(room.lobby.hostId)?.connected)
    room.lobby.hostId = [...room.players.values()].find((p) => p.connected)?.id || null;
  if (room.mission.phase === 'waiting') invalidateReadiness(room);
}
export function updateRoomLobby(room, p, message) {
  if (!validLobbyMessage(message)) return 'loadout-invalid';
  if (message.type === 'rematch') return returnToLobby(room, p, message);
  if (!room.lobby || room.mission.phase !== 'waiting' || room.players.get(p.id) !== p)
    return 'lobby-locked';
  if (message.revision !== room.lobby.revision) return 'lobby-changed';
  if (message.type === 'start') {
    if (room.lobby.hostId !== p.id) return 'not-host';
    if (!startRoomMission(room)) return 'not-ready';
  } else if (message.type === 'mission') {
    if (room.scenario === 'arena') return 'lobby-locked';
    if (room.lobby.hostId !== p.id) return 'not-host';
    room.lobby.missionId = message.missionId;
    room.mission = createRoomMission('cooperative', message.missionId);
    resetRoomScene(room);
    invalidateReadiness(room);
  } else if (message.type === 'configure') {
    p.selection = structuredClone(message.selection);
    const state =
      room.lobby.missionId === 'defend-base'
        ? defensePlayer(room, p)
        : spawnAircraft(p.selection.aircraftId, p.slot, p.spawnSeed, {
            armed: true,
            choice: p.selection.loadout,
            fuelFraction: p.selection.fuelFraction,
          });
    if (room.lobby.missionId !== 'defend-base') state.position = p.state.position.clone();
    state.team = room.scenario === 'arena' ? p.id : 'ally';
    p.state = state;
    p.combat = createPlayerCombat();
    p.combat.weapons.selected =
      ['gun', 'aam', 'agm', 'bomb'].find((t) => state.ammo[t] > 0) || 'gun';
    invalidateReadiness(room);
  } else {
    p.ready = message.ready;
  }
  return null;
}
export function roomLobbySnapshot(room, { copy = true } = {}) {
  return room.lobby
    ? {
        ...room.lobby,
        players: [...room.players.values()].map((p) => ({
          id: p.id,
          callSign: p.callSign,
          ready: p.ready,
          selection: copy ? structuredClone(p.selection) : p.selection,
        })),
      }
    : null;
}

function resetRoomScene(room) {
  room.practiceWorld ??= room.world;
  if (room.lobby.missionId === 'defend-base') {
    const scene = createDefenseScene(room.world);
    room.world = scene.world;
    room.combat = createRoomCombat(room.world, 'range');
    room.combat.targets = scene.targets;
    room.combat.ai = createRoomAI(room.world, scene.targets);
  } else {
    room.world = { ...room.practiceWorld, revision: room.world.revision + 1, surface: 'grass' };
    room.combat = createRoomCombat(room.world, room.scenario);
  }
  for (const pilot of room.players.values()) {
    pilot.state =
      room.lobby.missionId === 'defend-base'
        ? defensePlayer(room, pilot)
        : spawnAircraft(pilot.selection.aircraftId, pilot.slot, pilot.spawnSeed, {
            armed: true,
            choice: pilot.selection.loadout,
            fuelFraction: pilot.selection.fuelFraction,
          });
    pilot.combat = createPlayerCombat();
    pilot.combat.weapons.selected =
      ['gun', 'aam', 'agm', 'bomb'].find((t) => pilot.state.ammo[t] > 0) || 'gun';
  }

  for (const pilot of room.players.values()) {
    pilot.state.team = room.scenario === 'arena' ? pilot.id : 'ally';
    pilot.actor = null;
  }
}
function returnToLobby(room, player, message) {
  if (!room.lobby || room.players.get(player.id) !== player || !player.connected)
    return 'lobby-locked';
  if (message.revision !== room.lobby.revision) return 'lobby-changed';
  if (room.lobby.hostId !== player.id) return 'not-host';
  if (!['success', 'failed'].includes(room.mission?.phase)) return 'round-active';
  for (const p of room.players.values()) if (!p.connected) room.players.delete(p.id);
  room.round++;
  room.mission = createRoomMission(room.scenario, room.lobby.missionId);
  resetRoomScene(room);
  room.broadcastEventId = 0;
  room.orphanedAt = null;
  for (const p of room.players.values()) {
    p.round = room.round;
    p.queue.length = 0;
    p.ack = p.received;
  }
  invalidateReadiness(room);
  return null;
}
