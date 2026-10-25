import test from 'node:test';
import assert from 'node:assert/strict';
import { missions, aircraft } from '../src/aircraftSpec.js';
import { missionForSide } from '../src/missionSides.js';
import { createTargets, updateTargets, Targeting } from '../src/targeting.js';
import { createMissionAircraft, serviceAircraft } from '../src/missionStart.js';
import { terrainWorld, terrainHeight } from '../src/terrain.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { stepAircraft } from '../src/physics.js';
import { Vec3, Quat, DEG } from '../src/math.js';
import { airfieldForTarget, selectRecoveryAirfield } from '../src/recoveryAirfields.js';
import { initialiseNaval, requestCatapult, carrierTouchdown } from '../src/navalOps.js';
import { seaSegmentClear, planSeaRoute } from '../src/oceanEnvironment.js';
import { EnemyCombat } from '../src/enemyCombat.js';
import { updateAIResupply } from '../src/aiResupply.js';
import { superiorityRoster } from '../src/airSuperiority.js';

function setup(side = 'west', plane = side === 'west' ? 'fa18' : 'su27') {
  const spec = missionForSide(
    missions.find((m) => m.id === 'taiwan-invasion'),
    side,
  );
  const player = aircraft.find((a) => a.id === plane),
    targets = createTargets(spec, player, { rng: () => 0.4 });
  const s = createMissionAircraft(player, spec),
    m = new Mission(spec),
    w = new Weapons({ enemyFire: false, random: () => 0.4 });
  m.update(s, targets, w, new Targeting());
  return { spec, targets, s, m, w, by: (id) => targets.find((t) => t.id === id) };
}
const kill = (t) => {
  t.alive = false;
  t.health = 0;
  t.pending = false;
};

test('Taiwan uses three waves of three 3+1 flights, with one human seat and ordinary ground units', () => {
  for (const side of ['west', 'east'])
    for (const plane of [side === 'west' ? 'fa18' : 'su27', side === 'west' ? 'b52' : 'tu95']) {
      const x = setup(side, plane);
      for (const row of superiorityRoster(x.spec, x.s.spec))
        assert.equal(
          x.targets.filter((t) => t.team === row.team && t.type === row.type).length,
          row.count,
        );
      assert.equal(x.targets.filter((t) => t.kind === 'air').length, 47);
      for (const wave of [1, 2, 3]) {
        const east = x.targets.filter(
          (t) => t.coalition === 'east' && t.kind === 'air' && t.wave === wave,
        );
        const human = side === 'east' && wave === 1;
        assert.equal(east.length, human ? 11 : 12);
        assert.equal(
          east.filter((t) => t.type === 'bomber').length,
          3 - (human && plane === 'tu95' ? 1 : 0),
        );
        assert.equal(east.filter((t) => t.pending).length, wave === 1 ? 0 : 12);
      }
      assert.equal(x.s.airborne, true);
      assert.equal(x.s.onGround, false);
      if (side === 'west') {
        assert.equal(x.s.recoveryExit, undefined);
        assert.ok(x.s.airfield);
      } else {
        assert.equal(x.s.airfield, undefined);
        assert.ok(x.s.recoveryExit);
      }
      assert.equal(terrainWorld.islands.length, 1);
      assert.equal(x.targets.filter((t) => t.type === 'airbase').length, 1);
      assert.equal(x.by('EAST-AIRFIELD'), undefined);
      assert.equal(terrainHeight(-45000, 17000), 0);
      if (!x.s.spec.carrierCapable) {
        assert.equal(x.s.airfield?.carrier, undefined);
        assert.equal(x.s.naval, undefined);
      }
      assert.equal(x.targets.filter((t) => t.type === 'sam-system').length, 4);
      assert.equal(x.targets.filter((t) => t.type === 'flak').length, 4);
      for (const t of x.targets.filter((t) => t.type === 'airbase')) {
        assert.ok(t.position.y > 0);
        for (const z of [-1500, 0, 1500])
          assert.ok(Math.abs(terrainHeight(t.position.x, t.position.z + z) - t.position.y) < 0.01);
      }
    }
});

test('Taiwan rises from low shores to a level central airfield plateau', () => {
  const x = setup(),
    island = terrainWorld.islands[0],
    airfield = x.by('WEST-AIRFIELD');
  assert.equal(airfield.position.y, 650);
  // The runway, overruns and nearby taxi area all sit on the same physical plateau.
  for (const dx of [-300, 0, 300])
    for (const dz of [-1800, 0, 1800])
      assert.ok(Math.abs(terrainHeight(dx, dz) - airfield.position.y) < 0.01);
  for (let ray = 0; ray < 8; ray++) {
    const angle = (ray * Math.PI) / 4,
      c = Math.cos(island.heading),
      s = Math.sin(island.heading);
    let previous = Infinity;
    for (const radius of [0, 0.2, 0.4, 0.6, 0.8, 0.95, 1.2]) {
      const localX = Math.cos(angle) * island.radiusX * radius,
        localZ = Math.sin(angle) * island.radiusZ * radius,
        height = terrainHeight(localX * c + localZ * s, -localX * s + localZ * c);
      assert.ok(height <= previous + 0.01, 'terrain must descend toward every coast');
      if (radius === 0.8) assert.ok(height < 250, 'coast must lie well below the airfield');
      if (radius === 1.2) assert.equal(height, 0);
      previous = height;
    }
  }
});

test('future waves cannot be counted as destroyed, and release exactly once at 180 and 360 seconds', () => {
  const x = setup(),
    events = [];
  x.w.emit = (e) => events.push(e);
  for (const t of x.targets.filter((t) => t.team === 'enemy' && t.kind === 'air' && !t.pending))
    kill(t);
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.complete, false);
  x.s.elapsed = 179;
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.targets.filter((t) => t.pending).length, 24);
  x.s.elapsed = 180;
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.targets.filter((t) => t.pending).length, 12);
  x.s.elapsed = 360;
  x.m.update(x.s, x.targets, x.w);
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.targets.filter((t) => t.pending).length, 0);
  assert.deepEqual(
    events.filter((e) => e.type === 'mission-wave').map((e) => e.wave),
    [2, 3],
  );
});

test('western aircraft victory permits a surviving western base and does not require destroying eastern ships', () => {
  for (const destroyedBase of ['WEST-AIRFIELD', 'WEST-CARRIER']) {
    const x = setup();
    kill(x.by(destroyedBase));
    x.s.elapsed = 360;
    x.m.update(x.s, x.targets, x.w);
    for (const t of x.targets.filter((t) => t.team === 'enemy' && t.kind === 'air')) kill(t);
    x.m.update(x.s, x.targets, x.w);
    assert.equal(x.m.complete, true);
    assert.equal(x.m.failed, false);
    assert.ok(x.by('EAST-CARRIER').alive && x.by('EAST-DESTROYER').alive);
  }
  const x = setup();
  kill(x.by('WEST-CARRIER'));
  kill(x.by('WEST-AIRFIELD'));
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.failed, true);
});

test('eastern victory is an OR: both western bases, or all twelve western aircraft', () => {
  for (const route of ['bases', 'air']) {
    const x = setup('east');
    if (route === 'bases') {
      kill(x.by('WEST-CARRIER'));
      x.m.update(x.s, x.targets, x.w);
      assert.equal(x.m.complete, false);
      kill(x.by('WEST-AIRFIELD'));
    } else for (const t of x.targets.filter((t) => t.team === 'enemy' && t.kind === 'air')) kill(t);
    x.m.update(x.s, x.targets, x.w);
    assert.equal(x.m.complete, true);
    assert.equal(x.m.failed, false);
    assert.ok(x.m.objectives.filter((r) => !r.optional).every((r) => r.done));
  }
});

test('shared recovery selects friendly compatible bases, falls back after destruction, and services where it landed', () => {
  const x = setup();
  x.s.position = x
    .by('WEST-CARRIER')
    .position.clone()
    .add(new Vec3(0, 500, -600));
  selectRecoveryAirfield(x.s, x.targets);
  assert.equal(x.s.airfield.targetId, 'WEST-CARRIER');
  initialiseNaval(x.s);
  serviceAircraft(x.s);
  assert.ok(x.s.position.distance(x.by('WEST-CARRIER').position) < 200);
  x.s.onGround = false;
  kill(x.by('WEST-CARRIER'));
  selectRecoveryAirfield(x.s, x.targets);
  assert.equal(x.s.airfield.targetId, 'WEST-AIRFIELD');
  const bomber = setup('west', 'b52');
  bomber.s.position = bomber
    .by('WEST-CARRIER')
    .position.clone()
    .add(new Vec3(0, 500, 0));
  selectRecoveryAirfield(bomber.s, bomber.targets);
  assert.equal(bomber.s.airfield.targetId, 'WEST-AIRFIELD');
});

test('translated and rotated carriers use the same actual catapult and arresting-wire physics', () => {
  for (const heading of [0, Math.PI / 2, Math.PI]) {
    const x = setup(),
      home = x.by('WEST-CARRIER');
    home.heading = heading;
    x.s.airfield = airfieldForTarget(home);
    x.s.fuel = x.s.spec.fuelCapacity * 0.25;
    initialiseNaval(x.s);
    x.s.elapsed = 5;
    x.s.throttle = 1;
    requestCatapult(x.s);
    for (let i = 0; i < 720; i++) stepAircraft(x.s, {}, 1 / 120);
    assert.equal(x.s.crashed, false);
    assert.equal(x.s.airborne, true);
    assert.ok(x.s.position.y > 22);
    const q = Quat.euler(x.s.airfield.heading, 0, 0);
    x.s.position = q.rotate(new Vec3(0, 22.3, -108)).add(x.s.airfield.position);
    x.s.previousPosition = x.s.position.clone();
    x.s.velocity = q.rotate(new Vec3(0, -2, 70));
    x.s.orientation = Quat.euler(x.s.airfield.heading, 7 * DEG, 0);
    x.s.onGround = false;
    x.s.naval = { hook: true, nozzle: 0, arrested: false };
    x.s.landing = null;
    x.s.gear = true;
    x.s.flaps = true;
    x.s.flapPosition = 1;
    x.s.throttle = 0.25;
    x.s.landingMode = 'on';
    assert.equal(carrierTouchdown(x.s, 2, 70).fatal, false);
    for (let i = 0; i < 1080; i++) stepAircraft(x.s, {}, 1 / 120);
    assert.equal(x.s.crashed, false);
    assert.equal(x.s.naval.arrested, true);
    assert.ok(x.s.speed < 1);
  }
});

test('carrier positions stay fixed; ordinary destroyer movement navigates elongated islands', () => {
  const x = setup(),
    ship = x.by('EAST-DESTROYER');
  const carriers = x.targets
    .filter((t) => t.type === 'carrier')
    .map((t) => [t, t.position.clone()]);
  const start = ship.position.clone();
  for (let i = 0; i < 600; i++) updateTargets(x.targets, 0.1);
  for (const [t, p] of carriers) assert.equal(t.position.distance(p), 0);
  assert.ok(ship.position.distance(start) > 300);
  assert.equal(terrainHeight(ship.position.x, ship.position.z), 0);
  const island = terrainWorld.islands[0],
    from = new Vec3(-15000, 0, 0),
    to = new Vec3(15000, 0, 0);
  const route = planSeaRoute(from, to, [island]);
  assert.ok(route.length > 1);
  let previous = from;
  for (const point of route) {
    assert.ok(seaSegmentClear(previous, point, [island], 450));
    previous = point;
  }
});

test('ordinary AI resupply picks an actual carrier and redirects to a surviving friendly runway', () => {
  const x = setup(),
    t = x.targets.find((t) => t.team === 'ally' && t.type === 'fighter'),
    combat = new EnemyCombat(() => 0.4);
  t.position = x
    .by('WEST-CARRIER')
    .position.clone()
    .add(new Vec3(0, 2000, -3000));
  const u = combat.unit(t);
  u.missiles = 0;
  updateAIResupply(x.s, x.targets, x.w, combat, 1 / 60);
  assert.equal(t.service.homeId, 'WEST-CARRIER');
  assert.equal(t.flight.airfield.targetId, 'WEST-CARRIER');
  assert.ok(t.flight.airfield.deckPosition.distance(x.by('WEST-CARRIER').position) < 1);
  kill(x.by('WEST-CARRIER'));
  updateAIResupply(x.s, x.targets, x.w, combat, 1 / 60);
  assert.equal(t.service.homeId, 'WEST-AIRFIELD');
  assert.equal(t.flight.airfield.targetId, 'WEST-AIRFIELD');
});

test('victory can complete during ground service and while a damaged player is returning', () => {
  for (const returning of [false, true]) {
    const x = setup();
    x.s.elapsed = 360;
    x.m.update(x.s, x.targets, x.w);
    if (returning) {
      x.s.damage = 45;
      x.m.update(x.s, x.targets, x.w);
      assert.equal(x.m.aborted, true);
    } else {
      x.s.onGround = true;
      x.s.airborne = false;
    }
    for (const t of x.targets.filter((t) => t.team === 'enemy' && t.kind === 'air')) kill(t);
    x.m.update(x.s, x.targets, x.w);
    assert.equal(x.m.complete, true);
  }
});

test('physical-resupply flights cannot replenish off map when all compatible friendly bases are destroyed', () => {
  const x = setup('east'),
    t = x.targets.find((t) => t.team === 'ally' && t.type === 'fighter'),
    combat = new EnemyCombat(() => 0.4);
  const u = combat.unit(t);
  u.missiles = 0;
  kill(x.by('EAST-CARRIER'));
  updateAIResupply(x.s, x.targets, x.w, combat, 1 / 60);
  assert.equal(t.service, undefined);
  assert.ok(t.retreat);
  assert.equal(u.missiles, 0);
});

test('western carrier victory ends immediately even before future eastern waves arrive', () => {
  const west = setup();
  kill(west.by('EAST-CARRIER'));
  west.m.update(west.s, west.targets, west.w);
  assert.equal(west.m.complete, true);
  assert.ok(west.targets.some((t) => t.pending));
  assert.ok(west.m.objectives.filter((r) => !r.optional).every((r) => r.done));
  const east = setup('east');
  kill(east.by('EAST-CARRIER'));
  east.m.update(east.s, east.targets, east.w);
  assert.equal(east.m.failed, true);
});

test('a mixture of destroyed and permanently withdrawn eastern aircraft satisfies western victory', () => {
  const x = setup();
  x.s.elapsed = 360;
  x.m.update(x.s, x.targets, x.w);
  const air = x.targets.filter((t) => t.coalition === 'east' && t.kind === 'air');
  for (const [i, t] of air.entries()) {
    if (i % 2) kill(t);
    else {
      t.alive = false;
      t.exited = true;
      t.retired = true;
      t.retreat = { stage: 'departed', reason: 'ammunition' };
    }
  }
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.complete, true);
  assert.ok(x.by('EAST-CARRIER').alive);
  assert.ok(x.m.objectives.find((r) => r.id === 'invasion-bases').text.includes('36/36'));
});

test('retreating, temporarily servicing, and future aircraft do not count as permanently withdrawn', () => {
  for (const mode of ['pending', 'returning', 'service']) {
    const x = setup();
    x.s.elapsed = mode === 'pending' ? 0 : 360;
    x.m.update(x.s, x.targets, x.w);
    const air = x.targets.filter((t) => t.coalition === 'east' && t.kind === 'air');
    const last = mode === 'pending' ? air.find((t) => t.pending) : air[0];
    for (const t of air) if (t !== last) kill(t);
    if (mode === 'returning') last.retreat = { stage: 'exit', reason: 'ammunition' };
    if (mode === 'service') {
      last.exited = true;
      last.retired = false;
      last.retreat = { stage: 'departed', reason: 'resupply' };
      last.service = { stage: 'servicing' };
    }
    x.m.update(x.s, x.targets, x.w);
    assert.equal(x.m.complete, false, mode);
  }
});

test('an eastern human pilot counts as withdrawn only after reaching the actual withdrawal point', () => {
  const x = setup('east');
  x.s.elapsed = 360;
  x.m.update(x.s, x.targets, x.w);
  for (const t of x.targets.filter((t) => t.coalition === 'east' && t.kind === 'air')) kill(t);
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.failed, false);
  assert.equal(x.s.airfield, undefined);
  assert.ok(x.s.recoveryExit.x < -40000);
  x.s.position = x.s.recoveryExit.clone();
  x.m.update(x.s, x.targets, x.w);
  assert.equal(x.m.failed, true);
});
