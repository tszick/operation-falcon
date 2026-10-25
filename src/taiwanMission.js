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
  plateau: 0.2,
  landColor: [91, 128, 65],
});
const bases = ['WEST-AIRFIELD', 'WEST-CARRIER'];
const assets = [
  { id: 'WEST-AIRFIELD', type: 'airbase', side: 'west', position: [0, 0, 0], heading: 0 },
  { id: 'WEST-CARRIER', type: 'carrier', side: 'west', position: [-15000, 0, -12000], heading: 0 },
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
    'A Kelet három hullámban támad: hullámonként három négygépes raj, rajonként egy bombázó és három vadász. A hullámok hárompercenként érkeznek. A Nyugat három négygépes rajjal védekezik; a játékos a tizenkét gép egyike. Minden aktív raj a levegőből indul. A sziget közepén repülőtér, a tengeren nyugati anyahajó, a partokon négy SAM és négy légvédelmi löveg áll. Keletnek nincs szigete vagy reptere, csak egy anyahajója és egy rombolója. Saját, épségben maradt repülőtéren feltölthetsz; fedélzeti géppel saját anyahajón is. Nyugat győz, ha a keleti anyahajó megsemmisül, VAGY mind a 36 keleti gépet lelőttétek vagy végleg visszavonultak.',
  primary: [
    'Semmisítsétek meg a keleti anyahajót, VAGY küzdjétek le vagy kényszerítsétek végleges visszavonulásra mind a 36 keleti repülőt.',
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
        'Keleti támadás Tajvan ellen. Három hullám, hullámonként három négyszeres raj, egy bombázóval és három vadásszal rajonként. Te az első hullám egyik gépének helyén indulsz. A további hullámok hárompercenként érkeznek. A Nyugat tizenkét géppel, szigeti reptérrel, anyahajóval és partvédelmi ütegekkel védekezik. Keletnek nincs szigete vagy reptere: egy anyahajó és egy romboló támogatja. Fedélzeti típus saját anyahajón tölthet fel; a szárazföldi típusok szükség esetén végleg kivonulnak. A győzelemhez mindkét nyugati leszállóhely VAGY mind a tizenkét nyugati repülő megsemmisítése szükséges.',
      primary: [
        'Semmisítsétek meg a nyugati repteret ÉS az anyahajót, VAGY küzdjétek le mind a 12 nyugati repülőt.',
      ],
      optional: ['A keleti romboló túléli a bevetést.'],
    },
  },
  battlefield: {
    environment: {
      ocean: true,
      islands: [island(0, 0, 10000, 22000, 0.15, 650)],
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
        attack: ['EAST-CARRIER'],
        defend: bases,
      },
      {
        side: 'east',
        withdrawalPoint: [-50000, 3000, 5000],
        physicalRecovery: true,
        waves: 3,
        squadrons: 3,
        interval: 180,
        position: [-28000, 2600, 5000],
        heading: Math.PI / 2,
        fighter: 'su27',
        bomber: 'tu95',
        attack: bases,
        defend: ['EAST-CARRIER'],
      },
    ],
    reports: {
      west: [
        {
          id: 'invasion-bases',
          text: 'Hajó {destroyed}/{total} · gép {airResolved}/{airTotal}',
          assets: ['EAST-CARRIER'],
          air: 'east',
          condition: {
            any: [{ destroy: ['EAST-CARRIER'] }, { eliminateAir: 'east', allowWithdrawn: true }],
          },
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
      west: {
        any: [{ destroy: ['EAST-CARRIER'] }, { eliminateAir: 'east', allowWithdrawn: true }],
      },
      east: { any: [{ destroy: bases }, { eliminateAir: 'west' }] },
    },
  },
};

taiwanMission.sideBriefings.west = {
  description: taiwanMission.description,
  primary: taiwanMission.primary,
  optional: taiwanMission.optional,
};
