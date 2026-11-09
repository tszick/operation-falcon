import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerNotices } from '../src/multiplayer/notices.js';
import { FlightMessages } from '../src/flightMessages.js';
function snapshot(events = []) {
  return {
    round: 1,
    scenario: 'cooperative',
    time: 4,
    mission: { phase: 'active' },
    players: ['One', 'Two', 'Three'].map((callSign, i) => ({
      id: String(i),
      callSign: 'Falcon ' + callSign,
      connected: true,
      state: { team: 'ally', dying: false, crashed: false },
    })),
    combat: {
      eventSequence: events.at(-1)?.id ?? 0,
      events,
      targets: [{ id: 'hostile', kind: 'air', aircraftId: 'mig29', team: 'enemy' }],
    },
  };
}
function start() {
  const n = new MultiplayerNotices();
  n.reset(snapshot());
  return n;
}
const hit = (id, targetId = 'hostile', extra = {}) => ({
  id,
  type: 'target-hit',
  sourceId: '0',
  targetId,
  time: id / 10,
  weapon: 'aam',
  destroyed: true,
  ...extra,
});
test('a delayed burst retains separate chronological kill, friendly hit, AI takeover and loss notices exactly once', () => {
  const n = start();
  const s = snapshot([hit(1), hit(2, '1', { destroyed: false, friendlyFire: true }), hit(3, '2')]);
  s.players[1].connected = false;
  s.players[2].state.dying = true;
  n.receive(s, '0');
  const rows = n.drain();
  assert.deepEqual(
    rows.map((r) => r.text),
    ['LELÖVÉS', 'BARÁTI TŰZ — SAJÁT GÉPET TALÁLTÁL EL!', 'LELÖVÉS', 'AI átvette az irányítást.'],
  );
  assert.ok(rows[0].detail.startsWith('Falcon One → '));
  assert.equal(rows[1].detail, 'Falcon One → Falcon Two');
  assert.equal(rows[1].level, 'warning');
  assert.equal(rows[2].level, 'warning');
  n.receive(s, '0');
  assert.deepEqual(n.drain(), []);
  s.players[1].connected = true;
  n.receive(s, '0');
  assert.equal(n.drain()[0].text, 'Pilóta visszavette az irányítást.');
  s.players[2].state.crashed = true;
  n.receive(s, '0');
  assert.deepEqual(n.drain(), [], 'fatal fall does not announce a second death at impact');
});
test('initial history, obsolete rounds and preflight changes cannot replay combat messages', () => {
  const n = new MultiplayerNotices();
  n.receive(snapshot([hit(1)]), '0');
  assert.deepEqual(n.drain(), []);
  n.push('OLD');
  const next = snapshot();
  next.round = 2;
  next.mission.phase = 'waiting';
  n.receive(next, '0');
  assert.deepEqual(n.drain(), []);
  n.receive(snapshot([hit(10)]), '0');
  assert.deepEqual(n.drain(), []);
  next.players[1].connected = false;
  n.receive(next, '0');
  assert.deepEqual(n.drain(), []);
});
test('collision and its damage records produce one notice; unexplained fatal damage still reports the loss', () => {
  const n = start();
  const s = snapshot([
    hit(1, '1', { weapon: 'collision' }),
    { id: 2, time: 0.2, type: 'collision', sourceId: '0', targetId: '1' },
  ]);
  s.players[0].state.dying = s.players[1].state.dying = true;
  n.receive(s, '0');
  assert.deepEqual(
    n.drain().map((r) => r.text),
    ['ÜTKÖZÉS'],
  );
  s.players[2].state.dying = true;
  n.receive(s, '0');
  assert.equal(n.drain()[0].detail, 'Falcon Three');
});
test('pending bursts are bounded and draining preserves the remaining event order', () => {
  const n = start();
  for (let i = 0; i < 1000; i++) n.push('EVENT', String(i));
  assert.equal(n.pending.length, 64);
  assert.deepEqual(
    n.drain(2).map((r) => r.detail),
    ['936', '937'],
  );
  assert.equal(n.pending.length, 62);
  n.reset(snapshot());
  assert.equal(n.pending.length, 0);
});
test('each queued notice receives its readable lifetime when the common HUD displays it', () => {
  const n = start(),
    feed = new FlightMessages();
  feed.setStatus('target', 'tracking', 'TRACKING', '', 0);
  for (let i = 1; i <= 5; i++) n.push('LELÖVÉS', 'Target ' + i);
  for (const item of n.drain()) feed.event(item.text, 0, item.duration, item);
  const shown = new Set();
  for (let t = 0; t < 45; t += 0.5)
    for (const row of feed.view(t, 2)) if (!row.active) shown.add(row.detail);
  assert.equal(shown.size, 5);
  assert.deepEqual(
    feed.view(45, 2).map((r) => r.text),
    ['TRACKING'],
  );
});
test('friendly hits distinguish the local victim and a third-party incident without reporting ordinary nonfatal hits', () => {
  const n = start();
  n.receive(
    snapshot([
      hit(1, '0', { sourceId: '1', destroyed: false, friendlyFire: true }),
      hit(2, '2', { sourceId: '1', destroyed: false, friendlyFire: true }),
      hit(3, 'hostile', { destroyed: false }),
    ]),
    '0',
  );
  assert.deepEqual(
    n.drain().map((r) => r.text),
    ['BARÁTI TALÁLAT ÉRTE A GÉPED!', 'BARÁTI TALÁLAT'],
  );
});

test('an overloaded common feed remains bounded without replacing active or currently readable messages', () => {
  const feed = new FlightMessages({ eventLimit: 12 });
  feed.setStatus('systems', 'fault', 'FAULT', '', 0);
  feed.event('VISIBLE', 0);
  feed.view(0, 2);
  for (let i = 0; i < 1000; i++) feed.event('EVENT ' + i, 0);
  assert.equal(feed.items.filter((i) => !i.channel).length, 12);
  assert.ok(feed.items.some((i) => i.active && i.text === 'FAULT'));
  assert.ok(feed.items.some((i) => i.text === 'VISIBLE'));
  assert.ok(feed.view(1, 2).some((i) => i.text === 'VISIBLE'));
});
