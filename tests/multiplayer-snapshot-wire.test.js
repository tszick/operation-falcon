import test from 'node:test';
import assert from 'node:assert/strict';
import { packProjectile } from '../src/multiplayer/combatState.js';
import { expandSnapshot } from '../src/multiplayer/snapshotWire.js';
import { weaponProfiles } from '../src/weaponDynamics.js';
import { PROJECTILE_LIMIT } from '../src/multiplayer/protocol.js';
const shot = (id = 1) => ({
  id,
  type: 'aam',
  profile: weaponProfiles.aim9m,
  sourceId: 'Falcon',
  owner: 'ally',
  targetEntityId: 'HOSTILE',
  position: { x: 123.1234567890123, y: 3456.123456789, z: -5678.123456789 },
  velocity: { x: -12.123456789, y: 67.123456789, z: 987.123456789 },
  age: 1.123456789,
  armed: true,
  seekerLost: false,
});
const packet = (projectiles) => ({
  type: 'snapshot',
  round: 1,
  tick: 60,
  time: 0.5,
  combat: {
    projectileFormat: 1,
    projectiles,
    targets: [],
    events: [{ id: 1, type: 'explosion' }],
    eventSequence: 1,
  },
});
test('compact projectile tuples restore exactly the same wire values without rounding or changing snapshots', () => {
  for (const type of ['gun', 'aam', 'agm', 'bomb']) {
    const p = { ...shot(), type },
      compact = packet([packProjectile(p, { compact: true })]),
      before = structuredClone(compact);
    const restored = expandSnapshot(JSON.parse(JSON.stringify(compact)));
    assert.deepEqual(restored.combat.projectiles[0], JSON.parse(JSON.stringify(packProjectile(p))));
    assert.deepEqual(restored.combat.events, compact.combat.events);
    assert.deepEqual(compact, before);
    restored.combat.projectiles[0].position.x = 0;
    assert.notEqual(compact.combat.projectiles[0][6], 0);
  }
  const p = shot();
  delete p.sourceId;
  delete p.owner;
  delete p.targetEntityId;
  assert.deepEqual(
    expandSnapshot(packet([packProjectile(p, { compact: true })])).combat.projectiles[0],
    JSON.parse(JSON.stringify(packProjectile(p))),
  );
});
test('ordinary welcome and full snapshots are already decoded, and empty compact frames remain empty', () => {
  const full = { type: 'welcome', combat: { projectiles: [packProjectile(shot())] } };
  assert.equal(expandSnapshot(full), full);
  assert.deepEqual(expandSnapshot(packet([])).combat.projectiles, []);
  assert.equal(expandSnapshot(null), null);
});
test('projectile decoder bounds lists and rejects malformed formats, nonfinite vectors and unknown profiles', () => {
  const valid = packProjectile(shot(), { compact: true });
  const bad = [valid.slice(1), { id: 1 }, [...valid, 0]];
  for (const [index, value] of [
    [0, 1.5],
    [1, 'drone'],
    [2, '__proto__'],
    [3, {}],
    [6, Infinity],
    [7, '7'],
    [12, NaN],
    [13, 1],
    [14, null],
  ]) {
    const p = [...valid];
    p[index] = value;
    bad.push(p);
  }
  for (const p of bad) assert.throws(() => expandSnapshot(packet([p])));
  assert.throws(() =>
    expandSnapshot({ ...packet([]), combat: { projectileFormat: 2, projectiles: [] } }),
  );
  assert.throws(() => expandSnapshot(packet(Array(PROJECTILE_LIMIT + 1).fill(valid))));
});
test('bounded peak projectile packets are smaller than named object packets while preserving every shot', () => {
  const projectiles = Array.from({ length: PROJECTILE_LIMIT }, (_, i) => shot(i));
  const full = { combat: { projectiles: projectiles.map((p) => packProjectile(p)) } },
    compact = packet(projectiles.map((p) => packProjectile(p, { compact: true })));
  assert.ok(
    Buffer.byteLength(JSON.stringify(compact)) < Buffer.byteLength(JSON.stringify(full)) * 0.8,
  );
  assert.deepEqual(
    expandSnapshot(JSON.parse(JSON.stringify(compact))).combat.projectiles,
    JSON.parse(JSON.stringify(full)).combat.projectiles,
  );
});

test('airburst flak without a missile or gun profile is transmitted and expanded normally', () => {
  const p = { ...shot(), type: 'flak', profile: null };
  const full = JSON.parse(JSON.stringify(packProjectile(p)));
  const decoded = expandSnapshot(packet([packProjectile(p, { compact: true })]));
  assert.deepEqual(decoded.combat.projectiles[0], full);
  assert.equal(decoded.combat.projectiles[0].profile, undefined);
});
