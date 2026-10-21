import test from 'node:test';
import assert from 'node:assert/strict';
import { navalScenario } from './navalScenarios.js';
import { Weapons } from '../src/weapons.js';
import { EnemyCombat } from '../src/enemyCombat.js';
import { Vec3 } from '../src/math.js';
import { weaponProfiles } from '../src/weaponDynamics.js';
import { launchSeaRam, seaRamThreat, interceptionPoint } from '../src/navalInterception.js';
function incoming(
  w,
  ship,
  { id, owner = 'enemy', offset = new Vec3(0, 80, 1800), velocity = new Vec3(0, 0, -300) } = {},
) {
  const position = ship.position.clone().add(offset),
    p = {
      id: id ?? ++w.sequence,
      type: 'agm',
      owner,
      sourceId: 'ATTACKER',
      targetEntityId: ship.id,
      profile: weaponProfiles.maverick,
      position,
      previous: position.clone(),
      velocity,
      age: 0,
      travelled: 0,
      damage: 100,
      trailTimer: 0,
      trailAnchor: position.clone(),
    };
  w.projectiles.push(p);
  return p;
}
test('SeaRAM flies a real intercept and removes the incoming missile before ship impact, for both sides and array orders', () => {
  for (const enemy of [false, true])
    for (const reverse of [false, true]) {
      const x = navalScenario(),
        ship = x.targets.find((t) => t.type === (enemy ? 'destroyer' : 'carrier')),
        w = new Weapons({ enemyFire: false }),
        state = {};
      const threat = incoming(w, ship, { owner: enemy ? 'player' : 'enemy' });
      assert.ok(seaRamThreat(ship, threat));
      launchSeaRam(ship, x.s, [ship], w, state, 1 / 120);
      assert.equal(state.ramRounds, 1);
      assert.equal(w.projectiles.filter((p) => p.interceptor).length, 1);
      if (reverse) w.projectiles.reverse();
      for (let i = 0; i < 8 * 120 && w.projectiles.some((p) => p.id === threat.id); i++)
        w.update(x.s, [ship], 1 / 120);
      const events = w.drainEvents();
      assert.ok(
        events.some((e) => e.type === 'missile-intercept'),
        JSON.stringify(events.filter((e) => e.type === 'interceptor-end')),
      );
      assert.equal(ship.health, ship.maxHealth);
      assert.ok(!w.projectiles.some((p) => p.id === threat.id));
      assert.equal(w.hits, 0);
      assert.equal(w.alliedKills || 0, 0);
      assert.equal(x.s.incomingMissiles, 0);
    }
});
test('SeaRAM ignores friendly, receding, bomb, aircraft and other-unit missiles, and spends at most two rounds', () => {
  const x = navalScenario(),
    ship = x.targets.find((t) => t.home),
    w = new Weapons({ enemyFire: false }),
    state = {};
  const good = incoming(w, ship);
  assert.equal(seaRamThreat(ship, { ...good, owner: 'ally' }), false);
  assert.equal(seaRamThreat(ship, { ...good, type: 'bomb' }), false);
  assert.equal(seaRamThreat(ship, { ...good, velocity: new Vec3(0, 0, 300) }), false);
  assert.equal(seaRamThreat(ship, { ...good, targetEntityId: 'ALLY-FIGHTER1' }), false);
  const far = { ...good, id: 900, position: new Vec3(0, 80, 10000) };
  w.projectiles = [far];
  launchSeaRam(ship, x.s, [ship], w, state, 1 / 120);
  assert.equal(state.ramRounds, 2);
  for (let i = 0; i < 3; i++) {
    w.projectiles = [];
    incoming(w, ship);
    state.ramCooldown = 0;
    launchSeaRam(ship, x.s, [ship], w, state, 1 / 120);
  }
  assert.equal(state.ramRounds, 0);
  assert.equal(w.drainEvents().filter((e) => e.type === 'interceptor-launch').length, 2);
});
test('shared SeaRAM fire discipline does not spend both ships interceptors on the same threat', () => {
  const x = navalScenario(),
    base = x.targets.find((t) => t.home),
    other = { ...base, id: 'SECOND', position: new Vec3(100, 0, 0) },
    w = new Weapons({ enemyFire: false }),
    a = {},
    b = {};
  incoming(w, base);
  launchSeaRam(base, x.s, [base, other], w, a, 1 / 120);
  const threat = w.projectiles.find((p) => !p.interceptor);
  threat.targetEntityId = 'SECOND';
  launchSeaRam(other, x.s, [base, other], w, b, 1 / 120);
  assert.equal(w.projectiles.filter((p) => p.interceptor).length, 1);
  assert.equal(b.ramRounds, 2);
});
test('proximity fuse uses relative swept motion, requires arming and can miss', () => {
  const threat = { position: new Vec3(0, 0, 10) },
    p = {
      previous: new Vec3(0, 0, -10),
      position: new Vec3(0, 0, 10),
      armed: true,
      profile: weaponProfiles.ram,
    };
  assert.ok(interceptionPoint(p, threat, new Vec3(0, 0, -10)));
  p.armed = false;
  assert.equal(interceptionPoint(p, threat, new Vec3(0, 0, -10)), null);
  p.armed = true;
  p.previous.x = 20;
  p.position.x = 20;
  assert.equal(interceptionPoint(p, threat, new Vec3(0, 0, -10)), null);
});
test('destroyed ships cannot launch new SeaRAM through normal combat update', () => {
  const x = navalScenario(),
    ship = x.targets.find((t) => t.home),
    w = new Weapons({ enemyFire: false }),
    c = new EnemyCombat();
  incoming(w, ship);
  ship.alive = false;
  c.activeTime = 10;
  c.update(x.s, [ship], w, 1 / 120);
  assert.equal(w.projectiles.filter((p) => p.interceptor).length, 0);
});

test('automatic live-combat SeaRAM protects a ship, while a point-blank attack can still hit it', () => {
  for (const close of [false, true]) {
    const x = navalScenario(),
      ship = x.targets.find((t) => t.home),
      w = new Weapons({ enemyFire: true });
    w.enemyCombat.activeTime = 10;
    const p = incoming(w, ship, {
      offset: new Vec3(0, close ? 10 : 80, close ? 220 : 1800),
      velocity: new Vec3(0, 0, close ? -600 : -300),
    });
    if (close) {
      p.age = 2;
      p.travelled = 1200;
    }
    for (let i = 0; i < 8 * 120 && w.projectiles.some((q) => q.id === p.id); i++)
      w.update(x.s, [ship], 1 / 120);
    const events = w.drainEvents();
    if (close) {
      assert.ok(ship.health < ship.maxHealth);
      assert.ok(!events.some((e) => e.type === 'missile-intercept'));
    } else {
      assert.equal(ship.health, ship.maxHealth);
      assert.ok(events.some((e) => e.type === 'interceptor-launch'));
      assert.ok(events.some((e) => e.type === 'missile-intercept'));
      assert.equal(w.enemyCombat.unit(ship).ramRounds, 1);
    }
  }
});
