import { structuralLoadLimits } from './damage.js';
import { clamp } from './math.js';
export function fuelStatus(s) {
  const ratio = clamp(s.fuel / Math.max(1, s.spec.fuelCapacity), 0, 1);
  const percent = Math.round(ratio * 100);
  const level = ratio === 0 ? 'empty' : ratio < 0.1 ? 'critical' : ratio < 0.25 ? 'low' : 'normal';
  const flowKgMin = Math.max(0, s.fuelFlow || 0) * 60;
  const horizontalSpeed = Math.hypot(s.velocity?.x || 0, s.velocity?.z || 0),
    rangeKm =
      s.fuel <= 0
        ? 0
        : !s.onGround && !s.crashed && horizontalSpeed >= 30 && flowKgMin > 0
          ? ((s.fuel / (flowKgMin / 60)) * horizontalSpeed) / 1000
          : null;
  return {
    rangeKm,
    percent,
    kg: Math.max(0, Math.round(s.fuel)),
    level,
    flowKgMin,
    minutesRemaining: flowKgMin > 0 ? s.fuel / flowKgMin : null,
    label: {
      normal: 'ÜZEMANYAG',
      low: 'BINGO FUEL',
      critical: 'KRITIKUS ÜZEMANYAG',
      empty: 'ÜZEMANYAG KIFOGYOTT',
    }[level],
  };
}

export function engineInstruments(s) {
  const throttle = Math.round(clamp(s.throttle, 0, 1) * 100),
    g = s.g,
    limits = structuralLoadLimits(s);
  const load = g >= 0 ? g / limits.positive : g / limits.negative;
  return { throttle, g, limits, level: load >= 1 ? 'danger' : load >= 0.8 ? 'warning' : 'normal' };
}
