import { NETWORK_STEP, SNAPSHOT_INTERVAL } from '../src/multiplayer/protocol.js';
// Physics stays fixed-step. Catch-up yields between bounded chunks; only the
// newest state is encoded once the backlog has drained.
export class MultiplayerPump {
  constructor({ step, broadcast, now = () => performance.now(), budgetMs = 4, maxSteps = 4 }) {
    Object.assign(this, { step, broadcast, now, budgetMs, maxSteps });
    this.stats = {};
    this.reset();
  }
  reset() {
    this.last = this.now();
    this.accumulator = 0;
    this.frame = 0;
    this.broadcastDue = false;
  }
  advance() {
    const start = this.now(),
      elapsedMs = start - this.last;
    const available = this.accumulator + elapsedMs / 1000;
    const droppedMs = Math.max(0, available - NETWORK_STEP * 12) * 1000;
    this.accumulator = Math.min(available, NETWORK_STEP * 12);
    this.last = start;
    let steps = 0;
    while (
      this.accumulator >= NETWORK_STEP &&
      steps < this.maxSteps &&
      (!steps || this.now() - start < this.budgetMs)
    ) {
      this.step();
      steps++;
      this.frame++;
      this.accumulator -= NETWORK_STEP;
      if (this.frame % SNAPSHOT_INTERVAL === 0) this.broadcastDue = true;
    }
    const backlog = this.accumulator >= NETWORK_STEP;
    if (!backlog && this.broadcastDue) {
      this.broadcastDue = false;
      this.broadcast();
    }
    return Object.assign(this.stats, { backlog, elapsedMs, droppedMs, steps });
  }
}
