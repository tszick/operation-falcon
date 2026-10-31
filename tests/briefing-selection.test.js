import test from 'node:test';
import assert from 'node:assert/strict';
import { missions } from '../src/missionCatalog.js';
import { plannerAircraft } from '../src/plannerSelection.js';
import { missionLocations, missionLocation, mapPosition } from '../src/missionLocations.js';
import { missionSurface, surfaceStyles } from '../src/surfaceStyle.js';
import { suitability } from '../src/aircraftSpec.js';
import { missionForAircraft } from '../src/transportRole.js';

test('every mission has a valid map location and stable terrain; all textured biomes are represented', () => {
  assert.deepEqual(Object.keys(missionLocations).sort(), missions.map((m) => m.id).sort());
  const biomes = new Set();
  for (const mission of missions) {
    const location = missionLocation(mission),
      point = mapPosition(location);
    assert.ok(point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100);
    assert.ok(surfaceStyles[location.surface]);
    assert.equal(missionSurface(mission), location.surface);
    assert.equal(missionSurface({ ...mission }), location.surface);
    biomes.add(location.surface);
    for (const plane of plannerAircraft(mission))
      assert.equal(missionSurface(missionForAircraft(mission, plane)), location.surface);
  }
  assert.deepEqual(
    [...biomes].sort(),
    Object.keys(surfaceStyles)
      .filter((s) => s !== 'vector')
      .sort(),
  );
});

test('training stays in the USA with its required biome and a single Western trainer', () => {
  const expected = {
    landing: 'grass',
    civil: 'grass',
    canyon: 'desert',
    'practice-bombing': 'rocky',
  };
  for (const [id, biome] of Object.entries(expected)) {
    const mission = missions.find((m) => m.id === id),
      place = missionLocation(mission);
    assert.ok(place.lon < -70 && place.lon > -130 && place.lat > 25 && place.lat < 50);
    assert.equal(place.surface, biome);
    assert.deepEqual(
      plannerAircraft(mission).map((a) => a.id),
      ['t45'],
    );
  }
});

test('player briefing offers only usable Western aircraft, with recommended types first and naval restrictions intact', () => {
  const rank = { good: 0, ok: 1 };
  for (const mission of missions) {
    const choices = plannerAircraft(mission);
    assert.ok(choices.length > 0, mission.id);
    assert.equal(new Set(choices.map((a) => a.id)).size, choices.length);
    for (let i = 0; i < choices.length; i++) {
      const spec = choices[i];
      assert.equal(spec.faction, mission.side || 'west');
      assert.notEqual(suitability(spec, mission), 'bad');
      if (mission.naval) assert.ok(spec.carrierCapable);
      if (i)
        assert.ok(rank[suitability(choices[i - 1], mission)] <= rank[suitability(spec, mission)]);
    }
  }
  const escort = missions.find((m) => m.id === 'escort-transport');
  assert.ok(plannerAircraft(escort).some((a) => a.transport));
});
