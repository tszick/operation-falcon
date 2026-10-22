import test from 'node:test';
import assert from 'node:assert/strict';
import { HeadLook, headLookLimits } from '../src/headLook.js';
import {
  dubinsPath,
  planLandingRoute,
  getLandingRoute,
  clearLandingRoute,
} from '../src/landingRoute.js';
import { Vec3, Quat, DEG, forward } from '../src/math.js';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { evaluateApproach } from '../src/landing.js';
import { tacticalMapState } from '../src/tacticalMap.js';
import { radarContacts } from '../src/targeting.js';
import { terrainHeight, runway } from '../src/terrain.js';
const f16 = aircraft.find((a) => a.id === 'f16');
function approach() {
  const s = createMissionAircraft(
    f16,
    missions.find((m) => m.id === 'landing'),
  );
  s.landingMode = 'on';
  s.approach = evaluateApproach(s);
  s.landingRouteEnabled = true;
  return s;
}
test('head look is limited in both directions and does not rotate the aircraft or its radar', () => {
  const head = new HeadLook(),
    s = approach(),
    original = s.orientation.clone(),
    targets = [
      {
        id: 'T',
        kind: 'air',
        alive: true,
        position: s.position.clone().add(new Vec3(0, 0, 3000)),
        velocity: new Vec3(),
        team: 'enemy',
      },
    ],
    before = radarContacts(s, targets)[0];
  for (let i = 0; i < 120; i++) {
    head.move(100, -100, i / 60);
    head.update(1 / 60, i / 60);
  }
  assert.ok(Math.abs(head.yaw - headLookLimits.yaw) < 1e-6);
  assert.ok(Math.abs(head.pitch - headLookLimits.pitchUp) < 1e-6);
  assert.ok(forward(head.orientation(s.orientation)).distance(forward(s.orientation)) > 1);
  assert.deepEqual(s.orientation, original);
  assert.equal(radarContacts(s, targets)[0].angle, before.angle);
  for (let i = 0; i < 240; i++) {
    head.move(-100, 100, 2 + i / 60);
    head.update(1 / 60, 2 + i / 60);
  }
  assert.ok(Math.abs(head.yaw + headLookLimits.yaw) < 1e-6);
  assert.ok(Math.abs(head.pitch + headLookLimits.pitchDown) < 1e-6);
});
test('stopped mouse returns smoothly to neutral without requiring another mouse event', () => {
  const h = new HeadLook();
  h.move(200, -100, 0);
  h.update(0.05, 0.05);
  const angle = h.yaw;
  assert.ok(angle > 0);
  h.update(0.01, 0.3);
  assert.ok(h.yaw < angle && h.yaw > 0);
  for (let i = 0; i < 240; i++) h.update(1 / 120, 0.31 + i / 120);
  assert.ok(Math.abs(h.yaw) < 0.0001);
  assert.ok(Math.abs(h.pitch) < 0.0001);
  h.reset();
  assert.equal(h.active, false);
});
test('head movement ignores invalid input and camera rotations stay normalized when the aircraft is banked', () => {
  const h = new HeadLook();
  h.move(NaN, Infinity, 0);
  h.update(1 / 60, 0);
  assert.equal(h.active, false);
  const plane = Quat.euler(0.8, 0.2, Math.PI / 2);
  h.move(100, -80, 1);
  h.update(0.1, 1);
  const q = h.orientation(plane);
  assert.ok(Math.abs(Math.hypot(q.x, q.y, q.z, q.w) - 1) < 1e-12);
});
test('turn paths meet both endpoint position and heading across a wide range of approach geometries', () => {
  for (let i = 0; i < 300; i++) {
    const start = new Vec3(Math.sin(i * 0.3) * 20000, 0, Math.cos(i * 0.4) * 20000),
      end = new Vec3(Math.sin(i * 0.7) * 12000, 0, Math.cos(i * 0.8) * 12000),
      heading = i * 0.27,
      endHeading = i * 0.11,
      path = dubinsPath(start, heading, end, endHeading, 700 + (i % 20) * 200);
    assert.ok(path.points.at(-1).distance(end) < 1e-5);
    assert.ok(
      Math.abs(
        Math.atan2(Math.sin(path.endHeading - endHeading), Math.cos(path.endHeading - endHeading)),
      ) < 1e-8,
    );
    assert.ok(path.points.every((p) => [p.x, p.y, p.z].every(Number.isFinite)));
  }
});
test('an aligned practice approach uses the three-degree final rather than a turn away from the runway', () => {
  const s = approach(),
    route = planLandingRoute(s);
  assert.equal(route.joinType, 'FINAL');
  assert.equal(route.direction, 1);
  assert.ok(route.points.every((p) => Math.abs(p.x) < 1e-9));
  assert.ok(
    route.points.every(
      (p) => Math.abs(p.y - (2 + (-p.z - runway.halfLength) * Math.tan(3 * DEG))) < 1e-8,
    ),
  );
  assert.equal(route.points.at(-1).z, -runway.halfLength);
});
test('side arrivals have a curved join, terrain clearance and a matching northbound or southbound final', () => {
  for (const direction of [1, -1]) {
    const s = approach();
    s.position = new Vec3(6500, 900, 3000);
    s.velocity = new Vec3(-130, 0, 0);
    const route = planLandingRoute(s, direction);
    assert.notEqual(route.joinType, 'FINAL');
    assert.ok(route.finalStart > 0);
    assert.equal(route.points.at(-1).z, -direction * runway.halfLength);
    assert.ok(route.points.every((p) => p.y >= terrainHeight(p.x, p.z)));
    assert.ok(route.points.slice(route.finalStart).every((p) => Math.abs(p.x) < 1e-9));
  }
});
test('faster aircraft receive broader turns and normal descent joins do not require a steep dive', () => {
  const slow = approach(),
    fast = approach();
  slow.position = fast.position = new Vec3(6000, 900, 0);
  slow.velocity = new Vec3(90, 0, 0);
  fast.velocity = new Vec3(180, 0, 0);
  const a = planLandingRoute(slow),
    b = planLandingRoute(fast);
  assert.ok(b.radius > a.radius * 3.9);
  assert.equal(a.advisory, '');
  assert.equal(b.advisory, '');
  // A higher arrival must request altitude reduction instead of a 30 km final.
  slow.position.y = 1700;
  const high = planLandingRoute(slow);
  assert.equal(high.entryDistance, 6500);
  assert.match(high.advisory, /Magasan érkezel/);
});
test('map and world share a stable route, switches and jamming hide it, and large deviations replan', () => {
  const s = approach(),
    route = getLandingRoute(s);
  assert.equal(getLandingRoute(s), route);
  assert.equal(tacticalMapState(s, []).landingRoute, route);
  assert.equal(getLandingRoute(s, { jammed: true }), null);
  assert.equal(getLandingRoute(s), route);
  s.landingRouteEnabled = false;
  assert.equal(getLandingRoute(s), null);
  s.landingRouteEnabled = true;
  const next = getLandingRoute(s);
  assert.notEqual(next, route);
  s.position.x = 9000;
  s.elapsed = 10;
  assert.notEqual(getLandingRoute(s), next);
  clearLandingRoute(s);
  s.landingMode = 'off';
  s.approach = evaluateApproach(s);
  assert.equal(getLandingRoute(s), null);
});
