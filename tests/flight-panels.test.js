import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { createAircraft } from '../src/physics.js';
import { Vec3 } from '../src/math.js';
import { fuelStatus } from '../src/instruments.js';
import { missionCardState, missionGoalsMarkup, flightClock } from '../src/flightPanels.js';
import { tacticalMapState, mapPoint, renderRadarNoise } from '../src/tacticalMap.js';
import { Mission } from '../src/mission.js';
const plane = () => createAircraft(aircraft.find((a) => a.id === 'f16'));
test('range uses actual horizontal speed and fuel flow without inventing distance when stationary or flow is unknown', () => {
  const s = plane();
  s.onGround = false;
  s.fuel = 500;
  s.fuelFlow = 1;
  s.velocity = new Vec3(0, -300, 100);
  assert.equal(fuelStatus(s).rangeKm, 50);
  s.fuelFlow = 2;
  assert.equal(fuelStatus(s).rangeKm, 25);
  s.onGround = true;
  assert.equal(fuelStatus(s).rangeKm, null);
  s.onGround = false;
  s.fuelFlow = 0;
  assert.equal(fuelStatus(s).rangeKm, null);
  s.fuel = 0;
  assert.equal(fuelStatus(s).rangeKm, 0);
});
test('portrait radar adds vertical space while maintaining the same metres per pixel and north-up orientation', () => {
  const s = plane(),
    map = tacticalMapState(s, [], { width: 240, height: 300 }),
    zero = mapPoint(new Vec3(), map),
    east = mapPoint(new Vec3(1000, 0, 0), map),
    north = mapPoint(new Vec3(0, 0, 1000), map);
  assert.deepEqual(zero, { x: 120, y: 150 });
  assert.ok(Math.abs(east.x - zero.x - (zero.y - north.y)) < 1e-10);
  assert.equal(tacticalMapState(s, []).centerY, 120);
});
test('jammed radar noise covers the full taller viewport and centres the denial label', () => {
  let extent = null,
    label = null;
  const c = {
    fillRect(...args) {
      if (!extent) extent = args;
    },
    fillText(text, x, y) {
      label = { text, x, y };
    },
  };
  renderRadarNoise(c, 1, { width: 240, height: 300 });
  assert.deepEqual(extent, [0, 0, 240, 300]);
  assert.equal(label.x, 120);
  assert.equal(label.y, 153);
});
test('standalone landing and civil missions receive explicit goals and elapsed mission time', () => {
  const s = plane();
  s.elapsed = 125;
  const m = new Mission(missions.find((m) => m.id === 'landing'));
  let card = missionCardState(s, m);
  assert.equal(card.elapsed, '02:05');
  assert.equal(card.primary.total, 1);
  assert.equal(card.primary.done, 0);
  s.landing = { success: true };
  s.speed = 0;
  card = missionCardState(s, m);
  assert.equal(card.primary.done, 1);
  const civil = new Mission(missions.find((m) => m.id === 'civil'));
  civil.civilIntercepted = true;
  card = missionCardState(s, civil, [{ civilian: true, alive: true, departedAirspace: false }]);
  assert.equal(card.primary.total, 2);
  assert.equal(card.optional.total, 0);
  assert.equal(card.rows.find((r) => r.id === 'civil-lock').status, 'done');
  assert.equal(
    card.rows.some((r) => r.id === 'civil-exit'),
    false,
  );
  assert.equal(flightClock(3605), '60:05');
});
test('completed, failed, unfinished and optional goals remain distinct on a mission failure', () => {
  const s = plane(),
    m = new Mission(missions.find((m) => m.objective === 'escort-transport'));
  m.failed = true;
  m.failureReason = 'A szállítógép megsemmisült.';
  m.objectives = [
    { id: 'transport', text: 'Szállító kijut', done: false },
    { id: 'enemies', text: 'Összes ellenfél', done: true, optional: true },
    { id: 'landing', text: 'Leszállás', done: false },
  ];
  const card = missionCardState(s, m, [{ id: 'TRANSPORT', alive: false, exited: false }]);
  assert.equal(card.rows[0].status, 'failed');
  assert.equal(card.rows[1].status, 'done');
  assert.equal(card.rows[2].status, 'failed');
  assert.deepEqual(card.primary, { done: 0, total: 2, failed: 2 });
  assert.equal(card.optional.done, 1);
  assert.equal(card.priority, m.failureReason);
});
test('damage and fuel change the displayed priority while preserving original goals and not awarding victory', () => {
  const s = plane();
  s.onGround = false;
  s.damage = 50;
  const m = new Mission(missions.find((m) => m.objective === 'bridge-block'));
  m.objectives = [{ id: 'bridge', text: 'Híd elpusztítása', done: false }];
  const card = missionCardState(s, m);
  assert.match(card.priority, /HAZATÉRÉS/);
  assert.equal(card.rows[0].status, 'pending');
  assert.equal(m.complete, false);
  assert.equal(m.objectives[0].done, false);
  s.damage = 0;
  s.fuel = 0;
  assert.match(missionCardState(s, m).priority, /Kényszerleszállás/);
});
test('the bridge deadline is shown as a failed goal and mission labels are escaped', () => {
  const s = plane(),
    m = new Mission(missions.find((m) => m.objective === 'bridge-block'));
  m.objectives = [{ id: 'bridge', text: '<img src=x>', done: false }];
  const c = missionCardState(s, m, [{ id: 'CONVOY', crossedBridge: true }]);
  assert.equal(c.rows[0].status, 'failed');
  const html = missionGoalsMarkup(c);
  assert.ok(html.includes('&lt;img src=x&gt;'));
  assert.ok(html.includes('goal-failed'));
  assert.ok(!html.includes('<img'));
});
