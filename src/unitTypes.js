import { mobileUnitTypes } from './mobileUnitData.js';
export const unitTypes = {
  ...mobileUnitTypes,
  tanker: {
    name: 'KC-135R Stratotanker',
    category: 'Fegyvertelen katonai tankergép',
    kind: 'air',
    weapons: [],
    speed: 155,
    health: 100,
    role: 'Légiutántöltés',
    size: '41,53 m hossz · 39,88 m fesztáv',
    description:
      'Négyhajtóműves amerikai légiutántöltő. Nincs támadófegyvere; véges infracsapda- és dipólkészlettel védekezik. A küldetésben 2200 m MSL-en, 558 km/h valós légsebességgel repül, majd köröz. A türkiz tankolási pont a gép mögött 48 m-rel, alatta 6 m-rel van; 9 m tűrés, legfeljebb 6 m/s relatív sebesség és 5 másodperc stabil helyzet után automatikusan indul az átadás, 30 kg/s játékbeli sebességgel. Az 50%-nyi tartálykapacitás átvétele teljesíti a tankolási célt. A kontaktzóna egyszerűsített, a játék mindkét töltési rendszerű vadászgépet fogadja; nem típusminősített eljárás.',
  },
  carrier: {
    name: 'Anyahajó',
    category: 'Tüzelő hadihajó · saját bázis',
    kind: 'ground',
    weapons: ['gun', 'missile'],
    health: 600,
    radarRange: 12000,
    description:
      'Szürke, 320 méteres játékbeli anyahajó, ferde leszállósávval, négy fékezőkötéllel és katapulttal. Két önálló gépágyúállással védekezik, egyszerre két légi célt követhet. Állásonként 1800 lőszerrel és 1,8 km-es játékbeli hatásos lőtávval; két RIM-7 Sea Sparrow védelmi rakétát is hordoz, 9 km névleges játékbeli lőtávval, véges készlettel, továbbá 2 RAM elfogórakétát SeaRAM rendszerben a hajóra közeledő rakéták ellen. A fegyverprofil játékbeli közelítés, nem egy konkrét valós rendszer pontos mása. Nincs külön 900 méteres célmagasság-korlát: a térbeli lőtáv, radar és ballisztikai elérhetőség dönt. K: fékezőhorog, U: katapult. A Harrier függőlegesen, fékezőkötél nélkül száll le.',
    role: 'Védendő tengeri bázis',
    size: '320 × 72 m fedélzet · 20 m tengerszint felett',
  },
  destroyer: {
    name: 'Rakétás romboló',
    category: 'Tüzelő hadihajó',
    kind: 'ground',
    weapons: ['missile', 'gun'],
    health: 220,
    radarRange: 24000,
    radarAntennaHeight: 16,
    radarMinElevation: 0.15,
    speed: 10,
    description:
      'Közeledő ellenséges romboló, függőleges rakétaindítókkal, radarral és gépágyúval. 24 km-es radarral és hat RIM-7 Sea Sparrow rakétával rendelkezik; ugyanaz a 9 km-es névleges játékbeli rakétaprofil és félaktív radaros rávezetés érvényes, mint az anyahajón. Emellett 2 RAM elfogórakétát hordoz SeaRAM rendszerben, a hajót támadó rakéták ellen. A gépágyú hatásos lőtávja 1,8 km. Bombával, levegő–felszín rakétával és közeli ágyútűzzel is támadható.',
    role: 'Tengeri rakétás légvédelem',
    size: '150 m hosszú hajó',
  },
  'target-range': {
    name: 'Célterület',
    category: 'Gyakorlócél · nem tüzel',
    kind: 'ground',
    weapons: [],
    health: 100,
    description:
      '50 méter sugarú, kör alakú gyakorlócél, közepén kiszuperált tankkal. Az inert bomba tényleges talajbecsapódási pontja számít: a körön belüli találat érvényes. Nem kell elpusztítani; robbanás és területi sebzés nincs.',
    role: 'Ismételt bombacélzás ugyanarra a körre',
    size: '100 m átmérő; középen tankroncs',
  },
  'city-building': {
    name: 'Városi épület',
    category: 'Védendő objektum',
    kind: 'ground',
    weapons: [],
    health: 60,
    description:
      'A város külön rombolható házai. Közel 4 km széles metropolis: 180–300 méteres külső tornyok, 400–560 méteres belváros és 820–900 méteres központi felhőkarcoló. Az épülettömbök között legalább 620 méter széles repülési folyosók maradnak. A védelemhez legalább 80%-uknak állva kell maradnia.',
    role: 'Védendő város',
    size: '25 rombolható torony · közel 4 × 4 km',
  },
  'ballistic-silo': {
    name: 'Interkontinentális rakétasiló',
    category: 'Tüzelő objektum',
    kind: 'ground',
    weapons: ['ballistic'],
    health: 180,
    description:
      'Ötperces visszaszámlálás után egyetlen interkontinentális rakétát indít a saját bázisunkra. Kilövés előtti megsemmisítése megakadályozza a támadást; utána a rakéta már önálló cél.',
    role: 'Időzített stratégiai fenyegetés',
    size: 'Megerősített siló és kiszolgálóépület',
  },
  ballistic: {
    name: 'Interkontinentális rakéta',
    category: 'Önálló légi fenyegetés',
    kind: 'air',
    weapons: [],
    health: 25,
    speed: 3300,
    speedLabel: 'Indulósebesség (játék)',
    description:
      'Rövidített, játékhoz hangolt hajtott és ballisztikus repülés. A kilövés után a siló megsemmisítése már nem állítja meg. Levegő-levegő rakétával befogható; a nagy sebesség miatt csak kedvező szembetalálkozásnál van érdemi esély az elfogására.',
    role: 'Bázis elleni interkontinentális csapás',
  },
  airbase: {
    name: 'Repülőtér',
    category: 'Nem tüzelő objektum',
    kind: 'ground',
    weapons: [],
    health: 240,
    description:
      'Kifutópálya, hangárok és irányítótorony. Önmagában nem tüzel; külön védelmi egységek oltalmazhatják.',
    role: 'Stratégiai objektum',
    size: '3,2 km-es kifutópálya és kiszolgálóépületek',
  },
  bridge: {
    name: 'Híd',
    category: 'Nem tüzelő objektum',
    kind: 'ground',
    weapons: [],
    health: 100,
    description:
      'Folyón átvezető közúti átkelő. Megsemmisítésével a közeledő konvoj útja elvágható.',
    role: 'Útvonal lezárása',
    size: 'A folyó szélességéhez igazodik',
  },
  bunker: {
    name: 'Bunker',
    category: 'Tüzelő objektum',
    kind: 'ground',
    weapons: ['gun'],
    health: 140,
    description:
      'Megerősített, lapos kupolás állás. Közeli légi és földi célokra gépágyúval tüzel.',
    role: 'Területvédelem',
    size: '74 m széles tető',
  },
  fighter: {
    name: 'Vadászgép',
    category: 'Tüzelő egység',
    kind: 'air',
    weapons: ['missile', 'gun'],
    description:
      'Rakétával és a saját géptípusának megfelelő gépágyúval küzd. Az ellenfél típusa a választott géphez igazodik.',
    role: 'Légi elfogás',
    speed: 165,
  },
  bomber: {
    name: 'Bombázó',
    category: 'Tüzelő egység',
    kind: 'air',
    weapons: ['bomb', 'gun'],
    description:
      'A kijelölt objektum felé repül, majd valódi ballisztikus bombákat old. A Tu–95 és a játék klasszikus, fegyveres B–52 változatának farokgépágyúja külön célozza a közeli ellenséges repülőket. Csak a hátsó tüzelési szektorban veszélyes; földi célt nem támad vele.',
    role: 'Objektumok támadása',
    speed: 145,
  },
  transport: {
    name: 'Szállítógép',
    category: 'Nem tüzelő egység',
    kind: 'air',
    weapons: [],
    description:
      'Fegyvertelen szállító, véges infracsapda- és dipólkészlettel. A gépi vezérlés rakétaveszélyre kitér, majd visszatér az útvonalára. A szállítós küldetésen a játékos is vezetheti, ilyenkor két baráti vadász fedezi.',
    role: 'Védendő szövetséges',
    speed: 125,
  },
  convoy: {
    flakRange: 6500,
    name: 'Konvoj',
    category: 'Tüzelő egység',
    kind: 'ground',
    weapons: ['flak', 'gun'],
    health: 110,
    description:
      'Öt teherautó az úton halad. Légvédelmi gránáttal és gépágyúval védekezik; támadó feladatban a bázis közelében tüzet nyit.',
    role: 'Mozgó földi egység',
    speed: 14,
  },
  sam: {
    radarRange: 6500,
    flakRange: 6500,
    name: 'Légvédelmi üteg',
    category: 'Tüzelő egység',
    kind: 'ground',
    weapons: ['flak', 'gun'],
    health: 90,
    description:
      'Magasabban repülő célra időzített légvédelmi gránátokat, alacsony célra rövid gépágyúsorozatokat lő.',
    role: 'Közeli légvédelem',
    size: 'Kb. 20 m-es állás',
  },
  'sam-system': {
    radarAntennaHeight: 6,
    radarMinElevation: 0.15,
    radarRange: 24000,
    name: 'Légvédelmi rakétarendszer',
    category: 'Tüzelő egység',
    kind: 'ground',
    weapons: ['missile', 'gun'],
    health: 90,
    description:
      'Teherautó és függőleges rakétaindító. Követő rakétákkal és közeli gépágyúval védi a kijelölt területet.',
    role: 'Rakétás légvédelem',
    size: 'Kb. 30 m-es telepítés',
  },
  jammer: {
    name: 'Jelzavaró',
    category: 'Zavaró ellenség',
    kind: 'ground',
    weapons: ['jammer'],
    health: 65,
    description:
      '7 km sugarú körben letiltja az ellenséges navigációt és a célbefogást. Kívülről a többi aktív védővel együtt kijelölhető.',
    role: 'Radar / GPS zavarás',
    range: 7000,
  },
  civil: {
    name: 'Civil repülő',
    category: 'Nem támadó repülő',
    kind: 'air',
    weapons: [],
    description: 'Tilos megtámadni. A békés befogás után visszafordul és elhagyja a légteret.',
    role: 'Békés elfogás',
    speed: 120,
  },
};
export const unitDefinition = (type) =>
  unitTypes[type] || { name: type, kind: 'ground', weapons: [], health: 100 };
export const teamOf = (t, s) =>
  t === s
    ? 'ally'
    : t.team ||
      (t.civilian || t.faction === 'neutral'
        ? 'neutral'
        : t.faction === s?.spec?.faction
          ? 'ally'
          : 'enemy');
export const isHostile = (t, s) => teamOf(t, s) === 'enemy';
export const isActiveDefender = (t) =>
  (t.alive && t.type === 'jammer') ||
  (t.alive && (t.threats || unitDefinition(t.type).weapons).some((w) => w !== 'jammer'));
