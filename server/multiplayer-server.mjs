import { WebSocketServer, WebSocket } from 'ws';
import { MultiplayerRooms } from './multiplayer-rooms.mjs';
import { sameOriginRequest } from './request-policy.mjs';
import {
  PROTOCOL_VERSION,
  MULTIPLAYER_PATH,
  SNAPSHOT_INTERVAL,
  NETWORK_STEP,
  INPUT_BATCH_LIMIT,
  aircraftChoices,
  roomScenarios,
  validRoomCode,
} from '../src/multiplayer/protocol.js';
export function attachMultiplayer(
  server,
  { allowedHosts = [], maxConnections = 32, rooms = new MultiplayerRooms() } = {},
) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  let closed = false;
  let timer = null,
    last = 0,
    accumulator = 0,
    frame = 0;
  function send(ws, message) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 128 * 1024) {
      ws.terminate();
      return;
    }
    ws.send(JSON.stringify(message));
  }
  function stopIdleTimer() {
    if (!wss.clients.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  function startTimer() {
    if (timer) return;
    last = performance.now();
    accumulator = 0;
    timer = setInterval(() => {
      const now = performance.now();
      accumulator = Math.min(accumulator + (now - last) / 1000, NETWORK_STEP * 12);
      last = now;
      while (accumulator >= NETWORK_STEP) {
        rooms.step();
        frame++;
        accumulator -= NETWORK_STEP;
        if (frame % SNAPSHOT_INTERVAL === 0) {
          for (const room of rooms.rooms.values()) {
            const snapshot = rooms.snapshot(room);
            for (const ws of wss.clients) if (ws.session?.room === room) send(ws, snapshot);
          }
        }
      }
      for (const ws of wss.clients) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        if (now - ws.lastPong > 30000 || (!ws.session && now - ws.connectedAt > 10000))
          ws.terminate();
        else if (now - ws.lastPing > 10000) {
          ws.lastPing = now;
          ws.ping();
        }
      }
    }, 8);
    timer.unref();
  }
  function upgrade(req, socket, head) {
    if (
      req.url !== MULTIPLAYER_PATH ||
      !sameOriginRequest(req, allowedHosts) ||
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
      if (msg.type === 'hello' && !ws.session) {
        if (
          msg.version !== PROTOCOL_VERSION ||
          !aircraftChoices.includes(msg.aircraftId) ||
          (msg.scenario !== undefined && !roomScenarios.includes(msg.scenario)) ||
          !['create', 'join'].includes(msg.mode) ||
          (msg.mode === 'join' && !validRoomCode(msg.code))
        ) {
          ws.close(1008, 'Invalid handshake');
          return;
        }
        const room =
          msg.mode === 'create' ? rooms.create(msg.scenario || 'range') : rooms.rooms.get(msg.code);
        if (!room) {
          send(ws, { type: 'error', code: msg.mode === 'create' ? 'server-full' : 'room-missing' });
          return;
        }
        const player = rooms.join(room, msg.aircraftId);
        if (!player) {
          send(ws, {
            type: 'error',
            code: room.mission && room.mission.phase !== 'waiting' ? 'room-started' : 'room-full',
          });
          return;
        }
        ws.session = { room, player };
        send(ws, {
          version: PROTOCOL_VERSION,
          id: player.id,
          code: room.code,
          world: room.world,
          ...rooms.snapshot(room),
          type: 'welcome',
        });
      } else if (['ready', 'configure', 'mission'].includes(msg.type) && ws.session) {
        const error = rooms.preflight(ws.session.room, ws.session.player, msg);
        if (error) send(ws, { type: 'error', code: error });
        else
          for (const peer of wss.clients)
            if (peer.session?.room === ws.session.room) send(peer, rooms.snapshot(ws.session.room));
      } else if (
        msg.type === 'input' &&
        ws.session &&
        Array.isArray(msg.commands) &&
        msg.commands.length > 0 &&
        msg.commands.length <= INPUT_BATCH_LIMIT
      ) {
        if (!rooms.inputs(ws.session.player, msg.commands)) ws.close(1008, 'Invalid controls');
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
    if (timer) clearInterval(timer);
    timer = null;
    server.off('upgrade', upgrade);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  }
  server.once('close', close);
  return { rooms, close };
}
