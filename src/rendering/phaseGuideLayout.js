// Fit guide rows after the browser has laid out the other HUD writes. Keep the
// previous retained panel until this single-frame, coalesced update commits.
export class PhaseGuideLayout {
  constructor({
    schedule = (callback) => requestAnimationFrame(callback),
    now = () => performance.now(),
  } = {}) {
    this.schedule = schedule;
    this.now = now;
    this.states = new WeakMap();
  }
  update(list, key, html, profile) {
    let state = this.states.get(list);
    if (!state) {
      state = {};
      this.states.set(list, state);
    }
    if (state.key === key && (state.pending || state.fitted)) return false;
    Object.assign(state, { key, html, profile, fitted: false });
    if (state.pending) return true;
    state.pending = true;
    list.dataset.layoutPending = 'true';
    this.schedule(() => this.commit(list, state));
    return true;
  }
  commit(list, state) {
    state.pending = false;
    const start = state.profile ? this.now() : 0;
    let measuredAt = start;
    const mark = state.profile
      ? (name) => {
          const now = this.now();
          state.profile('guide-async-' + name, now - measuredAt);
          measuredAt = now;
        }
      : null;
    try {
      const height = list.clientHeight;
      mark?.('height');
      if (height <= 0) return;
      list.innerHTML = state.html;
      const lines = height >= 24 ? '2' : '1';
      if ((list.style.getPropertyValue('--guide-lines') || '2') !== lines)
        list.style.setProperty('--guide-lines', lines);
      mark?.('dom');
      const rows = [...list.children],
        bottoms = rows.map((row) => row.offsetTop + row.offsetHeight);
      mark?.('measure-rows');
      let full = false;
      for (let i = 0; i < rows.length; i++) {
        full ||= bottoms[i] > height;
        rows[i].hidden = full;
      }
      state.fitted = true;
    } finally {
      delete list.dataset.layoutPending;
      state.profile?.('guide-async-total', this.now() - start);
    }
  }
}
