import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { aircraft, experimentalAircraft, trainingAircraft } from '../src/aircraftSpec.js';
import { aiAircraft } from '../src/aiAircraftSpec.js';
import { createAircraft, stepAircraft } from '../src/physics.js';
import { Vec3, Quat, DEG } from '../src/math.js';
import { atmosphere, mass, massBreakdown } from '../src/performance.js';
import { createDamage } from '../src/damage.js';
const catalogue = new Map(
  [...aiAircraft, ...experimentalAircraft, trainingAircraft, ...aircraft].map((s) => [s.id, s]),
);
const results = [];
for (const spec of catalogue.values())
  for (const bank of [-75, -45, 45, 75]) {
    const s = createAircraft(spec, { ammo: { gun: 0, aam: 0, agm: 0, bomb: 0, tailGun: 0 } });
    s.fuel *= 0.5;
    const height = 3000,
      air = atmosphere(height),
      speed = Math.min(240, spec.maxMach * 0.65 * air.soundSpeed),
      q = 0.5 * air.density * speed * speed,
      alpha = ((mass(s) * 9.81) / (q * spec.wingArea) - (spec.liftZero ?? 0.22)) / spec.clSlope;
    Object.assign(s, {
      position: new Vec3(0, height, 0),
      velocity: new Vec3(0, 0, speed),
      orientation: Quat.euler(0, alpha, bank * DEG),
      onGround: false,
      airborne: true,
      gear: false,
      flaps: false,
      flapPosition: 0,
      throttle: 0.7,
      engineSpool: 0.7,
      condition: createDamage(42),
    });
    let maxG = -Infinity,
      minG = Infinity;
    for (let i = 0; i < 720 && !s.crashed; i++) {
      stepAircraft(s, { pitch: 0.7 });
      maxG = Math.max(maxG, s.g);
      minG = Math.min(minG, s.g);
      for (const value of [
        ...Object.values(s.position),
        ...Object.values(s.velocity),
        ...Object.values(s.orientation),
        s.g,
        s.ias,
        s.fuel,
      ])
        assert.ok(Number.isFinite(value), spec.id);
      assert.equal(mass(s), massBreakdown(s).totalKg);
    }
    results.push({
      aircraft: spec.id,
      bank,
      seconds: s.elapsed,
      maxG,
      minG,
      damage: s.damage,
      crashed: s.crashed,
      stalled: s.stalled,
      height: s.position.y,
      iasKmh: s.ias * 3.6,
    });
  }
const states = aircraft.map((spec) => {
  const s = createAircraft(spec);
  s.fuel *= 0.5;
  return s;
});
function timing(fn) {
  let sum = 0;
  const start = performance.now();
  for (let i = 0; i < 100000; i++) sum += fn(states[i % states.length]);
  return { ms: performance.now() - start, checksum: sum };
}
for (let i = 0; i < 10000; i++) {
  mass(states[i % states.length]);
  massBreakdown(states[i % states.length]);
}
const direct = timing(mass),
  detailed = timing((s) => massBreakdown(s).totalKg);
assert.equal(direct.checksum, detailed.checksum);
const report = {
  aircraftTypes: catalogue.size,
  cases: results.length,
  physicsHz: 120,
  secondsPerCase: 6,
  finiteStates: true,
  massEquality: true,
  directMass100kMs: direct.ms,
  detailedMass100kMs: detailed.ms,
  results,
  note: 'Silent deterministic core-physics audit. Six-second held-pull manoeuvres from 45/75 degree banks, half fuel and empty stores. This checks numerical stability and records envelope behaviour; it is not a certified aircraft performance model or an FPS measurement.',
};
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    ...report,
    results: undefined,
    damagedCases: results.filter((r) => r.damage > 0),
    crashedCases: results.filter((r) => r.crashed),
  }),
);
