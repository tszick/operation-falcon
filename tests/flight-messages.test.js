import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightMessages } from '../src/flightMessages.js';
test('statuses expire independently of arrival order and an active older message stays visible', () => {
  const feed = new FlightMessages();
  feed.setStatus('a', 'radar', 'RADAR', null, 0);
  feed.view(0);
  feed.setStatus('b', 'lock', 'LOCK', null, 1);
  feed.view(1);
  feed.setStatus('b', 'clear', 'CLEAR', null, 2);
  const fading = feed.view(3.8);
  assert.equal(fading.find((i) => i.text === 'RADAR').fading, false);
  assert.equal(fading.find((i) => i.text === 'LOCK').fading, true);
  assert.ok(feed.view(6).some((i) => i.text === 'RADAR'));
  assert.ok(!feed.view(6).some((i) => i.text === 'LOCK'));
});
test('a rapidly changing percentage updates one status instead of flooding the message queue', () => {
  const feed = new FlightMessages();
  for (let i = 0; i < 100; i++) feed.setStatus('target', 'acquiring', `LOCK ${i}%`, 'HOLD', i / 10);
  assert.equal(feed.items.length, 1);
  assert.equal(feed.view(10)[0].text, 'LOCK 99%');
});
test('bursts queue separate events and start their readable lifetime when displayed', () => {
  const feed = new FlightMessages();
  feed.setStatus('target', 'active', 'ACTIVE', '', 0);
  for (let i = 0; i < 5; i++) feed.event(`EVENT ${i}`, 0);
  let seen = new Set();
  for (let t = 0; t < 30; t += 0.5) {
    for (const item of feed.view(t, 2)) if (!item.active) seen.add(item.text);
  }
  assert.equal(seen.size, 5);
  assert.ok(feed.view(30, 2).some((i) => i.active));
});
test('repeated events coalesce and a returning status reverses fading without duplication', () => {
  const feed = new FlightMessages();
  feed.event('FIRE', 0);
  feed.event('FIRE', 0.2);
  assert.equal(feed.view(0.3)[0].count, 2);
  feed.setStatus('target', 'one', 'ONE', '', 1);
  feed.view(1);
  feed.setStatus('target', 'two', 'TWO', '', 2);
  feed.view(2);
  feed.setStatus('target', 'one', 'ONE AGAIN', '', 3);
  assert.equal(feed.view(3).filter((i) => i.active).length, 1);
  assert.equal(feed.view(3).find((i) => i.active).fading, false);
  feed.reset();
  assert.equal(feed.view(10).length, 0);
});

test('spoken radio captions are admitted immediately without duplication even when transient events are queued', () => {
  const feed = new FlightMessages();
  feed.setStatus('target', 'locked', 'LOCKED', '', 0);
  for (let i = 0; i < 8; i++) feed.event(`EVENT ${i}`, 0);
  feed.view(0, 3);
  feed.event('CONTROL', 0.1, 7, { detail: 'Welcome home, pilot.', level: 'radio' });
  const visible = feed.view(0.1, 3);
  assert.ok(visible.some((i) => i.level === 'radio'));
  assert.equal(new Set(visible.map((i) => i.id)).size, visible.length);
  assert.ok(visible.some((i) => i.active));
});

test('resolved system warnings fade independently while other statuses remain active', () => {
  const feed = new FlightMessages();
  feed.setStatus('target', 'locked', 'LOCKED', '', 0);
  feed.setStatus('systems', 'failure', 'WEAPONS FAILED', '', 0);
  feed.view(0);
  feed.clearStatus('systems', 2);
  feed.clearStatus('systems', 3);
  assert.ok(feed.view(3).find((i) => i.text === 'LOCKED').active);
  assert.equal(feed.view(3).find((i) => i.text === 'WEAPONS FAILED').active, false);
  assert.ok(!feed.view(5).some((i) => i.text === 'WEAPONS FAILED'));
});
