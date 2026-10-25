# Közös repülési modell, 2. változat

Az öt módosítás a közös fizikai lépésben működik, a típusonkénti eltéréseket paraméterek adják. A modell csökkentett rendű, játékhoz hangolt közelítés; a felpörgési idők, csillapítási állandók, szárnyfesztáv-becslések és hullámellenállás-csúcsok nem hitelesített típusadatok.

## Szél és sebességek

A világsebesség továbbra is a talajhoz viszonyított mozgás. A felhajtóerő, légellenállás, állásszög, IAS és Mach a levegőhöz viszonyított sebességből számolódik: v_air = v_ground − v_wind. A fékezés, kigurulás és pályán megtett út talajhoz viszonyított marad. A megközelítési és fedélzeti sebességellenőrzés is figyelembe veszi a szelet; elforgatott pályán a szélvektor a pályával együtt átalakul.

A determinisztikus szélmező magassági szélerősödést, folytonos széllökéseket és enyhe függőleges turbulenciát ad. Gyakorló és berepülési küldetéseken alapértelmezésben szélcsend, harci feladatokon enyhe szél van. A küldetés weather adata felülírhatja ezt. A teljes beállítás és mag a naplóba kerül.

A HUD bal alsó adatcsoportjában a szél meteorológiai érkezési iránya és km/h-ban mért sebessége olvasható; a kis nyíl a gép orrához viszonyított fújási irányt mutatja. A ± érték a konfigurált vízszintes lökés amplitúdója, szintén km/h. Szélcsendben ez külön felirat. A felkészítő és a Mission Control is kiírja a szelet. A meglévő magasság- és sebességmező elrendezése változatlan.

## Hajtómű és forgás

A gázkar a kért teljesítmény. Az engineSpool a leadott száraz tolóerő normalizált állapota, nem valódi N1/RPM. Alacsony teljesítményről lassabb a felpörgés, mint magasabb fordulatról; külön késleltetett állapot vezérli az utánégető többletét. Üzemanyag nélkül nincs tolóerő. A levegőből indított gépek járó hajtóművel kezdenek, földi kiszolgálás után viszont újra fel kell pörgetni. Az AB INDUL jelzés a felpörgési szakaszt mutatja.

A magassági, csűrő- és oldalkormány forgási sebessége időállandóval közelíti a parancsot. Elengedéskor a forgás lecseng, nem ugrik azonnal nullára. A nehéz típusok lassabban reagálnak. A G- és állásszögkorlátozás a megmaradó magassági forgást is korlátozza. A sérülésből és dugóhúzóból származó mozgás továbbra is külön hozzájárulás.

## Talajhatás és nagy sebesség

A szárny felszín fölötti magasságával és a becsült fesztávval csökken az indukált légellenállás. Nagy bedöntésben eltűnik a hatás. Víz és ténylegesen alatta fekvő anyahajófedélzet fölött is működik. Nem alkalmazunk mesterséges felhajtóerő-szorzót vagy függőleges impulzust.

A Mach-függő, folytonos hullámellenállás a kritikus Mach fölött növekszik, a transzszonikus tartományban tetőzik, majd a szuperszonikus tartományban mérséklődik. Mach 1-nél nincs szingularitás. A légkör réteges standardmodellből számol sűrűséget, hőmérsékletet, nyomást és hangsebességet; a telepített tolóerő magasság- és Mach-függő csökkenése közös a fizikával és az MI előrejelzésével.

## MI és teljesítmény

A teljes fizikával mozgó MI ugyanazt a stepAircraft függvényt használja, a leszállási és útvonalkövető szabályozó pedig szélre korrigálja az irányt. A távoli, egyszerűsített navigáció megmaradt: ott is közös a szélmező, a hajtómű-késleltetés, a fordulási csillapítás, a hullámellenállás és a tolóerőcsökkenés. Ez nem teljes merevtest-szimuláció minden távoli gépre; nem cseréltük drágább fizikai lépésekre a nagy kötelékek teljes mozgását.

A korábbi manővertesztek közül az azonnali megállást és azonnali utánégetőt elvárókat az új viselkedésre módosítottuk. A Split-S teszt most a kívánt bedöntés alapján fejezi be a fél orsót, számolva a lecsengő forgással. A fedélzeti tesztek ismert szélcsendben izolálják a hajó fizikáját; külön oldalszeles szolgálati próba ellenőrzi az MI teljes ciklusát. A Harrier guruló felszállása előtt felpörgés szükséges.

## Napló és reprodukálható visszamérés

A meglévő JSON formátum új flightModelVersion: 2 jelölést kapott. Új mezők: groundSpeedKmh, windMps, airVelocityMps, engineSpool, afterburnerSpool, bodyRates. A forces csoport tartalmazza a számítás bemeneti légsebességét és sűrűségét, a tényleges és kért tolóerőt, a teljes és hullámellenállás-tényezőt, a szárnymagasságot és a talajhatás tényezőjét. Az MI fizikai és egyszerűsített állapotai is naplózhatók. A TAS immár valódi légsebesség; a régi naplók visszajátszása továbbra is működik.

Futtatás a projekt gyökeréből:

    node scripts/measure-flight-model.mjs OUTPUT_DIRECTORY final
    node scripts/analyze-flight-model.mjs OUTPUT_DIRECTORY

A mérőscript valódi FlightRecorder-naplókat ír, köztük nyolc felszállást és egy oldalszeles MI-ciklust. A külön elemző ezeket a mentett naplókat olvassa vissza; ellenőrzi a sebességvektor-egyenleget, az erőszámítás bemeneteit, a tolóerő reakcióját, a talajhatást, a hullámellenállást, valamint a sérülésmentes felszállást és folytatott emelkedést. Az audit.json és audit.md a visszamért eredmény.

## Fizikai háttér

- NASA: [levegőhöz és talajhoz viszonyított sebesség](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/relative-velocity/).
- NASA: [légkör és magasságfüggő állapot](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/earth-atmosphere-equation-metric/).
- NASA: [indukált és hullámellenállás](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/what-is-drag/).
- FAA: [Pilot's Handbook – talajhatás](https://www.faa.gov/sites/faa.gov/files/pilot_handbook_1.pdf).
- FAA: [Airplane Flying Handbook – sugárhajtóműves átmenet](https://www.faa.gov/regulations_policies/handbooks_manuals/aviation/airplane_handbook).
