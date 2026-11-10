import { clamp } from '../math.js';
const overlaps = (a, b, margin = 0) =>
  !(
    a.right + margin < b.left ||
    a.left - margin > b.right ||
    a.bottom + margin < b.top ||
    a.top - margin > b.bottom
  );
// Retain only the text's collision offset. Never smooth the world-space marker
// or its anchor: fast aircraft/head motion must remain accurately registered.
export class MarkerLabelLayout {
  states = new Map();
  beginFrame(now) {
    if (now - (this.lastCleanup || 0) > 1000 || this.states.size > 512) {
      for (const [id, state] of this.states) if (now - state.seen > 1000) this.states.delete(id);
      this.lastCleanup = now;
    }
  }
  place(id, x, y, width, top, bottom, used, now) {
    let state = this.states.get(id);
    const fresh = !state || now - state.seen > 1000;
    if (fresh) state = { slot: 0, offset: 0, seen: now, clearSince: null };
    const half = width / 2,
      rectAt = (offset) => ({
        left: x - half,
        right: x + half,
        top: clamp(y - offset, top, bottom) - 12,
        bottom: clamp(y - offset, top, bottom) + 4,
      }),
      free = (slot, margin = 0) => used.every((r) => !overlaps(rectAt(slot * 16), r, margin));
    if (!free(state.slot)) {
      for (let slot = 0; slot < 40; slot++)
        if (free(slot)) {
          state.slot = slot;
          break;
        }
      state.clearSince = null;
    } else if (state.slot > 0) {
      // A margin and a short clear period prevent threshold flicker when labels
      // approach each other or their distance text changes by a character.
      if (free(0, 6)) {
        state.clearSince ??= now;
        if (now - state.clearSince >= 350) {
          state.slot = 0;
          state.clearSince = null;
        }
      } else state.clearSince = null;
    }
    const dt = clamp((now - state.seen) / 1000, 0, 0.1),
      target = state.slot * 16;
    state.offset = fresh
      ? target
      : state.offset +
        clamp((target - state.offset) * (1 - Math.exp(-dt / 0.12)), -160 * dt, 160 * dt);
    state.seen = now;
    this.states.set(id, state);
    const rect = rectAt(state.offset);
    used.push(rect);
    return rect.top + 12;
  }
}
