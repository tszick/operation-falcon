import { MultiplayerPump } from './multiplayer-pump.mjs';
import { MultiplayerPerformance } from './multiplayer-performance.mjs';
import { WebSocketServer, WebSocket } from 'ws';
import { MultiplayerRooms } from './multiplayer-rooms.mjs';
import { SNAPSHOT_ENCODING } from '../src/multiplayer/snapshotWire.js';
import { compressSnapshot } from './snapshot-transport.mjs';
import { unpackControlBatch } from '../src/multiplayer/controlWire.js';
import { sameOriginRequest, parsePublicOrigin } from './request-policy.mjs';
import {
  PROTOCOL_VERSION,
  SNAPSHOT_BYTES_LIMIT,
  MULTIPLAYER_PATH,
  INPUT_BATCH_LIMIT,
  aircraftChoices,
  roomScenarios,
  validRoomCode,
  normalizePlayerName,
} from '../src/multiplayer/protocol.js';
export function attachMultiplayer(
  server,
  {
    allowedHosts = [],
    publicOrigin = null,
    maxConnections = 80,
    rooms = new MultiplayerRooms(),
    onPerformance,
  } = {},
) {
  const expectedOrigin = parsePublicOrigin(publicOrigin ?? undefined);
  const metrics = onPerformance
    ? new MultiplayerPerformance(onPerformance, { observeGC: true })
    : null;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  let closed = false;
  let timer = null,
    continuation = null;
  function send(ws, message) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > SNAPSHOT_BYTES_LIMIT) {
      ws.terminate();
      return;
    }
    ws.send(
      typeof message === 'string' || message instanceof Uint8Array
        ? message
        : JSON.stringify(message),
    );
  }
  function hasRecipient(room) {
    for (const ws of wss.clients)
      if (ws.session?.room === room && ws.readyState === WebSocket.OPEN) return true;
    return false;
  }
  function broadcastRoom(room, afterEventId = null) {
    let json,
      wire,
      compressed,
      bytes = 0,
      recipients = 0;
    const start = metrics && performance.now();
    for (const ws of wss.clients) {
      if (ws.session?.room !== room || ws.readyState !== WebSocket.OPEN) continue;
      let packet =
        ws.snapshotEncoding === SNAPSHOT_ENCODING
          ? (wire ??= rooms.wireSnapshot(room, afterEventId, { reset: !!room.wireReset }))
          : (json ??= rooms.serialize(room, afterEventId));
      if (ws.snapshotCompression && packet === wire) packet = compressed ??= compressSnapshot(wire);
      send(ws, packet);
      bytes += typeof packet === 'string' ? Buffer.byteLength(packet) : packet.byteLength;
      recipients++;
    }
    if (wire) room.wireReset = false;
    if (metrics && recipients)
      metrics.snapshot(performance.now() - start, bytes / recipients, recipients);
  }
  const pump = new MultiplayerPump({
    step: () => {
      const start = metrics && performance.now();
      rooms.step();
      if (metrics) metrics.step(performance.now() - start);
    },
    broadcast: () => {
      for (const room of rooms.rooms.values()) {
        if (!hasRecipient(room)) continue;
        broadcastRoom(room, room.broadcastEventId || 0);
        room.broadcastEventId = room.combat.eventSequence;
      }
    },
  });
  function stopIdleTimer() {
    if (!wss.clients.size && !rooms.rooms.size && timer) {
      clearInterval(timer);
      timer = null;
      clearImmediate(continuation);
      continuation = null;
    }
  }
  function tick() {
    if (closed || !timer) return;
    clearImmediate(continuation);
    continuation = null;
    const now = performance.now(),
      sample = pump.advance();
    stopIdleTimer();
    for (const ws of wss.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (now - ws.lastPong > 30000 || (!ws.session && now - ws.connectedAt > 10000))
        ws.terminate();
      else if (now - ws.lastPing > 10000) {
        ws.lastPing = now;
        ws.ping();
      }
    }
    if (metrics)
      metrics.loop(performance.now(), sample.elapsedMs, performance.now() - now, sample.droppedMs, {
        rooms: rooms.rooms.size,
        connections: wss.clients.size,
      });
    if (sample.backlog && timer) continuation = setImmediate(tick);
  }
  function startTimer() {
    if (timer) return;
    pump.reset();
    timer = setInterval(tick, 8);
    timer.unref();
  }
  function upgrade(req, socket, head) {
    if (
      req.url !== MULTIPLAYER_PATH ||
      !sameOriginRequest(req, allowedHosts, expectedOrigin) ||
      wss.clients.size >= maxConnections
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  }
  server.on('upgrade', upgrade);
  wss.on('connection', (ws) => {
    const now = performance.now();
    Object.assign(ws, {
      connectedAt: now,
      lastPong: now,
      lastPing: now,
      budget: 100,
      budgetAt: now,
    });
    ws.on('error', () => ws.terminate());
    ws.on('pong', () => {
      ws.lastPong = performance.now();
    });
    ws.on('message', (buffer, binary) => {
      const now = performance.now();
      ws.budget = Math.min(100, ws.budget + (now - ws.budgetAt) * 0.06);
      ws.budgetAt = now;
      if (binary || --ws.budget < 0) {
        ws.close(1008, 'Invalid traffic');
        return;
      }
      let msg;
      try {
        msg = JSON.parse(buffer.toString());
      } catch {
        ws.close(1008, 'Invalid JSON');
        return;
      }
      if (!msg || typeof msg !== 'object') {
        ws.close(1008, 'Invalid message');
        return;
      }
      if (msg.type === 'input' && msg.packed !== undefined) {
        try {
          if (msg.commands !== undefined) throw new Error('Ambiguous controls');
          msg.commands = unpackControlBatch(msg.packed);
        } catch {
          ws.close(1008, 'Invalid controls');
          return;
        }
      }
      if (msg.type === 'hello' && !ws.session) {
        if (
          msg.version !== PROTOCOL_VERSION ||
          !aircraftChoices.includes(msg.aircraftId) ||
          (msg.scenario !== undefined && !roomScenarios.includes(msg.scenario)) ||
          !['create', 'join'].includes(msg.mode) ||
          (msg.mode === 'join' && !validRoomCode(msg.code)) ||
          (msg.mode === 'create' && msg.resumeToken !== undefined)
        ) {
          ws.close(1008, 'Invalid handshake');
          return;
        }
        const playerName = normalizePlayerName(msg.playerName);
        if (playerName === null) {
          send(ws, { type: 'error', code: 'player-name-invalid' });
          return;
        }
        const room =
          msg.mode === 'create' ? rooms.create(msg.scenario || 'range') : rooms.rooms.get(msg.code);
        if (!room) {
          send(ws, { type: 'error', code: msg.mode === 'create' ? 'server-full' : 'room-missing' });
          return;
        }
        const player =
          msg.resumeToken !== undefined
            ? rooms.resume(room, msg.resumeToken)
            : rooms.join(room, msg.aircraftId, playerName);
        if (!player) {
          send(ws, {
            type: 'error',
            code:
              msg.resumeToken !== undefined
                ? 'session-invalid'
                : room.mission && room.mission.phase !== 'waiting'
                  ? 'room-started'
                  : 'room-full',
          });
          return;
        }
        // A valid private session replaces a stale socket atomically. Its close
        // handler must never detach the new owner of the same aircraft.
        for (const peer of wss.clients) {
          if (peer !== ws && peer.session?.player === player) {
            peer.session = null;
            peer.close(1000, 'Session resumed');
          }
        }
        ws.session = { room, player };
        ws.snapshotEncoding = msg.snapshotEncoding === SNAPSHOT_ENCODING ? SNAPSHOT_ENCODING : null;
        ws.snapshotCompression = msg.snapshotCompression === 'deflate-raw';
        room.wireReset = true;
        send(ws, {
          sessionToken: player.sessionToken,
          resumed: msg.resumeToken !== undefined,
          version: PROTOCOL_VERSION,
          id: player.id,
          code: room.code,
          world: room.world,
          ...rooms.snapshot(room),
          type: 'welcome',
        });
      } else if (
        ['ready', 'configure', 'mission', 'start', 'rematch'].includes(msg.type) &&
        ws.session
      ) {
        const error = rooms.preflight(ws.session.room, ws.session.player, msg);
        if (error) send(ws, { type: 'error', code: error });
        else {
          broadcastRoom(ws.session.room);
        }
      } else if (
        msg.type === 'input' &&
        ws.session &&
        Array.isArray(msg.commands) &&
        msg.commands.length > 0 &&
        msg.commands.length <= INPUT_BATCH_LIMIT
      ) {
        if (
          !Number.isSafeInteger(msg.round) ||
          msg.round < 1 ||
          msg.round > ws.session.room.round
        ) {
          ws.close(1008, 'Invalid round');
          return;
        }
        if (msg.round < ws.session.room.round) return;
        if (!rooms.inputs(ws.session.player, msg.commands, msg.round))
          ws.close(1008, 'Invalid controls');
      } else if (msg.type === 'ping' && Number.isFinite(msg.sent))
        send(ws, { type: 'pong', sent: msg.sent });
      else ws.close(1008, 'Unexpected message');
    });
    ws.on('close', () => {
      if (ws.session) rooms.leave(ws.session.room, ws.session.player);
      stopIdleTimer();
    });
    startTimer();
  });
  function close() {
    if (closed) return;
    closed = true;
    metrics?.close();
    if (timer) clearInterval(timer);
    clearImmediate(continuation);
    continuation = null;
    timer = null;
    server.off('upgrade', upgrade);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  }
  server.once('close', close);
  return { rooms, close };
}
