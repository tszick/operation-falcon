import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWorld } from '../src/multiplayer/worldState.js';
import { createDefenseScene } from '../server/multiplayer-defense.mjs';
import { withTerrainSnapshot, terrainHeight } from '../src/terrain.js';

test('network terrain decoding preserves supported mission geometry and deterministic heights', () => {
  for (const seed of [1, 33, 123, 812, 49152]) {
    const world = createDefenseScene({ revision: 1, skySeed: seed }).world;
    const decoded = decodeWorld(JSON.parse(JSON.stringify(world)));
    assert.equal(decoded.surface, 'winter');
    assert.deepEqual(decoded.airfields, world.airfields);
    assert.deepEqual(decoded.weather, world.weather);
    assert.deepEqual(decoded.bridges, world.bridges);
    for (let i = 0; i < 30; i++) {
      const x = i * 700 - 9000,
        z = i * 1300 - 4000;
      assert.equal(
        withTerrainSnapshot(decoded, () => terrainHeight(x, z)),
        withTerrainSnapshot(world, () => terrainHeight(x, z)),
      );
    }
  }
});
test('network terrain admits typed fields only and rejects nonnumeric geometry and oversized lists', () => {
  const base = { revision: 1, skySeed: 3, peaks: [] };
  const decoded = decodeWorld({
    ...base,
    playerStart: { airfield: '<img src=x onerror=alert(1)>' },
    unknown: 'payload',
  });
  assert.equal(decoded.playerStart, undefined);
  assert.equal(decoded.unknown, undefined);
  for (const invalid of [
    { ...base, revision: '<script>' },
    { ...base, peaks: [{ x: '10' }] },
    { ...base, weather: { wind: { x: Infinity } } },
    { ...base, peaks: Array(129).fill({ x: 0 }) },
    { ...base, surface: '<svg onload=alert(1)>' },
  ])
    assert.throws(() => decodeWorld(invalid));
  assert.equal({}.polluted, undefined);
});
