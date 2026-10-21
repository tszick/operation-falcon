import test from 'node:test';
import assert from 'node:assert/strict';
import { CockpitAlerts } from '../src/cockpitAlerts.js';
import { AudioSystem } from '../src/audio.js';
test('damage gives three soft beeps each ten seconds, despite changing damage warnings and low frame rates', () => {
  const alerts = new CockpitAlerts(),
    s = { elapsed: 0, damage: 65, warning: 'SZERKEZETI KÁR' },
    events = [];
  for (let i = 0; i <= 420; i++) {
    s.elapsed = i * 0.05;
    s.warning = i % 2 ? 'HAJTÓMŰ SÉRÜLT' : 'SZERKEZETI KÁR';
    const event = alerts.next(s, {});
    if (event) events.push({ time: s.elapsed, ...event });
  }
  assert.equal(events.length, 9);
  for (let group = 0; group < 3; group++) {
    assert.ok(Math.abs(events[group * 3].time - group * 10) < 0.06);
    assert.ok(events[group * 3 + 2].time - events[group * 3].time < 0.7);
  }
  assert.ok(events.every((e) => e.type === 'sine' && e.volume === 0.012 && e.duration === 0.12));
});
test('pause holds the burst, reset clears it, and impact stops all cockpit warning tones', () => {
  const alerts = new CockpitAlerts(),
    s = { elapsed: 0, damage: 70, warning: 'SZERKEZETI KÁR' };
  assert.ok(alerts.next(s, {}));
  assert.equal(alerts.next(s, {}, false), null);
  assert.equal(alerts.next(s, {}), null);
  s.elapsed = 0.28;
  assert.ok(alerts.next(s, {}));
  s.elapsed = 0.56;
  assert.ok(alerts.next(s, {}));
  s.elapsed = 1;
  assert.equal(alerts.next(s, {}), null);
  alerts.reset();
  s.elapsed = 0;
  assert.ok(alerts.next(s, {}));
  s.crashed = true;
  s.elapsed = 50;
  assert.equal(alerts.next(s, { locked: true }), null);
});
test('missile threat interrupts the infrequent damage sequence; immediate terrain risk interrupts a fuel caution', () => {
  const alerts = new CockpitAlerts(),
    s = { elapsed: 0, damage: 50, warning: 'SZERKEZETI KÁR' };
  assert.equal(alerts.next(s, {}).id, 'damage');
  s.elapsed = 0.1;
  s.threatWarning = 'RAKÉTA KÖZELEDIK';
  assert.equal(alerts.next(s, {}).id, 'missile');
  s.elapsed = 0.8;
  assert.equal(alerts.next(s, {}).id, 'missile');
  s.threatWarning = '';
  s.damage = 0;
  s.warning = 'BINGO FUEL';
  s.elapsed = 1;
  assert.equal(alerts.next(s, {}).id, 'warning');
  s.warning = 'TALAJKÖZELSÉG';
  s.elapsed = 1.1;
  assert.equal(alerts.next(s, {}).id, 'urgent');
});
test('warning oscillator uses a short sine envelope, dedicated mute bus and disconnects after ending', () => {
  const audio = new AudioSystem(),
    ramps = [],
    source = {
      frequency: {},
      connect(node) {
        this.output = node;
        return node;
      },
      start() {},
      stop() {},
      disconnect() {
        this.disconnected = true;
      },
    },
    gain = {
      gain: {
        setValueAtTime(...v) {
          ramps.push(v);
        },
        exponentialRampToValueAtTime(...v) {
          ramps.push(v);
        },
      },
      connect(node) {
        this.output = node;
      },
      disconnect() {
        this.disconnected = true;
      },
    };
  audio.ctx = { currentTime: 2, createOscillator: () => source, createGain: () => gain };
  audio.warningGain = {};
  audio.tone(620, 0.12, 'sine', 0.012);
  assert.equal(source.type, 'sine');
  assert.equal(gain.output, audio.warningGain);
  assert.deepEqual(ramps, [
    [0.0001, 2],
    [0.012, 2.012],
    [0.0001, 2.12],
  ]);
  source.onended();
  assert.ok(source.disconnected && gain.disconnected);
  assert.equal(audio.sources.size, 0);
});
