import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { missions, aircraft, transportAircraft } from '../src/aircraftSpec.js';
import { trainingAircraft } from '../src/trainingAircraft.js';
import { catalogueAircraft, cataloguePages } from '../src/aircraftCatalog.js';
import { aircraftNations, aircraftSide, nations } from '../src/aircraftNations.js';
import { plannerAircraft } from '../src/plannerSelection.js';
import { missionForSide, canChooseSide } from '../src/missionSides.js';

test('catalogue retains every eligible aircraft for its own coalition mission, without duplicates', () => {
  for (const mission of missions) {
    const choices = catalogueAircraft(mission);
    assert.ok(choices.length);
    assert.equal(new Set(choices.map((a) => a.id)).size, choices.length);
    const expected = ['west', ...(canChooseSide(mission) ? ['east'] : [])]
      .flatMap((side) => plannerAircraft(missionForSide(mission, side)))
      .map((a) => a.id)
      .sort();
    assert.deepEqual(choices.map((a) => a.id).sort(), expected, mission.id);
    for (const spec of choices)
      assert.ok(plannerAircraft(missionForSide(mission, aircraftSide(spec))).includes(spec));
  }
});
test('three-card pages preserve coalition boundaries, order and incomplete final pages', () => {
  for (const mission of missions) {
    const choices = catalogueAircraft(mission),
      pages = cataloguePages(choices);
    assert.equal(pages[0].side, mission.side || 'west');
    assert.deepEqual(
      pages.flatMap((p) => p.aircraft).map((a) => a.id),
      choices.map((a) => a.id),
    );
    for (const page of pages) {
      assert.ok(page.aircraft.length > 0 && page.aircraft.length <= 3);
      assert.ok(page.aircraft.every((a) => aircraftSide(a) === page.side));
    }
    if (!canChooseSide(mission)) {
      assert.equal(pages.length, 1);
      if (mission.objective === 'flight-test') {
        assert.equal(choices.length, 3);
        assert.ok(choices.every((a) => a.experimentalOnly && a.faction === mission.side));
      } else assert.equal(pages[0].aircraft[0].id, 't45');
      continue;
    }
    const ranks = { soviet: 0, 'russia-modern': 1, 'china-modern': 2 };
    const groups = pages
      .filter((p) => p.side === 'east')
      .flatMap((p) => p.aircraft)
      .map((a) => ranks[a.group]);
    assert.deepEqual(
      groups,
      [...groups].sort((a, b) => a - b),
    );
    for (const side of ['west', 'east']) {
      const count = choices.filter((a) => aircraftSide(a) === side).length;
      assert.equal(pages.filter((p) => p.side === side).length, Math.ceil(count / 3));
    }
  }
});

test('nationality flags cover selectable aircraft, transports and trainer with local assets', () => {
  for (const spec of [...aircraft, ...transportAircraft, trainingAircraft]) {
    const origins = aircraftNations(spec);
    assert.ok(origins.length);
    for (const id of origins) {
      assert.ok(nations[id], spec.id);
      assert.ok(existsSync(new URL(`../assets/flags/${id}.svg`, import.meta.url)));
    }
  }
  assert.deepEqual(aircraftNations(aircraft.find((a) => a.id === 'mig29')), ['su']);
  assert.deepEqual(aircraftNations(aircraft.find((a) => a.id === 'su35')), ['ru']);
  assert.deepEqual(aircraftNations(aircraft.find((a) => a.id === 'j20')), ['cn']);
  assert.deepEqual(aircraftNations(aircraft.find((a) => a.id === 'euro')), [
    'uk',
    'de',
    'it',
    'es',
  ]);
});
test('choosing an Eastern naval aircraft selects airborne carrier attack rather than deck defence', () => {
  const base = missions.find((m) => m.id === 'carrier-defense');
  const east = catalogueAircraft(base).find((a) => a.faction !== 'west');
  const effective = missionForSide(base, aircraftSide(east));
  assert.equal(effective.mirrored, true);
  assert.equal(effective.airStart, true);
  assert.equal(effective.recoveryMode, 'egress');
  const west = catalogueAircraft(base).find((a) => a.faction === 'west');
  assert.equal(missionForSide(base, aircraftSide(west)).mirrored, false);
});

test('six-card layout preserves every aircraft and coalition on tall desktop screens', () => {
  for (const mission of missions) {
    const choices = catalogueAircraft(mission),
      pages = cataloguePages(choices, 6);
    assert.deepEqual(
      pages.flatMap((p) => p.aircraft),
      choices,
    );
    for (const page of pages) {
      assert.ok(page.aircraft.length > 0 && page.aircraft.length <= 6);
      assert.ok(page.aircraft.every((a) => aircraftSide(a) === page.side));
    }
  }
});
