import { PROTOCOL_VERSION, MULTIPLAYER_PATH, INPUT_BATCH_LIMIT } from './protocol.js';
import { NetworkCombatView } from './combatView.js';
import { FlightPrediction, SnapshotBuffer } from './prediction.js';
import { configureTerrain } from '../terrain.js';
export class MultiplayerClient {
  constructor({
    onWelcome,
    onStatus,
    onClose,
    onSnapshot,
    onReconcile = () => {},
    now = () => performance.now(),
  }) {
    Object.assign(this, { onWelcome, onStatus, onClose, onSnapshot, onReconcile, now });
    this.prediction = new FlightPrediction();
    this.combat = new NetworkCombatView();
    this.history = new SnapshotBuffer();
    this.socket = null;
    this.latest = null;
    this.receivedAt = 0;
    this.rtt = null;
  }
  connect({ mode, code, aircraftId, scenario = 'range' }) {
    const url = new URL(MULTIPLAYER_PATH, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = (this.socket = new WebSocket(url));
    ws.addEventListener('open', () => {
      this.send({ type: 'hello', version: PROTOCOL_VERSION, mode, code, aircraftId, scenario });
      this.flushTimer = setInterval(() => this.flush(), 50);
      this.pingTimer = setInterval(() => this.send({ type: 'ping', sent: this.now() }), 2000);
    });
    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string' || event.data.length > 128 * 1024) {
        ws.close();
        return;
      }
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        ws.close();
        return;
      }
      if (msg.type === 'welcome') {
        if (msg.version !== PROTOCOL_VERSION) {
          ws.close();
          return;
        }
        this.id = msg.id;
        this.code = msg.code;
        configureTerrain({ battlefield: { environment: msg.world } });
        const own = msg.players.find((p) => p.id === this.id);
        this.prediction.reset(own);
        this.acceptSnapshot(msg, false);
        this.onWelcome(msg);
      } else if (msg.type === 'snapshot' && this.id) this.acceptSnapshot(msg, true);
      else if (msg.type === 'error') this.onStatus(msg.code);
      else if (msg.type === 'pong') this.rtt = Math.max(0, this.now() - msg.sent);
    });
    ws.addEventListener('close', () => {
      clearInterval(this.flushTimer);
      clearInterval(this.pingTimer);
      this.onClose();
    });
    ws.addEventListener('error', () => this.onStatus('connection-error'));
  }
  acceptSnapshot(msg, reconcile) {
    if (!this.history.add(msg)) return;
    const own = msg.players.find((p) => p.id === this.id);
    if (!own) return;
    this.prediction.simulating = !msg.mission || msg.mission.phase === 'active';
    if (reconcile) {
      const before = this.prediction.state;
      this.prediction.reconcile(own);
      this.onReconcile(before, this.prediction.state);
    }
    this.combat.accept(msg, !reconcile);
    this.latest = msg;
    this.receivedAt = this.now();
    this.onSnapshot(msg);
  }
  get stale() {
    return !this.latest || this.now() - this.receivedAt > 750;
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
    while (this.prediction.outgoing.length)
      this.send({ type: 'input', commands: this.prediction.outgoing.splice(0, INPUT_BATCH_LIMIT) });
  }
  disconnect() {
    this.socket?.close();
  }
}
