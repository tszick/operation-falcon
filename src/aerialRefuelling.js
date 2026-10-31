import { thrustFactor } from './flightModel.js';
import { createAircraft } from './physics.js';
import { aircraftFlightSpec } from './aiAircraftSpec.js';
import { guidedFlightInput, combatFlightInput } from './aiDefense.js';
import { atmosphere, mass } from './performance.js';
import { Vec3, Quat, forward, up, attitude, DEG, clamp } from './math.js';
export const refuellingRules = Object.freeze({
  altitude: 2200,
  speed: 155,
  startFuel: 0.12,
  requiredFraction: 0.5,
  rate: 30,
  contactSeconds: 5,
});
// Shared by the AI attacker and the player when flying the Eastern side.
export const refuellingAttackerStart = Object.freeze({ x: 22000, y: 2500, z: -26000 });
export const refuellingAttackerHeading = Math.atan2(
  -refuellingAttackerStart.x,
  22000 - refuellingAttackerStart.z,
);
export function spawnRefuelling(m, player, add) {
  const east = m.side === 'east',
    westTeam = east ? 'enemy' : 'ally';
  const tanker = add('TANKER', 'tanker', westTeam, new Vec3(0, 2200, 22000), {
    aiRole: 'tanker',
    transferFuel: 18000,
    routeStage: 'entry',
    faction: 'west',
  });
  Object.assign(tanker, {
    aircraftId: 'kc135',
    name: 'KC-135R Stratotanker',
    displayCallSign: 'TEXACO ONE',
    cruiseSpeed: 155,
    heading: Math.PI,
    velocity: new Vec3(0, 0, -155),
  });
  const fighter = add(
    'REFUEL-FIGHTER',
    'fighter',
    'enemy',
    east
      ? new Vec3(-1800, 2200, -16000)
      : new Vec3(refuellingAttackerStart.x, refuellingAttackerStart.y, refuellingAttackerStart.z),
    {
      aiRole: 'interceptor',
      aiTargetId: east ? 'PLAYER' : 'TANKER',
      defendId: east ? 'TANKER' : undefined,
    },
  );
  if (!east) {
    fighter.heading = refuellingAttackerHeading;
    fighter.velocity = new Vec3(
      Math.sin(fighter.heading) * 165,
      0,
      Math.cos(fighter.heading) * 165,
    );
  }
  if (east) {
    fighter.aircraftId = 'f16';
    fighter.name = 'F-16 Fighting Falcon';
    fighter.faction = 'west';
    fighter.fuelFraction = 0.12;
  }
  for (let i = 0; i < 3; i++)
    add(
      'REFUEL-AAA' + (i + 1),
      'sam',
      east ? 'ally' : 'enemy',
      new Vec3([-8500, 9000, 6500][i], 0, [-1000, 6500, 16000][i]),
    );
  return { tanker, fighter };
}
export function moveTanker(t, dt) {
  if (t.routeStage === 'entry' && t.position.z <= 14500) t.routeStage = 'orbit';
  const radial = Math.atan2(t.position.x, t.position.z - 2500),
    radius = Math.hypot(t.position.x, t.position.z - 2500);
  const desired =
    t.routeStage === 'entry' ? Math.PI : radial + Math.PI / 2 + Math.atan2(radius - 12000, 3000);
  const error = Math.atan2(Math.sin(desired - t.heading), Math.cos(desired - t.heading));
  const turn = clamp(error, -0.032 * dt, 0.032 * dt);
  t.heading += turn;
  t.bank = Math.atan((155 * turn) / Math.max(dt, 1e-9) / 9.81);
  t.routeX = t.position.x + Math.sin(t.heading) * 5000;
  t.exitZ = t.position.z + Math.cos(t.heading) * 5000;
  t.routeAltitude = 2200;
  t.velocity = new Vec3(
    Math.sin(t.heading) * 155,
    clamp((2200 - t.position.y) * 0.1, -5, 5),
    Math.cos(t.heading) * 155,
  );
  t.position.add(t.velocity.clone().scale(dt));
}
export function refuellingStation(t) {
  const q = t.flight?.orientation || Quat.euler(t.heading || 0, t.pitch || 0, t.bank || 0);
  return t.position.clone().add(forward(q).scale(-48)).add(up(q).scale(-6));
}
export function refuellingEnvelope(s, t) {
  const station = refuellingStation(t),
    q = t.flight?.orientation || Quat.euler(t.heading || 0, t.pitch || 0, t.bank || 0);
  const delta = station.clone().sub(s.position),
    relative = s.velocity.clone().sub(t.velocity).length();
  const f = forward(s.orientation),
    tf = forward(q);
  const heading = Math.acos(clamp(f.dot(tf), -1, 1)) / DEG;
  const ready =
    t.alive &&
    !t.exited &&
    !t.falling &&
    !t.retreat &&
    !t.evasion &&
    !s.crashed &&
    !s.dying &&
    !s.onGround &&
    !s.gear &&
    !s.flaps &&
    !s.airbrake &&
    !s.afterburner &&
    delta.length() <= 9 &&
    relative <= 6 &&
    heading <= 10 &&
    Math.abs(attitude(s.orientation).bank - (t.bank || 0)) / DEG <= 12 &&
    Math.abs(t.bank || 0) / DEG <= 30;
  return { station, distance: delta.length(), relativeSpeed: relative, heading, ready: !!ready };
}
export function transferFuel(s, t, dt, w) {
  const state = (s.aerialRefuel ??= { transferred: 0, stable: 0, connected: false });
  const envelope = refuellingEnvelope(s, t),
    was = state.connected;
  state.bearing =
    (Math.atan2(t.position.x - s.position.x, t.position.z - s.position.z) / DEG + 360) % 360;
  const heading = forward(Quat.euler(t.heading || 0, 0, 0));
  state.closingSpeed = s.velocity.clone().sub(t.velocity).dot(heading);
  state.tankerIAS = t.velocity.length() * Math.sqrt(atmosphere(t.position.y).density / 1.225) * 3.6;
  state.ready = envelope.ready;
  state.distance = envelope.distance;
  state.relativeSpeed = envelope.relativeSpeed;
  state.stable = envelope.ready ? state.stable + dt : 0;
  state.connected =
    envelope.ready &&
    state.stable >= refuellingRules.contactSeconds &&
    t.transferFuel > 0 &&
    s.fuel < s.spec.fuelCapacity;
  if (state.connected) {
    const amount = Math.max(
      0,
      Math.min(refuellingRules.rate * dt, t.transferFuel, s.spec.fuelCapacity - s.fuel),
    );
    s.fuel += amount;
    t.transferFuel -= amount;
    state.transferred += amount;
    if (t.flight) t.flight.fuel = Math.max(0, t.flight.fuel - amount);
  }
  if (state.connected !== was)
    w?.emit?.({
      type: state.connected ? 'refuelling-connected' : 'refuelling-disconnected',
      sourceId: t.id,
      transferredKg: state.transferred,
      time: s.elapsed,
    });
  return state;
}
export function updateRefuellingMission(s, m, targets, w) {
  const east = m.spec.side === 'east',
    tanker = targets.find((t) => t.id === 'TANKER'),
    fighter = targets.find((t) => t.id === 'REFUEL-FIGHTER');
  const dt = clamp(s.elapsed - (m.refuelClock ?? s.elapsed), 0, 1);
  m.refuelClock = s.elapsed;
  if (east && fighter.alive && !fighter.flight) {
    const flight = createAircraft(aircraftFlightSpec(fighter.aircraftId));
    Object.assign(flight, {
      position: fighter.position.clone(),
      previousPosition: fighter.position.clone(),
      velocity: new Vec3(0, 0, 165),
      onGround: false,
      airborne: true,
      gear: false,
      flaps: false,
      flapPosition: 0,
      throttle: 0.65,
      engineSpool: 0.65,
      weather: s.weather,
      landingMode: 'off',
      noAirfield: true,
    });
    flight.fuel = flight.spec.fuelCapacity * 0.12;
    const q = 0.5 * atmosphere(flight.position.y).density * 165 ** 2;
    const alpha =
      ((mass(flight) * 9.81) / (q * flight.spec.wingArea) - (flight.spec.liftZero ?? 0.22)) /
      flight.spec.clSlope;
    flight.orientation = Quat.euler(0, alpha, 0);
    fighter.flight = flight;
    fighter.velocity = flight.velocity.clone();
    fighter.aiRole = 'refuel-receiver';
    fighter.refuellingReceiver = true;
  }
  if (east && fighter.flight && fighter.alive && tanker.alive) {
    fighter.refuelTanker = tanker;
    transferFuel(fighter.flight, tanker, dt, w);
    if (fighter.flight.aerialRefuel.transferred >= fighter.flight.spec.fuelCapacity * 0.5) {
      fighter.aiRole = 'interceptor';
      fighter.refuellingReceiver = false;
    }
  }
  const state = east ? null : transferFuel(s, tanker, dt, w);
  const filled =
    !!state && state.transferred + 1e-6 >= s.spec.fuelCapacity * refuellingRules.requiredFraction;
  const ground = targets.filter((t) => t.id.startsWith('REFUEL-AAA'));
  const row = (id, text, done, optional = false) => ({ id, text, done: !!done, optional });
  m.objectives = east
    ? [
        row('tanker', 'Nyugati tanker megsemmisítve', !tanker.alive),
        row('fighter', 'Nyugati vadász megsemmisítve', !fighter.alive, true),
        row(
          'air-defence',
          'Mindhárom baráti üteg megmaradt',
          ground.every((t) => t.alive),
          true,
        ),
      ]
    : [
        row(
          'fuel',
          `Átvett üzemanyag: ${Math.floor(state.transferred)} / ${Math.ceil(s.spec.fuelCapacity * 0.5)} kg`,
          filled,
        ),
        row('fighter', 'Ellenséges vadász megsemmisítve', !fighter.alive),
        row(
          'air-defence',
          'Mindhárom ellenséges üteg megsemmisítve',
          ground.every((t) => !t.alive),
          true,
        ),
        row('tanker', 'A tanker túlélte a küldetést', tanker.alive, true),
      ];
  if (!east && !filled && (!tanker.alive || tanker.exited || tanker.transferFuel <= 0)) {
    m.failed = true;
    m.failureReason = 'A tanker elveszett vagy kifogyott, mielőtt elegendő üzemanyagot vettél át.';
    m.setPhase('failed', 'KÜLDETÉS SIKERTELEN', m.failureReason);
    return;
  }
  m.objectiveComplete = east ? !tanker.alive : filled && !fighter.alive;
  if (m.objectiveComplete) {
    m.complete = true;
    m.score = Math.round(
      1500 + (100 - s.damage) * 5 + m.objectives.filter((o) => o.optional && o.done).length * 300,
    );
    m.setPhase('complete', 'KÜLDETÉS TELJESÍTVE', 'A győzelmi feltételek teljesültek.');
    return;
  }
  if (east) {
    m.setPhase(
      'tanker-attack',
      'TANKER ELFOGÁSA',
      'T: tanker befogása. Védd a baráti ütegeket; a nyugati vadász másodlagos cél.',
    );
    return;
  }
  if (filled) {
    m.setPhase(
      'refuel-intercept',
      'LÉGIHARC',
      'Tankolás kész. Küzdd le az ellenséges vadászt; nincs kötelező leszállás.',
    );
    return;
  }
  m.setPhase(
    state.connected
      ? 'refuel-transfer'
      : state.distance < 500
        ? 'refuel-contact'
        : 'refuel-rendezvous',
    state.connected ? 'ÜZEMANYAG ÁTADÁSA' : 'TANKER MEGKÖZELÍTÉSE',
    refuellingHint(s),
  );
}
export function refuellingHint(s) {
  const a = s.aerialRefuel;
  if (!a) return 'Keresd a KC–135R tankert; nincs repülőtér.';
  if (a.connected) return 'Tartsd a helyzetet. Az üzemanyag átadása folyamatban.';
  if (a.distance > 1500)
    return `TANKER ${Math.round(a.bearing)}° · ${(a.distance / 1000).toFixed(1)} KM · IAS ~${Math.round(a.tankerIAS)}`;
  if (s.gear || s.flaps || s.airbrake || s.afterburner)
    return 'Futó, fékszárny, légfék és utánégető kikapcsolva.';
  if (a.ready) return `TARTSD A HELYZETET ${a.stable.toFixed(1)} / 5 S`;
  return `PONT ${Math.round(a.distance)} M · ZÁRÁS ${a.closingSpeed.toFixed(1)} M/S`;
}
export function renderRefuellingCue(r, s, targets) {
  if (r.cinematic || !s.aerialRefuel || s.crashed || s.dying) return;
  const tanker = targets.find((t) => t.id === 'TANKER' && t.alive && t.team === 'ally');
  if (!tanker) return;
  const station = refuellingStation(tanker);
  if (station.distance(s.position) < 1500) r.marker(station, 'TANKOLÁSI PONT', '#84deec');
  if (s.aerialRefuel.connected) {
    r.ctx.strokeStyle = '#84deec';
    r.ctx.lineWidth = 2;
    r.ctx.beginPath();
    r.line(station, s.position.clone().add(forward(s.orientation).scale(8)));
    r.ctx.stroke();
  }
}

export function refuelReceiverInput(t) {
  const tanker = t.refuelTanker;
  if (!tanker?.alive || t.navigationGoal?.position.distance(t.position) < 5000)
    return combatFlightInput(t);
  const station = refuellingStation(tanker),
    delta = station.clone().sub(t.position);
  const near =
    delta.length() < 3000 &&
    forward(t.flight.orientation).dot(tanker.velocity.clone().normalize()) > 0.3;
  t.flight.afterburner = false;
  if (!near)
    return guidedFlightInput(t, station, {
      altitude: station.y,
      bankLimit: 30 * DEG,
      targetSpeed: 200,
    });
  const desired = tanker.velocity.clone().add(delta.clone().scale(0.12)),
    a = attitude(t.flight.orientation);
  const speed = clamp(
    Math.hypot(desired.x, desired.z),
    tanker.velocity.length() - 25,
    tanker.velocity.length() + 35,
  );
  const heading = Math.atan2(desired.x, desired.z),
    error = Math.atan2(Math.sin(heading - a.heading), Math.cos(heading - a.heading));
  const bank = clamp((tanker.bank || 0) + error * 1.2, -35 * DEG, 35 * DEG);
  const controls = guidedFlightInput(t, t.position.clone().add(desired.clone().scale(10)), {
    altitude: t.position.y + delta.y * 4,
    bankLimit: 35 * DEG,
    targetSpeed: speed,
  });
  const q = 0.5 * atmosphere(t.position.y).density * t.velocity.length() ** 2;
  const trim =
    (t.flight.condition.rates.roll || 0) /
    Math.max(0.01, t.flight.spec.rollRate * DEG * clamp(q / 2800, 0.06, 1));
  controls.roll = clamp((bank - a.bank) * 2 - trim, -0.65, 0.65);
  const air = atmosphere(t.position.y),
    v = t.flight.trueAirspeed ?? t.velocity.length();
  const available = t.flight.spec.thrust * thrustFactor(t.flight.spec, air, v / air.soundSpeed);
  const throttle = clamp(
    ((t.flight.forces?.dragN || 0) + mass(t.flight) * (speed - v) * 0.4) / Math.max(1, available),
    0,
    1,
  );
  controls.throttle = clamp((throttle - t.flight.throttle) * 3, -1, 1);
  return controls;
}
