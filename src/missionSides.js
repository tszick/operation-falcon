import { isPracticeMission } from './trainingAircraft.js';
export const sideName = (side) => (side === 'east' ? 'KELETI' : 'NYUGATI');
export const canChooseSide = (m) => !isPracticeMission(m);
const reversed = {
  'defend-base': [
    'Támadd meg a repteret',
    ['Semmisítsd meg a nyugati repülőteret.', 'Térj vissza a saját bázisodra és szállj le.'],
    ['A nyugati vadászok leküzdése.', 'A reptér légvédelmének megsemmisítése.'],
  ],
  'escort-transport': [
    'Fogd el a szállítógépet',
    ['Semmisítsd meg a nyugati szállítót, mielőtt kijut a légtérből.', 'Térj haza és szállj le.'],
    ['A vadászkíséret leküzdése.'],
  ],
  'defend-city': [
    'Támadd meg a várost',
    ['Semmisítsd meg az épületek több mint 20%-át.', 'Térj haza és szállj le.'],
    ['A védő vadászok leküzdése.'],
  ],
  'ballistic-strike': [
    'Védd meg az indítósilót',
    [
      'Óvd meg a silót a kilövésig, majd biztosítsd a nyugati bázisra mért csapást.',
      'Térj haza és szállj le.',
    ],
    ['A nyugati támadó megsemmisítése.'],
  ],
  'air-superiority': [
    'Légifölény · keleti hadművelet',
    [
      'Küzdjétek le mind a 12 nyugati repülőt.',
      'Semmisítsétek meg a nyugati repteret.',
      'Védd meg a saját bázist, majd szállj le.',
    ],
    ['A nyugati rakétavédelem megsemmisítése.'],
  ],
  'iron-veil': [
    'Vasfátyol · a folyosó védelme',
    [
      'Őrizd meg a parancsnoki bunkert.',
      'Semmisítsd meg Nomad One-t, mielőtt kijut.',
      'Térj haza és szállj le.',
    ],
    [
      'A hídon átjut az erősítés.',
      'A nyugati bázis megsemmisítése.',
      'Legalább egy folyosóvédő SAM megmarad.',
    ],
  ],
  'carrier-defense': [
    'Támadd meg az anyahajót',
    [
      'Semmisítsétek meg az ellenséges anyahajót.',
      'Küzdjétek le a négy nyugati repülőt.',
      'A feladat után repülj a KIVONULÁS pontjához.',
    ],
    ['A baráti romboló túléli a bevetést.', 'A három rajtárs túléli a bevetést.'],
  ],
};
export function missionForSide(m, side = 'west') {
  if (!canChooseSide(m) || m.side === side) return m;
  const east = side === 'east',
    variant = east && reversed[m.objective];
  const common = { ...m, side: east ? 'east' : 'west', mirrored: !!variant };
  if (!variant) return common;
  const [name, primary, optional] = variant;
  return {
    ...common,
    name,
    primary,
    optional,
    recoveryMode: m.naval ? 'egress' : 'landing',
    originalAirStart: !!m.airStart,
    airStart: true,
    needs:
      m.objective === 'escort-transport'
        ? ['aam']
        : m.objective === 'ballistic-strike'
          ? ['aam']
          : m.needs,
    description:
      (m.naval
        ? 'Keleti támadóraj: te és három társad a levegőből közelítetek, egy baráti romboló támogat. A nyugati pilóták az ellenséges anyahajóról szállnak fel. A hajó és a négy védőgép leküzdése után a KIVONULÁS pontjához repülj; nincs saját fedélzeti leszállás.'
        : 'Az eredeti hadszíntér ellentétes oldala: a nyugati erők korábbi szerepe most ellenséges. A keleti egységek a társaid; a korábbi keleti raj egyik gépének helyén, a levegőből indulsz. Saját hátsó repülőtéren javíthatsz és tölthetsz újra.') +
      ' ' +
      primary.join(' '),
    roster: [
      ...m.roster.map((row) => ({
        ...row,
        team: row.team === 'enemy' ? 'ally' : row.team === 'ally' ? 'enemy' : row.team,
      })),
      { type: 'fighter', count: 1, team: 'enemy' },
      ...(!m.naval && !m.roster.some((r) => r.team === 'ally' && r.type === 'airbase')
        ? [{ type: 'airbase', count: 1, team: 'enemy' }]
        : []),
      ...(!m.naval && !m.roster.some((r) => r.team === 'enemy' && r.type === 'airbase')
        ? [{ type: 'airbase', count: 1, team: 'ally' }]
        : []),
    ],
  };
}
