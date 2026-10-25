import { calmWeather } from '../src/flightEnvironment.js';
import { atmosphere } from '../src/performance.js';
import { evaluateApproach } from '../src/landing.js';
import { aircraft, missions } from '../src/aircraftSpec.js';
import { createTargets, updateTargets, Targeting } from '../src/targeting.js';
import { createMissionAircraft } from '../src/missionStart.js';
import { Weapons } from '../src/weapons.js';
import { Mission } from '../src/mission.js';
import { Vec3, Quat, DEG } from '../src/math.js';
import { stepAircraft } from '../src/physics.js';
import { requestCatapult } from '../src/navalOps.js';
export function navalScenario(mode = 'battle') {
  const scenario = { ...missions.find((m) => m.naval), weather: calmWeather() },
    spec = aircraft.find((a) => a.id === (mode.startsWith('harrier') ? 'harrier' : 'fa18'));
  let seed = 671;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const targets = createTargets(scenario, spec, { rng: random }),
    s = createMissionAircraft(spec, scenario, {
      fuelFraction: mode === 'harrier-heavy' ? 1 : 0.25,
    }),
    w = new Weapons({ enemyFire: mode === 'battle', random }),
    m = new Mission(scenario),
    aim = new Targeting();
  if (mode === 'catapult') {
    s.elapsed = 5;
    s.throttle = 1;
    requestCatapult(s);
  }
  if (['trap', 'bolter', 'harrier-land'].includes(mode)) {
    s.onGround = false;
    s.airborne = true;
    s.elapsed = 30;
    s.gear = true;
    s.flaps = true;
    s.flapPosition = 1;
    s.landingMode = 'on';
    if (mode === 'harrier-land') {
      s.naval.nozzle = 90;
      s.position = new Vec3(-18, 23.3, -40);
      s.velocity = new Vec3(0, -1, 0);
      s.orientation = new Quat();
      s.throttle = 0.83;
    } else {
      const q = Quat.euler(s.airfield.heading, 0, 0);
      s.position = q
        .rotate(new Vec3(0, 22.3, mode === 'bolter' ? 40 : -108))
        .add(s.airfield.position);
      s.velocity = q.rotate(new Vec3(0, -2, 70));
      s.orientation = Quat.euler(s.airfield.heading, 7 * DEG, 0);
      s.throttle = 0.25;
      s.naval.hook = mode === 'trap';
    }
    s.previousPosition = s.position.clone();
  }
  if (mode === 'harrier-light' || mode === 'harrier-heavy') {
    s.naval.nozzle = 90;
    s.throttle = 1;
  }
  if (['trap', 'bolter', 'harrier-land'].includes(mode)) s.engineSpool = s.throttle;
  const air = atmosphere(s.position.y);
  s.speed = s.velocity.length();
  s.ias = s.speed * Math.sqrt(air.density / 1.225);
  s.mach = s.speed / air.soundSpeed;
  s.agl = s.position.y;
  s.approach = evaluateApproach(s);
  m.update(s, targets, w, aim);
  return { s, w, m, aim, targets, mode };
}
export function advanceNaval(x, seconds, { combat = true } = {}) {
  for (let i = 0; i < Math.round(seconds * 120); i++) {
    stepAircraft(x.s, {}, 1 / 120);
    if (combat) {
      updateTargets(x.targets, 1 / 120);
      x.aim.update(x.s, x.targets, 1 / 120);
      x.w.update(x.s, x.targets, 1 / 120);
      x.m.update(x.s, x.targets, x.w, x.aim);
    }
    if (x.s.crashed) break;
  }
  return x;
}
