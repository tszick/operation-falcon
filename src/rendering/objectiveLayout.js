// Read layout only when objective content or available panel space changes.
// ResizeObserver catches parent/font-driven resizing without forcing layout on
// every HUD update. Older browsers retain the synchronous measurement fallback.
export class ObjectiveLayout {
  constructor(Observer = globalThis.ResizeObserver) {
    this.states = new WeakMap();
    this.observer = Observer
      ? new Observer((entries) => {
          for (const entry of entries) {
            const state = this.states.get(entry.target);
            if (!state) continue;
            const { width, height } = entry.contentRect;
            if (state.width !== width || state.height !== height) state.dirty = true;
            state.width = width;
            state.height = height;
          }
        })
      : null;
  }
  fit(card, list, key) {
    let state = this.states.get(list);
    if (!state) {
      state = { dirty: true };
      this.states.set(list, state);
      this.observer?.observe(list);
    }
    if (!this.observer) key += ':' + list.clientWidth + ':' + list.clientHeight;
    if (state.key === key && !state.dirty) return false;
    state.key = key;
    state.dirty = false;
    card.classList.remove('dense-objectives');
    if (list.scrollHeight > list.clientHeight + 1) card.classList.add('dense-objectives');
    return true;
  }
}
