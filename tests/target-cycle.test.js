import test from 'node:test';
import assert from 'node:assert/strict';
import { Targeting } from '../src/targeting.js';
import { aircraft } from '../src/aircraftSpec.js';
import { createAircraft } from '../src/physics.js';
import { Vec3, Quat, DEG } from '../src/math.js';
function player() {
  const s = createAircraft(aircraft.find((a) => a.id === 'f16'));
  Object.assign(s, {
    position: new Vec3(0, 2000, 0),
    orientation: new Quat(),
    airborne: true,
    onGround: false,
    agl: 2000,
  });
  return s;
}
function contact(
  id,
  angle,
  distance,
  { group = 'A', kind = 'air', team = 'enemy', ...extra } = {},
) {
  return {
    id,
    kind,
    team,
    alive: true,
    position: new Vec3(Math.sin(angle * DEG) * distance, 2000, Math.cos(angle * DEG) * distance),
    velocity: new Vec3(),
    radioCallSign: kind === 'air' ? { flight: group, number: 1 } : undefined,
    ...extra,
  };
}
test('first selection follows the reticle rather than the nearest enemy in the radar cone', () => {
  const s = player(),
    aim = new Targeting(),
    units = [contact('NEAR', 16, 2000), contact('AIMED', 0.2, 12000)];
  assert.equal(aim.cycle(s, units), 'AIMED');
});
test('contacts clustered around the reticle use range as the tie breaker', () => {
  const s = player(),
    aim = new Targeting(),
    units = [contact('CENTRE', 0, 12000), contact('NEAR', 1, 4000), contact('OUTSIDE', 4, 1000)];
  assert.equal(aim.cycle(s, units), 'NEAR');
});
test('cycling finishes the selected squad, then other squads, then ground targets, by live range', () => {
  const s = player(),
    aim = new Targeting(),
    units = [
      contact('A1', 0, 12000),
      contact('A2', 8, 7000),
      contact('A3', 10, 4000),
      contact('B1', -8, 2000, { group: 'B' }),
      contact('B2', -10, 9000, { group: 'B' }),
      contact('C1', 15, 5000, { group: 'C' }),
      contact('G1', 0, 3000, { kind: 'ground' }),
      contact('G2', 0, 1000, { kind: 'ground' }),
    ];
  // Keep ground objects off the reticle: first selection may otherwise legitimately be ground.
  units.filter((t) => t.kind === 'ground').forEach((t) => (t.position.x = 500));
  const expected = ['A1', 'A3', 'A2', 'B1', 'B2', 'C1', 'G2', 'G1'];
  assert.deepEqual(
    expected.map(() => aim.cycle(s, units)),
    expected,
  );
  assert.equal(aim.cycle(s, units), 'A1');
});
test('range order is recomputed during the same squad traversal and dead contacts are skipped', () => {
  const s = player(),
    aim = new Targeting(),
    a = contact('A', 0, 8000),
    b = contact('B', 8, 4000),
    c = contact('C', 10, 6000),
    d = contact('D', 12, 7000),
    units = [a, b, c, d];
  assert.equal(aim.cycle(s, units), 'A');
  c.position = contact('C', 10, 2000).position;
  assert.equal(aim.cycle(s, units), 'C');
  b.alive = false;
  assert.equal(aim.cycle(s, units), 'D');
  assert.equal(aim.cycle(s, units), 'A');
});
test('deliberately aiming at a new enemy starts a new cycle from that enemy', () => {
  const s = player(),
    aim = new Targeting(),
    units = [
      contact('A', 0, 8000),
      contact('A2', 10, 2000),
      contact('B', 20, 6000, { group: 'B' }),
      contact('B2', 24, 3000, { group: 'B' }),
    ];
  assert.equal(aim.cycle(s, units), 'A');
  s.orientation = Quat.euler(20 * DEG, 0, 0);
  assert.equal(aim.cycle(s, units), 'B');
  assert.equal(aim.cycle(s, units), 'B2');
});
test('ground targets remain freely selectable first and friendlies/out-of-radar targets are excluded', () => {
  const s = player(),
    aim = new Targeting(),
    units = [
      contact('ALLY', 0, 1000, { team: 'ally' }),
      contact('GROUND', 0, 4000, { kind: 'ground' }),
      contact('AIR', 10, 8000),
      contact('BEHIND', 180, 100),
      contact('FAR', 0, s.spec.radarRange * 2),
    ];
  assert.equal(aim.cycle(s, units), 'GROUND');
  assert.equal(aim.cycle(s, units), 'AIR');
  assert.equal(aim.cycle(s, units), 'GROUND');
});
test('numeric squad identifiers work without radio callsigns and new contacts join the live traversal', () => {
  const s = player(),
    aim = new Targeting(),
    units = [
      contact('A', 0, 9000, { radioCallSign: null, squad: 1 }),
      contact('B', 8, 2000, { radioCallSign: null, squad: 2 }),
    ];
  assert.equal(aim.cycle(s, units), 'A');
  units.push(contact('A2', 10, 6000, { radioCallSign: null, squad: 1 }));
  assert.equal(aim.cycle(s, units), 'A2');
  assert.equal(aim.cycle(s, units), 'B');
});
test('an empty radar clears the cycle and reselecting one contact preserves its lock', () => {
  const s = player(),
    aim = new Targeting(),
    units = [contact('A', 0, 4000)];
  aim.cycle(s, units);
  aim.update(s, units, 3);
  assert.equal(aim.locked, true);
  aim.cycle(s, units);
  assert.equal(aim.locked, true);
  assert.equal(aim.cycle(s, []), null);
  assert.equal(aim.locked, false);
  assert.equal(aim.cycle(s, units), 'A');
  assert.equal(aim.progress, 0);
});
