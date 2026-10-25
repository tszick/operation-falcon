import { carrierAirfield } from './navalData.js';
import { runway, terrainHeight } from './terrain.js';
import { Quat } from './math.js';
export function airfieldForTarget(home) {
  return home.type === 'carrier'
    ? { ...carrierAirfield(home), targetId: home.id }
    : {
        position: home.position.clone(),
        elevation: terrainHeight(home.position.x, home.position.z),
        heading: home.heading || 0,
        halfLength: runway.halfLength,
        halfWidth: runway.halfWidth,
        home: true,
        targetId: home.id,
      };
}
export function recoveryAirfields(s, targets) {
  return targets.filter(
    (t) =>
      t.alive &&
      t.team === 'ally' &&
      (t.type === 'airbase' || (t.type === 'carrier' && s.spec.carrierCapable)),
  );
}
export function selectRecoveryAirfield(s, targets) {
  const choices = recoveryAirfields(s, targets);
  const current = choices.find((t) => t.id === s.airfield?.targetId);
  // Keep the current strip during rollout; in flight the nearest friendly usable base guides N.
  const nearest =
    s.onGround && current
      ? current
      : choices.sort(
          (a, b) => a.position.distance(s.position) - b.position.distance(s.position),
        )[0];
  if (!nearest) {
    if (s.airfield?.targetId) delete s.airfield;
    return;
  }
  if (nearest.id === s.airfield?.targetId) return;
  s.airfield = airfieldForTarget(nearest);
  if (s.spec.carrierCapable) {
    s.naval ??= { hook: false, nozzle: 0, arrested: false, bolter: false };
    s.naval.arrested = false;
    s.naval.catapult = false;
    s.naval.launchComplete = false;
  }
  delete s.approach;
  delete s.landingRoute;
}
export function carrierLocalPosition(p, field) {
  return Quat.euler(-(field?.deckHeading || 0), 0, 0).rotate(
    p.clone().sub(field?.deckPosition || { x: 0, y: 0, z: 0 }),
  );
}
