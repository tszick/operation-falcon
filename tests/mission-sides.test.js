import { missionCardState } from '../src/flightPanels.js';
import { superiorityRoster } from '../src/airSuperiority.js';
import { planLandingRoute, getLandingRoute } from '../src/landingRoute.js';
import { EnemyCombat } from '../src/enemyCombat.js';
import { evaluateFlight } from '../src/flightDebrief.js';
import { Quat } from '../src/math.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { missions, aircraft } from '../src/aircraftSpec.js';
import { missionForSide, canChooseSide } from '../src/missionSides.js';
import { plannerAircraft } from '../src/plannerSelection.js';
import { createTargets, updateTargets, Targeting } from '../src/targeting.js';
import { createMissionAircraft, serviceAircraft } from '../src/missionStart.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { aircraftFlightSpec } from '../src/aiAircraftSpec.js';
import { battleObjectives } from '../src/missionObjectives.js';
import { updateMissionRuntime } from '../src/missionRuntime.js';
import { assessTouchdown, evaluateApproach } from '../src/landing.js';
import { baseMarkerPosition } from '../src/renderer.js';
import { Vec3 } from '../src/math.js';
import { terrainWorld } from '../src/terrain.js';
import { recoveryComplete } from '../src/navalOps.js';
const random = (value) => () => value;
function setup(id, side = 'east', plane = 'su35') {
  const spec = missionForSide(
      missions.find((m) => m.id === id),
      side,
    ),
    player = aircraft.find((a) => a.id === (side === 'west' && plane === 'su35' ? 'f16' : plane)),
    targets = createTargets(spec, player, { rng: random(0.4) }),
    s = createMissionAircraft(player, spec),
    m = new Mission(spec),
    w = new Weapons({ enemyFire: true, random: random(0.4) });
  return { spec, player, targets, s, m, w, by: (id) => targets.find((t) => t.id === id) };
}
const destroy = (t) => {
  t.alive = false;
  t.health = 0;
  t.pending = false;
};

test('side selection is combat-only, both coalitions have compatible choices, and geographic terrain is preserved', () => {
  for (const original of missions)
    for (const side of ['west', 'east']) {
      const spec = missionForSide(original, side),
        choices = plannerAircraft(spec);
      assert.ok(choices.length, original.id + ':' + side);
      if (!canChooseSide(original)) {
        assert.equal(spec, original);
        assert.deepEqual(
          choices.map((a) => a.id),
          ['t45'],
        );
      } else for (const a of choices) assert.equal(a.faction === 'west', side === 'west');
      assert.equal(original.name, missions.find((m) => m.id === original.id).name);
      assert.equal(spec.id, original.id);
    }
  for (const id of ['convoy', 'airbase']) {
    const spec = missionForSide(
      missions.find((m) => m.id === id),
      'east',
    );
    assert.equal(spec.mirrored, false);
    assert.equal(spec.airStart, undefined);
  }
});

test('all combat variants spawn with correct coalition aircraft and one human seat, without stale references', () => {
  for (const original of missions.filter(canChooseSide))
    for (const side of ['west', 'east']) {
      const spec = missionForSide(original, side),
        player = plannerAircraft(spec)[0];
      const units = createTargets(spec, player, { rng: random(0.4) });
      const state = createMissionAircraft(player, spec);
      assert.equal(new Set(units.map((t) => t.id)).size, units.length);
      for (const t of units.filter(
        (t) => t.kind === 'air' && !t.civilian && t.type !== 'ballistic',
      )) {
        const west = aircraftFlightSpec(t.aircraftId).faction === 'west';
        assert.equal(
          west,
          side === 'west' ? t.team === 'ally' : t.team === 'enemy',
          spec.id + ':' + t.id,
        );
      }
      if (spec.mirrored) {
        assert.equal(state.onGround, false);
        assert.equal(state.airborne, true);
        assert.ok(state.position.y > 500);
        assert.ok(units.every((t) => !t.playerControlled));
        assert.equal(state.radioCallSign.number, 1);
        for (const t of units)
          for (const key of ['aiTargetId', 'defendId'])
            if (t[key])
              assert.ok(
                t[key] === 'PLAYER' || units.some((a) => a.id === t[key]),
                `${spec.id}/${key}/${t[key]}`,
              );
      }
    }
});

test('eastern naval strike has three airborne allies, a friendly destroyer and four Western deck launches', () => {
  const x = setup('carrier-defense');
  assert.equal(x.by('BASE').team, 'enemy');
  assert.equal(x.by('ENEMY-DESTROYER').team, 'ally');
  assert.equal(x.targets.filter((t) => t.team === 'ally' && t.kind === 'air').length, 3);
  const west = x.targets.filter((t) => t.team === 'enemy' && t.kind === 'air');
  assert.equal(west.length, 4);
  assert.ok(
    west.every((t) => t.aiRole === 'takeoff' && t.position.y === 22 && t.aircraftId === 'fa18'),
  );
  assert.ok(x.s.recoveryExit);
  assert.equal(x.s.airfield, undefined);
  assert.equal(evaluateApproach(x.s).active, false);
  assert.equal(assessTouchdown(x.s, 1, 80).fatal, true);
  const ids = x.targets
    .filter((t) => t.team === 'ally' && t.kind === 'air')
    .map((t) => t.radioCallSign.number);
  assert.deepEqual(ids, [2, 3, 4]);
});

test('eastern naval victory requires actual carrier/aircraft destruction and egress, not an enemy-deck landing', () => {
  const x = setup('carrier-defense');
  x.s.position = x.s.recoveryExit.clone();
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.complete, false);
  assert.equal(x.m.serviceCount, undefined);
  destroy(x.by('BASE'));
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.complete, false);
  for (const t of x.targets.filter((t) => t.team === 'enemy' && t.kind === 'air')) destroy(t);
  x.s.position = new Vec3(0, 2000, 10000);
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.objectiveComplete, true);
  assert.equal(x.m.complete, false);
  x.s.position = x.s.recoveryExit.clone();
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.complete, true);
  assert.ok(Number.isFinite(x.m.score));
});

test('base attackers recover at their own remote runway and service does not teleport to the Western base', () => {
  const x = setup('defend-base');
  assert.equal(x.by('BASE').team, 'enemy');
  assert.ok(x.s.airfield && x.s.airfield.position.length() > 20000);
  const field = x.s.airfield.position.clone();
  serviceAircraft(x.s);
  assert.ok(x.s.position.distance(field) < 10);
  assert.ok(baseMarkerPosition(x.targets).distance(field) < 1100);
  assert.equal(battleObjectives(x.m, x.s, x.targets, x.w).complete, false);
  destroy(x.by('BASE'));
  assert.equal(battleObjectives(x.m, x.s, x.targets, x.w).complete, true);
});

test('opposing escort fails on transport escape; destroyed transport completes the interception objective', () => {
  const x = setup('escort-transport');
  assert.equal(x.by('TRANSPORT').team, 'enemy');
  x.by('TRANSPORT').exited = true;
  assert.ok(battleObjectives(x.m, x.s, x.targets, x.w).failure);
  x.by('TRANSPORT').exited = false;
  destroy(x.by('TRANSPORT'));
  assert.equal(battleObjectives(x.m, x.s, x.targets, x.w).complete, true);
});

test('opposing city strike uses the same 80% preservation boundary', () => {
  const x = setup('defend-city'),
    city = x.targets.filter((t) => t.city);
  assert.ok(city.every((t) => t.team === 'enemy'));
  city.slice(0, 5).forEach(destroy);
  assert.equal(battleObjectives(x.m, x.s, x.targets, x.w).complete, false);
  destroy(city[5]);
  assert.equal(battleObjectives(x.m, x.s, x.targets, x.w).complete, true);
});

test('friendly intercontinental missile targets the Western base and its interception fails the defensive mission', () => {
  const x = setup('ballistic');
  x.s.elapsed = 301;
  updateMissionRuntime(x.s, x.m, x.targets, x.w);
  const missile = x.by('BALLISTIC');
  assert.equal(missile.team, 'ally');
  assert.equal(missile.targetId, 'BASE');
  destroy(missile);
  assert.ok(battleObjectives(x.m, x.s, x.targets, x.w).failure);
  missile.impacted = true;
  destroy(x.by('BASE'));
  assert.equal(battleObjectives(x.m, x.s, x.targets, x.w).complete, true);
});

test('Eastern Iron Veil activates its AI timeline without waiting for a Western human to land', () => {
  const x = setup('iron-veil');
  x.s.elapsed = 181;
  updateMissionRuntime(x.s, x.m, x.targets, x.w);
  assert.equal(x.by('IV-TRANSPORT').pending, false);
  assert.equal(x.by('IV-TRANSPORT').team, 'enemy');
  assert.equal(x.by('IV-TRANSPORT').alive, true);
  assert.equal(x.m.failed, false);
});

test('Western missions can face homogeneous Soviet/Russian or mixed Eastern flights without Western enemies', () => {
  const m = missionForSide(
      missions.find((m) => m.id === 'carrier-defense'),
      'west',
    ),
    player = aircraft.find((a) => a.id === 'fa18');
  const modes = new Set();
  for (const value of [0, 0.4, 0.95]) {
    const targets = createTargets(m, player, { rng: random(value) }),
      enemy = targets.filter((t) => t.team === 'enemy' && t.kind === 'air');
    modes.add(enemy[0].coalitionMode);
    assert.ok(enemy.every((t) => aircraftFlightSpec(t.aircraftId).faction !== 'west'));
    if (value > 0.9) assert.ok(enemy.some((t) => t.faction === 'china'));
  }
  assert.deepEqual([...modes], ['soviet', 'russian', 'mixed']);
});

test('both naval sides run real combat updates with finite positions and valid ownership', () => {
  for (const side of ['west', 'east']) {
    const x = setup('carrier-defense', side, side === 'west' ? 'fa18' : 'su35'),
      aim = new Targeting();
    for (let i = 0; i < 360; i++) {
      const dt = 1 / 30;
      x.s.elapsed += dt;
      updateTargets(x.targets, dt, x.s, x.w);
      x.w.update(x.s, x.targets, dt);
      x.m.update(x.s, x.targets, x.w, aim);
    }
    assert.ok(
      x.targets.every((t) => [t.position.x, t.position.y, t.position.z].every(Number.isFinite)),
    );
    assert.equal(terrainWorld.ocean, true);
    assert.equal(recoveryComplete(x.s), false);
  }
});

test('remote recovery route and physical touchdown use the Eastern runway, not the origin or double altitude', () => {
  const x = setup('defend-base'),
    field = x.s.airfield;
  x.s.position = field.position.clone().add(new Vec3(4000, 1400, -7000));
  x.s.landingMode = 'on';
  const route = planLandingRoute(x.s, 1),
    last = route.points.at(-1);
  assert.ok(Math.abs(last.x - field.position.x) < 0.01);
  assert.ok(Math.abs(last.z - (field.position.z - field.halfLength)) < 0.01);
  assert.ok(Math.abs(last.y - (field.elevation + 2)) < 0.01);
  x.s.position = field.position.clone();
  x.s.position.y = field.elevation + 2;
  x.s.velocity = new Vec3(0, -1, 80);
  x.s.orientation = Quat.euler(0, 0.05, 0);
  x.s.gear = true;
  assert.equal(assessTouchdown(x.s, 1, 80).fatal, false);
});

test('the hostile Western carrier really targets the Eastern human with its own missile ammunition', () => {
  const x = setup('carrier-defense'),
    carrier = x.by('BASE'),
    combat = new EnemyCombat();
  x.s.position = new Vec3(0, 1200, 4500);
  x.s.velocity = new Vec3(0, 0, -150);
  combat.activeTime = 20;
  const w = new Weapons({ enemyFire: false });
  for (let i = 0; i < 400; i++) combat.update(x.s, [carrier], w, 1 / 120);
  assert.ok(
    w.projectiles.some(
      (p) => p.owner === 'enemy' && p.sourceId === 'BASE' && p.type === 'aam' && p.targetPlayer,
    ),
  );
  assert.ok(combat.unit(carrier).missiles < 2);
});

test('the report identifies safe naval withdrawal rather than claiming an unflown landing', () => {
  const report = evaluateFlight({
    metadata: { mission: { recoveryMode: 'egress' } },
    entries: [{ t: 1, kind: 'mission-end', data: { result: 'success' } }],
  });
  assert.match(report.summary, /kivonulás/);
  assert.doesNotMatch(report.summary, /leszállás/);
});

test('briefing rosters match real opposing formations, including the replaced player and added rear base', () => {
  for (const original of missions.filter(canChooseSide)) {
    const spec = missionForSide(original, 'east');
    if (!spec.mirrored) continue;
    for (const player of plannerAircraft(spec)) {
      const targets = createTargets(spec, player, { rng: random(0.4) });
      const expected = new Map();
      for (const r of superiorityRoster(spec, player))
        expected.set(r.team + ':' + r.type, (expected.get(r.team + ':' + r.type) || 0) + r.count);
      const actual = new Map();
      for (const t of targets)
        actual.set(t.team + ':' + t.type, (actual.get(t.team + ':' + t.type) || 0) + 1);
      assert.deepEqual(actual, expected, spec.id + ':' + player.id);
      const names = targets
        .filter((t) => t.team === 'ally' && t.radioCallSign)
        .map((t) => t.radioCallSign);
      assert.ok(names.every((n) => n.flight && n.number >= 1 && n.number <= 4));
      assert.equal(new Set(names.map((n) => n.flight + ':' + n.number)).size, names.length);
    }
  }
});

test('a damaged Eastern naval pilot can withdraw as recovered without being stuck in an unrepairable service loop', () => {
  const x = setup('carrier-defense');
  x.s.damage = 45;
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.aborted, true);
  x.s.position = x.s.recoveryExit.clone();
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.recovered, true);
  assert.equal(x.m.complete, false);
  assert.equal(x.m.serviceCount, undefined);
});

test('opposing objectives stay green in the cockpit and temporarily servicing aircraft do not count as neutralized', () => {
  const x = setup('defend-base');
  destroy(x.by('BASE'));
  x.m.update(x.s, x.targets, x.w);
  assert.equal(
    missionCardState(x.s, x.m, x.targets).rows.find((r) => r.id === 'base')?.status,
    'done',
  );
  const y = setup('escort-transport');
  destroy(y.by('TRANSPORT'));
  y.m.update(y.s, y.targets, y.w);
  assert.equal(
    missionCardState(y.s, y.m, y.targets).rows.find((r) => r.id === 'transport')?.status,
    'done',
  );
  const n = setup('carrier-defense');
  destroy(n.by('BASE'));
  const air = n.targets.filter((t) => t.team === 'enemy' && t.kind === 'air');
  air.forEach(destroy);
  air[0].exited = true;
  air[0].retired = true;
  assert.equal(battleObjectives(n.m, n.s, n.targets, n.w).complete, true);
  air[0].alive = true;
  air[0].service = { stage: 'outbound' };
  assert.equal(battleObjectives(n.m, n.s, n.targets, n.w).complete, false);
});

test('manual landing guidance and route work far from home after destroying the convoy and bridge', () => {
  for (const side of ['west', 'east']) {
    const x = setup('convoy', side);
    for (const target of x.targets)
      if (target.team === 'enemy' && ['convoy', 'bridge'].includes(target.type)) destroy(target);
    const home = x.s.airfield?.position || new Vec3();
    x.s.position = home.clone().add(new Vec3(18000, 2000, 22000));
    x.s.velocity = new Vec3(-100, -2, -100);
    x.s.orientation = Quat.euler(-Math.PI * 0.75, 0, 0);
    x.s.onGround = false;
    x.s.airborne = true;
    x.s.landingMode = 'auto';
    assert.equal(evaluateApproach(x.s).active, false, side + ': remote auto stays off');
    x.s.landingMode = 'on';
    x.s.approach = evaluateApproach(x.s);
    assert.equal(x.s.approach.active, true, side + ': manual mode works immediately');
    assert.equal(x.s.approach.runwayCorridor, false);
    const route = getLandingRoute(x.s);
    assert.ok(route?.points.length > 1);
    assert.ok(route.entryDistance <= 6500);
    assert.ok(route.points.at(-1).clone().sub(home).length() < 1700);
    x.s.landingMode = 'off';
    x.s.approach = evaluateApproach(x.s);
    assert.equal(getLandingRoute(x.s), null);
  }
});
