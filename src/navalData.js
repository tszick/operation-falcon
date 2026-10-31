import { Vec3, Quat, DEG } from './math.js';
export const carrierDeck = { halfWidth: 36, halfLength: 160, elevation: 20 };
export function carrierAirfield(carrier = null) {
  const position = carrier?.position?.clone() || new Vec3(),
    heading = carrier?.heading || 0;
  return {
    carrier: true,
    home: true,
    position: Quat.euler(heading, 0, 0)
      .rotate(new Vec3(-7, 0, -10))
      .add(position),
    heading: heading - 8 * DEG,
    elevation: position.y + 20,
    deckPosition: position,
    deckHeading: heading,
    halfWidth: 13,
    halfLength: 140,
    touchdownOffset: 80,
    glideDeg: 3.5,
  };
}
export const harrier = {
  id: 'harrier',
  name: 'AV-8B Harrier II Plus',
  faction: 'west',
  group: 'nato-classic',
  role: 'Fedélzeti V/STOL csapásmérő',
  carrierCapable: true,
  vtol: true,
  engineCount: 1,
  emptyMass: 6340,
  fuelCapacity: 3519,
  thrust: 98750,
  abThrust: 98750,
  hasAB: false,
  wingArea: 22.61,
  maxG: 7.8,
  maxMach: 0.9,
  ceiling: 15240,
  radarRange: 65000,
  radarCone: 60,
  lockTime: 2,
  tags: ['aam', 'agm', 'bomb', 'agility'],
  shape: 'swept',
  cd0: 0.028,
  inducedDrag: 0.075,
  clSlope: 4.8,
  maxCL: 1.65,
  stallAlpha: 19 * DEG,
  pitchRate: 32,
  rollRate: 75,
  gunAmmo: 300,
  approachSpeed: 60,
  maxWeaponPayloadKg: 4170,
  maxTakeoffMass: 14061,
};
export const navalMission = {
  id: 'carrier-defense',
  name: 'Védd meg az anyahajót',
  difficulty: 'TOP-GUN',
  icon: '⚓',
  kind: 'mixed',
  objective: 'carrier-defense',
  composition: true,
  naval: true,
  code: 'SEA GUARD',
  needs: ['aam', 'bomb'],
  speed: 0,
  description:
    'Nappali tengeri bevetés az anyahajó fedélzetéről. Falcon Two előtted indul, Falcon Three és Falcon Four már a levegőből fedezi az anyahajót. Egyetlen támadó raj érkezik, három vadásszal és egy bombázóval. Nincs második hullám. Egy ellenséges rakétás romboló is közeledik, kezdetben 23,4 km-ről, a 9 km-es Sea Sparrow rakétalőtávján kívülről. Küzdd le őket, őrizd meg az anyahajót, majd szállj vissza. F/A-18C vagy F-14: U katapult, K fékezőhorog. Harrier: Z fúvócső 0/45/90°, függőleges leszállás kötél nélkül; a lebegés tömegfüggő.',
  primary: [
    'Védd meg az anyahajót.',
    'Küzdd le a négygépes támadó rajt.',
    'Semmisítsd meg a közeledő ellenséges rombolót.',
    'Térj vissza és állj meg az anyahajó fedélzetén.',
  ],
  optional: [
    'Falcon Two túléli a bevetést.',
    'Falcon Three túléli a bevetést.',
    'Falcon Four túléli a bevetést.',
  ],
  roster: [
    { type: 'fighter', count: 3, team: 'enemy' },
    { type: 'bomber', count: 1, team: 'enemy' },
    { type: 'destroyer', count: 1, team: 'enemy' },
    { type: 'carrier', count: 1, team: 'ally' },
    { type: 'fighter', count: 3, team: 'ally' },
  ],
};
