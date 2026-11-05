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

## Multiplayer · közös repülés, fegyverpróba és légiharc

A főmenü **Multiplayer · közös gyakorlás** linkje a `/multiplayer.html` oldalt nyitja meg.
Két böngészőlapon vagy böngészőben nyisd meg **ugyanazt a címet és portot**. Az elsőn hozz létre szobát,
a másodikon add meg a hatkarakteres szobakódot. A később érkező pilóta a társa közelében indul.
Két felfegyverzett vadásztípus választható; levegőből indultok, a meglévő repülésfizikával és egérrel nézelődéssel.
A próba mindig hang nélkül fut. A központi repülési HUD megmarad; a teljes cockpit és a meglévő egyjátékos küldetéskatalógus bekötése későbbi lépés.

A szerver számolja a fizikát 120 Hz-en; a böngésző csak sorszámozott vezérlési parancsokat küld, pozíciót,
sérülést vagy üzemanyagkészletet nem írhat felül. Állapotküldés 20 Hz, helyi mozgás-előrejelzés,
visszaigazolt parancsok utáni korrekció és 100 ms-os távoli interpoláció egészíti ki.
Háttérbe tett lap vagy kapcsolatkimaradás esetén nem marad lenyomva a kormány: a szerver semleges bevitellel folytatja a repülést.

**Ez még harci prototípus, saját közös bevetéssel:** nincs kölcsönös repülőgép-ütközés, automatikus újraéledés vagy fiók. Esc csak az egeret engedi el, nem állítja meg a világot.
A fegyverpróba és légiharc módban lezuhanás után kilépéssel és újbóli csatlakozással kérhető új gép. A közös bevetésben indulás után nincs pótrepülő vagy új belépő. Kilépéskor megszűnik a pilóta helye;
az üres szoba azonnal törlődik. A szobakódot érdemes kimásolni, mielőtt az utolsó pilóta kilép.

Alapértelmezésben a szerver továbbra is csak `127.0.0.1` címen figyel. A prototípust elsőként localhoston teszteld.
A `HOST` és a vesszővel elválasztott `ALLOWED_HOSTS` csak kifejezetten beállított címekre bővíti a kiszolgálást;
a WebGPU másik gépről HTTPS-t igényel, ezért a publikus/LAN HTTPS-kiszolgálás és a reverse proxy origin-kezelése külön következő feladat.
Nincs automatikus portnyitás, külső matchmaking, felhős AI vagy hangátvitel.

A kapcsolatok azonos eredetű WebSocketet használnak. A szerver ellenőrzi az Origin és Host fejléceket,
a protokollverziót, a vezérlési értékeket és sorszámokat; korlátozza a csomagméretet, a parancssort,
a küldési sebességet, a szobák és a kapcsolatok számát. Két pilóta lehet egy szobában, legfeljebb 16 szoba és 32 kapcsolat.
Üres szervernél nem fut a multiplayer időzítő. A játékosállapot csak memóriában él, a szerver újraindítása törli.

Célzott ellenőrzés: `node --test tests/multiplayer.test.js tests/static-server.test.js`.

### Közös fegyverhasználat

A második prototípusban a két gép alapértelmezett, típushoz illő fegyverzetet kap. Egy fegyvertelen,
egyenesen repülő légi cél és egy nem tüzelő teherautó közös lőtéri célként jelenik meg. **1–4** fegyverválasztás,
**T / Tab** célkijelölés és befogás, **Space** tüzelés, **C** elterelő. A panel gombjaival is választható fegyver,
kijelölhető cél és leadható egy lövés. Közös bevetésben a felszerelés és az induló üzemanyag az előszobában állítható.

A szerver birtokolja a pilótánkénti lőszert, fegyvervárakozást és befogást, valamint egyetlen közös
lövedék- és találatszimulációt futtat a meglévő `Weapons` ballisztikájával. A kliens nem küldhet befogott
célt, találatot, sebzést, lőszermennyiséget vagy időlépést. Csak fegyverválasztási, célváltási, tüzelési és
elterelési szándék érkezhet a sorszámozott vezérléssel együtt. Új csomag nélkül nincs folytatódó tüzelés.

**A baráti tűz valódi:** másik pilóta gépébe csapódó lövedékek és bombák, valamint éles rakéták ugyanazt a
részegységenkénti sebzést okozzák, mint az ellenséges találatok. A baráti cél továbbra sem választható ki
ellenséges radarcélként, de a lövedékek útjában nincs csapat szerinti sérthetetlenség. A kilövő saját
repülőgépe kizárt az önütközésből. A baráti találat külön `friendlyFire` esemény és `friendlyHits` számláló;
nem növeli az ellenséges találat- vagy győzelmi számlálót. Mindkét érintett pilóta figyelmeztetést kap.

A csomagok közös, egyedi azonosítókkal küldik a lövedékeket és az utolsó 128 harci eseményt.
A kliensek ebből építik a nyomvonalakat és a determinisztikus robbanási részecskéket; a megismételt
esemény nem játszódik le kétszer. Később csatlakozva az aktív lövedékek és még tartó robbanások is helyreállnak.
Legfeljebb 192 aktív lövedék lehet egy szobában. A sérült gépek fizikai állapota, korlátozott füsttörténete,
lőszere és elterelői a repülési állapottal együtt szinkronizálódnak. Az 5-ös protokollverzió régebbi nyitott lap helyett frissítést igényel.

Célzott harci teszt: `node --test tests/multiplayer-combat.test.js tests/multiplayer.test.js`.

### Közös gépi ellenfél

Szobanyitáskor választható a passzív **fegyverpróba** vagy a **légiharc**. Utóbbiban a két gyakorlócél mellett egy felfegyverzett keleti vadász is repül. A szoba létrehozásától számított 20 másodperc felkészülés után kezd támadni; a később érkező pilóta az aktuális közös állapotba lép be.

Az AI kizárólag a szerveren fut, a meglévő repülésfizikával és harci szabályokkal. Mindkét pilóta egyenrangú célpont; nincs különleges host-célzás. A radar- és fegyverhatótáv, a véges lőszer, az elterelők, a kitérő manőverek és a részegységenkénti sérülések érvényesek. A játékos elterelőjét csak a saját C-parancsa indítja; a közeledő rakéták figyelmeztetése a tényleges szerveroldali rakétákból készül.

Súlyos sérülés vagy elfogyott légi fegyverzet esetén az AI fizikailag kivonul. Ebben a prototípusban nincs saját reptere, így nem tér vissza feltöltve. A közös csapásmérés saját célokat és lezárást kap; a teljes egyjátékos küldetéskatalógus még nincs bekötve. A baráti tűz továbbra is valódi sérülést okoz.

AI-ellenőrzés: `node --test tests/multiplayer-ai.test.js tests/multiplayer.test.js`.

### Közös csapásmérés

A `cooperative` szoba mindkét pilóta Kész jelzése után indul. Addig a fizika, a fegyverek és az üzemanyag-fogyasztás áll; a 20 másodperces AI-felkészülés csak az indulástól számít. Két kötelező cél van: az ellenséges vadász leküzdése és a földi céljármű megsemmisítése. A vadász megsemmisítése vagy tényleges kivonulása tisztítja meg a légteret. Mindkét pilóta túlélése opcionális. Nincs leszállási szakasz.

A célokat, a bevetés idejét, a túlélést, az egyéni találatokat és a baráti találatokat a szerver rögzíti. Egy pilóta kiesése vagy kapcsolatbontása után a másik folytathatja. Indulás után a szoba új pilótának zárt, ezért kilépéssel nem lehet új gépet kérni. Mindkét pilóta lezuhanása vereség; a zuhanást a földetérésig tovább számolja.

A közös eredmény rögzül és megállítja a szimulációt. A kiszolgáló továbbra is fogadja és visszaigazolja a sorban maradt vezérlést, de ebből nem lesz további lövés vagy mozgás. A kliens ilyenkor a helyi mozgás-előrejelzést is leállítja. Új bevetéshez kilépés és új szoba szükséges; a fegyverpróba és a szabad légiharc korábbi működése megmaradt.

Küldetésellenőrzés: `node --test tests/multiplayer-mission.test.js tests/multiplayer.test.js`.

### Közös előszoba

A közös bevetéshez szobanyitás és csatlakozás után külön előszoba jelenik meg. A szobagazda **csapásmérés** (vadász és földi cél kötelező) vagy **légtérellenőrzés** (a földi cél opcionális) feladatot választ. A korábbi szabad légiharc és fegyverpróba továbbra is közvetlenül indítható. A teljes egyjátékos küldetéskatalógus bekötése külön következő lépés.

Mindkét pilóta a saját gépét, függesztési pontonkénti fegyvereit, gépágyúját és 10–100% induló üzemanyagát állítja be. A meglévő kompatibilitási és tömegkorlátokat a szerver ellenőrzi; a konfigurált fegyverzet és az ebből számolt repülési állapot a kliens előrejelzésében is megmarad. A mentett választás megjelenik a társ előszobájában.

A **Felszerelés mentése**, majd a **Kész vagyok** gomb használható. Mindkét Kész jelzés szükséges az induláshoz. Bármely mentett módosítás, feladatváltás, csatlakozás vagy előszobai kilépés törli az összes korábbi jóváhagyást. A verziózott beállítások megakadályozzák, hogy egy késve érkező Kész üzenet azóta megváltoztatott felszereléssel indítson bevetést. Szobagazda távozásakor a szerep átkerül a megmaradt pilótához. Indulás után a felszerelés és a feladat rögzített.

Előszoba ellenőrzése: `node --test tests/multiplayer-lobby.test.js tests/multiplayer.test.js`.
