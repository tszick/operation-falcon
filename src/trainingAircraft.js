// Public dimensional/engine data: US Navy T-45 fact file. Aerodynamic coefficients
// and training sensor range are gameplay approximations, not NATOPS tables.
export const trainingAircraft = {
  id: 't45',
  name: 'T-45C Goshawk',
  faction: 'west',
  group: 'training',
  trainingOnly: true,
  role: 'Haditengerészeti kiképzőgép',
  engineCount: 1,
  emptyMass: 4261,
  fuelCapacity: 1317,
  thrust: 24585,
  abThrust: 24585,
  hasAB: false,
  wingArea: 17.7,
  maxG: 7.3,
  maxMach: 0.85,
  ceiling: 12954,
  radarRange: 45000,
  radarCone: 60,
  syntheticRadar: true,
  tags: ['agility', 'bomb', 'radar'],
  shape: 'swept',
  cd0: 0.025,
  inducedDrag: 0.065,
  clSlope: 4.8,
  maxCL: 1.55,
  stallAlpha: (19 * Math.PI) / 180,
  pitchRate: 30,
  rollRate: 75,
  lockTime: 2,
  gunAmmo: 0,
  approachSpeed: 60,
  maxWeaponPayloadKg: 34.02,
  maxTakeoffMass: 6577,
  countermeasureCapacity: 0,
};
export const isPracticeMission = (m) =>
  m.group === 'practice' || ['landing', 'canyon', 'civil', 'practice-bombing'].includes(m.id);
export const unarmedPractice = (m) => isPracticeMission(m) && m.objective !== 'practice-bombing';
// JP-5 usable fuel: 2904 lb, rounded to kg (CNATRA engineering training text).
export const trainerReferences = [
  [
    'T–45 alapadatok · US Navy',
    'https://www.navy.mil/DesktopModules/ArticleCS/Print.aspx?Article=2166516&ModuleId=724&PortalId=1',
  ],
  [
    'T–45C / Mk 76 kiképzés · US Navy',
    'https://www.navy.mil/Press-Office/News-Stories/display-news/Article/2402468/training-wings-strike-pilot-detachment-makes-impact/',
  ],
  [
    'CNATRA T–45 konfiguráció és használható üzemanyag · oktatási kézikönyv másolata',
    'https://navyflightmanuals.tpub.com/P-1239/T-45A-Overview-26.htm',
  ],
];
