import test from 'node:test';
import assert from 'node:assert/strict';
import { configureBattlefieldObserver } from './helpers/battlefield-observer.js';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { missionForSide } from '../src/missionSides.js';
import { createTargets } from '../src/targeting.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { updateBattlefieldRuntime } from '../src/battlefieldScenario.js';
import { EnemyCombat } from '../src/enemyCombat.js';
for (const side of ['west', 'east'])
  test('observer restores the ordinary human seat and releases real waves: ' + side, () => {
    const plane = aircraft.find((a) => a.id === (side === 'west' ? 'fa18' : 'su27')),
      spec = missionForSide(
        missions.find((m) => m.id === 'taiwan-invasion'),
        side,
      ),
      targets = createTargets(spec, plane, { rng: () => 0.4 }),
      s = createMissionAircraft(plane, spec);
    const id = configureBattlefieldObserver(plane, targets, s);
    assert.equal(targets.filter((t) => t.kind === 'air').length, 48);
    assert.equal(targets.filter((t) => t.kind === 'air' && t.alive).length, 24);
    assert.equal(targets.find((t) => t.id === id).health, 100);
    assert.equal(s.onGround, true);
    assert.equal(s.airborne, false);
    assert.equal(s.radioCallSign, null);
    const ai = new EnemyCombat();
    for (const t of targets.filter((t) => t.alive))
      assert.notEqual(ai.chooseTarget(t, s, targets), s);
    const m = { spec },
      events = [],
      w = { emit: (e) => events.push(e) };
    for (const [time, wave, pending] of [
      [179, 1, 24],
      [180, 2, 12],
      [359, 2, 12],
      [360, 3, 0],
    ]) {
      s.elapsed = time;
      updateBattlefieldRuntime(s, m, targets, w);
      assert.equal(m.wave, wave);
      assert.equal(targets.filter((t) => t.pending).length, pending);
    }
    assert.deepEqual(
      events.map((e) => e.wave),
      [2, 3],
    );
    assert.throws(() => configureBattlefieldObserver(plane, targets, s), /already exists/);
  });
