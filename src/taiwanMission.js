// Mission data only: combat, service, waves and victory evaluation are shared systems.
const island = (x, z, radiusX, radiusZ, heading, height) => ({
  x,
  z,
  radiusX,
  radiusZ,
  radius: Math.max(radiusX, radiusZ) * 1.18,
  heading,
  height,
  phase: 0,
  plateau: 0.8,
  landColor: [91, 128, 65],
});
const bases = ['WEST-AIRFIELD', 'WEST-CARRIER'];
const assets = [
  { id: 'WEST-AIRFIELD', type: 'airbase', side: 'west', position: [0, 0, 0], heading: 0 },
  { id: 'WEST-CARRIER', type: 'carrier', side: 'west', position: [-15000, 0, -12000], heading: 0 },
  { id: 'EAST-AIRFIELD', type: 'airbase', side: 'east', position: [-45000, 0, 17000], heading: 0 },
  {
    id: 'EAST-CARRIER',
    type: 'carrier',
    side: 'east',
    position: [-26000, 0, 14000],
    heading: Math.PI,
  },
  {
    id: 'EAST-DESTROYER',
    type: 'destroyer',
    side: 'east',
    position: [-20000, 0, 5000],
    heading: Math.PI,
  },
  ...[
    [-7200, -9000],
    [-7500, 4500],
    [5800, 11500],
    [6500, -6000],
  ].map(([x, z], i) => ({
    id: 'WEST-SAM-' + (i + 1),
    type: 'sam-system',
    side: 'west',
    position: [x, 0, z],
  })),
  ...[
    [-6200, -13000],
    [-7800, 0],
    [6800, 4000],
    [4800, 14500],
  ].map(([x, z], i) => ({
    id: 'WEST-FLAK-' + (i + 1),
    type: 'flak',
    side: 'west',
    position: [x, 0, z],
  })),
];
export const taiwanMission = {
  id: 'taiwan-invasion',
  name: 'Invázió: Tajvan',
  difficulty: 'TOP-GUN',
  icon: '◈',
  kind: 'mixed',
  objective: 'invasion',
  composition: true,
  airStart: true,
  code: 'TAIWAN SHIELD',
  needs: ['aam', 'bomb'],
  speed: 0,
  description:
    'A Kelet három hullámban támad: hullámonként három négygépes raj, rajonként egy bombázó és három vadász. A hullámok hárompercenként érkeznek. A Nyugat három négygépes rajjal védekezik; a játékos a tizenkét gép egyike. Minden aktív raj a levegőből indul. A sziget közepén repülőtér, a tengeren nyugati anyahajó, a partokon négy SAM és négy légvédelmi löveg áll. A Keletet anyahajó, romboló és hátsó repülőtér támogatja. Saját, épségben maradt repülőtéren feltölthetsz; fedélzeti géppel saját anyahajón is. A győzelem azonnali: legalább egy nyugati leszállóhely maradjon meg, és mind a 36 keleti gépet küzdjétek le.',
  primary: [
    'Őrizz meg legalább egy leszállóhelyet: a szigeti repteret vagy a nyugati anyahajót.',
    'Küzdjétek le mind a 36 keleti repülőt, a három hullámot együtt.',
  ],
  optional: ['Semmisítsétek meg a keleti rombolót.'],
  roster: [
    { type: 'fighter', count: 27, team: 'enemy' },
    { type: 'bomber', count: 9, team: 'enemy' },
    { type: 'fighter', count: 8, team: 'ally' },
    { type: 'bomber', count: 3, team: 'ally' },
    ...assets.map((a) => ({ type: a.type, count: 1, team: a.side === 'west' ? 'ally' : 'enemy' })),
  ].reduce((rows, r) => {
    const old = rows.find((a) => a.type === r.type && a.team === r.team);
    if (old) old.count += r.count;
    else rows.push({ ...r });
    return rows;
  }, []),
  endOnObjectives: true,
  sideBriefings: {
    east: {
      description:
        'Keleti támadás Tajvan ellen. Három hullám, hullámonként három négyszeres raj, egy bombázóval és három vadásszal rajonként. Te az első hullám egyik gépének helyén indulsz. A további hullámok hárompercenként érkeznek. A Nyugat tizenkét géppel, szigeti reptérrel, anyahajóval és partvédelmi ütegekkel védekezik. Saját repülőtéren feltölthetsz; a fedélzeti típusok saját anyahajót is használhatnak. A győzelemhez mindkét nyugati leszállóhely VAGY mind a tizenkét nyugati repülő megsemmisítése szükséges.',
      primary: [
        'Semmisítsétek meg a nyugati repteret ÉS az anyahajót, VAGY küzdjétek le mind a 12 nyugati repülőt.',
      ],
      optional: ['A keleti romboló túléli a bevetést.'],
    },
  },
  battlefield: {
    environment: {
      ocean: true,
      islands: [island(0, 0, 10000, 22000, 0.15, 80), island(-45000, 17000, 11500, 23000, 0, 50)],
    },
    assets,
    flights: [
      {
        side: 'west',
        physicalRecovery: true,
        waves: 1,
        squadrons: 3,
        interval: 180,
        position: [-7000, 2200, -8000],
        heading: -Math.PI / 2,
        fighter: 'fa18',
        bomber: 'b52',
        attack: ['EAST-CARRIER', 'EAST-AIRFIELD'],
        defend: bases,
      },
      {
        side: 'east',
        physicalRecovery: true,
        waves: 3,
        squadrons: 3,
        interval: 180,
        position: [-28000, 2600, 5000],
        heading: Math.PI / 2,
        fighter: 'su27',
        bomber: 'tu95',
        attack: bases,
        defend: ['EAST-CARRIER', 'EAST-AIRFIELD'],
      },
    ],
    waitForThreats: ['west'],
    reports: {
      west: [
        {
          id: 'invasion-bases',
          text: 'Saját bázisok: {alive}/{total}',
          assets: bases,
          condition: { survive: bases, min: 1 },
        },
        {
          id: 'attackers',
          text: 'Repülők: {airLost}/{airTotal} · hullám {wave}/3',
          air: 'east',
          condition: { eliminateAir: 'east' },
        },
        {
          id: 'destroyer',
          text: 'Romboló megsemmisítve',
          condition: { destroy: ['EAST-DESTROYER'] },
          optional: true,
        },
      ],
      east: [
        {
          id: 'invasion-bases',
          text: 'Bázis {destroyed}/{total} · repülő {airLost}/{airTotal}',
          assets: bases,
          air: 'west',
          condition: { any: [{ destroy: bases }, { eliminateAir: 'west' }] },
        },
        {
          id: 'destroyer',
          text: 'Romboló megmaradt',
          condition: { survive: ['EAST-DESTROYER'], min: 1 },
          optional: true,
        },
      ],
    },
    victory: {
      west: { all: [{ survive: bases, min: 1 }, { eliminateAir: 'east' }] },
      east: { any: [{ destroy: bases }, { eliminateAir: 'west' }] },
    },
  },
};

taiwanMission.sideBriefings.west = {
  description: taiwanMission.description,
  primary: taiwanMission.primary,
  optional: taiwanMission.optional,
};
