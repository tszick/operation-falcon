import {
  createRoomLobby,
  joinRoomLobby,
  leaveRoomLobby,
  updateRoomLobby,
  roomLobbySnapshot,
} from './multiplayer-lobby.mjs';
import {
  createRoomMission,
  roomSimulating,
  updateRoomMission,
  roomMissionSnapshot,
} from './multiplayer-mission.mjs';
import {
  createRoomCombat,
  createPlayerCombat,
  stepRoomCombat,
  playerCombatSnapshot,
  roomCombatSnapshot,
} from './multiplayer-combat.mjs';
import { randomBytes, randomInt } from 'node:crypto';
import { Vec3 } from '../src/math.js';
import { withTerrainSnapshot } from '../src/terrain.js';
import { spawnAircraft, applyFlightCommand, packFlight } from '../src/multiplayer/flightState.js';
import {
  ROOM_CAPACITY,
  roomScenarios,
  INPUT_QUEUE_LIMIT,
  NETWORK_STEP,
  validCommand,
} from '../src/multiplayer/protocol.js';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode() {
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
}
export class MultiplayerRooms {
  constructor({ maxRooms = 16 } = {}) {
    this.rooms = new Map();
    this.maxRooms = maxRooms;
  }
  create(scenario = 'range') {
    if (!roomScenarios.includes(scenario)) return null;
    if (this.rooms.size >= this.maxRooms) return null;
    let code;
    do code = roomCode();
    while (this.rooms.has(code));
    const world = {
      revision: 1,
      skySeed: randomBytes(4).readUInt32LE(),
      river: null,
      road: null,
      canyon: null,
      peaks: [],
    };
    const room = {
      code,
      world,
      scenario,
      players: new Map(),
      tick: 0,
      combat: createRoomCombat(world, scenario),
      mission: createRoomMission(scenario),
      lobby: createRoomLobby(scenario),
    };
    this.rooms.set(code, room);
    return room;
  }
  join(room, aircraftId) {
    if (
      !room ||
      room.players.size >= ROOM_CAPACITY ||
      (room.mission && room.mission.phase !== 'waiting')
    )
      return null;
    const slot = [0, 1].find((slot) => ![...room.players.values()].some((p) => p.slot === slot));
    const spawnSeed = randomBytes(4).readUInt32LE();
    const player = {
      spawnSeed,
      id: randomBytes(12).toString('hex'),
      slot,
      callSign: slot ? 'Falcon Two' : 'Falcon One',
      state: spawnAircraft(aircraftId, slot, spawnSeed, { armed: true }),
      combat: createPlayerCombat(),
      queue: [],
      received: 0,
      ack: 0,
    };
    const leader = [...room.players.values()].find((p) => !p.state.crashed && !p.state.dying);
    if (leader) {
      player.state.position = leader.state.position
        .clone()
        .add(leader.state.orientation.rotate(new Vec3(40, 20, 220)));
      player.state.velocity = leader.state.velocity.clone();
      player.state.orientation = leader.state.orientation.clone();
    }
    room.players.set(player.id, player);
    joinRoomLobby(room, player);
    return player;
  }
  preflight(room, player, message) {
    return updateRoomLobby(room, player, message);
  }
  inputs(player, commands) {
    if (player.queue.length + commands.length > INPUT_QUEUE_LIMIT) return false;
    let next = player.received + 1;
    if (!commands.every((c) => validCommand(c) && c.seq === next++)) return false;
    player.queue.push(...commands);
    player.received = next - 1;
    return true;
  }
  step() {
    for (const room of this.rooms.values()) {
      withTerrainSnapshot(room.world, () => {
        const commands = new Map(),
          simulating = roomSimulating(room);
        if (room.mission && simulating) room.mission.elapsedTicks++;
        for (const player of room.players.values()) {
          const command = player.queue.shift();
          commands.set(player.id, command);
          if (simulating) applyFlightCommand(player.state, command, NETWORK_STEP);
          if (command) player.ack = command.seq;
        }
        if (simulating) stepRoomCombat(room, commands, NETWORK_STEP);
        updateRoomMission(room);
      });
      room.tick++;
    }
  }
  snapshot(room) {
    return {
      type: 'snapshot',
      scenario: room.scenario,
      mission: roomMissionSnapshot(room),
      lobby: roomLobbySnapshot(room),
      tick: room.tick,
      time: room.tick * NETWORK_STEP,
      combat: roomCombatSnapshot(room),
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        callSign: p.callSign,
        ack: p.ack,
        state: packFlight(p.state),
        combat: playerCombatSnapshot(p),
      })),
    };
  }
  leave(room, player) {
    room.players.delete(player.id);
    leaveRoomLobby(room);
    updateRoomMission(room);
    if (!room.players.size) this.rooms.delete(room.code);
  }
}
