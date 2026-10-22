import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { terrainWorld, terrainHeight } from '../src/terrain.js';
import { buildTerrainSurface, terrainGridCenter } from '../src/terrainSurface.js';
import { Vec3, Quat, DEG } from '../src/math.js';
import { createAircraft } from '../src/physics.js';
import { aircraft } from '../src/aircraftSpec.js';
import { evaluateApproach, landingGroundHeight } from '../src/landing.js';
import { planLandingRoute, getLandingRoute } from '../src/landingRoute.js';
import { tacticalMapState } from '../src/tacticalMap.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/east-landing.json', import.meta.url)));
function setup(sample = fixture.samples[0]) {
  Object.assign(terrainWorld, structuredClone(fixture.terrain), {
    revision: terrainWorld.revision + 1,
  });
  const p = sample.player;
  const s = Object.assign(createAircraft(aircraft.find((a) => a.id === fixture.aircraft)), p, {
    position: new Vec3(p.position.x, p.position.y, p.position.z),
    velocity: new Vec3(p.velocity.x, p.velocity.y, p.velocity.z),
    orientation: Object.assign(new Quat(), p.orientation),
    airfield: {
      ...fixture.terrain.sideStart.airfield,
      position: Object.assign(new Vec3(), fixture.terrain.sideStart.airfield.position),
    },
    airborne: true,
    onGround: false,
    ias: p.iasKmh / 3.6,
  });
  s.approach = evaluateApproach(s);
  return s;
}
function meshHeight(faces, x, z) {
  for (const {
    points: [a, b, c],
  } of faces) {
    const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
    const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
    const w = 1 - u - v;
    if (Math.min(u, v, w) >= -1e-8) return u * a.y + v * b.y + w * c.y;
  }
  throw Error('Missing terrain triangle');
}
test('eastern mission replay: drawn approach terrain matches collision through camera grid changes', () => {
  setup();
  for (const { player: p } of fixture.samples.slice(1)) {
    const center = terrainGridCenter(p.position);
    for (const shift of [-450, 0, 450]) {
      const faces = buildTerrainSurface(center.x + shift, center.z);
      for (const dx of [-45, 0, 45]) {
        const x = p.position.x + dx,
          z = p.position.z;
        assert.ok(
          Math.abs(meshHeight(faces, x, z) - terrainHeight(x, z)) < 0.001,
          `x=${x} z=${z} shift=${shift}`,
        );
      }
      assert.ok(faces.length < 15000, 'Airfield anchors must retain a bounded terrain mesh');
    }
  }
});
test('remote runway and both approach corridors remain flat across the runway threshold transition', () => {
  const s = setup(),
    f = s.airfield;
  for (const direction of [-1, 1])
    for (const along of [0, 1599, 1600, 1800, 1900, 2100, 5000, 8499])
      for (const lateral of [-45, 0, 45]) {
        const x = f.position.x + lateral,
          z = f.position.z + direction * along;
        assert.ok(Math.abs(terrainHeight(x, z) - f.elevation) < 0.001);
      }
  assert.equal(landingGroundHeight({ ...s, position: f.position.clone() }, 123), f.elevation);
});
test('remote manual landing shows the route home while keeping the final glideslope short', () => {
  const s = setup();
  assert.equal(s.landingMode, 'on');
  assert.equal(s.approach.active, true);
  const route = getLandingRoute(s);
  assert.equal(tacticalMapState(s, []).landingRoute, route);
  assert.equal(route.entryDistance, 6500);
  const threshold = route.points.at(-1);
  assert.ok(
    route.points
      .slice(route.finalStart)
      .every((p) => Math.hypot(p.x - threshold.x, p.z - threshold.z) <= 6500.001),
  );
  s.position = s.airfield.position.clone().add(new Vec3(0, 200, -5600));
  s.velocity = new Vec3(0, -3, 90);
  s.orientation = Quat.euler(0, 3 * DEG, 0);
  s.approach = evaluateApproach(s);
  assert.equal(s.approach.active, true);
  assert.ok(getLandingRoute(s));
});
test('a distant aligned arrival joins a short final instead of extending the glideslope to the aircraft', () => {
  const s = setup();
  s.position = s.airfield.position.clone().add(new Vec3(0, 2 + 25000 * Math.tan(3 * DEG), -26600));
  s.velocity = new Vec3(0, -5, 90);
  const route = planLandingRoute(s, 1);
  assert.equal(route.entryDistance, 6500);
  assert.ok(route.finalStart > 0);
});
