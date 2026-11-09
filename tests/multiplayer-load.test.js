import { MultiplayerDiagnostics } from '../src/multiplayer/diagnostics.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CombatLoadPilot } from './helpers/combat-load-pilot.js';
import { MultiplayerRooms } from '../server/multiplayer-rooms.mjs';
import { unpackFlight } from '../src/multiplayer/flightState.js';
import { validCommand } from '../src/multiplayer/protocol.js';
function fixture() {
  const rooms = new MultiplayerRooms(),
    room = rooms.create('arena'),
    one = rooms.join(room, 'f16'),
    two = rooms.join(room, 'fa18');
  for (const p of [one, two])
    rooms.preflight(room, p, { type: 'ready', revision: room.lobby.revision, ready: true });
  rooms.preflight(room, one, { type: 'start', revision: room.lobby.revision });
  const snapshot = rooms.snapshot(room);
  return { snapshot, id: one.id, state: unpackFlight(snapshot.players[0].state) };
}
test('combat load pilot uses ordinary valid inputs and cannot mutate flight state or replenish stores', () => {
  const { snapshot, id, state } = fixture(),
    pilot = new CombatLoadPilot(),
    before = structuredClone(state);
  const c = pilot.command(state, snapshot, id);
  assert.equal(validCommand({ seq: 1, ...c }), true);
  assert.deepEqual(structuredClone(state), before);
  assert.equal(c.combat.fire, false);
  assert.equal(c.combat.cycle, true);
  assert.equal(pilot.command(state, snapshot, id).combat.cycle, false);
});
test('combat load pilot respects fatal states and finite ammunition, and spaces decoys', () => {
  const { snapshot, id, state } = fixture(),
    pilot = new CombatLoadPilot();
  state.dying = true;
  assert.equal(pilot.command(state, snapshot, id), null);
  state.dying = false;
  state.ammo.aam = 0;
  state.ammo.gun = 0;
  state.incomingMissiles = 1;
  const first = pilot.command(state, snapshot, id);
  assert.equal(first.combat.weapon, 'gun');
  assert.equal(first.combat.fire, false);
  assert.equal(first.combat.countermeasures, true);
  assert.equal(pilot.command(state, snapshot, id).combat.countermeasures, false);
  state.elapsed += 3;
  assert.equal(pilot.command(state, snapshot, id).combat.countermeasures, true);
  snapshot.mission.phase = 'success';
  assert.equal(pilot.command(state, snapshot, id), null);
});

test('performance measurements reset between rooms and rounds instead of retaining previous battle peaks', () => {
  const d = Object.create(MultiplayerDiagnostics.prototype);
  d.windows = [{ fps: 10 }];
  d.peakProjectiles = 192;
  d.renderParts = { terrain: 200 };
  d.instrumentParts = { weapons: 100 };
  d.panel = { textContent: 'old' };
  d.reset();
  assert.deepEqual(d.windows, []);
  assert.equal(d.peakProjectiles, 0);
  assert.deepEqual(d.renderParts, {});
  assert.deepEqual(d.instrumentParts, {});
  assert.match(d.panel.textContent, /Measuring/);
});

test('five-second render diagnostics separate a one-off startup peak from later flight work', (t) => {
  const d = Object.create(MultiplayerDiagnostics.prototype);
  d.panel = { textContent: '' };
  d.reset();
  d.telemetry.intervalMs = 1;
  const originalDocument = globalThis.document;
  globalThis.document = { visibilityState: 'visible' };
  t.after(() => {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });
  const client = {
    latest: { mission: { phase: 'active' }, combat: { projectiles: [] }, players: [], time: 1 },
    metrics: {},
    prediction: { pending: [] },
    inbox: { coalesced: 0 },
  };
  d.renderParts = { terrain: 180 };
  d.renderWindow = { terrain: 180 };
  d.frame({ frameMs: 20 }, client, { costs: [['cockpit-frame', 25]] });
  const startup = JSON.parse(d.panel.textContent);
  assert.equal(startup.renderPartsWindowMaxMs.terrain, 180);
  assert.equal(startup.instrumentPartsWindowMaxMs['cockpit-frame'], 25);
  d.renderWindow = { terrain: 2 };
  d.frame({ frameMs: 20 }, client, { costs: [['cockpit-frame', 1]] });
  const flight = JSON.parse(d.panel.textContent);
  assert.equal(flight.renderPartsMaxMs.terrain, 180);
  assert.equal(flight.renderPartsWindowMaxMs.terrain, 2);
  assert.equal(flight.instrumentPartsMaxMs['cockpit-frame'], 25);
  assert.equal(flight.instrumentPartsWindowMaxMs['cockpit-frame'], 1);
});

test('stall diagnostics remain bounded, preserve callback timing and reset on a new room', (t) => {
  const original = globalThis.document;
  globalThis.document = { visibilityState: 'visible', hasFocus: () => false };
  t.after(() => {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  });
  const d = Object.create(MultiplayerDiagnostics.prototype);
  d.panel = { textContent: '' };
  d.reset();
  const client = {
    latest: { mission: { phase: 'active' }, combat: { projectiles: [] }, players: [], time: 1 },
    metrics: {},
    prediction: { pending: [] },
    inbox: { coalesced: 0 },
  };
  for (let i = 0; i < 40; i++)
    d.frame(
      { frameMs: 100 + i, cpuMs: 5, previousCpuMs: 4, betweenFramesMs: 95 + i, callbackDelayMs: 2 },
      client,
    );
  assert.equal(d.stalls.length, 24);
  assert.equal(d.stalls[0].frameMs, 116);
  assert.equal(d.stalls.at(-1).betweenFramesMs, 134);
  assert.equal(d.stalls.at(-1).focused, false);
  d.reset();
  assert.deepEqual(d.stalls, []);
});

test('co-op load pilots attack hostile mission targets instead of allied player aircraft', () => {
  const { snapshot, id, state } = fixture();
  snapshot.scenario = 'cooperative';
  snapshot.combat.targets = [
    { id: 'HOSTILE', kind: 'air', team: 'enemy', alive: true, position: { x: 0, y: 3200, z: 0 } },
  ];
  const own = snapshot.players.find((p) => p.id === id);
  own.state.team = 'ally';
  own.combat.aim = { id: 'HOSTILE', locked: true };
  const pilot = new CombatLoadPilot();
  assert.equal(pilot.command(state, snapshot, id).combat.cycle, false);
  snapshot.combat.targets = [];
  assert.equal(
    pilot.command(state, snapshot, id),
    null,
    'allied human aircraft are not fallback combat targets',
  );
});
