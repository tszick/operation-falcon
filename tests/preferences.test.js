import test from 'node:test';
import assert from 'node:assert/strict';
import { readPreference, writePreference } from '../src/ui/preferences.js';
test('blocked storage preserves defaults and reports unsuccessful writes without interrupting the game', () => {
  const blocked = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('quota');
    },
  };
  assert.equal(readPreference('guide', 'open', blocked), 'open');
  assert.equal(writePreference('guide', 'closed', blocked), false);
  const map = new Map(),
    storage = { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
  assert.equal(writePreference('score', 12, storage), true);
  assert.equal(readPreference('score', null, storage), '12');
});
