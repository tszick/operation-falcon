export const refuellingMission = {
  id: 'aerial-refuelling',
  name: 'Légiutántöltés',
  objective: 'aerial-refuelling',
  difficulty: 'TOP-GUN',
  icon: '◇',
  kind: 'mixed',
  composition: true,
  airStart: true,
  noAirfield: true,
  endOnObjectives: true,
  needs: ['aam'],
  speed: 0,
  code: 'OPERATION LIFELINE',
  description:
    'Kevés üzemanyaggal indulsz a levegőből. A szemközti oldalról érkező KC–135R 2200 méteren, 558 km/h valós légsebességgel tart az utántöltési körzetbe, majd köröz. Védd meg az ellenséges vadásztól, és tankolj a tanker mögött stabil kötelékben. Nincs repülőtér; a sikerhez tankolás és az ellenséges vadász megsemmisítése szükséges.',
  primary: [
    'Vegyél át a saját tartálykapacitásod 50%-ának megfelelő üzemanyagot.',
    'Semmisítsd meg az ellenséges vadászgépet.',
  ],
  optional: [
    'Semmisítsd meg mindhárom ellenséges légvédelmi üteget.',
    'A tanker a küldetés végéig életben marad.',
  ],
  roster: [
    { type: 'tanker', count: 1, team: 'ally' },
    { type: 'fighter', count: 1, team: 'enemy' },
    { type: 'sam', count: 3, team: 'enemy' },
  ],
};
export const refuellingEastBrief = {
  name: 'Akadályozd meg a légiutántöltést',
  description:
    'Keleti támadóként a levegőből indulsz, három baráti légvédelmi üteg támogat. Semmisítsd meg a nyugati KC–135R tankert. Egy nyugati vadász kevés üzemanyaggal próbál tankolni és megvédeni azt. Nincs repülőtér; a tanker megsemmisítésével győzöl.',
  primary: ['Semmisítsd meg a nyugati tankergépet.'],
  optional: [
    'Semmisítsd meg a nyugati vadászgépet.',
    'Mindhárom baráti légvédelmi üteg túléli a küldetést.',
  ],
  roster: [
    { type: 'tanker', count: 1, team: 'enemy' },
    { type: 'fighter', count: 1, team: 'enemy' },
    { type: 'sam', count: 3, team: 'ally' },
  ],
};
