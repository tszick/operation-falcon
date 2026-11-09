import test from 'node:test';
import assert from 'node:assert/strict';
import { PhaseGuideLayout } from '../src/rendering/phaseGuideLayout.js';
function fixture(height = 45) {
  const tasks = [],
    events = [],
    styles = new Map();
  let size = height,
    content = 'old';
  const rows = [0, 13, 26, 39].map((top) => ({
    get offsetTop() {
      events.push('read');
      return top;
    },
    get offsetHeight() {
      events.push('read');
      return 13;
    },
    set hidden(v) {
      events.push('write');
      this.value = v;
    },
  }));
  const list = {
    dataset: {},
    children: rows,
    style: {
      getPropertyValue: (k) => styles.get(k) || '',
      setProperty: (k, v) => styles.set(k, v),
    },
    get clientHeight() {
      events.push('height');
      return size;
    },
    get innerHTML() {
      return content;
    },
    set innerHTML(v) {
      events.push('html');
      content = v;
    },
  };
  const fitter = new PhaseGuideLayout({ schedule: (fn) => tasks.push(fn), now: () => 0 });
  return { tasks, events, rows, list, fitter, styles, resize: (h) => (size = h) };
}
test('guide updates coalesce to the newest content, preserve old DOM until commit, and batch row reads before hiding', () => {
  const f = fixture();
  f.fitter.update(f.list, 'a', 'first');
  assert.equal(f.list.innerHTML, 'old');
  assert.equal(f.events.length, 0);
  assert.equal(f.list.dataset.layoutPending, 'true');
  f.fitter.update(f.list, 'b', 'newest');
  assert.equal(f.tasks.length, 1);
  f.tasks.shift()();
  assert.equal(f.list.innerHTML, 'newest');
  assert.deepEqual(
    f.rows.map((r) => r.value),
    [false, false, false, true],
  );
  assert.equal(f.list.dataset.layoutPending, undefined);
  const firstWrite = f.events.indexOf('write');
  assert.equal(f.events.slice(firstWrite).includes('read'), false);
  assert.equal(f.styles.size, 0); // CSS already defaults to two lines.
  assert.equal(f.fitter.update(f.list, 'b', 'newest'), false);
});
test('hidden guide retries after reopening, and small or resized panels recompute visible rows', () => {
  const f = fixture(0);
  f.fitter.update(f.list, 'a', 'content');
  f.tasks.shift()();
  assert.equal(f.list.innerHTML, 'old');
  assert.equal(f.list.dataset.layoutPending, undefined);
  f.resize(20);
  assert.equal(f.fitter.update(f.list, 'a', 'content'), true);
  f.tasks.shift()();
  assert.equal(f.styles.get('--guide-lines'), '1');
  assert.deepEqual(
    f.rows.map((r) => r.value),
    [false, true, true, true],
  );
  f.resize(60);
  f.fitter.update(f.list, 'new-size', 'content');
  f.tasks.shift()();
  assert.equal(f.styles.get('--guide-lines'), '2');
  assert.deepEqual(
    f.rows.map((r) => r.value),
    [false, false, false, false],
  );
});
test('asynchronous guide work is timed and its pending marker is cleared even on a measurement failure', () => {
  const f = fixture(),
    timing = [];
  f.fitter.update(f.list, 'a', 'content', (name, ms) => timing.push([name, ms]));
  f.tasks.shift()();
  assert.ok(timing.some(([name]) => name === 'guide-async-total'));
  Object.defineProperty(f.list, 'clientHeight', {
    get() {
      throw new Error('layout failed');
    },
  });
  f.fitter.update(f.list, 'b', 'other');
  assert.throws(() => f.tasks.shift()(), /layout failed/);
  assert.equal(f.list.dataset.layoutPending, undefined);
});
