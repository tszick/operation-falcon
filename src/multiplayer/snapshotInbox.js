import { EVENT_LIMIT } from './protocol.js';
// Replace obsolete flight snapshots before painting, but preserve their one-shot
// combat events: reliable transport may release several packets in one burst.
export class SnapshotInbox {
  constructor(
    apply,
    schedule = (callback) =>
      globalThis.requestAnimationFrame ? requestAnimationFrame(callback) : setTimeout(callback, 16),
  ) {
    this.apply = apply;
    this.schedule = schedule;
    this.pending = null;
    this.events = new Map();
    this.scheduled = false;
    this.received = 0;
    this.coalesced = 0;
  }
  offer(snapshot, receivedAt) {
    if ((snapshot.round || 1) < (this.round || 1)) return;
    this.round = snapshot.round || 1;
    this.received++;
    if (this.pending && (snapshot.round || 1) !== (this.pending.snapshot.round || 1))
      this.events.clear();
    if (this.pending) this.coalesced++;
    for (const event of snapshot.combat?.events || []) this.events.set(event.id, event);
    while (this.events.size > EVENT_LIMIT) this.events.delete(this.events.keys().next().value);
    this.pending = { snapshot, receivedAt };
    if (this.scheduled) return;
    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      const pending = this.pending;
      this.pending = null;
      const events = [...this.events.values()];
      this.events.clear();
      if (!pending) return;
      const snapshot = pending.snapshot.combat
        ? { ...pending.snapshot, combat: { ...pending.snapshot.combat, events } }
        : pending.snapshot;
      this.apply(snapshot, pending.receivedAt);
    });
  }
  clear() {
    this.pending = null;
    this.events.clear();
    this.round = null;
  }
}
