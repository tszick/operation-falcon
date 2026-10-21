import { updateTargets } from '../src/targeting.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { navalScenario } from './navalScenarios.js';
import { Vec3 } from '../src/math.js';
import { Weapons } from '../src/weapons.js';
import { weaponProfiles, enemyProfile, stepMissile } from '../src/weaponDynamics.js';
import { EnemyCombat } from '../src/enemyCombat.js';
import { updateAIResupply, aiServiceInput } from '../src/aiResupply.js';
import { stepAircraft, createAircraft } from '../src/physics.js';
import { aircraft } from '../src/aircraftSpec.js';
test('carrier and destroyer use their actual weapons, and bombs hit the moving destroyer model', () => {
  const x = navalScenario();
  x.s.position = new Vec3(0, 2000, 10000);
  x.s.airborne = true;
  x.s.onGround = false;
  const ship = x.targets.find((t) => t.type === 'destroyer'),
    w = new Weapons({ enemyFire: false });
  for (let shot = 0; shot < 5; shot++) {
    const p = ship.position.clone().add(new Vec3(0, 100, 0));
    w.projectiles.push({
      id: ++w.sequence,
      type: 'bomb',
      profile: weaponProfiles.mk82,
      position: p,
      previous: p.clone(),
      velocity: new Vec3(),
      age: 0,
      damage: 50,
    });
    for (let i = 0; i < 6 * 120 && ship.alive; i++) {
      updateTargets([ship], 1 / 120);
      w.update(x.s, [ship], 1 / 120);
    }
  }
  assert.equal(ship.alive, false);
  assert.ok(w.drainEvents().some((e) => e.type === 'target-hit' && e.targetId === ship.id));
  const combat = new EnemyCombat(),
    base = x.targets.find((t) => t.home),
    target = x.targets.find((t) => t.type === 'bomber');
  target.position = new Vec3(0, 300, 500);
  target.velocity = new Vec3();
  target.alive = true;
  base.alive = true;
  combat.activeTime = 10;
  const fire = new Weapons({ enemyFire: false });
  for (let i = 0; i < 180; i++) combat.update(x.s, [base, target], fire, 1 / 120);
  assert.ok(fire.projectiles.some((p) => p.sourceId === 'BASE' && p.type === 'gun'));
  assert.ok(!fire.projectiles.some((p) => p.sourceId === 'BASE' && p.type === 'aam'));
});
test('allied carrier-capable AI requests its own carrier for rearm and deploys its hook', () => {
  const x = navalScenario(),
    t = x.targets.find((t) => t.team === 'ally' && t.kind === 'air'),
    s = createAircraft(aircraft.find((a) => a.id === 'fa18'));
  s.position = new Vec3(0, 1000, -6000);
  s.velocity = new Vec3(0, 0, 150);
  s.onGround = false;
  s.airborne = true;
  s.gear = false;
  s.flaps = false;
  s.flapPosition = 0;
  t.flight = s;
  t.position = s.position.clone();
  t.velocity = s.velocity.clone();
  t.aiRole = 'interceptor';
  t.lastAIWeapon = 'aam';
  const combat = new EnemyCombat(),
    u = combat.unit(t);
  u.missiles = 0;
  const w = { projectiles: [], missionEnded: false, emit() {} };
  updateAIResupply(x.s, x.targets, w, combat, 1 / 120);
  assert.equal(t.service.homeId, 'BASE');
  assert.equal(t.flight.airfield.carrier, true);
  assert.equal(t.flight.naval.hook, true);
});

test('AI carrier recovery, sixty-second servicing and catapult departure complete under actual controls', () => {
  const x = navalScenario('trap'),
    observer = navalScenario().s;
  observer.position = new Vec3(10000, 3000, -2000);
  observer.onGround = false;
  observer.airborne = true;
  const t = x.targets.find((t) => t.team === 'ally' && t.kind === 'air');
  t.flight = x.s;
  t.position = x.s.position.clone();
  t.velocity = x.s.velocity.clone();
  t.aiRole = 'resupply';
  t.service = {
    stage: 'final',
    reason: 'ammunition',
    homeId: 'BASE',
    remaining: 60,
    previousRole: 'interceptor',
  };
  const combat = new EnemyCombat(),
    events = [],
    w = {
      projectiles: [],
      emit(e) {
        events.push(e);
      },
    };
  for (let i = 0; i < 120 * 165; i++) {
    stepAircraft(t.flight, aiServiceInput(t), 1 / 120);
    t.position = t.flight.position.clone();
    t.velocity = t.flight.velocity.clone();
    updateAIResupply(observer, x.targets, w, combat, 1 / 120);
    if (t.flight.crashed || !t.service) break;
  }
  assert.equal(t.flight.crashed, false);
  assert.ok(events.some((e) => e.type === 'ai-service-start' && e.offmap === false));
  assert.ok(events.some((e) => e.type === 'ai-service-complete'));
  assert.ok(events.some((e) => e.type === 'ai-return-to-combat'));
  assert.equal(t.serviceCount, 1);
  assert.equal(t.service, undefined);
  assert.equal(t.flight.naval.launchComplete, true);
  assert.equal(t.flight.onGround, false);
});

test('carrier gun uses its original ground-gun range and lifetime', async () => {
  const { enemyProfile, weaponProfiles } = await import('../src/weaponDynamics.js');
  const p = enemyProfile({ type: 'carrier' }, 'gun');
  assert.equal(p.effectiveRange, 1800);
  assert.equal(p.effectiveRange, weaponProfiles.groundGun.effectiveRange);
  assert.equal(p.life, 5);
  assert.equal(enemyProfile({ type: 'destroyer' }, 'gun'), weaponProfiles.groundGun);
});

test('carrier mounts fire at two separate hostiles, retarget a lost contact and never fire at friendly or out-of-range aircraft', () => {
  const x = navalScenario(),
    base = x.targets.find((t) => t.home),
    enemies = x.targets.filter((t) => t.wave === 1).slice(0, 2),
    friend = x.targets.find((t) => t.id === 'ALLY-FIGHTER2');
  for (const [i, t] of enemies.entries()) {
    t.position = new Vec3(i ? 500 : -500, 300, 1200);
    t.velocity = new Vec3();
    t.alive = true;
  }
  friend.position = new Vec3(0, 300, 500);
  const far = { ...enemies[0], id: 'FAR', position: new Vec3(0, 300, 6000) },
    combat = new EnemyCombat(),
    fire = new Weapons({ enemyFire: false });
  combat.activeTime = 10;
  const units = [base, ...enemies, friend, far];
  for (let i = 0; i < 160; i++) combat.update(x.s, units, fire, 1 / 120);
  const shots = fire.drainEvents().filter((e) => e.type === 'gun' && e.sourceId === base.id);
  assert.deepEqual(new Set(shots.map((e) => e.targetId)), new Set(enemies.map((t) => t.id)));
  assert.deepEqual(new Set(shots.map((e) => e.turret)), new Set(['carrier-1', 'carrier-2']));
  assert.ok(shots.every((e) => e.profile === 'carrierGun' && e.launchRangeM === 1800));
  const state = combat.unit(base);
  assert.equal(
    state.rounds,
    state.carrierGuns.reduce((n, m) => n + m.rounds, 0),
  );
  assert.ok(state.carrierGuns.every((m) => m.rounds < 1800));
  enemies[0].alive = false;
  for (let i = 0; i < 700; i++) combat.update(x.s, units, fire, 1 / 120);
  const later = fire.drainEvents().filter((e) => e.type === 'gun' && e.sourceId === base.id);
  assert.ok(later.length > 0);
  assert.ok(later.every((e) => e.targetId === enemies[1].id));
  assert.ok(!combat.unit(friend).carrierGuns);
});

test('carrier engages bomber at logged 1800 m altitude and fighters above 900 m, but not targets beyond slant range', () => {
  const x = navalScenario(),
    base = x.targets.find((t) => t.home),
    bomber = x.targets.find((t) => t.type === 'bomber'),
    fighter = x.targets.find((t) => t.wave === 1 && t.type === 'fighter');
  bomber.position = new Vec3(0, 1800, 0);
  bomber.velocity = new Vec3();
  bomber.alive = true;
  fighter.position = new Vec3(400, 1000, 900);
  fighter.velocity = new Vec3();
  fighter.alive = true;
  const high = { ...fighter, id: 'HIGH-OUT-OF-RANGE', position: new Vec3(0, 6000, 500) };
  const combat = new EnemyCombat(),
    fire = new Weapons({ enemyFire: false });
  combat.activeTime = 10;
  for (let i = 0; i < 180; i++) combat.update(x.s, [base, bomber, fighter, high], fire, 1 / 120);
  const shots = fire.drainEvents().filter((e) => e.type === 'gun' && e.sourceId === base.id);
  assert.deepEqual(new Set(shots.map((e) => e.targetId)), new Set([bomber.id, fighter.id]));
  assert.deepEqual(new Set(shots.map((e) => e.turret)), new Set(['carrier-1', 'carrier-2']));
  assert.ok(combat.unit(base).rounds < 3600);
});

test('naval reinforcements and distant destroyer prevent a ship missile launch at the deck start', () => {
  const x = navalScenario(),
    ship = x.targets.find((t) => t.type === 'destroyer'),
    base = x.targets.find((t) => t.home),
    allies = x.targets.filter((t) => t.team === 'ally' && t.kind === 'air');
  assert.equal(allies.length, 3);
  assert.equal(allies.find((t) => t.radioCallSign.number === 4).aiRole, 'interceptor');
  for (const target of [base, x.s, ...allies])
    assert.ok(ship.position.distance(target.position) > weaponProfiles.seaSparrow.maxRange);
  const range = ship.position.length();
  assert.ok(range > 23000 && range < 24000);
  assert.ok((range - weaponProfiles.seaSparrow.maxRange) / ship.velocity.length() > 1400);
  const combat = new EnemyCombat(),
    fire = new Weapons({ enemyFire: false });
  combat.activeTime = 10;
  x.s.onGround = false;
  x.s.airborne = true;
  x.s.position = new Vec3(0, 1500, 0);
  x.s.agl = 1500;
  for (let i = 0; i < 6 * 120; i++) combat.update(x.s, [ship], fire, 1 / 120);
  assert.equal(fire.projectiles.filter((p) => p.sourceId === ship.id).length, 0);
});

test('carrier has exactly two defensive missiles with its own shorter range and finite stock', () => {
  const x = navalScenario(),
    base = x.targets.find((t) => t.home),
    bomber = x.targets.find((t) => t.type === 'bomber');
  bomber.alive = true;
  bomber.position = new Vec3(0, 1800, 4500);
  bomber.velocity = new Vec3(0, 0, -100);
  const combat = new EnemyCombat(),
    fire = new Weapons({ enemyFire: false }),
    u = combat.unit(base);
  assert.equal(u.missiles, 2);
  assert.equal(weaponProfiles.seaSparrow.maxRange, 9000);
  assert.equal(weaponProfiles.sam.maxRange, 24000);
  combat.activeTime = 10;
  for (let attempt = 0; attempt < 4; attempt++) {
    fire.projectiles = [];
    u.missile = 0;
    combat.update(x.s, [base, bomber], fire, 1 / 120);
  }
  const launches = fire
    .drainEvents()
    .filter((e) => e.type === 'missile-launch' && e.sourceId === 'BASE');
  assert.equal(launches.length, 2);
  assert.ok(launches.every((e) => e.profile === 'seaSparrow' && e.nominalRangeM === 9000));
  assert.equal(u.missiles, 0);
  const far = new EnemyCombat(),
    farFire = new Weapons({ enemyFire: false });
  far.activeTime = 10;
  bomber.position = new Vec3(0, 1800, 10000);
  far.unit(base).missile = 0;
  far.update(x.s, [base, bomber], farFire, 1 / 120);
  assert.equal(farFire.projectiles.filter((p) => p.type === 'aam').length, 0);
  assert.equal(far.unit(base).missiles, 2);
});

test('both ships use the same semi-active Sea Sparrow, which loses support when its launcher is destroyed', () => {
  assert.equal(enemyProfile({ type: 'carrier' }, 'aam'), weaponProfiles.seaSparrow);
  assert.equal(
    enemyProfile({ type: 'destroyer', kind: 'ground' }, 'aam'),
    weaponProfiles.seaSparrow,
  );
  assert.equal(enemyProfile({ type: 'sam-system', kind: 'ground' }, 'aam'), weaponProfiles.sam);
  assert.equal(weaponProfiles.seaSparrow.guidance, 'sarh');
  const x = navalScenario(),
    ship = x.targets.find((t) => t.type === 'destroyer'),
    target = {
      id: 'TEST',
      kind: 'air',
      position: ship.position.clone().add(new Vec3(0, 1000, 3500)),
      velocity: new Vec3(0, 0, -100),
      alive: true,
      team: 'ally',
      faction: 'west',
    },
    combat = new EnemyCombat(),
    w = new Weapons({ enemyFire: false });
  combat.activeTime = 10;
  for (let i = 0; i < 4 * 120; i++) combat.update(x.s, [ship, target], w, 1 / 120);
  const missile = w.projectiles.find((p) => p.sourceId === ship.id && p.type === 'aam');
  assert.ok(missile);
  assert.equal(missile.profile, weaponProfiles.seaSparrow);
  missile.age = 0.2;
  stepMissile(missile, target, null, 1 / 120);
  assert.equal(missile.seekerLost, true);
  assert.equal(missile.lossReason, 'TÁMOGATÁS MEGSZŰNT');
});
