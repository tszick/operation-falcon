# Operation Falcon: Redline

![Operation Falcon: Redline — Carrier defence, rendered with the game engine](docs/images/carrier-battle.png)

Böngészős repülőszimulátor magyar és angol kezelőfelülettel, 120 Hz-es repülésfizikával, küldetésekkel és helyben futó gépi ellenfelekkel. A 3D világ, a HUD, a műszerfal, a radar és az effektek alapértelmezetten WebGPU-val jelennek meg. A menük HTML-alapúak. A játékhoz nincs külső futásidejű hálózati függőség vagy felhős AI-szolgáltatás; a rádiófelvételek helyi fájlok.

## Indítás

Az elsődleges fejlesztői verzió **Node.js 26.12.0**, az `.nvmrc` szerint. A támogatott LTS ág **24.22.0 vagy újabb 24.x**. A CI mindkét ágat a legfrissebb elérhető javítóverzióval ellenőrzi.

```sh
npm ci --ignore-scripts
npm start
```

A játék: [localhost:5173](http://localhost:5173). Más portot a `PORT` környezeti változóval lehet megadni. A szerver kizárólag `127.0.0.1`-en hallgatózik; nem publikus éles webszerver. A fejlesztői csomagok a kódellenőrzéshez kellenek, nem kerülnek a böngészőbe.

## Fejlesztés és ellenőrzés

```sh
npm run verify       # teljes szintaxis, lint, formázás és minden Node-teszt
npm run format       # egységes Prettier formázás
npm run lint         # ESLint, hibát jelent a holt változókra/importokra is
npm audit            # közvetlen és tranzitív fejlesztői csomagok ellenőrzése
```

A `check` minden JS/MJS forrást ellenőriz, nem csak a belépőfájlt. Az architektúratesztek ellenőrzik az importok feloldhatóságát, a körkörös függőségek hiányát, valamint a harci és shader-életciklus modulok DOM-függetlenségét. A fizikát és a játékmenetet külön regressziós tesztek fedik le.

A böngészős próbák a `tests/*.html` oldalakon érhetők el, például `/tests/naval-cockpit.html` és `/tests/mission-performance.html`. Ezek fejlesztői diagnosztikai oldalak. FPS-t csak érvényes frissítési ütem mellett mérj; háttérbe tett lap lassítása nem hardverteljesítmény-mérés. A rádiógeneráló offline eszközök a `scripts/` mappában vannak; generálás után futtasd a formázást és ellenőrzést.

## Játékszabályok és kézikönyv

A **Légiutántöltés / Operation Lifeline** küldetés mindkét oldalról játszható, külön KC–135R tankerrel, tényleges üzemanyag-átadással és repülőtér nélküli győzelmi feltételekkel. A [részletes szabályok és tankolási segítség](docs/aerial-refuelling.md) a fejlesztői dokumentációban is elérhetők.

Az aktuális irányítás, küldetések, gépek, fegyverek és célkorlátozások a játékbeli **Egységtárban** (`/encyclopedia.html`) olvashatók. A [pilótaútmutató](tutorial.html) nyomtatható leírás. A részletes küldetéslistát és a fegyverzetet a hangár az élő adatmodellekből állítja össze.

A kezdőképernyő három lépése: **világtérképes küldetésválasztás → térbeli gépkatalógus → fegyverzet és üzemanyag**. A gépkártyákon csak az adott feladatra használható típusok szerepelnek, ajánlási sorrendben. A ⓘ gombok ugyanazon az oldalon, bezárható dialógusban nyitják a teljes kézikönyvet, a megfelelő gép- vagy fegyveradatlapnál.

A `missionLocations.js` rögzíti mind a 16 küldetés földrajzi helyét és táját. A helyek fiktív műveletek valós térségekben; nem földrajzilag pontos domborzatot töltenek be. A procedurális terep elrendezése változhat, a tájpaletta küldetésenként állandó. Minden textúrázott táj legalább egy feladatnál szerepel, a négy gyakorlat amerikai helyszínű, a havas bázisvédelem Észak-Finnországban, a tengeri művelet az Arab-tengeren játszódik. A helyi világtérkép Natural Earth public-domain körvonalakból készült; nem használ külső térképszolgáltatást.

Az új **Berepülés** kategória Edwards és Zsukovszkij fegyvertelen tesztprogramját adja, három-három különleges kísérleti géppel. Felszállás, típushoz igazított magasság/IAS, stabil repülés, bal/jobb forduló és biztonságos hazatérés szükséges. A történeti források, becslések és kapcsolódó B-52/rakéta-javítások: [Berepülési program](docs/flight-test-program.md).

A katalógus három gépkártyát, magasabb asztali ablakban 2×3 kártyát mutat oldalanként: nyugati gépek, majd szovjet, orosz és kínai gépek. A kártyákon csak zászló, gépnév és kitöltött térbeli modell szerepel; a műszaki adatok és a wiki linkje külön adatpanelen vannak. A gépválasztás automatikusan meghatározza az oldalt; a kártyákon és a wiki adatlapjain helyi SVG-zászlók jelzik a fejlesztő országokat. Lapozás: nyilak, bal/jobb billentyű vagy oldalra húzás. Lapozáskor az oldal első gépe lesz kiválasztva, a többi kártyára kattintva másik típus jelölhető ki. Az oldalfüggő célok és eredmények a `missionSides`, `sideObjectives` és `sideRuntime` modulokban vannak. A `sideBattle` a közös hadszíntéren felcseréli a csapatokat és a játékost az ellenoldal egyik valódi géphelyére teszi; a korábbi játékos helyét AI veszi át. A keleti tengeri támadás három repülős társat és baráti rombolót kap, négy nyugati fedélzeti gép ellen; saját fedélzet híján biztonságos kivonulással zárul. A szárazföldi változatok saját hátsó repteret használnak. Konvoj és légi ellenfél nélküli reptércsapás esetén az indulás és a feladat nem fordul meg.

A `coalitionRoster` küldetésenként szovjet, orosz, kínai vagy vegyes keleti vadászösszetételt választ. Önálló kínai bombázómodell hiányában homogén kínai kötelék csak vadászokból állhat; a bombázós homogén változatok szovjet/orosz típusokat használnak. A napló a választott oldalt és a tényleges gép-/csapatkiosztást is rögzíti.

A repülési napló csak az aktuális küldetést tárolja a böngésző IndexedDB-adatbázisában. Új küldetés lecseréli; a JSON-export a `/flight-log.html` oldalon tölthető le. A napló és a kiértékelés helyben marad. Ne tegyél személyes adatot vagy naplót nyilvános hibajegybe.

## Automatikus ellenőrzések GitHubon

A workflow-k pushra, pull requestre és kézi indításra is futnak. Esti ütemezés **Europe/Budapest** időzónában, a nyári/téli időszámítást követve:

| Ellenőrzés                            | Tervezett idő |
| ------------------------------------- | ------------- |
| Teljes minőségellenőrzés és npm audit | 22:15         |
| Dependabot npm-verziófrissítések      | 22:30         |
| Dependabot GitHub Actions-frissítések | 22:40         |
| CodeQL: JavaScript, Python és Actions | 22:45         |

A Dependabot külön szolgáltatás, nem saját Actions-lépés. Az Actions-hivatkozások teljes commitazonosítóhoz vannak rögzítve, módosításukra a Dependabot tesz javaslatot. A workflow-k minimális tokenjogosultságot és időkorlátot használnak; nincs automatikus merge vagy publish.

Az ütemezések a workflow-fájlok **alapértelmezett ágra történő feltöltése után** működnek, ha az Actions és a code scanning engedélyezett. Meglévő CodeQL default setup mellett az advanced workflow használatához a beállításokat is egyeztetni kell. A GitHub késleltetheti az ütemezett futást, és inaktív publikus repóban letilthatja azt. A Dependabot alerts/automatikus security update külön repóbeállítás; a verziófrissítési konfiguráció nem kapcsolja be helyettük ezeket.

## Felépítés és biztonság

- [Architektúra és réteghatárok](docs/architecture.md)
- [Csillagos küldetésértékelés, visszajátszás és menüzene](docs/mission-results.md)
- [Biztonsági áttekintés és helyi ellenőrzések](docs/security-review.md)
- [Vulnerabilitás bejelentése](.github/SECURITY.md)
- [Archivált fejlesztési feljegyzések](docs/archive/development-notes.md)

A WebGPU böngésző-API; működő adapterhez támogatott böngésző és grafikus illesztőprogram kell. A korábbi WebGL2/Canvas-változat `?backend=webgl`, a Canvas2D-változat `?backend=cpu` paraméterrel érhető el összehasonlításhoz. Az alapértelmezett WebGPU-útvonal nem kér Canvas2D- vagy WebGL-kontextust. Részletek és vizuális tesztoldalak: [WebGPU-megjelenítés](docs/rendering-webgpu.md).

## Nyelvek

A fejlécben magyar és angol felület választható. Első indításkor a böngésző támogatott nyelve érvényes; más nyelvnél angol az alapértelmezés. A kézi választás a `falcon-language` helyi beállításban marad meg. Váltáskor a bevetés, felszerelés és repülési állapot megmarad; a wiki és a naplónézet is követi a választást. A hangfelvételek minden nyelven angolok, a rádiófeliratok fordíthatók.

Az i18next rögzített npm-függőség, helyi ESM-példánya az `assets/vendor/i18next/` alatt van. Az `npm install`/`npm ci` utáni `postinstall` frissíti a böngészős példányt és MIT-licencet; kézzel `npm run vendor:sync` futtatható. Játék közben nincs CDN vagy fordítószolgáltatás. A szótár: `src/locales/messages.json`. Minden forrásszöveghez teljes magyar/angol pár tartozik; a `{{v0}}` jellegű helyőrzőket meg kell őrizni. A megjelenítési réteg fordít, a szimuláció belső azonosítói és a naplóadatok változatlanok. A nyomtatható útmutató és a wiki közös fejezetadatokat használ.

Az új [Invázió: Tajvan](docs/taiwan-invasion.md) bevetés a közös hullám-, harci és feltöltési rendszerekből épül fel.

A [közös repülési modell](docs/flight-model.md) széllel, hajtómű-késleltetéssel, forgási csillapítással, talajhatással és Mach-függő hullámellenállással működik. A mérő- és elemzőscript exportált repülési naplókból ellenőrzi a működést.

## Játékbeli névkatalógus

A megjelenő típusnevek formája: `EREDET-SZEREP-SOROZAT (Fantázianév)`, például `US-MR-101 (Skywarden)`. A repülőgépek, fegyverek, földi és tengeri rendszerek közös adatai a `src/equipmentCatalogData.json` fájlban vannak; a névfeloldás a `src/equipmentCatalog.js` feladata. A wiki „Játékbeli típusjelölések” fejezete ismerteti a kódokat. A szűk repülési kijelzők csak a rövid kódot használják. A többnemzetiségű programok kódja EU, az országfüggetlen játékbeli eszközöké OF.

A névkatalógus a megjelenítési réteghez tartozik. A szimuláció azonosítói, a fegyverprofilok és a régi naplók kompatibilisek maradnak. A régi megnevezések belső megfeleltetésként megmaradnak; a játékosnak megjelenő szövegek mindkét nyelven az új neveket használják. Az új naplók a katalógus verzióját és a megjelenítési nevet is rögzítik. Új típus felvételekor a katalógus és a fizikai profil külön-külön bővítendő.

A saját elnevezések nem jelentenek gyártói jóváhagyást vagy jogi névellenőrzést. A műszaki modellek egyszerűsített játékbeli közelítések. A névkatalógus bevezetése nem módosítja a modellek formáját vagy a képi eszközök felhasználási feltételeit.

## Multiplayer · co-op és aréna

Nyisd meg a `/multiplayer.html` oldalt ugyanazon a szerveren és porton minden játékosnál.
Egy szobába **legfeljebb öt pilóta** fér. A szobagazda létrehozza a szobát, a többiek a
hatkarakteres kóddal csatlakoznak. A játék jelenleg hang nélkül fut.

- **Co-op:** a meglévő csapásmérés, légtérellenőrzés és reptérvédelem. Nem bővült a küldetéskatalógus.
- **Aréna:** minden pilóta külön ellenfél; szimmetrikus, levegőből induló összecsapás. Az utolsó túlélő nyer.
  A szerver kivárja a zuhanások földetérését; egyetlen még zuhanó gép nem kap győzelmet. Teljes veszteség döntetlen.
- A szabad fegyverpróba és az egy AI-vadászos légiharc továbbra is elérhető.

Co-opban és arénában mindenki beállítja a gépét, kompatibilis fegyverzetét és 10–100% üzemanyagát,
majd jelzi: **Kész vagyok**. Legalább két és minden jelen lévő pilóta készültsége szükséges;
a **szobagazda külön indítja** a bevetést. Új csatlakozás, feladat- vagy felszerelésváltás
visszavonja a korábbi kész jelzéseket. Indulás után nincs új pilóta vagy pótrepülő.

Minden pilóta az **egyszemélyes játék közös cockpitját és HUD-ját** látja, saját műszerekkel,
sérülésrajzzal, fegyverekkel, radarral és szerveroldali küldetéscélokkal.
A markupot ugyanabból az `index.html` HUD-részletből tölti be; ugyanazok a HUD- és cockpit-modulok rajzolják.
A kezelőszervek billentyűvel és a panelen is működnek. **0** radarzoom, **O / radarkattintás** nagy taktikai térkép,
**N** leszállási mód, **I** segédív, **H** Mission Control segítség. Online a térkép **nem állítja meg** a világot.
Esc csak az egeret engedi el. A próba nem inicializál zenét vagy rádióhangot.

### Kapcsolatvesztés és visszatérés

Váratlan kapcsolatvesztés után a böngésző 1, 2, majd 4 másodperc várakozással
legfeljebb háromszor próbálja visszavenni a meglévő gépet. A kijelző mutatja a
próbálkozást; a Kilépés megszakítja. A helyreállítás a memóriában őrzött titkos
munkamenettel letiltott böngészőtár mellett is működik az oldal újratöltéséig.
Lejárt munkamenetnél nem hoz létre automatikusan új pilótát, és egy másik
kapcsolaton átvett gépért sem kezd újracsatlakozási versenyt.

A kapcsolódás legfeljebb 10 másodpercig vár a szerver üdvözlőüzenetére. Időtúllépésnél
jelzi a hibát, és újra lehet próbálkozni; egy korábbi kapcsolat késve érkező eseményei
nem írhatják felül az új kapcsolatot vagy annak repülési állapotát.

Aktív repülés közben a kilépő vagy leszakadt pilóta **ugyanazt a gépet** hagyja az AI-ra:
a pozíció, sérülés, üzemanyag, lőszer és elterelők megmaradnak. Az AI rendes fizikával,
fegyverhatótávval, véges készlettel és kitérő/elterelő védelemmel repül tovább. Reptérvédelmen
felszállhat és a visszatérés szakaszában leszállni is próbál. Előszobai távozás felszabadítja a helyet.

Ugyanazon böngészőlapon, ugyanahhoz a címhez és szobakódhoz csatlakozva a játék automatikusan
felhasználja a `sessionStorage` privát, véletlen 256 bites azonosítóját. Frissítés után is
**ugyanannak a gépnek** az aktuális állapotát veszed vissza; ez nem újraéledés. Másik eszközre
vagy új böngészőmunkamenetre az azonosító nem kerül át. Letiltott böngészőtárhely esetén a
visszatérés nem őrizhető meg. A szobakód önmagában nem jogosít másik pilóta gépének átvételére.
A privát azonosítót csak az adott pilóta üdvözlőcsomagja kapja meg, a közös állapotcsomagok soha.

Ha mindenki leszakad, a szoba és az AI legfeljebb **két percig** életben marad a visszatéréshez.
A szerver újraindítása törli a memóriában tárolt szobákat és munkameneteket. A befejezett bevetés után a szobagazda ugyanabban a szobában új menetet készíthet elő. Kölcsönös repülőgép-ütközés és hangátvitel még nincs.

### Közös szimuláció és védelem

A szerver 120 Hz-en számolja a fizikát, 20 Hz-en küld állapotot. A kliens csak ellenőrzött,
sorszámozott vezérlési szándékot küldhet: nem adhat meg pozíciót, találatot, sérülést, befogott célt
vagy lőszerkészletet. Helyi előrejelzés és 100 ms távoli interpoláció simítja a mozgást.
A **baráti tűz valódi sérülést okoz** co-opban; arénában minden másik pilóta ellenség.
A lövedék saját indítógépe kizárt az önütközésből.

Az állapotot szobánként egyszer állítja elő és kódolja JSON-ná a szerver, az öt kliens ugyanazt kapja.
A távoli repülőgép-állapotok dekódolása hálózati frissítéskor történik, nem minden képkockánál;
a célinterpoláció azonosító szerinti gyors keresést használ. A HUD ritkított gyakorisággal frissül.
Szobánként legfeljebb 192 lövedék és 128 harci esemény marad. A kapcsolatonkénti küldési sor,
csomagméret (állapotnál 256 KiB), üzenetsebesség és vezérlési sor is korlátozott. Legfeljebb 16 szoba / 80 kapcsolat.
A 8-as protokollverzió régebbi nyitott lap frissítését igényli.

A szerver alapból csak `127.0.0.1` címen figyel; a `HOST` és `ALLOWED_HOSTS` kifejezett beállítást
igényel. Origin/Host ellenőrzés védi a WebSocketet. Nincs automatikus portnyitás, felhős AI,
külső matchmaking vagy hangátvitel. Távoli WebGPU-játékhoz HTTPS szükséges.

A reptérvédelmen egy bombázó és két vadász támad; saját bunker, két SAM és **Guardian One** segít.
A Falcon One–Five hívójelek az emberi helyekhez tartoznak. A bázis megvédése után minden túlélő
pilótának (az AI által átvettnek is) sikeres fizikai földetéréssel kell leszállnia és megállnia.
A még levegőben lévő ellenséges bombák a bombázó lelövése után is veszélyesek.

Ellenőrzés: `npm run verify`; célzott multiplayer tesztek a `tests/multiplayer*.test.js` fájlokban.
Szerveroldali terhelésmérés: `node scripts/benchmark-multiplayer.mjs` (ez nem böngésző-FPS mérés).

### Helyi hálózati és FPS-próba

Az automatizált próba kizárólag `127.0.0.1` címen nyit tesztszervert, és öt valódi
WebSocket-klienst csatlakoztat hozzá. Irányonként 0–160 ms késleltetést, ingadozást,
1,2 másodperces adatkimaradást, csomagtorlódást és AI-átvétel utáni visszacsatlakozást vizsgál:

```sh
node --test tests/multiplayer-network.test.js
```

A visszaérkező állapotcsomagokból képkockánként csak a legújabb repülési állapotot dolgozza fel
a kliens. Az egyszeri találati és robbanási eseményeket külön, korlátozott sorban megőrzi;
az összevonás nem nyeli el ezeket. A készenléti és hibaüzenetek azonnal feldolgozódnak.

A `/multiplayer.html?diagnostics=1` oldal helyi címen bekapcsol egy kizárólag képernyőn látható,
nem feltöltött FPS/CPU/hálózati mérőpanelt. A normál oldalon ez nincs jelen. A panel a valódi,
korlátozás nélküli képkockaidőt méri, és kiírja a lap láthatóságát is.

Saját localhost tesztszobádhoz négy automatikusan repülő, hang nélküli tesztpilóta adható:

```sh
node scripts/local-multiplayer-bots.mjs ABC234 90
```

Az `ABC234` helyére a saját tesztszobád kódja kerül. A segédprogram szándékosan csak
`127.0.0.1:5174` címhez csatlakozik; távoli címet nem lehet megadni. Arénában és co-opban
az előszobai készültséget a tesztpilóták jelzik, a szobagazda indít. A program legfeljebb
120 másodpercig fut, majd bontja a kapcsolatait. Egy böngészős nézet és négy hálózati
szimulált pilóta mérése nem azonos öt teljes grafikus böngésző egy gépen futtatásával.

A hálózati célok radar-látóvonala a stabil célazonosító alapján is újrahasznosítható;
az újraszámítás mozgásra és terepváltozásra továbbra is megtörténik. A műszerfal csak
megváltozott feliratot ír a DOM-ba, a radart pedig frissítésenként egyszer, rajzolás előtt méretezi.
A mérőpanelen a részfeladatok maximumai a lap indulását, beleértve a bemelegítést is tartalmazzák;
az FPS-ablakok a tényleges repülés utolsó legfeljebb két percét fedik le.

### Több egymást követő menet

Arénában és co-opban az eredmény megállítja az aktuális menetet. A már végzetesen sérült
gép zuhanása ilyenkor is földetérésig folytatódik, egyszeri robbanással; ez nem módosítja
a rögzített eredményt. A saját zuhanás alatt az eredménytábla nem takarja a képet.
A táblázat a szerver által
rögzített győztest, célokat, találatokat, lelövéseket, baráti találatokat és gépállapotot mutatja.
A szobagazda **Új menet** gombja mindenkit ugyanabba az előszobába visz: a kód, a bent maradó
pilóták azonosítója és felszerelési választása megmarad, a gépek és a pálya újraépülnek.
Újra mindenki készültsége és a szobagazda indítása szükséges. Aktív körben ez nem használható.

A távozott játékosok helye az új előszobában felszabadul. Később csatlakozva ott már új
pilótaként is beléphetnek; aktív menetben továbbra is kizárólag a saját meglévő gépük vehető vissza.
A szobagazda kilépésekor egy kapcsolódott pilóta veszi át a szerepet.
A menetazonosító kizárja a korábbi körből késve érkező vezérlést, és a kliensek újraindítják
az előrejelzést, a képi interpolációt és a harci effektusokat. A szobán belüli időbélyeg folyamatos.

A saját gép zuhanását végig lehet nézni. **Földetérés után** a megfigyelő kamera a túlélő
játékosokra válthat a nyilakkal, **[ / ]** gombokkal vagy a **Játékosok** listából.
Az AI által átvett gép is követhető. A megfigyelés nem ad irányítási vagy tüzelési jogot.
A lista külön jelzi a szobagazdát, a kapcsolatot, az AI-átvételt, a zuhanást és a kiesést.
