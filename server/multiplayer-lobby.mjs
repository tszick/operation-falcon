import { defaultSelection, validLobbyMessage } from '../src/multiplayer/preflight.js';
import { spawnAircraft } from '../src/multiplayer/flightState.js';
import { createPlayerCombat } from './multiplayer-combat.mjs';
import { createRoomMission, startRoomMission } from './multiplayer-mission.mjs';
export function createRoomLobby(scenario) {
  return scenario === 'cooperative' ? { revision: 1, hostId: null, missionId: 'strike' } : null;
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
  room.lobby.hostId ||= p.id;
  invalidateReadiness(room);
}
export function leaveRoomLobby(room) {
  if (!room.lobby || room.mission.phase !== 'waiting') return;
  if (!room.players.has(room.lobby.hostId))
    room.lobby.hostId = room.players.keys().next().value || null;
  invalidateReadiness(room);
}
export function updateRoomLobby(room, p, message) {
  if (!validLobbyMessage(message)) return 'loadout-invalid';
  if (!room.lobby || room.mission.phase !== 'waiting' || room.players.get(p.id) !== p)
    return 'lobby-locked';
  if (message.revision !== room.lobby.revision) return 'lobby-changed';
  if (message.type === 'mission') {
    if (room.lobby.hostId !== p.id) return 'not-host';
    room.lobby.missionId = message.missionId;
    room.mission = createRoomMission('cooperative', message.missionId);
    invalidateReadiness(room);
  } else if (message.type === 'configure') {
    p.selection = structuredClone(message.selection);
    const state = spawnAircraft(p.selection.aircraftId, p.slot, p.spawnSeed, {
      armed: true,
      choice: p.selection.loadout,
      fuelFraction: p.selection.fuelFraction,
    });
    state.position = p.state.position.clone();
    p.state = state;
    p.combat = createPlayerCombat();
    p.combat.weapons.selected =
      ['gun', 'aam', 'agm', 'bomb'].find((t) => state.ammo[t] > 0) || 'gun';
    invalidateReadiness(room);
  } else {
    p.ready = message.ready;
    startRoomMission(room);
  }
  return null;
}
export function roomLobbySnapshot(room) {
  return room.lobby
    ? {
        ...room.lobby,
        players: [...room.players.values()].map((p) => ({
          id: p.id,
          callSign: p.callSign,
          ready: p.ready,
          selection: structuredClone(p.selection),
        })),
      }
    : null;
}
