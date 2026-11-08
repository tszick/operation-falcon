import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectiveLayout } from '../src/rendering/objectiveLayout.js';
function fixture() {
  const sizes = { clientWidth: 200, clientHeight: 80, scrollHeight: 100 };
  let reads = 0;
  const list = {};
  for (const key of Object.keys(sizes))
    Object.defineProperty(list, key, {
      get() {
        reads++;
        return sizes[key];
      },
    });
  const classes = new Set();
  const card = { classList: { add: (x) => classes.add(x), remove: (x) => classes.delete(x) } };
  return { list, card, sizes, classes, reads: () => reads };
}
test('unchanged objectives perform no synchronous layout reads; changed content and space still refit', () => {
  let notify, observed;
  class Observer {
    constructor(callback) {
      notify = callback;
    }
    observe(target) {
      observed = target;
    }
  }
  const f = fixture(),
    layout = new ObjectiveLayout(Observer);
  assert.equal(layout.fit(f.card, f.list, 'content:800:600'), true);
  assert.equal(observed, f.list);
  assert.ok(f.classes.has('dense-objectives'));
  notify([{ target: f.list, contentRect: { width: 200, height: 80 } }]);
  layout.fit(f.card, f.list, 'content:800:600');
  const before = f.reads();
  for (let i = 0; i < 100; i++) assert.equal(layout.fit(f.card, f.list, 'content:800:600'), false);
  assert.equal(f.reads(), before);
  f.sizes.clientHeight = 120;
  notify([{ target: f.list, contentRect: { width: 200, height: 120 } }]);
  assert.equal(layout.fit(f.card, f.list, 'content:800:600'), true);
  assert.equal(f.classes.has('dense-objectives'), false);
  assert.equal(layout.fit(f.card, f.list, 'new objectives:800:600'), true);
  const after = f.reads();
  notify([{ target: f.list, contentRect: { width: 200, height: 120 } }]);
  assert.equal(layout.fit(f.card, f.list, 'new objectives:800:600'), false);
  assert.equal(f.reads(), after);
});
test('objective layout keeps a size-aware fallback without ResizeObserver and fits each panel independently', () => {
  const layout = new ObjectiveLayout(null),
    a = fixture(),
    b = fixture();
  assert.equal(layout.fit(a.card, a.list, 'same'), true);
  assert.equal(layout.fit(a.card, a.list, 'same'), false);
  a.sizes.clientHeight = 120;
  assert.equal(layout.fit(a.card, a.list, 'same'), true);
  assert.equal(a.classes.has('dense-objectives'), false);
  assert.equal(layout.fit(b.card, b.list, 'same'), true);
  assert.ok(b.classes.has('dense-objectives'));
});
