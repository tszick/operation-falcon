import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { createTargets, updateTargets, Targeting } from '../src/targeting.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { EnemyCombat } from '../src/enemyCombat.js';
import { FlightRecorder } from '../src/flightRecorder.js';
import { RadioDirector } from '../src/radioDirector.js';
import { ironVeilObjectives, ironVeilVisibleRows, ironVeilGuide } from '../src/ironVeil.js';
import { terrainWorld, terrainHeight, pathCoordinates } from '../src/terrain.js';
import { Vec3, Quat } from '../src/math.js';
const spec = aircraft.find((a) => a.id === 'f16'),
  scenario = missions.find((m) => m.id === 'iron-veil');
function scene() {
  const targets = createTargets(scenario, spec, { rng: () => 0.37 }),
    s = createMissionAircraft(spec, scenario),
    m = new Mission(scenario),
    w = new Weapons({ enemyFire: false }),
    aim = new Targeting();
  return { s, m, w, targets, aim, by: (id) => targets.find((t) => t.id === id) };
}
function tick(x) {
  x.s.elapsed++;
  x.m.update(x.s, x.targets, x.w, x.aim);
}
function kill(x, ...ids) {
  for (const id of ids) x.by(id).alive = false;
}
function airborne(x) {
  Object.assign(x.s, { onGround: false, airborne: true, speed: 165, landing: null });
  x.s.position = new Vec3(0, 2200, -9000);
  x.s.agl = 2200;
}
function land(x) {
  Object.assign(x.s, {
    onGround: true,
    airborne: true,
    speed: 0,
    landing: { success: true, descent: 1, offset: 0 },
  });
  tick(x);
}
function clear(x, road = 'IV-BRIDGE') {
  airborne(x);
  kill(x, 'IV-SAM1', 'IV-SAM2', road);
  tick(x);
}
function launch(x) {
  clear(x);
  land(x);
  tick(x);
  airborne(x);
}
function counter(x) {
  launch(x);
  x.by('IV-TRANSPORT').exited = true;
  x.by('IV-TRANSPORT').alive = false;
  tick(x);
}
function repel(x) {
  counter(x);
  kill(x, 'IV-RAIDER1', 'IV-RAIDER2');
  tick(x);
}

test('Iron Veil has eleven objectives plus final landing and an exact unique staged roster', () => {
  const x = scene();
  tick(x);
  assert.equal(scenario.difficulty, 'TOP-GUN');
  assert.equal(scenario.order, 8);
  assert.equal(x.s.onGround, true);
  assert.equal(new Set(x.targets.map((t) => t.id)).size, x.targets.length);
  for (const r of scenario.roster)
    assert.equal(
      x.targets.filter((t) => t.type === r.type && t.team === r.team).length,
      r.count,
      `${r.team}/${r.type}`,
    );
  assert.equal(x.m.objectives.length, 12);
  assert.equal(x.m.objectives.filter((r) => r.optional).length, 5);
  assert.equal(x.m.objectiveComplete, false);
  assert.ok(terrainWorld.road && terrainWorld.river);
  const bridge = x.by('IV-BRIDGE'),
    convoy = x.by('IV-CONVOY');
  assert.ok(
    Math.abs(pathCoordinates(terrainWorld.road, bridge.position.x, bridge.position.z).across) < 1,
  );
  assert.ok(
    Math.abs(pathCoordinates(terrainWorld.road, convoy.position.x, convoy.position.z).across) < 1,
  );
  assert.ok(convoy.routeDistance < -10000);
  assert.ok(x.targets.filter((t) => t.team === 'enemy').every((t) => t.position.length() > 15000));
  for (const id of ['IV-FLAK', 'IV-COMMAND'])
    assert.ok(terrainHeight(x.by(id).position.x, x.by(id).position.z) > 700);
});

test('dormant transport and Vipers cannot move or falsely report losses before resupply', () => {
  const x = scene(),
    t = x.by('IV-TRANSPORT'),
    start = t.position.clone(),
    d = new RadioDirector();
  d.start(x.s, x.m, x.targets);
  for (let i = 0; i < 60; i++) {
    updateTargets(x.targets, 1);
    tick(x);
    d.observe(x.s, x.m, x.targets);
  }
  assert.equal(t.pending, true);
  assert.equal(t.alive, false);
  assert.equal(t.position.distance(start), 0);
  assert.ok(!d.queue.some((c) => ['wingmanDown', 'wingmanReady'].includes(c.line.group)));
  clear(x);
  land(x);
  tick(x);
  x.s.elapsed++;
  d.observe(x.s, x.m, x.targets);
  assert.equal(d.queue.filter((c) => c.line.group === 'wingmanReady').length, 1);
  assert.ok(!d.queue.some((c) => c.line.group === 'wingmanDown'));
});

test('two SAMs and either road target are required; services before clearance do not satisfy the gate', () => {
  for (const road of ['IV-BRIDGE', 'IV-CONVOY']) {
    const x = scene();
    land(x);
    assert.equal(x.m.serviceCount, 1);
    airborne(x);
    kill(x, road, 'IV-SAM1');
    tick(x);
    assert.equal(x.m.ironVeil.stage, 'breach');
    kill(x, 'IV-SAM2');
    tick(x);
    assert.equal(x.m.ironVeil.stage, 'resupply');
    assert.equal(x.m.ironVeil.rearmAfter, 2);
    assert.equal(x.by('IV-TRANSPORT').pending, true);
    tick(x);
    assert.equal(x.m.ironVeil.rearmed, false);
    land(x);
    tick(x);
    assert.equal(x.m.ironVeil.stage, 'escort');
    assert.equal(x.by('IV-TRANSPORT').alive, true);
    assert.equal(x.m.complete, false);
  }
});

test('bridge destruction physically stops the convoy; failure to block its crossing is irreversible', () => {
  const x = scene();
  kill(x, 'IV-BRIDGE');
  for (let i = 0; i < 850; i++) updateTargets([x.by('IV-CONVOY'), x.by('IV-BRIDGE')], 1);
  assert.equal(x.by('IV-CONVOY').stopped, true);
  assert.ok(!x.by('IV-CONVOY').crossedBridge);
  tick(x);
  assert.equal(x.m.ironVeil.roadSecured, true);
  const y = scene();
  for (let i = 0; i < 850; i++) updateTargets([y.by('IV-CONVOY'), y.by('IV-BRIDGE')], 1);
  assert.equal(y.by('IV-CONVOY').crossedBridge, true);
  tick(y);
  assert.equal(y.m.failed, true);
  kill(y, 'IV-CONVOY', 'IV-BRIDGE');
  land(y);
  assert.equal(y.m.complete, false);
});

test('actual intermediate service repairs and restocks without resetting enemies or operation', () => {
  const x = scene();
  clear(x);
  x.s.fuel = 1;
  x.s.ammo.aam = 0;
  x.s.damage = 35;
  const elapsed = x.s.elapsed;
  land(x);
  assert.equal(x.m.serviceCount, 1);
  assert.equal(x.s.fuel, spec.fuelCapacity);
  assert.equal(x.s.damage, 0);
  assert.ok(x.s.ammo.aam > 0);
  assert.ok(x.s.elapsed > elapsed);
  assert.equal(x.by('IV-SAM1').alive, false);
  assert.equal(x.by('IV-JAMMER').alive, true);
  tick(x);
  assert.equal(x.m.ironVeil.stage, 'escort');
  assert.equal(x.m.complete, false);
});

test('escort and interceptor activation occur once and allow substantial preparation distance', () => {
  const x = scene();
  launch(x);
  const t = x.by('IV-TRANSPORT');
  assert.equal(t.pending, false);
  assert.equal(t.position.z, -12000);
  assert.equal(x.by('IV-VIPER1').alive, true);
  assert.equal(x.by('IV-INTERCEPT1').pending, true);
  t.position.z = 9999;
  tick(x);
  assert.equal(x.by('IV-INTERCEPT1').pending, true);
  t.position.z = 10000;
  tick(x);
  assert.equal(x.by('IV-INTERCEPT1').alive, true);
  assert.ok(t.position.distance(x.by('IV-INTERCEPT1').position) > 30000);
  kill(x, 'IV-INTERCEPT1');
  tick(x);
  assert.equal(x.by('IV-INTERCEPT1').alive, false);
  assert.equal(x.by('IV-RAIDER1').pending, true);
});

test('only transport exit starts counterattack; command bunker suppresses escort without awarding kills', () => {
  const x = scene();
  launch(x);
  kill(x, 'IV-COMMAND');
  tick(x);
  assert.equal(x.by('IV-RAIDER1').pending, true);
  const t = x.by('IV-TRANSPORT');
  t.position.z = t.exitZ - 1;
  updateTargets([t], 1);
  tick(x);
  assert.equal(x.m.ironVeil.stage, 'counterstrike');
  assert.equal(x.by('IV-RAIDER1').alive, true);
  assert.equal(x.by('IV-RAIDER2').alive, true);
  for (const id of ['IV-COVER1', 'IV-COVER2']) {
    assert.equal(x.by(id).cancelled, true);
    assert.equal(x.by(id).alive, false);
    assert.equal(x.by(id).pending, false);
  }
  assert.equal(x.w.hits, 0);
  const y = scene();
  counter(y);
  assert.equal(y.by('IV-COVER1').alive, true);
  kill(y, 'IV-COMMAND');
  tick(y);
  assert.equal(y.by('IV-COVER1').alive, true);
});

test('extra resupply in escort preserves transport progress and enemy ammunition', () => {
  const x = scene();
  launch(x);
  const t = x.by('IV-TRANSPORT');
  t.position.z = 12000;
  tick(x);
  x.w.enemyCombat = new EnemyCombat();
  const enemy = x.by('IV-INTERCEPT1'),
    stock = x.w.enemyCombat.unit(enemy);
  stock.missiles = 1;
  const fuel = x.s.fuel;
  x.s.fuel = 10;
  land(x);
  tick(x);
  assert.equal(x.m.serviceCount, 2);
  assert.equal(x.m.ironVeil.stage, 'escort');
  assert.equal(t.position.z, 12000);
  assert.equal(x.by('IV-SAM1').alive, false);
  assert.ok(x.s.fuel >= fuel);
  assert.equal(x.w.enemyCombat.unit(enemy).missiles, 1);
});

test('active transport or own base loss fails without a replacement or victory', () => {
  const x = scene();
  launch(x);
  kill(x, 'IV-TRANSPORT');
  tick(x);
  assert.equal(x.m.failed, true);
  assert.match(x.m.failureReason, /Nomad/);
  land(x);
  assert.equal(x.m.serviceCount, 1);
  assert.equal(x.m.complete, false);
  const y = scene();
  repel(y);
  kill(y, 'BASE');
  land(y);
  assert.equal(y.m.failed, true);
  assert.equal(y.m.complete, false);
});

test('optional losses and survivors do not gate final victory; final full stop remains mandatory', () => {
  const x = scene();
  counter(x);
  kill(x, 'IV-VIPER1', 'IV-RAIDER1', 'IV-RAIDER2');
  tick(x);
  assert.equal(x.m.objectiveComplete, true);
  assert.equal(x.m.complete, false);
  assert.ok(x.m.objectives.some((r) => r.id === 'iv-wingmen' && r.status === 'failed'));
  assert.ok(x.by('IV-JAMMER').alive && x.by('IV-COMMAND').alive && x.by('IV-CONVOY').alive);
  x.s.onGround = true;
  x.s.landing = { success: true, descent: 1, offset: 0 };
  x.s.speed = 15;
  tick(x);
  assert.equal(x.m.complete, false);
  x.s.speed = 0;
  tick(x);
  assert.equal(x.m.complete, true);
  assert.equal(x.m.serviceCount, 1);
});

test('withdrawing bombers count as neutralized but existing base-bound ordnance must resolve', () => {
  const x = scene();
  counter(x);
  x.by('IV-RAIDER1').retreat = { stage: 'departure' };
  kill(x, 'IV-RAIDER2');
  x.w.projectiles.push({ owner: 'enemy', targetEntityId: 'BASE', type: 'bomb' });
  tick(x);
  assert.equal(x.m.objectiveComplete, false);
  assert.equal(x.m.ironVeil.stage, 'counterstrike');
  x.w.projectiles = [];
  tick(x);
  assert.equal(x.m.objectiveComplete, true);
  assert.equal(x.m.ironVeil.stage, 'return');
  assert.equal(x.w.hits, 0);
});

test('retired Vipers survive and the compact cockpit shows at most three current goals plus emergency return', () => {
  const x = scene();
  launch(x);
  x.by('IV-VIPER1').alive = false;
  x.by('IV-VIPER1').retired = true;
  tick(x);
  assert.equal(x.m.objectives.find((r) => r.id === 'iv-wingmen').done, true);
  for (const stage of ['breach', 'resupply', 'escort', 'counterstrike', 'return']) {
    x.m.ironVeil.stage = stage;
    const rows = ironVeilVisibleRows(x.m, x.m.objectives);
    assert.ok(rows.length > 0 && rows.length <= 3);
    assert.ok(ironVeilGuide(x.m, x.s).length <= 3);
  }
  x.s.damage = 45;
  tick(x);
  assert.equal(x.m.aborted, true);
  assert.equal(ironVeilVisibleRows(x.m, x.m.objectives)[0].id, 'return');
  land(x);
  assert.equal(x.m.aborted, false);
  assert.equal(x.m.serviceCount, 2);
  assert.equal(x.m.ironVeil.rearmed, true);
});

test('operation transitions and deferred units are present in the current mission recorder', () => {
  const x = scene(),
    recorder = new FlightRecorder();
  tick(x);
  recorder.start(x.s, x.m, x.targets, x.w, x.aim);
  clear(x);
  recorder.capture(x.s, x.m, x.targets, x.w, x.aim, {}, true);
  land(x);
  tick(x);
  recorder.capture(x.s, x.m, x.targets, x.w, x.aim, {}, true);
  assert.ok(
    recorder.entries.some((e) => e.kind === 'operation-stage' && e.data.stage === 'resupply'),
  );
  assert.ok(
    recorder.entries.some((e) => e.kind === 'operation-stage' && e.data.stage === 'escort'),
  );
  assert.equal(recorder.metadata.initialUnits.find((t) => t.id === 'IV-TRANSPORT').pending, true);
  assert.ok(
    recorder.entries.some(
      (e) =>
        e.kind === 'unit-state' && e.data.id === 'IV-TRANSPORT' && e.data.alive && !e.data.pending,
    ),
  );
});

test('Viper elements split interceptor assignments and receive new bomber intercept orders on exit', () => {
  const x = scene();
  launch(x);
  x.by('IV-TRANSPORT').position.z = 10000;
  tick(x);
  assert.equal(x.by('IV-VIPER1').aiTargetId, 'IV-INTERCEPT1');
  assert.equal(x.by('IV-VIPER2').aiTargetId, 'IV-INTERCEPT2');
  x.by('IV-VIPER2').retreat = { stage: 'home' };
  x.by('IV-TRANSPORT').exited = true;
  x.by('IV-TRANSPORT').alive = false;
  tick(x);
  assert.equal(x.by('IV-VIPER1').aiTargetId, 'IV-RAIDER1');
  assert.equal(x.by('IV-VIPER2').aiTargetId, 'IV-INTERCEPT2');
  assert.equal(x.by('IV-VIPER2').retreat.stage, 'home');
});

test('transport route skirts the flak range, preserving an optional rather than automatic-failure objective', () => {
  const x = scene(),
    t = x.by('IV-TRANSPORT'),
    flak = x.by('IV-FLAK');
  assert.ok(Math.abs(Math.abs(t.position.x - flak.position.x) - 6200) < 1e-6);
  assert.ok(Math.abs(t.position.x - x.by('IV-BRIDGE').position.x) >= 6200);
  assert.ok(x.by('IV-VIPER1').position.distance(t.position) < 3000);
  assert.equal(x.by('IV-HOME-SAM').defendId, 'BASE');
});

test('escort help gives current bearing only for a visible contact and changes from joining to combat', () => {
  const x = scene();
  launch(x);
  x.s.position = x
    .by('IV-TRANSPORT')
    .position.clone()
    .add(new Vec3(0, 200, -2000));
  x.s.orientation = new Quat();
  let steps = ironVeilGuide(x.m, x.s, x.targets);
  assert.match(steps[0].text, /Nomad 000/);
  assert.equal(steps[1].key, 'R / F');
  x.s.orientation = Quat.euler(Math.PI, 0, 0);
  steps = ironVeilGuide(x.m, x.s, x.targets);
  assert.ok(!/\d{3}°/.test(steps[0].text));
  x.m.ironVeil.interceptorsLaunched = true;
  steps = ironVeilGuide(x.m, x.s, x.targets);
  assert.equal(steps[1].key, '2 / T');
  assert.match(steps[1].text, /Viper/);
});

test('temporary bomber ammunition service does not complete the counterstrike or grant landing victory', () => {
  const x = scene();
  counter(x);
  kill(x, 'IV-RAIDER1');
  const bomber = x.by('IV-RAIDER2');
  for (const stage of ['outbound', 'servicing', 'returning']) {
    bomber.retreat = { reason: 'resupply', stage };
    bomber.exited = stage === 'servicing';
    tick(x);
    assert.equal(x.m.ironVeil.stage, 'counterstrike');
    const result = ironVeilObjectives(x.m, x.s, x.targets, x.w);
    assert.equal(result.complete, false);
    assert.equal(result.rows.find((r) => r.id === 'iv-counter').done, false);
  }
  delete bomber.retreat;
  bomber.exited = false;
  tick(x);
  assert.equal(x.m.ironVeil.stage, 'counterstrike');
  land(x);
  assert.equal(x.m.complete, false);
  kill(x, 'IV-RAIDER2');
  airborne(x);
  tick(x);
  assert.equal(x.m.ironVeil.stage, 'return');
  land(x);
  assert.equal(x.m.complete, true);
});

test('permanent damaged bomber withdrawal still repels the Iron Veil counterstrike', () => {
  const x = scene();
  counter(x);
  kill(x, 'IV-RAIDER1');
  x.by('IV-RAIDER2').retreat = { reason: 'structural', stage: 'outbound' };
  tick(x);
  assert.equal(x.m.ironVeil.stage, 'return');
  assert.equal(
    ironVeilObjectives(x.m, x.s, x.targets, x.w).rows.find((r) => r.id === 'iv-counter').done,
    true,
  );
});
