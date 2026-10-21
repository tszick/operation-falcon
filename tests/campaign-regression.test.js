import test from 'node:test';
import assert from 'node:assert/strict';
import { missions, aircraft } from '../src/aircraftSpec.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { createTargets } from '../src/targeting.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { Vec3 } from '../src/math.js';
import { runCountermeasureProbe } from '../scripts/countermeasure-playtest.mjs';
test('a failed city or base objective after damage abort replaces stale 100-percent survival rows', () => {
  for (const id of ['defend-city', 'ballistic']) {
    const spec = aircraft.find((a) => a.id === 'f16'),
      scenario = missions.find((m) => m.id === id),
      s = createMissionAircraft(spec, scenario),
      targets = createTargets(scenario, spec, { rng: () => 0.5 }),
      m = new Mission(scenario),
      w = new Weapons();
    s.airborne = true;
    s.onGround = false;
    s.position = new Vec3(0, 2000, 0);
    s.agl = 2000;
    s.damage = 45;
    m.update(s, targets, w);
    assert.equal(m.aborted, true);
    if (id === 'defend-city')
      for (const t of targets.filter((t) => t.city).slice(0, 6)) t.alive = false;
    else {
      const base = targets.find((t) => t.home);
      base.alive = false;
      base.health = 0;
    }
    m.update(s, targets, w);
    assert.equal(m.failed, true);
    const row = m.objectives.find((o) => o.id === (id === 'defend-city' ? 'city' : 'base'));
    assert.equal(row.done, false);
    assert.equal(row.status, 'failed');
  }
});
test('decoys help without guaranteeing capture; radar beam maneuver improves the shared deterministic probe', () => {
  const straight = runCountermeasureProbe(),
    beam = runCountermeasureProbe({ beam: true }),
    ir = runCountermeasureProbe({ guidance: 'aim9m' });
  assert.ok(straight.diverted > 20 && straight.diverted < 90);
  assert.ok(beam.diverted > straight.diverted && beam.diverted < 100);
  assert.ok(ir.diverted > 20 && ir.diverted < 90);
});
