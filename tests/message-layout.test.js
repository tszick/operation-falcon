import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutMessageFeeds } from '../src/rendering/messageLayout.js';
test('radio and warning geometry is read together before transforms, retaining drift and independent fades', () => {
  const events = [];
  function message(height, shownAt, fading) {
    const style = {};
    for (const key of ['transform', 'opacity'])
      Object.defineProperty(style, key, {
        set(value) {
          events.push(['write', key, value]);
          this['_' + key] = value;
        },
        get() {
          return this['_' + key];
        },
      });
    return {
      node: {
        get offsetHeight() {
          events.push(['read', 'message']);
          return height;
        },
        style,
      },
      item: { shownAt, fading },
    };
  }
  const a = message(30, 0, false),
    b = message(40, 3, true),
    c = message(20, 2, false);
  const feeds = [
    {
      host: {
        get clientHeight() {
          events.push(['read', 'warning']);
          return 200;
        },
      },
      positioned: [a, b],
    },
    {
      host: {
        get clientHeight() {
          events.push(['read', 'radio']);
          return 40;
        },
      },
      positioned: [c],
    },
  ];
  layoutMessageFeeds(feeds, 5);
  const firstWrite = events.findIndex((e) => e[0] === 'write');
  assert.equal(
    events.slice(firstWrite).some((e) => e[0] === 'read'),
    false,
  );
  assert.equal(a.node.style.transform, 'translateY(40px)');
  assert.equal(b.node.style.transform, 'translateY(60px)');
  assert.equal(b.node.style.opacity, '0');
  assert.equal(c.node.style.transform, 'translateY(6px)');
  assert.equal(c.node.style.opacity, '1');
});
test('empty message feeds do not trigger layout reads', () => {
  const host = {
    get clientHeight() {
      throw new Error('empty feed measured');
    },
  };
  layoutMessageFeeds([{ host, positioned: [] }], 0);
});
