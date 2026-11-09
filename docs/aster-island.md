# Invázió: Aster-sziget

Fiktív, stilizált hadszíntér a Csendes-óceán nyugati részén; nem valós sziget vagy ország térképe. A pályán egyetlen, nyugati sziget van; a procedurális sziget nem valódi méretarányú térkép.

- Kelet: három hullám 0 / 180 / 360 másodpercnél, hullámonként három négygépes raj (1 Tu-95 és 3 Su-27). Összesen 36 gép. A keleti játékos az első hullám egyik rajhelyét foglalja el.
- Nyugat: három négygépes raj (1 B-52 és 3 F/A-18). A játékos beleszámít a 12 gépbe: vadásszal vadászhelyen, csapásmérő/bombázó géppel bombázóhelyen kezd.
- Két rögzített anyahajó, egy keleti mozgó romboló. A romboló a közös szigetkerülő útvonaltervezést használja.
- A sziget közepén egy nyugati reptér, a parton négy nyugati SAM és négy légvédelmi löveg van. Keletnek nincs szigete és nincs reptere. Az alacsony partokról fokozatosan 650 méter magas központi fennsíkra emelkedik a terep; a reptér, a kifutó és a közvetlen kigurulási terület ezen a vízszintes fennsíkon fekszik. A sziget felszíne és a tényleges háromszögelt terep azonos a kirajzolásban és az ütközésben.
- Feltöltés bármely épségben maradt saját, típussal használható leszállóhelyen. A legközelebbi saját használható bázisra mutat a navigáció és az N segédvonal. F/A-18/F-14/Harrier használhat anyahajót; szárazföldi típusok (B-52, Tu-95, Su-27 stb.) repteret használnak. A jelenlegi keleti gépkínálatban nincs fedélzeti típus: a keleti szárazföldi típusok nem tölthetnek fel, szükség esetén végleg kivonulnak. Keleti játékosként nincs baráti reptérre mutató hamis leszállójel; a kivonulási pont nyugaton, a harctértől távol található. A keleti anyahajó közös fedélzeti infrastruktúrája egy későbbi fedélzeti típust külön küldetéskód nélkül fogad.
- Nyugati győzelem: a keleti anyahajó megsemmisül VAGY minden keleti repülő megsemmisül vagy végleg visszavonul (a függő hullámokat is beleértve). Vegyesen is teljesülhet a lelövések és a végleges kivonulások száma. A feltöltésre tartó, ideiglenesen távol lévő gép, a még folyamatban lévő visszavonulás és a függő hullám nem számít leküzdöttnek. Az anyahajó megsemmisítése a későbbi hullámok előtt is győzelem.
- Keleti győzelem: mindkét nyugati leszállóhely VAGY az összes nyugati repülő megsemmisül. A győzelemhez nem kötelező még egyszer leszállni.

## Közös játékrendszerek

A taiwanMission.js kizárólag küldetésadatokat tartalmaz. A battlefieldScenario.js deklaratív egység-, hullám-, cél- és győzelmifeltétel-kezelője más küldetésből ugyanígy használható. A fegyverek, sebzés, MI, ütközések és feltöltési idő a meglévő rendszerekből érkeznek, küldetésfüggő kivételek nélkül.

A több bázis kezelése általános: recoveryAirfields.js választ kompatibilis, saját bázist; az MI elveszett célrepülőtér helyett megmaradt saját bázisra irányítható. Az anyahajós katapult, fékezőhorog, fedélzeti ütközés és megközelítési útvonal tetszőleges rögzített pozícióban és irányban működik.

A berepülési térképjelölők és jelmagyarázat lilák; kijelöléskor is lila marad a kategória, világosabb kerettel.

## Ellenőrzés

A battlefield-scenario.test.js lefedi mindkét oldal és vadász/bombázó játékos pontos rajlétszámát, késleltetett hullámokat, mindkét győzelmi ágat, bázisvesztést és pótlást, kompatibilis leszállóhely-választást, az eltolással/elforgatással lefuttatott tényleges katapult- és fékezőkötelezési fizikát, az álló anyahajókat, a romboló mozgását és hosszúkás szigetek megkerülését.

A belső `taiwan-invasion` azonosító és `taiwanMission.js` modulnév kompatibilitási okból megmaradt: a korábbi naplók és küldetésazonosítók továbbra is működnek. A játékban megjelenő név, leírás, helyszín és hadműveleti kód már Aster-szigetre utal.

## Helyi teljesítménypróba

A `node scripts/benchmark-battlefield.mjs 90 west` (vagy `east`) hang és külső kapcsolat nélkül méri a szimuláció részidejét. Ez CPU-mérés, nem böngészős FPS. A pilóta semleges bemenetekkel repül, nincs sérthetetlenség vagy lőszerpótlás; kiesését az eredmény külön jelzi.

A `/tests/battlefield-load.html?side=west` (vagy `east`) kizárólag localhoston indítható, hang nélküli grafikus terhelési próba. A rendes küldetés-, harci, sebzési, naplózási és kirajzolási rendszereket használja. Az öt másodperces mérési ablakok legfeljebb egy percig maradnak meg; az első képkockák költségét nem szűri ki. Kiesett pilóta utáni eredményből nem szabad aktív légiharcra következtetni.

### Későbbi hullámok megfigyelőként

A `node scripts/benchmark-battlefield.mjs 420 west observer` mindhárom hullám szimulációját méri; `east` oldalról is futtatható. A játékos eredeti rajhelyére rendes AI-gép kerül vissza, így 48 repülő van összesen a három hullámban és a védelemben. A megfigyelő nem harci szereplő: a térképen kívül, nem repülő állapotban van, saját hívójel nélkül. Nem választható harci célnak. Az AI-egységek véges lőszerrel, rendes sérüléssel és feltöltéssel működnek; a győzelmi feltételek továbbra is lezárhatják a próbát.

Grafikus próba: `/tests/battlefield-load.html?side=west&mode=observer&at=350`. Az `at` legfeljebb 420 másodperc valós, 120 Hz-es szimulációs előkészítést kér, nem kényszerített hullámindítást. Ez az előkészítés nem FPS-mérés; a kijelzett FPS csak az utána kirajzolt, valós idejű képkockákból származik. A külön megfigyelőkamera legfeljebb 400 m/s sebességgel követi a csatát, hogy a célváltás ne okozzon mesterséges kameraugrást.

A géppárok ütközési előszűrése közvetlen koordinátaszámítást használ, páronként három ideiglenes vektor létrehozása nélkül. A söpört gömbpróba képlete, sugártűrése és az azt követő tényleges felületi ütközésvizsgálat változatlan; húszezer véletlen, valamint érintő és álló eset ellenőrzi az azonosságot.

A grafikus terhelési próba opcionális HUD-részidőket is rögzít (`hudPartsMaxMs`, `recentHUDSpikes`). A normál játékban nem olvas külön időmérőt emiatt. A radartérkép szintvonalépítése még a pont- és él-listák létrehozása előtt kizárja azokat a cellákat, amelyek mind a négy sarka az adott szint ugyanazon oldalán van. A megmaradt keresztezések rajzolási sorrendje és a 100 méteres szintköz változatlan.
