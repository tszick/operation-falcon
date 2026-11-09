import { decodeWorld } from './worldState.js';
import {
  PROTOCOL_VERSION,
  MULTIPLAYER_PATH,
  INPUT_BATCH_LIMIT,
  INPUT_QUEUE_LIMIT,
  SNAPSHOT_BYTES_LIMIT,
} from './protocol.js';
import { NetworkCombatView } from './combatView.js';
import { FlightPrediction, SnapshotBuffer } from './prediction.js';
import { SnapshotInbox } from './snapshotInbox.js';
import { configureTerrain } from '../terrain.js';
export class MultiplayerClient {
  constructor({
    onWelcome = () => {},
    onStatus = () => {},
    onClose = () => {},
    onSnapshot = () => {},
    onReconcile = () => {},
    onRound = () => {},
    onReconnecting = () => {},
    reconnectDelays = [],
    now = () => performance.now(),
    baseUrl = globalThis.location?.href,
    socketFactory = (url) => new WebSocket(url),
    getStorage = () => globalThis.sessionStorage,
    scheduleSnapshot,
    onTiming = null,
    connectionTimeoutMs = 10000,
  }) {
    Object.assign(this, { onWelcome, onStatus, onClose, onSnapshot, onReconcile, onRound, now });
    this.onReconnecting = onReconnecting;
    this.reconnectDelays = reconnectDelays;
    this.reconnectAttempt = 0;
    this.connectionTimeoutMs = connectionTimeoutMs;
    this.baseUrl = baseUrl;
    this.socketFactory = socketFactory;
    this.getStorage = getStorage;
    this.onTiming = onTiming;
    this.inbox = new SnapshotInbox(
      (data, receivedAt) => this.acceptSnapshot(data, true, receivedAt),
      scheduleSnapshot,
    );
    this.metrics = {
      receivedCharacters: 0,
      appliedSnapshots: 0,
      maxReconcileMs: 0,
      maxCorrectionM: 0,
      maxDecodeMs: 0,
      maxSnapshotApplyMs: 0,
      maxHistoryMs: 0,
      maxCombatApplyMs: 0,
    };
    this.prediction = new FlightPrediction();
    this.combat = new NetworkCombatView();
    this.history = new SnapshotBuffer({ maxFrames: 8 });
    this.socket = null;
    this.latest = null;
    this.receivedAt = 0;
    this.rtt = null;
  }
  stopConnectionTimers() {
    clearTimeout(this.connectionTimer);
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    clearInterval(this.flushTimer);
    clearInterval(this.pingTimer);
  }
  connect(
    { mode, code, aircraftId, scenario = 'range', resumeToken: recoveryToken },
    { recovering = false } = {},
  ) {
    this.stopConnectionTimers();
    this.manualClose = false;
    if (!recovering) {
      this.session = null;
      this.recovering = false;
      this.reconnectAttempt = 0;
    }
    const previous = this.socket;
    this.socket = null;
    previous?.close();
    this.inbox.clear();
    this.prediction = new FlightPrediction();
    this.history = new SnapshotBuffer({ maxFrames: 8 });
    this.combat = new NetworkCombatView();
    this.id = this.code = this.round = this.latest = this.handshake = null;
    this.worldRevision = null;
    this.receivedAt = this.transportReceivedAt = 0;
    this.rtt = null;
    const url = new URL(MULTIPLAYER_PATH, this.baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = (this.socket = this.socketFactory(url));
    this.connectionTimer = setTimeout(() => {
      if (this.socket !== ws || this.id) return;
      if (!this.recovering) this.onStatus('connection-timeout');
      ws.close();
    }, this.connectionTimeoutMs);
    ws.addEventListener('open', () => {
      if (this.socket !== ws) return;
      let resumeToken = recoveryToken;
      try {
        if (mode === 'join' && !resumeToken)
          resumeToken = this.getStorage().getItem('falcon-session:' + code) || undefined;
      } catch {
        /* Storage may be disabled. */
      }
      this.handshake = {
        type: 'hello',
        version: PROTOCOL_VERSION,
        mode,
        code,
        aircraftId,
        scenario,
        ...(resumeToken ? { resumeToken } : {}),
      };
      this.send(this.handshake);
      this.flushTimer = setInterval(() => this.flush(), 50);
      this.pingTimer = setInterval(() => this.send({ type: 'ping', sent: this.now() }), 2000);
    });
    ws.addEventListener('message', (event) => {
      if (this.socket !== ws) return;
      if (typeof event.data !== 'string' || event.data.length > SNAPSHOT_BYTES_LIMIT) {
        ws.close();
        return;
      }
      this.metrics.receivedCharacters += event.data.length;
      let msg;
      const decodeStart = this.now();
      try {
        msg = JSON.parse(event.data);
        if (msg?.world) msg.world = decodeWorld(msg.world);
      } catch {
        ws.close();
        return;
      }
      const decodeMs = this.now() - decodeStart;
      this.metrics.maxDecodeMs = Math.max(this.metrics.maxDecodeMs, decodeMs);
      this.onTiming?.('decode', decodeStart, decodeMs);
      if (!msg || typeof msg !== 'object') {
        ws.close();
        return;
      }
      const receivedAt = this.now();
      if (this.id && msg.type === 'snapshot') {
        this.transportReceivedAt = receivedAt;
        this.inbox.offer(msg, receivedAt);
      } else this.receive(msg, receivedAt);
    });
    ws.addEventListener('close', (event) => {
      if (this.socket !== ws) return;
      this.inbox.clear();
      this.stopConnectionTimers();
      if (![1000, 1008].includes(event.code) && this.recover()) return;
      this.recovering = false;
      this.onClose();
    });
    ws.addEventListener('error', () => {
      if (this.socket === ws && !this.recovering) this.onStatus('connection-error');
    });
  }
  recover() {
    if (this.manualClose || !this.session || this.reconnectAttempt >= this.reconnectDelays.length)
      return false;
    const delay = this.reconnectDelays[this.reconnectAttempt++];
    this.recovering = true;
    this.onReconnecting({
      attempt: this.reconnectAttempt,
      total: this.reconnectDelays.length,
      delay,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      try {
        this.connect(
          {
            mode: 'join',
            code: this.session.code,
            aircraftId: this.session.aircraftId,
            resumeToken: this.session.token,
          },
          { recovering: true },
        );
      } catch {
        if (!this.recover()) {
          this.recovering = false;
          this.onClose();
        }
      }
    }, delay);
    return true;
  }
  receive(msg, receivedAt = this.now()) {
    if (msg.type === 'welcome') {
      if (msg.version !== PROTOCOL_VERSION) {
        this.socket.close();
        return;
      }
      clearTimeout(this.connectionTimer);
      this.recovering = false;
      this.reconnectAttempt = 0;
      this.session = {
        code: msg.code,
        token: msg.sessionToken,
        aircraftId: this.handshake?.aircraftId,
      };
      this.id = msg.id;
      this.code = msg.code;
      try {
        this.getStorage().setItem('falcon-session:' + msg.code, msg.sessionToken);
        this.getStorage().setItem('falcon-last-room', msg.code);
      } catch {
        /* Flight does not require browser storage. */
      }
      configureTerrain({ battlefield: { environment: decodeWorld(msg.world) } });
      const own = msg.players.find((p) => p.id === this.id);
      this.prediction.reset(own);
      this.acceptSnapshot(msg, false, receivedAt);
      this.onWelcome(msg);
    } else if (msg.type === 'snapshot' && this.id) this.acceptSnapshot(msg, true, receivedAt);
    else if (msg.type === 'error') {
      if (this.recovering) {
        this.manualClose = true;
        this.recovering = false;
        this.onStatus(msg.code);
        this.socket.close();
        return;
      }
      if (msg.code === 'session-invalid' && this.handshake?.resumeToken) {
        // A new round frees absent seats. A fresh join is only permitted by the
        // server while waiting, so this cannot respawn anyone during combat.
        const fresh = { ...this.handshake };
        delete fresh.resumeToken;
        this.handshake = fresh;
        try {
          this.getStorage().removeItem('falcon-session:' + fresh.code);
        } catch {
          /* Storage is optional. */
        }
        this.send(fresh);
      } else this.onStatus(msg.code);
    } else if (msg.type === 'pong') this.rtt = Math.max(0, this.now() - msg.sent);
  }
  acceptSnapshot(msg, reconcile, receivedAt = this.now()) {
    const started = this.now();
    const round = msg.round || 1;
    if (this.round && round < this.round) return;
    const changedRound = this.round && round !== this.round;
    if (changedRound) {
      const own = msg.players.find((p) => p.id === this.id);
      if (!own) return;
      this.prediction.reset(own);
      this.history = new SnapshotBuffer({ maxFrames: 8 });
      this.combat = new NetworkCombatView();
      reconcile = false;
    }
    this.round = round;
    const historyStarted = this.now();
    if (!this.history.add(msg, this.id)) return;
    this.metrics.maxHistoryMs = Math.max(this.metrics.maxHistoryMs, this.now() - historyStarted);
    const own = msg.players.find((p) => p.id === this.id);
    if (!own) return;
    if (msg.world && this.worldRevision !== msg.world.revision) {
      configureTerrain({ battlefield: { environment: decodeWorld(msg.world) } });
      this.worldRevision = msg.world.revision;
    }
    this.prediction.simulating = !msg.mission || msg.mission.phase === 'active';
    if (reconcile) {
      const before = this.prediction.state,
        started = this.now();
      this.prediction.reconcile(own);
      this.metrics.maxReconcileMs = Math.max(this.metrics.maxReconcileMs, this.now() - started);
      this.metrics.maxCorrectionM = Math.max(
        this.metrics.maxCorrectionM,
        before.position.distance(this.prediction.state.position),
      );
      this.onReconcile(before, this.prediction.state);
    }
    const combatStarted = this.now();
    this.combat.accept(msg, !reconcile);
    this.metrics.maxCombatApplyMs = Math.max(
      this.metrics.maxCombatApplyMs,
      this.now() - combatStarted,
    );
    this.latest = msg;
    this.receivedAt = receivedAt;
    this.transportReceivedAt = receivedAt;
    this.metrics.appliedSnapshots++;
    if (changedRound) this.onRound(msg);
    this.onSnapshot(msg);
    const applyMs = this.now() - started;
    this.metrics.maxSnapshotApplyMs = Math.max(this.metrics.maxSnapshotApplyMs, applyMs);
    this.onTiming?.('apply', started, applyMs);
  }
  get stale() {
    return !this.latest || this.now() - this.transportReceivedAt > 750;
  }
  send(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > 16 * 1024) {
      this.socket.close();
      return;
    }
    this.socket.send(JSON.stringify(message));
  }
  flush() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    while (this.prediction.outgoing.length) {
      // Count all unacknowledged controls, including packets still in transit.
      // A stalled connection must not release more than the server can queue.
      const available =
        this.prediction.acknowledged + INPUT_QUEUE_LIMIT - this.prediction.outgoing[0].seq + 1;
      if (available <= 0 || this.socket.bufferedAmount > 8 * 1024) break;
      this.send({
        type: 'input',
        round: this.round,
        commands: this.prediction.outgoing.splice(0, Math.min(INPUT_BATCH_LIMIT, available)),
      });
    }
  }
  disconnect() {
    const waiting = this.reconnectTimer != null;
    this.manualClose = true;
    this.recovering = false;
    this.stopConnectionTimers();
    if (this.latest?.mission?.phase === 'waiting') {
      try {
        this.getStorage().removeItem('falcon-session:' + this.code);
      } catch {
        /* Storage is optional. */
      }
    }
    this.socket?.close();
    if (waiting) this.onClose();
  }
}
