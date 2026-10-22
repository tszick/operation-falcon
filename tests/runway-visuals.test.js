import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, Quat } from '../src/math.js';
import { runway } from '../src/terrain.js';
import {
  runwayPaintMesh,
  runwaySurfaceMesh,
  runwayLamps,
  runwayLampColor,
  renderAirfield,
  renderRunwayLightGlows,
} from '../src/runwayVisuals.js';
import { meshBuffers } from '../src/rendering/shared/meshData.js';

test('runway paint is filled geometry with physical width, above the pavement and inside the collision runway', () => {
  const paint = runwayPaintMesh(),
    surface = runwaySurfaceMesh();
  assert.equal(paint, runwayPaintMesh());
  assert.ok(meshBuffers(paint).triangles.length > 0);
  assert.equal(paint.details.length, 0);
  for (const p of paint.points) {
    assert.ok(Math.abs(p.x) <= runway.halfWidth);
    assert.ok(Math.abs(p.z) <= runway.halfLength);
    assert.ok(p.y > surface.points[0].y);
  }
  for (const face of paint.faces) {
    const xs = face.map((i) => paint.points[i].x),
      zs = face.map((i) => paint.points[i].z);
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 1);
    assert.ok(Math.max(...zs) - Math.min(...zs) >= 2);
  }
});
test('edge fixtures remain outside the landing surface, with reciprocal red/green threshold faces', () => {
  for (const lamp of runwayLamps()) {
    assert.ok(Math.abs(lamp.position.z) <= runway.halfLength);
    if (lamp.kind === 'edge' || lamp.kind === 'caution')
      assert.ok(Math.abs(lamp.position.x) > runway.halfWidth);
    assert.ok(lamp.position.y < 2);
  }
  assert.equal(runwayLampColor('south', -4000), runwayLampColor('north', 4000));
  assert.equal(runwayLampColor('south', 0), runwayLampColor('north', 0));
  assert.notEqual(runwayLampColor('south', -4000), runwayLampColor('south', 0));
});
test('the same painted and lit airfield follows a remote runway pose; dead runway lighting can be disabled', () => {
  const position = new Vec3(12500, 22, 3800),
    rotation = Quat.euler(Math.PI / 2, 0, 0),
    entries = [];
  const r = {
    camera: position.clone().add(rotation.rotate(new Vec3(0, 100, -4000))),
    surfaceMode: 'night',
    mesh: (...e) => entries.push(e),
  };
  renderAirfield(r, position, rotation);
  assert.ok(entries.some((e) => e[6] === 'paint'));
  assert.equal(entries.filter((e) => e[6] === 'lamp').length, 4);
  assert.ok(entries.every((e) => e[1] === position && e[2] === rotation));
  assert.ok(Math.abs(r.runwayLightQueue[0].cameraZ + 4000) < 1e-6);
  entries.length = 0;
  renderAirfield(r, position, rotation, { lights: false });
  assert.ok(entries.some((e) => e[6] === 'paint'));
  assert.equal(entries.filter((e) => e[6] === 'lamp').length, 0);
});
test('runway halos respect world visibility and distance without drawing hidden lights', () => {
  let draws = 0;
  const r = {
    surfaceMode: 'night',
    camera: new Vec3(0, 10, -1800),
    runwayLightQueue: [{ position: new Vec3(), rotation: new Quat(), cameraZ: -1800 }],
    projectWorld: () => null,
    ctx: { fillRect: () => draws++ },
  };
  renderRunwayLightGlows(r);
  assert.equal(draws, 0);
});
