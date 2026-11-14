import { WebSocket } from 'ws';
// Test-only ordered delivery on top of real loopback WebSockets. No remote
// destination, proxy, interface binding or browser setting is involved.
export class LocalNetworkLink {
  constructor(url, origin, { latency = 0, jitter = 0, holdDown = () => 0, holdUp = () => 0 } = {}) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
      throw new Error('Loopback only');
    this.raw = new WebSocket(url, { origin });
    this.profile = { latency, jitter, holdDown, holdUp };
    this.timers = new Set();
    this.deliverAt = { up: 0, down: 0 };
    this.queues = { up: [], down: [] };
    this.pendingUp = 0;
    this.sequence = 0;
    this.sentBytes = 0;
    this.receivedBytes = 0;
    this.raw.addEventListener('close', () => {
      for (const timer of this.timers) clearTimeout(timer);
      this.timers.clear();
      this.pendingUp = 0;
      this.queues.up.length = this.queues.down.length = 0;
    });
  }
  set binaryType(value) {
    this.raw.binaryType = value;
  }
  get binaryType() {
    return this.raw.binaryType;
  }
  get readyState() {
    return this.raw.readyState;
  }
  get bufferedAmount() {
    return this.raw.bufferedAmount + this.pendingUp;
  }
  later(direction, apply) {
    const now = performance.now(),
      p = this.profile;
    const variance = p.jitter ? (((++this.sequence * 37) % 101) / 100 - 0.5) * 2 * p.jitter : 0;
    const at = Math.max(
      this.deliverAt[direction],
      now + Math.max(0, p.latency + variance),
      direction === 'up' ? p.holdUp() : p.holdDown(),
    );
    this.deliverAt[direction] = at;
    const queue = this.queues[direction];
    queue.push({ at, apply });
    if (queue.length === 1) this.scheduleDelivery(direction);
  }
  scheduleDelivery(direction) {
    const queue = this.queues[direction];
    const timer = setTimeout(
      () => {
        this.timers.delete(timer);
        // Independent timers with the same deadline can fire out of order.
        // WebSockets are ordered, so the simulator must drain one FIFO instead.
        while (queue.length && queue[0].at <= performance.now()) {
          const { apply } = queue.shift();
          if (this.readyState === WebSocket.OPEN) apply();
        }
        if (queue.length) this.scheduleDelivery(direction);
      },
      Math.max(0, queue[0].at - performance.now()),
    );
    this.timers.add(timer);
  }
  addEventListener(type, handler) {
    if (type !== 'message') {
      this.raw.addEventListener(type, handler);
      return;
    }
    this.raw.addEventListener('message', (event) => {
      this.receivedBytes += Buffer.byteLength(event.data);
      this.later('down', () => handler(event));
    });
  }
  send(data) {
    const bytes = Buffer.byteLength(data);
    this.pendingUp += bytes;
    this.later('up', () => {
      this.pendingUp -= bytes;
      this.sentBytes += bytes;
      this.raw.send(data);
    });
  }
  close() {
    this.raw.close();
  }
  terminate() {
    this.raw.terminate();
  }
}
export function memorySession() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
