import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft } from '../src/aircraftSpec.js';
import { createAircraft, stepAircraft, mass } from '../src/physics.js';
import { atmosphere } from '../src/atmosphere.js';
import { Vec3, Quat, DEG } from '../src/math.js';
function turn(id, speed, bank, assist = true, dt = 1 / 120) {
  const s = createAircraft(aircraft.find((a) => a.id === id));
  Object.assign(s, {
    position: new Vec3(0, 4000, 0),
    velocity: new Vec3(0, 0, speed),
    onGround: false,
    airborne: true,
    gear: false,
    flaps: false,
    flapPosition: 0,
    throttle: 0.8,
    engineSpool: 0.8,
    assist,
  });
  const cl = (mass(s) * 9.81) / (0.5 * atmosphere(4000).density * speed ** 2 * s.spec.wingArea);
  s.orientation = Quat.euler(0, (cl - (s.spec.liftZero ?? 0.22)) / s.spec.clSlope, bank * DEG);
  let peak = 0,
    early = 0;
  for (let i = 0; i < 12 / dt && !s.crashed; i++) {
    stepAircraft(s, { pitch: 1 }, dt);
    peak = Math.max(peak, s.g);
    if ((i + 1) * dt <= 0.25) early = s.g;
  }
  return { s, peak, early };
}
test('held full pull in steep fighter turns respects aerodynamic G limits at different speeds', () => {
  for (const id of ['f16', 'f14', 'mig29', 'j20'])
    for (const speed of [220, 300])
      for (const bank of [45, 70, 90]) {
        const { s, peak, early } = turn(id, speed, bank);
        assert.equal(s.damage, 0, `${id} ${speed} ${bank}: ${peak} G`);
        assert.ok(peak <= s.spec.maxG, `${id}: ${peak}`);
        assert.ok(early < s.spec.maxG * 0.8, 'digital input builds load progressively');
        assert.equal(s.crashed, false);
      }
});
test('bomber uses its lower structural limit instead of fighter G capability', () => {
  const { s, peak } = turn('b52', 250, 70);
  assert.equal(s.damage, 0);
  assert.ok(peak <= s.spec.maxG);
});
test('disabling assistance retains the possibility of genuine overload damage', () => {
  const { s, peak } = turn('f14', 300, 70, false);
  assert.ok(peak > s.spec.maxG);
  assert.ok(s.damage > 0);
});
test('load limiting remains effective at 60 Hz as well as 120 Hz', () => {
  const a = turn('f16', 300, 70),
    b = turn('f16', 300, 70, true, 1 / 60);
  assert.equal(b.s.damage, 0);
  assert.ok(Math.abs(a.peak - b.peak) < 0.15);
});
