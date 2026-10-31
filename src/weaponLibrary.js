import { trainingAircraft } from './trainingAircraft.js';
import { aircraft } from './aircraftSpec.js';
import { armament } from './armament.js';
import { weaponProfile, weaponProfiles } from './weaponDynamics.js';
const category = {
  gun: 'Gépágyú',
  aam: 'Levegő–levegő rakéta',
  agm: 'Levegő–föld rakéta',
  bomb: 'Szabadesésű bomba',
};
const guidance = {
  ir: 'Infravörös önirányítás',
  imaging: 'Képalkotó önirányítás',
  sarh: 'Félaktív radaros rávezetés',
  active: 'Aktív radaros végfázis',
  laser: 'Lézeres célmegjelölés (egyszerűsített játékmodell)',
};
function describe(type, p) {
  if (p.inert)
    return {
      description:
        'Mk 76 alakú, 11,34 kg-os inert gyakorlóbomba. A játék változatában nincs robbanó- vagy jelzőtöltet; csak a talajon mért becsapódási pont jelölése látszik. A valós Mk 76 használhat jelzőpatront, ezt nem modellezzük robbanásként.',
      usable: 'Kizárólag a gyakorlóbombázás kijelölt célköre.',
      excellent: 'Egyenes, stabil rárepülés a tankroncs körüli célterületre.',
      cannot:
        'Nincs robbanás, környezeti vagy közvetlen sebzés. Nem pusztítja el a tankot, épületeket vagy repülőket.',
      operation:
        '4 → CCIP a célkörbe → Szóköz, egyenként. Háromból két találat, majd leszállás és megállás. Újratöltés nincs.',
      counter: 'A bomba nem követ célt; kioldás után ballisztikusan esik, légellenállással.',
    };
  if (type === 'gun')
    return {
      description:
        'Rövid sorozatokkal használható, irányítatlan gépágyú. A lövedék esik, lassul és szóródik; távolabbról kisebb a találati esély és a becsapódási energia.',
      usable: 'Közeli légi és földi célok; vadász, bombázó, szállító, konvoj és földi állások.',
      excellent: 'Közeli, lassú vagy egyenesen mozgó cél; zavaróállomás a zónán belül is.',
      cannot:
        'Nincs automatikus célkövetés. Távoli célra nem hatásos; civil és szövetséges célra tüzelni tilos.',
      operation:
        '1 → rövid Szóköz-sorozatok. Mozgó célra az előretartási jelet figyeld; befogás nélkül is tüzel.',
      counter: 'A flare és a dipólköteg nem téríti el a lövedékeket.',
    };
  if (type === 'bomb')
    return {
      description:
        'Hajtómű és önirányítás nélküli, ballisztikusan eső bomba. A CCIP a várható becsapódási helyet jelzi; zavaráskor kézzel kell célozni.',
      usable: 'Földi objektumok: reptér, híd, bunker, légvédelmi állás, jelzavaró és konvoj.',
      excellent:
        'Nagy, álló földi objektum, például reptér vagy híd. Mozgó konvojnál az útját előre kell becsülni.',
      cannot:
        'Légi cél elleni célkövetésre alkalmatlan. Nem korrigál kioldás után; a civil és a saját egység sérülhet.',
      operation:
        '4 → CCIP a célra → Szóköz. Befogás nem kell. Zavarózónában a becsapódási segédjel eltűnik.',
      counter: 'Az infracsapda és a dipólköteg nem téríti el.',
    };
  const air = type === 'aam',
    support = p.guidance === 'sarh' || p.guidance === 'laser',
    active = p.guidance === 'active';
  const control = support
    ? 'A rávezetéshez tartsd a célt a hordozó érzékelőjének látómezejében, szabad rálátással a találatig.'
    : active
      ? 'A hordozónak az önálló végfázisig támogatnia kell. Utána a rakéta önállóan követ.'
      : 'Indítás után önállóan követ; a hordozó befogásának elvesztése önmagában nem szakítja meg a követést.';
  const excellent = air
    ? p.maxG <= 22
      ? 'Bombázó, szállító és kevésbé manőverező légi cél; erősen kitérő vadász ellen kisebb a tartalék.'
      : p.maxRange <= 24000
        ? 'Közeli légiharc, forduló vadász és közeledő légi cél, a kijelzett kedvező lőtávon belül.'
        : 'Közepes vagy nagyobb távolságról közeledő légi cél; a névleges maximum helyett a becsült lőtávot figyeld.'
    : p.id === 'brimstone'
      ? 'Mozgó földi cél, például konvoj, megfelelő befogással és szabad rálátással.'
      : 'Pontszerű földi állás: légvédelem, jelzavaró vagy bunker; nagyobb objektumhoz több találat kellhet.';
  return {
    description: `${category[type]}. ${guidance[p.guidance]}. ${control}`,
    usable: air
      ? 'Vadászgép, bombázó és szállítógép: légi célokra indítható.'
      : 'Konvoj, légvédelmi üteg, rakétarendszer, jelzavaró, bunker, híd és reptér: földi célokra indítható.',
    excellent,
    cannot: air
      ? 'Földi célokra nem indítható: reptérre, hídra, konvojra, bunkerre és légvédelemre sem. Civilre tüzelni tilos; szövetséges nem jelölhető ki.'
      : 'Repülőgépre nem indítható. Zavarózónán belül új irányított rakéta nem indítható; a zavaró ellen sem. Szövetséges nem jelölhető ki.',
    operation: `${air ? '2' : '3'} → T/Tab: célválasztás és befogás → tartsd a célt az indítási szögön belül → Szóköz. A lőtáv, tereptakarás, sérülés és lőszer is számít. Zavarózónában nincs indítás.`,
    counter: ['ir', 'imaging'].includes(p.guidance)
      ? 'A játékban infracsapda térítheti el; a hatás a keresőtől és a helyzettől függ.'
      : p.guidance === 'laser'
        ? 'A flare és a dipólköteg nem szakítja meg a lézeres megjelölést; a hordozói támogatás elvesztése viszont igen.'
        : 'Dipólköteg (chaff) csökkentheti a találat esélyét; az aktív keresőnél ez az önálló végfázisban számít.',
  };
}
const map = new Map();
for (const a of [...aircraft, trainingAircraft])
  for (const [type, mount] of Object.entries(armament(a).weapons)) {
    const profile = weaponProfile(a, type),
      key = profile.id;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        id: `weapon-${key}`,
        name: mount.name,
        kind: 'weapon',
        category: category[type],
        type,
        profile,
        aliases: [],
        carriers: [],
        ...describe(type, profile),
      };
      map.set(key, entry);
    }
    if (!entry.aliases.includes(mount.name)) entry.aliases.push(mount.name);
    entry.carriers.push(a.name);
  }
map.set('mobileSam', {
  id: 'weapon-mobileSam',
  name: 'Mobil IR légvédelmi rakéta',
  kind: 'weapon',
  category: 'Rövid hatótávú föld–levegő rakéta',
  type: 'aam',
  profile: weaponProfiles.mobileSam,
  aliases: ['Mobil IR légvédelmi rakéta'],
  carriers: ['Mobil rakétás légvédelem · 4 db'],
  related: ['mobile-sam', 'cm-flare'],
  description:
    'Általános Verba/Gibka osztályú infravörös játékprofil, 6 km névleges lőtávval és 10–3500 m célmagassággal. Kisebb harci rész és sebzés a nehéz földi SAM-rendszernél.',
  usable: 'Ellenséges repülőgépek és csapásmérő drónok.',
  excellent: 'Alacsonyan vagy közepes magasságban közeledő, kevéssé kitérő légi cél.',
  cannot:
    'Földi célra, hajóra és baráti egységre nem indítható. A névleges lőtáv nem garantált találat.',
  operation:
    'Automatikus indítás az AI-nál, mindkét oldalon azonos profillal; négy rakéta, véges készlet. Nem szerelhető a játékos repülőgépére.',
  counter:
    '5: infracsapda vagy C: vegyes elterelő, kitérő manőverrel együtt. Tereptakarás és az indítókocsi megsemmisítése is csökkenti a fenyegetést.',
});
map.set('seaSparrow', {
  id: 'weapon-seaSparrow',
  name: 'RIM-7 Sea Sparrow',
  kind: 'weapon',
  category: 'Hajófedélzeti légvédelmi rakéta',
  type: 'aam',
  profile: weaponProfiles.seaSparrow,
  aliases: ['RIM-7 Sea Sparrow'],
  carriers: ['Anyahajó · 2 db', 'Rakétás romboló · 6 db'],
  related: ['carrier', 'destroyer', 'cm-chaff', 'weapon-ram', 'weapon-searam'],
  description:
    'Valós hajófedélzeti légvédelmi rakétacsalád alapján készült játékprofil. Félaktív radaros: a hajó radaros támogatása a találatig szükséges. A 9 km-es névleges felső lőtáv, a hajtómű és a manőverezés játékbeli közelítés, nem gyártói teljesítménytábla.',
  usable: 'Ellenséges vadászgép, bombázó és szállítógép, mindkét oldalon azonos fegyverprofillal.',
  excellent:
    'A hajót támadó, közeledő bombázó és kevéssé kitérő légi cél a kedvező indítási tartományban.',
  cannot:
    'Földi objektumra, hajóra, civilre és baráti egységre nem indítható. A Sea Sparrow nem fog el beérkező rakétát: erre a hajó külön SeaRAM/RAM készlete szolgál.',
  operation:
    'A hajó automatikusan választ célt és indít, véges készlettel. A radar, tereptakarás, zavarás, célmozgás és a becsült rakétalőtáv is korlátozza. Nem választható a repülőgép hangárbeli fegyverzetéhez.',
  counter:
    '6: dipólköteg vagy C: vegyes elterelő, kitérő manőverrel együtt. A flare önmagában nem megfelelő. A hajó megsemmisülése, zavart radara vagy a radaros rálátás elvesztése megszakíthatja a támogatást.',
});
map.set('ram', {
  id: 'weapon-ram',
  name: 'RIM-116 RAM',
  kind: 'weapon',
  naval: true,
  type: 'aam',
  category: 'SeaRAM hajóvédelmi elfogórakéta',
  profile: weaponProfiles.ram,
  aliases: ['RIM-116 RAM'],
  carriers: ['Anyahajó · 2 db', 'Rakétás romboló · 2 db'],
  related: ['weapon-searam', 'weapon-seaSparrow', 'carrier', 'destroyer'],
  description:
    'A SeaRAM rendszer elfogórakétája. A játék egyszerűsített, önálló IR jellegű követést használ; a valós RAM többféle érzékelését és a SeaRAM elektronikáját nem modellezzük teljes részletességgel. A 9 km-es felső határ játékbeli beállítás.',
  usable:
    'A saját hajóra közeledő ellenséges levegő–levegő vagy levegő–felszín rakétalövedék. A célpont a rakéta, nem annak indító repülőgépe.',
  excellent:
    'Időben észlelt, megfelelő távolságban közeledő rakéta, amely ellen még felépíthető az elfogási pálya.',
  cannot:
    'Ebben a játékban nem támad repülőt, földi célt vagy hajót. Bombát, gépágyúlövedéket és interkontinentális rakétaegységet sem fog el. Baráti vagy távolodó rakétára nem indít.',
  operation:
    'Automatikus, mindkét oldalon azonos szabályokkal. Hajónként két rakéta; a következő indítás legkorábban két másodperc múlva lehet. Ugyanarra a fenyegetésre nem pazarolják a készletet, ha már követi egy saját oldali elfogórakéta.',
  counter:
    'A találathoz élesített közelségi gyújtó és tényleges térbeli megközelítés kell. Túl közeli vagy kedvezőtlen pályájú támadás átjuthat. Ha kifogyott a két RAM, a SeaRAM nem tud tovább védekezni.',
});
map.set('searam', {
  id: 'weapon-searam',
  name: 'SeaRAM rendszer',
  kind: 'weapon',
  type: 'aam',
  category: 'Automatikus hajóvédelmi rendszer',
  related: ['weapon-ram', 'weapon-seaSparrow', 'carrier', 'destroyer'],
  description:
    'A Phalanx radaros és elektrooptikai érzékelőit RAM rakétákkal egyesítő közelvédelmi rendszer. A SeaRAM rendszer, nem külön rakétatípus. A játékban az anyahajón és a rombolón is működik, hajónként két RAM rakétával.',
  usable: 'A saját hajót fenyegető, közeledő rakétalövedékek.',
  excellent: 'Utolsó védelmi réteg a Sea Sparrow repülőgép-elhárítása mellett.',
  cannot:
    'Nem biztosít sérthetetlenséget. A játékban nem hárít bombát, ágyútüzet vagy interkontinentális rakétaegységet.',
  operation:
    'Önálló célválasztás és indítás; 2 RAM/hajó, két másodperces indításköz. A közeli találatot a repülési modell számolja, nincs automatikus százalékos megsemmisítés.',
  counter:
    'A készlet véges. A napló külön interceptor-launch, missile-intercept és interceptor-end eseményekben mutatja a védekezés eredményét.',
});

export const weaponEntries = [...map.values()].sort(
  (a, b) =>
    ['gun', 'aam', 'agm', 'bomb'].indexOf(a.type) - ['gun', 'aam', 'agm', 'bomb'].indexOf(b.type),
);
export const countermeasureEntries = [
  {
    id: 'cm-flare',
    name: 'Infracsapda (flare)',
    kind: 'countermeasure',
    type: 'flare',
    category: 'Rakéta elleni elterelő',
    description:
      'Forró, gyorsan kihűlő csali, amely az infravörös keresőt próbálja eltéríteni. A találati esélyt csökkenti, nem ad biztos védelmet.',
    usable: 'Infravörös és a játékban képalkotó keresőjű rakéta ellen.',
    excellent:
      'Közeledő IR-rakétánál korán, kitérő manőverrel együtt; az utánégető kikapcsolása csökkenti a saját hőjelet.',
    cannot: 'Radaros és lézeres rakéta, gépágyú, légvédelmi gránát vagy bomba ellen nem hatásos.',
    operation:
      '5: két infracsapda. C: két infracsapda és egy dipólköteg együtt. Csak repülés közben, 0,7 s újratöltési idővel.',
    counter:
      'Figyeld a közeledő rakéta jelzését és a bal felső IR-készletet. A csali néhány másodpercig él.',
  },
  {
    id: 'cm-chaff',
    name: 'Dipólköteg (chaff)',
    kind: 'countermeasure',
    type: 'chaff',
    category: 'Rakéta elleni elterelő',
    description:
      'Radart visszaverő, szétterülő és lelassuló csali. A radaros kereső figyelmét próbálja elvonni a gépről; a hatás a mozgási és megfigyelési helyzettől függ.',
    usable: 'Félaktív radaros és önálló végfázisban aktív radaros rakéta ellen.',
    excellent:
      'Radaros rakéta közeledésekor időben kiengedve, oldalirányú kitéréssel együtt. Az egyenesen repülő gép és a lassuló csali Doppler-különbsége segíti a keresőt az elutasításban.',
    cannot:
      'Infravörös, képalkotó és lézeres kereső, gépágyú, légvédelmi gránát vagy bomba ellen nem hatásos.',
    operation:
      '6: egy dipólköteg. C: vegyes infracsapda + dipólcsomag. Csak repülés közben; a készlet véges.',
    counter:
      'A bal felső R-készlet jelzi. Nincs garantált védelem, és a földi jelzavarás hatását nem szünteti meg.',
  },
];
export function weaponLibraryRows(e) {
  const rows = [
    ['Használható ellene', e.usable],
    ['Különösen jó választás', e.excellent],
    ['Mire nem használható', e.cannot],
    ['Kezelés', e.operation],
    ['Elterelés / védekezés', e.counter],
  ];
  if (e.profile) {
    const p = e.profile;
    if (['missile', 'gun'].includes(p.kind))
      rows.push([
        'Egységes szabályok',
        'Játékos, ellenség és szövetséges azonos fegyverprofillal, radar- és lőtávkorlátokkal működik. A nagyobb névleges lőtáv nem garantált találat.',
      ]);
    rows.push([
      ['seaSparrow', 'ram', 'mobileSam'].includes(e.profile.id)
        ? 'Hordozó egységek'
        : 'Felszerelhető gépek',
      e.carriers.join(' · '),
    ]);
    if (e.aliases.length > 1) rows.push(['Játékbeli változatok', e.aliases.join(' · ')]);
    if (p.kind === 'missile')
      rows.push(
        ['Rávezetés', guidance[p.guidance]],
        [
          'Indítási távolság',
          `${(p.minRange / 1000).toFixed(2)} km minimum · ${(p.maxRange / 1000).toFixed(0)} km névleges felső határ. A HUD sebesség, magasság és célmozgás alapján számol.`,
        ],
        ['Manőverezési felső határ', `${p.maxG} G; a sebesség és a légsűrűség korlátozza.`],
      );
    if (p.kind === 'gun')
      rows.push(
        [
          'Hatásos távolság',
          `Kb. ${(p.effectiveRange / 1000).toFixed(1)} km; a magasság és a cél mozgása módosítja.`,
        ],
        ['Torkolati sebesség', `${p.muzzleSpeed} m/s`],
      );
    if (p.kind === 'bomb') rows.push(['Bomba tömege', `${p.mass} kg`]);
  }
  return rows;
}
