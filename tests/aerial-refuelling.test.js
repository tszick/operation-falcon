import test from 'node:test';
import assert from 'node:assert/strict';
import { missions, aircraft } from '../src/aircraftSpec.js';
import { missionForSide } from '../src/missionSides.js';
import { createTargets, updateTargets, Targeting, applyTargetHit } from '../src/targeting.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { Mission } from '../src/mission.js';
import { Weapons } from '../src/weapons.js';
import { Quat } from '../src/math.js';
import { terrainWorld } from '../src/terrain.js';
import { aircraftMesh } from '../src/airframes.js';
import { armament } from '../src/armament.js';
import { aircraftFlightSpec } from '../src/aiAircraftSpec.js';
import { defenseState } from '../src/aiDefense.js';
import { unitTypes } from '../src/unitTypes.js';
import { refuellingStation, transferFuel, moveTanker } from '../src/aerialRefuelling.js';
import { calmWeather } from '../src/flightEnvironment.js';
import { catalogueAircraft } from '../src/aircraftCatalog.js';
import { evaluateApproach, onLandingRunway } from '../src/landing.js';
import { mass } from '../src/performance.js';
import { getRefuellingRoute, toggleRefuellingRoute } from '../src/refuellingRoute.js';
import { tacticalMapState } from '../src/tacticalMap.js';
import { landingRouteColor } from '../src/landingRoute.js';
import { initialWeapon } from '../src/loadoutPlanner.js';
function setup(side = 'west') {
  const spec = aircraft.find((a) => a.id === (side === 'east' ? 'mig29' : 'f16'));
  const mission = {
    ...missionForSide(
      missions.find((m) => m.id === 'aerial-refuelling'),
      side,
    ),
    weather: calmWeather(),
  };
  const targets = createTargets(mission, spec, { rng: () => 0.3 }),
    s = createMissionAircraft(spec, mission),
    w = new Weapons(),
    m = new Mission(mission),
    aim = new Targeting();
  m.update(s, targets, w, aim);
  return {
    s,
    w,
    m,
    aim,
    targets,
    tanker: targets.find((t) => t.type === 'tanker'),
    fighter: targets.find((t) => t.type === 'fighter'),
  };
}
function dock(x) {
  x.s.position = refuellingStation(x.tanker);
  x.s.velocity = x.tanker.velocity.clone();
  x.s.orientation = Quat.euler(x.tanker.heading, 0, x.tanker.bank || 0);
}
test('both coalitions start airborne, have correct goals and no real or phantom airfield', () => {
  for (const side of ['west', 'east']) {
    const x = setup(side);
    assert.equal(x.targets.length, 5);
    assert.equal(
      x.targets.some((t) => ['airbase', 'carrier'].includes(t.type)),
      false,
    );
    assert.equal(terrainWorld.noAirfield, true);
    assert.equal(terrainWorld.ocean, undefined);
    assert.equal(x.s.onGround, false);
    assert.equal(x.s.airborne, true);
    assert.equal(x.s.noAirfield, true);
    assert.equal(x.tanker.team, side === 'west' ? 'ally' : 'enemy');
    assert.equal(x.tanker.faction, 'west');
    assert.equal(
      x.targets.filter((t) => t.type === 'sam' && t.team === (side === 'east' ? 'ally' : 'enemy'))
        .length,
      3,
    );
    assert.equal(x.s.airfield, undefined);
    assert.equal(evaluateApproach(x.s).active, false);
    assert.equal(onLandingRunway(x.s), false);
    if (side === 'west') assert.equal(x.s.fuel, x.s.spec.fuelCapacity * 0.12);
    else {
      assert.equal(x.s.fuel, x.s.spec.fuelCapacity);
      assert.equal(x.fighter.flight.fuel, x.fighter.flight.spec.fuelCapacity * 0.12);
      assert.equal(x.fighter.aiRole, 'refuel-receiver');
    }
  }
  const mission = missions.find((m) => m.id === 'aerial-refuelling');
  assert.ok(catalogueAircraft(mission).every((a) => a.emptyMass < 30000));
});
test('tanker is a distinct four-engine model, has no attack stores and retains finite countermeasures', () => {
  const x = setup(),
    spec = aircraftFlightSpec('kc135'),
    mesh = aircraftMesh('kc135');
  assert.equal(spec.engineCount, 4);
  assert.deepEqual(armament(spec).weapons, {});
  assert.deepEqual(unitTypes.tanker.weapons, []);
  assert.ok(mesh.points.some((p) => p.z < -30));
  assert.ok(mesh.points.every((p) => Number.isFinite(p.x + p.y + p.z)));
  assert.ok(defenseState(x.tanker).countermeasures.flare > 0);
});
test('stable contact transfers real fuel and mass, debits tanker supply, and records connection', () => {
  const x = setup();
  dock(x);
  const fuel = x.s.fuel,
    reserve = x.tanker.transferFuel,
    weight = mass(x.s);
  for (let i = 0; i < 1200; i++) {
    x.s.elapsed += 1 / 120;
    transferFuel(x.s, x.tanker, 1 / 120, x.w);
  }
  const amount = x.s.fuel - fuel;
  assert.ok(amount > 145 && amount < 155);
  assert.ok(Math.abs(reserve - x.tanker.transferFuel - amount) < 1e-6);
  assert.ok(Math.abs(mass(x.s) - weight - amount) < 1e-6);
  assert.equal(x.w.events.filter((e) => e.type === 'refuelling-connected').length, 1);
  x.s.velocity.x += 20;
  transferFuel(x.s, x.tanker, 1 / 120, x.w);
  assert.equal(x.s.aerialRefuel.connected, false);
  assert.equal(x.w.events.at(-1).type, 'refuelling-disconnected');
});
test('wrong direction, speed, configuration, alignment and tanker evasions cannot transfer fuel', () => {
  for (const mutate of [
    (x) => (x.s.position.x += 30),
    (x) => (x.s.velocity.z += 7),
    (x) => (x.s.orientation = new Quat()),
    (x) => (x.s.gear = true),
    (x) => (x.s.flaps = true),
    (x) => (x.s.airbrake = true),
    (x) => (x.s.afterburner = true),
    (x) => (x.tanker.evasion = {}),
    (x) => (x.tanker.alive = false),
  ]) {
    const x = setup();
    dock(x);
    mutate(x);
    const fuel = x.s.fuel;
    for (let i = 0; i < 80; i++) transferFuel(x.s, x.tanker, 0.1, x.w);
    assert.equal(x.s.fuel, fuel);
    assert.equal(x.s.aerialRefuel.transferred, 0);
  }
});
test('fuel transfer cannot overfill a receiver or create fuel after tanker depletion', () => {
  const x = setup();
  dock(x);
  x.s.fuel = x.s.spec.fuelCapacity - 10;
  x.tanker.transferFuel = 5;
  for (let i = 0; i < 100; i++) transferFuel(x.s, x.tanker, 0.1, x.w);
  assert.equal(x.tanker.transferFuel, 0);
  assert.equal(x.s.fuel, x.s.spec.fuelCapacity - 5);
});
test('western success requires both actual transferred fuel and the hostile fighter; no landing', () => {
  const x = setup();
  dock(x);
  x.fighter.alive = false;
  for (let i = 0; i < 90 * 120 && !x.m.complete; i++) {
    x.s.elapsed += 1 / 120;
    x.m.update(x.s, x.targets, x.w, x.aim);
  }
  assert.equal(x.m.complete, true);
  assert.equal(x.m.failed, false);
  assert.equal(x.w.missionEnded, true);
  assert.equal(x.s.landing, null);
  assert.ok(x.s.aerialRefuel.transferred >= x.s.spec.fuelCapacity * 0.5 - 1e-5);
  assert.equal(
    x.m.objectives.filter((o) => !o.optional).every((o) => o.done),
    true,
  );
});
test('tanker loss fails the west before refuelling, but completed refuelling survives later tanker loss', () => {
  let x = setup();
  x.tanker.alive = false;
  x.s.elapsed += 0.1;
  x.m.update(x.s, x.targets, x.w, x.aim);
  assert.equal(x.m.failed, true);
  x = setup();
  x.s.aerialRefuel = { transferred: x.s.spec.fuelCapacity * 0.5, stable: 0, connected: false };
  x.tanker.alive = false;
  x.fighter.alive = false;
  x.m.update(x.s, x.targets, x.w, x.aim);
  assert.equal(x.m.complete, true);
  assert.equal(x.m.objectives.find((o) => o.id === 'tanker').done, false);
});
test('east wins by destroying the tanker; optional fighter and battery goals reflect actual outcomes', () => {
  const x = setup('east');
  x.fighter.alive = false;
  x.targets.find((t) => t.type === 'sam').alive = false;
  applyTargetHit(x.tanker, 'aam', { amount: 1000 });
  x.s.elapsed += 0.1;
  x.m.update(x.s, x.targets, x.w, x.aim);
  assert.equal(x.tanker.alive, false);
  assert.equal(x.m.complete, true);
  assert.equal(x.m.failed, false);
  assert.equal(x.m.objectives.find((o) => o.id === 'fighter').done, true);
  assert.equal(x.m.objectives.find((o) => o.id === 'air-defence').done, false);
});
test('tanker enters from opposite side, transitions to a smooth finite orbit and stays on theatre', () => {
  const x = setup(),
    t = x.tanker;
  let max = 0;
  for (let i = 0; i < 120 * 900; i++) {
    moveTanker(t, 1 / 120);
    max = Math.max(max, Math.hypot(t.position.x, t.position.z));
    assert.ok(Math.abs(t.position.y - 2200) < 1e-6);
  }
  assert.equal(t.routeStage, 'orbit');
  assert.ok(max < 35000);
  assert.ok(Math.abs(t.bank) < 0.55);
});
test('eastern-side AI receiver uses the same contact envelope and supply accounting', () => {
  const x = setup('east'),
    s = x.fighter.flight;
  Object.assign(s, {
    position: refuellingStation(x.tanker),
    velocity: x.tanker.velocity.clone(),
    orientation: Quat.euler(Math.PI, 0, 0),
  });
  const before = x.tanker.transferFuel;
  for (let i = 0; i < 1200; i++) {
    x.s.elapsed += 1 / 120;
    x.m.update(x.s, x.targets, x.w, x.aim);
  }
  assert.ok(s.aerialRefuel.transferred > 145);
  assert.ok(x.tanker.transferFuel < before);
  assert.equal(x.m.complete, false);
});
test('both sides can run the normal physics, AI movement and combat loop without an airport', () => {
  for (const side of ['west', 'east']) {
    const x = setup(side);
    for (let i = 0; i < 120 * 10; i++) {
      x.s.elapsed += 1 / 120;
      updateTargets(x.targets, 1 / 120);
      x.w.update(x.s, x.targets, 1 / 120);
      x.m.update(x.s, x.targets, x.w, x.aim);
    }
    assert.ok(x.targets.every((t) => Number.isFinite(t.position.x + t.position.y + t.position.z)));
    assert.equal(x.m.complete, false);
  }
});

test('an unopposed AI receiver actually rendezvouses, matches speed and refuels through physical controls', () => {
  const x = setup('east');
  x.s.position.x = -30000;
  for (
    let i = 0;
    i < 120 * 600 &&
    (x.fighter.flight.aerialRefuel?.transferred || 0) < x.fighter.flight.spec.fuelCapacity * 0.5;
    i++
  ) {
    x.s.elapsed += 1 / 120;
    updateTargets(x.targets, 1 / 120);
    x.m.update(x.s, x.targets, x.w, x.aim);
  }
  assert.ok(x.fighter.flight.aerialRefuel.transferred >= x.fighter.flight.spec.fuelCapacity * 0.5);
  assert.equal(x.fighter.aiRole, 'interceptor');
  assert.equal(x.fighter.flight.damage, 0);
});

test('refuelling mission starts with air-to-air weapons selected on either side', () => {
  for (const side of ['west', 'east']) {
    const { s } = setup(side);
    assert.equal(initialWeapon(s, { objective: 'aerial-refuelling' }), 'aam');
  }
});

test('attacking fighter starts across the map from the tanker on either player side', () => {
  const west = setup('west');
  assert.ok(west.fighter.position.z < -25000);
  assert.ok(west.tanker.position.z > 20000);
  assert.ok(west.fighter.position.distance(west.tanker.position) > 50000);
  assert.ok(
    west.s.position.distance(west.tanker.position) + 10000 <
      west.fighter.position.distance(west.tanker.position),
  );
  const east = setup('east');
  assert.deepEqual(east.s.position, west.fighter.position);
  assert.ok(east.s.position.distance(east.tanker.position) > 50000);
  const towardTanker = east.tanker.position.clone().sub(east.s.position).normalize();
  assert.ok(east.s.velocity.clone().normalize().dot(towardTanker) > 0.99);
});

test('I toggles refuelling guidance independently of the landing guide and fuel state', () => {
  const x = setup();
  x.s.landingRouteEnabled = true;
  const fuel = x.s.fuel;
  assert.equal(getRefuellingRoute(x.s, x.targets), null);
  assert.equal(toggleRefuellingRoute(x.s), true);
  assert.ok(getRefuellingRoute(x.s, x.targets));
  assert.equal(toggleRefuellingRoute(x.s), false);
  assert.equal(getRefuellingRoute(x.s, x.targets), null);
  assert.equal(x.s.landingRouteEnabled, true);
  assert.equal(x.s.fuel, fuel);
});

test('purple refuelling route joins behind the moving tanker and ends at its physical contact point', () => {
  const x = setup();
  toggleRefuellingRoute(x.s);
  const route = getRefuellingRoute(x.s, x.targets);
  assert.equal(route.color, landingRouteColor);
  assert.ok(route.points[0].distance(x.s.position) < 1e-6);
  assert.ok(route.points.every((p) => Number.isFinite(p.x + p.y + p.z)));
  assert.ok(route.points.at(-1).distance(refuellingStation(x.tanker)) < 1e-6);
  const final = route.points.at(-1).clone().sub(route.points.at(-2)).normalize();
  assert.ok(final.dot(x.tanker.velocity.clone().normalize()) > 0.99);
  assert.equal(getRefuellingRoute(x.s, x.targets), route);
  moveTanker(x.tanker, 1);
  const moved = getRefuellingRoute(x.s, x.targets);
  assert.notEqual(moved, route);
  assert.ok(moved.points.at(-1).distance(refuellingStation(x.tanker)) < 1e-6);
  assert.ok(moved.points.at(-1).distance(route.points.at(-1)) > 100);
  assert.equal(tacticalMapState(x.s, x.targets).landingRoute, moved);
});

test('aligned close refuelling guidance avoids a new turn and disappears when unavailable', () => {
  const x = setup();
  dock(x);
  x.s.position.z += 300;
  toggleRefuellingRoute(x.s);
  const route = getRefuellingRoute(x.s, x.targets);
  assert.ok(route.points.length <= 5);
  assert.equal(route.finalStart, 0);
  assert.equal(getRefuellingRoute(x.s, x.targets, { jammed: true }), null);
  x.tanker.alive = false;
  assert.equal(getRefuellingRoute(x.s, x.targets), null);
  x.tanker.alive = true;
  x.s.dying = true;
  assert.equal(getRefuellingRoute(x.s, x.targets), null);
  const east = setup('east');
  toggleRefuellingRoute(east.s);
  assert.equal(getRefuellingRoute(east.s, east.targets), null);
});
