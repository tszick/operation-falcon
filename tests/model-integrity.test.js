import test from 'node:test';
import assert from 'node:assert/strict';
import { airframes, aircraftMesh } from '../src/airframes.js';
import { groundMesh } from '../src/groundModels.js';
import { meshBuffers } from '../src/rendering/shared/meshData.js';

const groundTypes = [
  'carrier',
  'destroyer',
  'city-building',
  'ballistic-silo',
  'ballistic',
  'mobile-sam',
  'mobile-jammer',
  'drone-command',
  'attack-drone',
  'convoy',
  'truck',
  'bunker',
  'jammer',
  'sam-system',
  'sam',
  'bridge',
  'airbase',
  'target-range',
];
const crossXZ = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

test('every aircraft wing fan covers its outline exactly, including concave planforms and deployed flaps', () => {
  for (const id of Object.keys(airframes))
    for (const sweep of [0, 1])
      for (const flaps of [0, 1]) {
        const mesh = aircraftMesh(id, sweep, flaps);
        for (let i = 0; i < mesh.faces.length; i++) {
          if (!['leftWing', 'rightWing'].includes(mesh.faceParts[i])) continue;
          const points = mesh.faces[i].map((index) => mesh.points[index]);
          const outline = Math.abs(
            points.reduce((sum, a, j) => {
              const b = points[(j + 1) % points.length];
              return sum + a.x * b.z - a.z * b.x;
            }, 0),
          );
          let triangles = 0;
          for (let j = 1; j < points.length - 1; j++)
            triangles += Math.abs(crossXZ(points[0], points[j], points[j + 1]));
          assert.ok(
            Math.abs(triangles - outline) < 1e-6,
            `${id} sweep=${sweep} flaps=${flaps} face=${i}: ${triangles} vs ${outline}`,
          );
        }
      }
});

test('all aircraft and ground models upload only finite, nonzero-area surface triangles', () => {
  const models = [
    ...Object.keys(airframes).map((id) => [id, aircraftMesh(id)]),
    ...groundTypes.map((id) => [id, groundMesh(id)]),
  ];
  for (const [id, mesh] of models) {
    const buffers = meshBuffers(mesh);
    assert.ok(
      mesh.points.every((p) => [p.x, p.y, p.z].every(Number.isFinite)),
      id,
    );
    for (let i = 0; i < buffers.triangles.length; i += 3) {
      const [a, b, c] = [...buffers.triangles.slice(i, i + 3)].map((index) => mesh.points[index]);
      assert.ok(a && b && c, `${id} indices`);
      assert.ok(
        b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-9,
        `${id}: collapsed triangle ${i / 3}`,
      );
    }
  }
});

test('suspended jet nacelles have solid supports reaching the wing and sharing engine damage ownership', () => {
  for (const id of ['b52', 'il76', 'il76md90a', 'kc135', 'y20']) {
    const mesh = aircraftMesh(id),
      profile = airframes[id],
      wingY = profile.wingY || 0;
    for (const engine of new Set(mesh.faceEngines.filter((index) => index !== null))) {
      const points = mesh.faces.flatMap((face, index) =>
        mesh.faceEngines[index] === engine ? face.map((i) => mesh.points[i]) : [],
      );
      assert.ok(
        points.some((p) => p.y >= wingY),
        `${id}/${engine}: no wing connection`,
      );
      assert.ok(
        points.some((p) => p.y < wingY),
        `${id}/${engine}: no nacelle connection`,
      );
    }
  }
});
