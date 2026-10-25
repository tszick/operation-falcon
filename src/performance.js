import { damageResponse } from './damage.js';
import { weaponProfile, weaponProfiles } from './weaponDynamics.js';

export function atmosphere(h) {
  h = Math.max(0, h);
  const gas = 287.05287,
    g = 9.80665;
  let temperature, pressure;
  if (h <= 11000) {
    temperature = 288.15 - 0.0065 * h;
    pressure = 101325 * (temperature / 288.15) ** (g / (gas * 0.0065));
  } else if (h <= 20000) {
    temperature = 216.65;
    pressure = 22632.06 * Math.exp((-g * (h - 11000)) / (gas * temperature));
  } else if (h <= 32000) {
    temperature = 216.65 + 0.001 * (h - 20000);
    pressure = 5474.889 * (temperature / 216.65) ** (-g / (gas * 0.001));
  } else if (h <= 47000) {
    temperature = 228.65 + 0.0028 * (h - 32000);
    pressure = 868.0187 * (temperature / 228.65) ** (-g / (gas * 0.0028));
  } else {
    temperature = 270.65;
    pressure = 110.9063 * Math.exp((-g * (h - 47000)) / (gas * temperature));
  }
  return {
    density: pressure / (gas * temperature),
    soundSpeed: Math.sqrt(1.4 * gas * temperature),
    temperatureK: temperature,
    pressurePa: pressure,
  };
}
// Gun profiles describe the projectile. The 2.2 factor is an approximate
// complete-round allowance (projectile, case and propellant), not extra gun mass.
export function ammoMass(spec, type, count) {
  const profile =
    count > 0
      ? type === 'tailGun'
        ? weaponProfiles[spec.defensiveGun?.profile]
        : weaponProfile(spec, type)
      : null;
  return profile ? count * profile.mass * (['gun', 'tailGun'].includes(type) ? 2.2 : 1) : 0;
}
export function massBreakdown(s) {
  const gunAmmoKg = ammoMass(s.spec, 'gun', s.ammo.gun || 0),
    missilesKg =
      ammoMass(s.spec, 'aam', s.ammo.aam || 0) + ammoMass(s.spec, 'agm', s.ammo.agm || 0),
    bombsKg = ammoMass(s.spec, 'bomb', s.ammo.bomb || 0);
  const tailGunAmmoKg = ammoMass(s.spec, 'tailGun', s.ammo.tailGun || 0);
  const emptyKg = s.spec.emptyMass,
    fuelKg = s.fuel,
    storesKg = missilesKg + bombsKg;
  return {
    emptyKg,
    fuelKg,
    gunAmmoKg,
    tailGunAmmoKg,
    missilesKg,
    bombsKg,
    storesKg,
    totalKg: emptyKg + fuelKg + gunAmmoKg + tailGunAmmoKg + storesKg,
  };
}
export function mass(s) {
  return massBreakdown(s).totalKg;
}
// Reference speeds are indicated airspeeds, using the landing flap configuration.
// A loaded aircraft needs a larger margin above the lift-limited stall speed.
export function approachSpeeds(s) {
  const maximumCL = s.spec.maxCL + 0.35;
  const stall = Math.sqrt(
    (2 * mass(s) * 9.81) /
      (1.225 * s.spec.wingArea * maximumCL * Math.max(0.05, damageResponse(s).lift)),
  );
  const target = Math.max(s.spec.approachSpeed, 1.23 * stall) * 3.6;
  return { stall: stall * 3.6, target, min: target - 25, max: target + 30 };
}
export function approachSpeedAction(s) {
  const speeds = approachSpeeds(s),
    speed = s.ias * 3.6,
    target = Math.round(speeds.target);
  if (s.afterburner && s.spec.hasAB)
    return { key: 'SHIFT', text: 'Utánégető kikapcsolása', done: false };
  if (speed > speeds.max) {
    if (s.throttle > 0.02)
      return { key: 'F', text: `Gáz alapjáratra · cél ${target} km/h`, done: false };
    if (!s.airbrake) return { key: 'B', text: `Légfék nyitása · cél ${target} km/h`, done: false };
    return {
      key: 'S',
      text: 'Finoman: enyhítsd a süllyedést; hagyj időt a lassulásra',
      done: false,
    };
  }
  if (s.airbrake) return { key: 'B', text: 'Légfék bezárása; ne lassulj tovább', done: false };
  if (speed < speeds.min)
    return { key: 'R', text: `Finoman növeld a gázt · ${target} km/h`, done: false };
  return { key: 'R / F', text: `Tarts kb. ${target} km/h-t`, done: true };
}
