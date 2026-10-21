import test from 'node:test';
import assert from 'node:assert/strict';
import { aircraft, hangarGroups } from '../src/aircraftSpec.js';
import { airframes, aircraftMesh } from '../src/airframes.js';
import { armament, loadedStations } from '../src/armament.js';
import { createAircraft } from '../src/physics.js';
import { enemyAircraft } from '../src/enemies.js';
import { storesMarkup } from '../src/storesDisplay.js';
test('hangar has the requested five groups and every aircraft belongs to exactly one', () => {
  assert.deepEqual(
    hangarGroups.map((g) => g.id),
    ['nato-classic', 'nato-modern', 'soviet', 'russia-modern', 'china-modern'],
  );
  assert.deepEqual(
    hangarGroups.map((g) => aircraft.filter((a) => a.group === g.id).length),
    [11, 5, 8, 2, 2],
  );
  assert.equal(new Set(aircraft.map((a) => a.id)).size, 28);
  assert.ok(aircraft.every((a) => hangarGroups.some((g) => g.id === a.group)));
  for (const group of hangarGroups) {
    const faction = group.id.startsWith('nato')
      ? 'west'
      : group.id.startsWith('china')
        ? 'china'
        : 'east';
    assert.ok(aircraft.filter((a) => a.group === group.id).every((a) => a.faction === faction));
  }
});
test('modern aircraft have distinctive layout, correct engine counts and tailored handling', () => {
  assert.equal(airframes.f22.engines, 2);
  assert.equal(airframes.f22.nozzle, 'flat');
  assert.equal(airframes.f35.engines, 1);
  assert.equal(airframes.su35.canard, undefined);
  assert.equal(airframes.su57.fins, 2);
  assert.ok(airframes.j10.canard);
  assert.ok(airframes.j20.canard);
  assert.equal(airframes.j20.tail, undefined);
  for (const id of ['f22', 'f35', 'su35', 'su57', 'j10', 'j20']) {
    const s = aircraft.find((a) => a.id === id);
    assert.ok(s.thrust < s.abThrust);
    assert.ok(s.emptyMass > 9000 && s.fuelCapacity > 4000);
    assert.equal(aircraftMesh(id).id, id);
    assert.ok(armament(s).weapons.aam);
    assert.doesNotMatch(storesMarkup(createAircraft(s), 'aam'), /NaN|undefined/);
  }
});
test('stealth air presets are carried inside and J-20 receives no conjectural cannon', () => {
  for (const id of ['f22', 'f35', 'su57', 'j20']) {
    const s = createAircraft(aircraft.find((a) => a.id === id));
    assert.ok(loadedStations(s).every((station) => station.internal));
    assert.match(storesMarkup(s, 'aam'), /belső fegyvertér/);
  }
  assert.equal(createAircraft(aircraft.find((a) => a.id === 'j20')).ammo.gun, 0);
});
test('modern fighter missions use modern opponents and Chinese targets retain their own faction', () => {
  const m = { id: 'fighter' };
  for (const id of ['f22', 'f35', 'su35', 'su57', 'j10', 'j20']) {
    const player = aircraft.find((a) => a.id === id),
      enemy = enemyAircraft(m, player),
      spec = aircraft.find((a) => a.id === enemy.id);
    assert.ok(spec);
    assert.notEqual(spec.faction, player.faction);
    assert.equal(enemy.faction, spec.faction);
    assert.ok(spec.group.endsWith('modern'));
  }
  assert.equal(
    enemyAircraft(
      m,
      aircraft.find((a) => a.id === 'f35'),
    ).faction,
    'china',
  );
});
