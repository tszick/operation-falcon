import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vec3 } from '../src/math.js';
import { replayBracket, replayRotation } from '../src/flightReplay.js';
import { weaponProfiles, stepBallistic } from '../src/weaponDynamics.js';
import { aircraftHit } from '../src/hitGeometry.js';
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/gun-path-audit.json', import.meta.url)),
);
const vec = (p) => new Vec3(p.x, p.y, p.z);
function targetAt(frames, time) {
  const f = replayBracket(frames, time),
    a = f.a.data,
    b = f.b.data;
  return {
    spec: { id: a.aircraftId },
    position: vec(a.position)
      .scale(1 - f.mix)
      .add(vec(b.position).scale(f.mix)),
    orientation: replayRotation(a.flight.orientation, b.flight.orientation, f.mix),
    condition: { parts: a.flight.parts },
  };
}
test('recorded close-range gun trajectories reproduce the confirmed hit and a shot missing the moving Su-27', () => {
  for (const shot of fixture.shots) {
    const { start, end } = shot,
      p = {
        profile: weaponProfiles[start.data.profile],
        position: vec(start.data.position),
        velocity: vec(start.data.velocity),
      };
    let hit = false;
    for (let time = start.t; time <= end + 1 / 120; time += 1 / 120) {
      const target = targetAt(shot.worlds, time),
        from = p.position.clone();
      stepBallistic(p, 1 / 120);
      p.position.add(p.velocity.clone().scale(1 / 120));
      if (p.position.distance(target.position) > 40) continue;
      target.previousPosition = targetAt(shot.worlds, time - 1 / 120).position;
      if (aircraftHit(target, from, p.position, { radius: 0.15 })) {
        hit = true;
        break;
      }
    }
    assert.equal(hit, shot.expectedHit, 'Projectile ' + start.data.id);
  }
});
