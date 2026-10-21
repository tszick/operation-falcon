import { Vec3 } from './math.js';
// The transport version of Iron Veil flies the extraction leg. The armed strike
// version retains its original multi-sortie objectives and aircraft selection.
export function missionForAircraft(m, spec) {
  if (!spec.transport) return m;
  if (m.objective === 'escort-transport')
    return {
      ...m,
      description:
        'Te vezeted Nomad One szállítógépét, két Falcon vadász fedez. Egy ellenséges vadász és egy légvédelmi üteg veszélyeztet. Juss el az északi KIJÁRAT jelzéshez, majd térj haza és szállj le. A géped fegyvertelen; C / 5 / 6: elterelők.',
      primary: [
        'Vezesd ki a saját szállítógépedet a műveleti légtérből.',
        'Térj haza, szállj le és állj meg.',
      ],
      optional: ['A kísérők semmisítsék meg az összes ellenfelet.'],
      roster: [
        { type: 'fighter', count: 1, team: 'enemy' },
        { type: 'sam', count: 1, team: 'enemy' },
        { type: 'fighter', count: 2, team: 'ally' },
      ],
    };
  if (m.objective !== 'iron-veil') return m;
  return {
    ...m,
    objective: 'escort-transport',
    airStart: true,
    playerTransportLeg: true,
    roster: [
      { type: 'fighter', count: 1, team: 'enemy' },
      { type: 'sam', count: 1, team: 'enemy' },
      { type: 'fighter', count: 2, team: 'ally' },
    ],
    description:
      'Vasfátyol – szállítós szakasz. Te vezeted Nomad One-t a folyosón, két Falcon vadász fedez. Juss el a kijáratig, majd térj vissza és szállj le. A fegyveres változat folyosónyitó és ellencsapási szakasza ebben a szerepben nem része a feladatnak.',
    primary: ['Vezesd ki a saját szállítógépedet a műveleti légtérből.', 'Térj haza és szállj le.'],
    optional: ['A kísérők semmisítsék meg az összes ellenfelet.'],
  };
}
export function syncPlayerTransport(s, targets) {
  if (!s.spec.transport) return;
  const t = targets.find((t) => t.playerControlled);
  if (!t) return;
  t.position = s.position.clone();
  t.previousPosition = s.previousPosition?.clone() || t.position.clone();
  t.velocity = s.velocity.clone();
  t.damage = s.damage;
  t.agl = s.agl;
  t.alive = !s.crashed && !s.dying;
  // Crossing the marked exit completes delivery, not the sortie: fly home next.
  if (
    t.alive &&
    s.airborne &&
    !s.onGround &&
    s.position.z >= t.exitZ &&
    Math.abs(s.position.x - t.routeX) < 5000 &&
    s.agl > 30
  )
    t.exited = true;
}
export const transportExitPosition = (t) => new Vec3(t.routeX, t.routeAltitude ?? 1700, t.exitZ);
