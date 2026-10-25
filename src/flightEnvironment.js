import { Vec3, clamp } from './math.js';
export const calmWeather = () => ({
  wind: { x: 0, y: 0, z: 0 },
  gust: 0,
  turbulence: 0,
  shear: 0,
  seed: 1,
});
export function missionWeather(m) {
  if (m.weather) return structuredClone(m.weather);
  const calm =
    m.group === 'practice' ||
    m.group === 'flight-test' ||
    m.kind === 'training' ||
    m.objective === 'landing' ||
    m.objective === 'flight-test';
  let seed = 17;
  for (const c of m.id || '') seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0;
  return calm
    ? calmWeather()
    : { wind: { x: 2, z: -1, y: 0 }, gust: 0.65, turbulence: 0.15, shear: 0.08, seed };
}
// A continuous, deterministic world field; no per-frame randomness or camera-space shaking.
export function windAt(weather, position, time = 0, ground = 0) {
  const w = weather || {},
    base = w.wind || {},
    h = Math.max(0, position.y - ground),
    phase = ((w.seed || 1) % 997) * 0.013;
  const shear = w.shear ? clamp((Math.max(10, h) / 10) ** w.shear, 1, 1.7) : 1;
  const gust = w.gust || 0,
    turbulence = (w.turbulence || 0) * clamp(h / 30, 0.1, 1);
  const slow = time * 0.37 + position.x * 0.00019 + position.z * 0.00013 + phase;
  return new Vec3(
    (base.x || 0) * shear + gust * (0.65 * Math.sin(slow) + 0.35 * Math.sin(slow * 0.43 + 2)),
    (base.y || 0) +
      turbulence *
        (0.65 * Math.sin(time * 1.7 + position.x * 0.0011 + phase) +
          0.35 * Math.sin(time * 3.1 - position.z * 0.0007)),
    (base.z || 0) * shear +
      gust * (0.65 * Math.cos(slow * 0.79) + 0.35 * Math.sin(slow * 0.51 - 1)),
  );
}
export function relativeAirVelocity(s, ground = 0) {
  const wind = windAt(s.weather, s.position, s.elapsed || 0, ground);
  return { wind, velocity: s.velocity.clone().sub(wind) };
}

// Distant navigation uses reduced flight dynamics, but shares the same air/ground frame.
export function unitAirVelocity(t) {
  return t.windAppliedVelocity === t.velocity && t.wind
    ? t.velocity.clone().sub(t.wind)
    : t.velocity.clone();
}
export function advectNavigatingAircraft(t, weather, dt, ground = 0) {
  t.environmentClock = (t.environmentClock ?? t.spawnAt ?? 0) + dt;
  t.wind = windAt(weather, t.position, t.environmentClock, ground);
  t.airVelocity = t.velocity.clone();
  t.position.add(t.wind.clone().scale(dt));
  t.velocity = t.velocity.clone().add(t.wind);
  t.windAppliedVelocity = t.velocity;
}
export function windCorrectedHeading(position, goal, speed, wind) {
  const track = Math.atan2(goal.x - position.x, goal.z - position.z);
  const cross = wind.x * Math.cos(track) - wind.z * Math.sin(track);
  return track - Math.asin(clamp(cross / Math.max(40, speed), -0.5, 0.5));
}

export function weatherBrief(weather) {
  const w = weather || calmWeather(),
    v = w.wind || {},
    speed = Math.hypot(v.x || 0, v.z || 0);
  if (speed < 0.1 && !(w.gust > 0)) return 'SZÉLCSEND';
  const from = ((Math.atan2(-(v.x || 0), -(v.z || 0)) * 180) / Math.PI + 360) % 360;
  return (
    'SZÉL ' +
    Math.round(from) +
    '° · ' +
    Math.round(speed * 3.6) +
    ' KM/H · LÖKÉS ±' +
    (w.gust || 0).toFixed(1) +
    ' M/S'
  );
}

export function windHudReadout(s) {
  const wind = s.wind || windAt(s.weather, s.position, s.elapsed || 0),
    speed = Math.hypot(wind.x, wind.z),
    gust = s.weather?.gust || 0;
  const from = ((Math.atan2(-wind.x, -wind.z) * 180) / Math.PI + 360) % 360;
  return {
    text:
      speed < 0.1
        ? 'SZÉLCSEND'
        : 'SZÉL ' +
          Math.round(from) +
          '° ' +
          Math.round(speed * 3.6) +
          ' KM/H' +
          (gust >= 0.2 ? ' · ±' + Math.round(gust * 3.6) : ''),
    directionToRad: Math.atan2(wind.x, wind.z),
    calm: speed < 0.1,
  };
}
