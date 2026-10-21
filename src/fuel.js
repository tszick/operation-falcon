import { clamp } from './math.js';
// Approximate installed engine-family TSFC [kg / (N s)], not certified charts.
// Thrust in aircraftSpec is the sum for all engines; never multiply it twice.
const families = {
  harrier: [0.000027, 0],
  t45: [0.000024, 0],
  c130: [0.000011, 0],
  il76: [0.000021, 0],
  b52: [0.000022, 0],
  tu95: [0.000012, 0],
  airliner: [0.000017, 0],
  f14: [0.000025, 0.000064],
  f15: [0.000021, 0.000056],
  f16: [0.000021, 0.000057],
  fa18: [0.000023, 0.000059],
  mirage: [0.000026, 0.000062],
  rafale: [0.000021, 0.000052],
  euro: [0.00002, 0.000051],
  gripen: [0.000021, 0.000055],
  f4: [0.000031, 0.000073],
  f15e: [0.000021, 0.000056],
  tornado: [0.000023, 0.00006],
  a10: [0.000011, 0],
  mig25: [0.000034, 0.000079],
  mig31: [0.000024, 0.000061],
  su27: [0.000025, 0.000064],
  mig29: [0.000026, 0.000066],
  su24: [0.00003, 0.000072],
  mig27: [0.000028, 0.000069],
  su25: [0.000029, 0],
  f22: [0.000019, 0.00005],
  f35: [0.000019, 0.000052],
  su35: [0.000023, 0.000058],
  su57: [0.000022, 0.000056],
  j10: [0.000022, 0.000057],
  j20: [0.000022, 0.000056],
};
export function fuelFlow(
  s,
  { thrust = 0, afterburner = false, mach = s.mach || 0, density = 1.225, engine = 1 } = {},
) {
  if (s.fuel <= 0 || s.crashed || s.dying || engine <= 0) return 0;
  const [dry, wet] = families[s.spec.id] || [0.000025, 0.000065],
    tsfc = afterburner && s.spec.hasAB ? wet : dry;
  const lapse = clamp(density / 1.225, 0.23, 1),
    ramFactor = clamp(1 - ((s.velocity?.length() || 0) / (s.spec.maxMach * 340)) * 0.22, 0.4, 1);
  const engineThrust = Math.max(s.spec.thrust * 0.065 * lapse * engine, thrust / ramFactor);
  // High Mach operation increases installed fuel cost; mass and stores enter
  // through the aircraft lift/drag/thrust demand, not a second fuel multiplier.
  return engineThrust * tsfc * (1 + 0.12 * clamp(mach, 0, 3) ** 2);
}
export function consumeFuel(s, flow, dt) {
  const consumed = Math.min(Math.max(0, s.fuel), Math.max(0, flow) * dt);
  s.fuel = Math.max(0, s.fuel - consumed);
  s.fuelFlow = dt > 0 ? consumed / dt : 0;
  if (s.fuel === 0) {
    s.afterburner = false;
    s.enginePower = 0;
  }
  return consumed;
}
