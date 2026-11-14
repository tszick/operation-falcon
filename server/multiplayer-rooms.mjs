import { encodeSnapshot } from '../src/multiplayer/binarySnapshot.js';
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
  stepRoomAftermath,
  playerCombatSnapshot,
  roomCombatSnapshot,
} from './multiplayer-combat.mjs';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Targeting } from '../src/targeting.js';
import { playerEntity } from './multiplayer-combat.mjs';
import { stepTakenOverAircraft } from './multiplayer-takeover.mjs';
import { Vec3 } from '../src/math.js';
import { withTerrainSnapshot } from '../src/terrain.js';
import { spawnAircraft, applyFlightCommand, packFlight } from '../src/multiplayer/flightState.js';
import {
  ROOM_CAPACITY,
  roomScenarios,
  INPUT_QUEUE_LIMIT,
  NETWORK_STEP,
  validCommand,
  normalizePlayerName,
} from '../src/multiplayer/protocol.js';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode() {
  return Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
}
export class MultiplayerRooms {
  constructor({ maxRooms = 10, now = () => Date.now(), orphanTimeout = 120000 } = {}) {
    this.rooms = new Map();
    this.maxRooms = maxRooms;
    this.now = now;
    this.orphanTimeout = orphanTimeout;
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
      round: 1,
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
  join(room, aircraftId, playerName = '') {
    const name = normalizePlayerName(playerName);
    if (
      name === null ||
      !room ||
      room.players.size >= ROOM_CAPACITY ||
      (room.mission && room.mission.phase !== 'waiting')
    )
      return null;
    const slot = Array.from({ length: ROOM_CAPACITY }, (_, i) => i).find(
      (slot) => ![...room.players.values()].some((p) => p.slot === slot),
    );
    const spawnSeed = randomBytes(4).readUInt32LE();
    const player = {
      round: room.round,
      connected: true,
      sessionToken: randomBytes(32).toString('hex'),
      spawnSeed,
      id: randomBytes(12).toString('hex'),
      slot,
      callSign: name || 'Falcon ' + ['One', 'Two', 'Three', 'Four', 'Five'][slot],
      state: spawnAircraft(aircraftId, slot, spawnSeed, { armed: true }),
      combat: createPlayerCombat(),
      queue: [],
      received: 0,
      ack: 0,
    };
    const leader = [...room.players.values()].find((p) => !p.state.crashed && !p.state.dying);
    if (leader) {
      const offset = slot - leader.slot;
      player.state.position = leader.state.position
        .clone()
        .add(
          leader.state.orientation.rotate(
            new Vec3(40 * offset, 20 * Math.abs(offset), 220 * offset),
          ),
        );
      player.state.velocity = leader.state.velocity.clone();
      player.state.orientation = leader.state.orientation.clone();
    }
    player.state.team = room.scenario === 'arena' ? player.id : 'ally';
    room.orphanedAt = null;
    room.players.set(player.id, player);
    joinRoomLobby(room, player);
    return player;
  }
  resume(room, token) {
    if (!room || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    if (room.orphanedAt != null && this.now() - room.orphanedAt >= this.orphanTimeout) {
      this.rooms.delete(room.code);
      return null;
    }
    const secret = Buffer.from(token, 'hex');
    const p = [...room.players.values()].find((p) =>
      timingSafeEqual(Buffer.from(p.sessionToken, 'hex'), secret),
    );
    if (!p) return null;
    p.connected = true;
    if (p.actor) {
      p.actor.takeoverSeeded = false;
      delete p.actor.service;
      delete p.actor.retreat;
      delete p.actor.evasion;
      delete p.actor.exited;
      delete p.actor.retired;
    }
    p.queue.length = 0;
    p.ack = p.received = 0;
    room.orphanedAt = null;
    room.lobby && (room.lobby.hostId ||= p.id);
    if (room.combat.ai) room.combat.ai.units = room.combat.ai.units.filter((t) => t.id !== p.id);
    playerEntity(p);
    return p;
  }
  preflight(room, player, message) {
    return updateRoomLobby(room, player, message);
  }
  inputs(player, commands, round = player.round) {
    if (round !== player.round) return false;
    if (!player.connected) return false;
    if (player.queue.length + commands.length > INPUT_QUEUE_LIMIT) return false;
    let next = player.received + 1;
    if (!commands.every((c) => validCommand(c) && c.seq === next++)) return false;
    player.queue.push(...commands);
    player.received = next - 1;
    return true;
  }
  step() {
    for (const room of this.rooms.values()) {
      if (room.orphanedAt != null && this.now() - room.orphanedAt >= this.orphanTimeout) {
        this.rooms.delete(room.code);
        continue;
      }
      withTerrainSnapshot(room.world, () => {
        const commands = new Map(),
          simulating = roomSimulating(room);
        if (room.mission && simulating) room.mission.elapsedTicks++;
        for (const player of room.players.values()) {
          const command = player.queue.shift();
          commands.set(player.id, command);
          if (simulating) {
            if (player.connected) applyFlightCommand(player.state, command, NETWORK_STEP);
            else stepTakenOverAircraft(room, player, NETWORK_STEP);
          }
          if (command) player.ack = command.seq;
        }
        if (simulating) stepRoomCombat(room, commands, NETWORK_STEP);
        else if (['success', 'failed'].includes(room.mission?.phase))
          stepRoomAftermath(room, NETWORK_STEP);
        updateRoomMission(room);
      });
      room.tick++;
    }
  }
  snapshot(room, afterEventId = null) {
    return this.#snapshot(room, afterEventId);
  }
  serialize(room, afterEventId = null, { includeWorld = true, compactProjectiles = false } = {}) {
    // Serialize synchronously: borrowed nested state never escapes as objects.
    return JSON.stringify(
      this.#snapshot(room, afterEventId, { copy: false, includeWorld, compactProjectiles }),
    );
  }
  packet(room, afterEventId = 0, { includeWorld = true } = {}) {
    return encodeSnapshot(
      this.#snapshot(room, afterEventId, { copy: false, includeWorld, compactProjectiles: true }),
    );
  }
  #snapshot(
    room,
    afterEventId,
    { copy = true, includeWorld = true, compactProjectiles = false } = {},
  ) {
    return {
      type: 'snapshot',
      round: room.round,
      ...(includeWorld ? { world: copy ? structuredClone(room.world) : room.world } : {}),
      scenario: room.scenario,
      mission: roomMissionSnapshot(room),
      lobby: roomLobbySnapshot(room, { copy }),
      tick: room.tick,
      time: room.tick * NETWORK_STEP,
      combat: roomCombatSnapshot(room, afterEventId, { copy, compactProjectiles }),
      players: [...room.players.values()].map((p) => ({
        connected: p.connected,
        id: p.id,
        callSign: p.callSign,
        ack: p.ack,
        state: packFlight(p.state, { copy }),
        combat: playerCombatSnapshot(p),
      })),
    };
  }
  leave(room, player) {
    if (!room.players.has(player.id)) return;
    if (!room.mission || room.mission.phase !== 'waiting') {
      player.connected = false;
      if (player.actor) player.actor.takeoverSeeded = false;
      player.queue.length = 0;
      player.combat.aim = new Targeting();
      playerEntity(player);
      leaveRoomLobby(room);
      if (![...room.players.values()].some((p) => p.connected)) room.orphanedAt = this.now();
      return;
    }
    room.players.delete(player.id);
    leaveRoomLobby(room);
    updateRoomMission(room);
    if (!room.players.size) this.rooms.delete(room.code);
    else if (![...room.players.values()].some((p) => p.connected)) room.orphanedAt = this.now();
  }
}
