# Invázió: Tajvan

Játékbeli, stilizált hadszíntér; a térképen Tajvanhoz rendelve. A helyi sziget és a nyugati partvidék procedurális, nem valódi méretarányú térkép.

- Kelet: három hullám 0 / 180 / 360 másodpercnél, hullámonként három négygépes raj (1 Tu-95 és 3 Su-27). Összesen 36 gép. A keleti játékos az első hullám egyik rajhelyét foglalja el.
- Nyugat: három négygépes raj (1 B-52 és 3 F/A-18). A játékos beleszámít a 12 gépbe: vadásszal vadászhelyen, csapásmérő/bombázó géppel bombázóhelyen kezd.
- Két rögzített anyahajó, egy keleti mozgó romboló. A romboló a közös szigetkerülő útvonaltervezést használja.
- Nyugati szigeti reptér, keleti hátsó reptér, négy parti SAM és négy légvédelmi löveg. A nagy szigetek lapos belső területe és a tényleges háromszögelt terep azonos a kirajzolásban és az ütközésben.
- Feltöltés bármely épségben maradt saját, típussal használható leszállóhelyen. A legközelebbi saját használható bázisra mutat a navigáció és az N segédvonal. F/A-18/F-14/Harrier használhat anyahajót; szárazföldi típusok (B-52, Tu-95, Su-27 stb.) repteret használnak. A jelenlegi keleti gépkínálatban nincs fedélzeti típus, ezért keleti repülővel a hátsó reptér szolgál feltöltésre; a keleti anyahajó közös fedélzeti infrastruktúrája egy későbbi fedélzeti típust külön küldetéskód nélkül fogad.
- Nyugati győzelem: az összes keleti repülő leküzdve (a függő hullámokat is beleértve), és legalább egy nyugati leszállóhely megmarad. Beérkező, megmaradt bázist fenyegető fegyver esetén a lezárás vár.
- Keleti győzelem: mindkét nyugati leszállóhely VAGY az összes nyugati repülő megsemmisül. A győzelemhez nem kötelező még egyszer leszállni.

## Közös játékrendszerek

A taiwanMission.js kizárólag küldetésadatokat tartalmaz. A battlefieldScenario.js deklaratív egység-, hullám-, cél- és győzelmifeltétel-kezelője más küldetésből ugyanígy használható. A fegyverek, sebzés, MI, ütközések és feltöltési idő a meglévő rendszerekből érkeznek, küldetésfüggő kivételek nélkül.

A több bázis kezelése általános: recoveryAirfields.js választ kompatibilis, saját bázist; az MI elveszett célrepülőtér helyett megmaradt saját bázisra irányítható. Az anyahajós katapult, fékezőhorog, fedélzeti ütközés és megközelítési útvonal tetszőleges rögzített pozícióban és irányban működik.

A berepülési térképjelölők és jelmagyarázat lilák; kijelöléskor is lila marad a kategória, világosabb kerettel.

## Ellenőrzés

A battlefield-scenario.test.js lefedi mindkét oldal és vadász/bombázó játékos pontos rajlétszámát, késleltetett hullámokat, mindkét győzelmi ágat, bázisvesztést és pótlást, kompatibilis leszállóhely-választást, az eltolással/elforgatással lefuttatott tényleges katapult- és fékezőkötelezési fizikát, az álló anyahajókat, a romboló mozgását és hosszúkás szigetek megkerülését.
