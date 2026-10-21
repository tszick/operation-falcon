# Architektúra

## Felelősségi körök

| Kör                            | Fő modulok                                                                           | Feladat                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Adatok és profilok             | `aircraftSpec`, `armament`, `unitTypes`, `missionCatalog`, `navalData`               | Típusok, készletek és küldetésadatok                       |
| Repülés és sérülés             | `physics`, `maneuverDynamics`, `damage`, `fuel`, `performance`, `navalOps`           | 120 Hz-es állapotfrissítés; UI nélkül                      |
| Harc                           | `weapons`, `enemyCombat`, `src/combat/*`, `weaponDynamics`                           | Célválasztás, lövedékek, hajós védelem és elfogás          |
| Küldetés                       | `scenarioSpawn`, `mission`, `missionRuntime`, `missionObjectives`, `missionProgress` | Indítás, feltételek, célállapot és eredmény                |
| Megjelenítés                   | `renderer`, `gpuModels`, `gpuTerrain`, `gpuFeatures`, `horizon`, `hud`, `cockpit`    | WebGL2, Canvas és DOM                                      |
| Közös megjelenítési primitívek | `src/ui/html`, `src/ui/preferences`                                                  | HTML-szövegkódolás; hibabiztos helyi beállítások           |
| GPU-erőforrás életciklus       | `src/graphics/shaderProgram`                                                         | Közös fordítás/linkelés és hibánál is teljes felszabadítás |
| Napló                          | `flightRecorder`, `flightLogStorage`, `flightLogAnalysis`, `flightDebrief`           | Események, IndexedDB és helyi elemzés                      |
| Belépési pontok                | `main`, `encyclopedia`, `flightLogViewer`                                            | A megfelelő oldal összeállítása és eseménykezelése         |
| Node infrastruktúra            | `server.mjs`, `server/static-server.mjs`                                             | Csak helyi, statikus HTTP-kiszolgálás                      |

A szerver nem importálja és nem futtatja a böngészős játékot; a böngészős forrás nem függ Node-kiszolgálómodultól. A harci és shader-életciklus réteg nem használ DOM-ot. A fő alkalmazás és a renderer koordinátor: a kapcsolódó alrendszereket hívja, nem külön másolatot tart a fizikából vagy a fegyverszabályokból.

## Bevetés-előkészítő felület

- `missionLocations`: földrajzi koordináták és küldetésenként rögzített táj; ugyanebből készülnek a térképes jelölők és az induló megjelenés.
- `aircraftCatalog`: mindkét oldal eredeti küldetésből képzett, kompatibilis géplistája, oldalanként három vagy hat géppel, a koalícióhatárokat megtartva. A gép származása határozza meg az oldalt; a lapozó pozíciója nem függ az oldalfrissítéstől. `aircraftNations`: közös fejlesztőország-adatok és helyi SVG-zászlók a katalógushoz és wikihez.
- `plannerSelection`: a játékos oldal szerinti, küldetéskompatibilis géplistája és ajánlási sorrendje. Nem módosítja az AI vagy a wiki teljes típusadatbázisát.
- `ui/briefing`: háromlépéses navigáció, térképes előnézet/kijelölés, lapozható gépkártyák és helyi wiki-dialógus. A `main` visszahívásokon keresztül kapcsolja a választásokat a meglévő felszerelési és indítási szabályokhoz.
- A wiki ugyanazt az enciklopédiaoldalt használja beágyazott módban, teljes fejezetlistával; nincs párhuzamos adatkészlet vagy külső popupablak.
- A világtérkép helyi SVG, forrása és public-domain felhasználása az `assets/planner/README.txt` fájlban szerepel.

## Oldalfüggő hadszíntér

- `missionSides`: tiszta adatréteg az oldalválasztáshoz és az ellenoldali célokhoz; az eredeti katalógust nem módosítja.
- `sideBattle`: a kanonikus hadszíntéren cserél csapatot, valódi AI-géphelyet vált ki a játékossal és visszateszi a korábbi játékos AI-helyettesét. Az eredeti objektumazonosítók megmaradnak a célhivatkozásokhoz.
- `coalitionRoster`: a hadviselő oldalhoz illő konkrét típusokat rendeli a gépekhez. A kínai és orosz/szovjet típusok csapatszinten ugyanahhoz a keleti koalícióhoz tartoznak.
- `sideObjectives` és `sideRuntime`: a tükrözött célok/történetszakaszok; nem futnak egyszerre az ellentétes győzelmi szabályokkal.
- `terrainWorld.sideStart`: kizárólag az aktuálisan létrehozott hadszíntér játékos-kezdőhelye és saját reptere/kivonulási pontja; az indulás ezt másolja a repülési állapotba.

## Kiemelt szabályok

- A fizikai fegyverprofil a `weaponDynamics` modulban azonos a játékos, a barát és az ellenfél számára. A wiki ebből olvassa a számokat.
- A hajók taktikai döntései a `combat/navalCombat` modulba tartoznak; a repülőgépek általános vezérlését nem kell ehhez módosítani.
- A SeaRAM külön lövedék–lövedék elfogási ciklus. Nem jutalmazza tévesen repülőgép-lelövésként az elfogást, és nem okoz automatikus területi találatot.
- A `src/navalInterception.js` vékony, stabil exportfelület a korábbi diagnosztikai importokhoz; az egyetlen implementáció a `src/combat/navalInterception.js`. A publikus importvonal megtartása szándékos kompatibilitás, nincs duplikált működés.
- A HTML-adatok szövegkódolása közös `escapeHtml`. Az ismert, statikus sablonok használhatnak HTML-t; külső szöveget `textContent`-tal vagy az escape segéddel kell beilleszteni. URL-t külön is validálni kell, ha nem saját konstansból származik.
- A beállítások tárolása hibázhat; a `readPreference` visszaesik az alapértékre, a `writePreference` eredményt ad. A fő alkalmazásban nincs néma, üres storage-catch.
- A shaderfordító hibánál is törli az összes már lefoglalt shader/program objektumot. Az egyes renderelőknek nem lehet saját másolata a fordítási kódból.

## Következő módosítások ellenőrzése

Futtasd az `npm run verify` parancsot. Új modul importálásakor a körkörös függőséget és a hibás helyi importot automatikusan jelzi az architektúrateszt. Adatváltozáshoz a meglévő profil-/küldetéstesztet, viselkedésváltozáshoz érdemi regressziót használj. Nagy modulból az összetartozó felelősséget emeld ki; a fájl puszta többfelé vágása vagy azonos működés másolása nem rétegezés.

A teljes forrás Prettierrel formázott, ESLint recommended és kiegészítő biztonsági szabályok ellenőrzik. A fejlesztői függőségek pontos verzióval és integritásellenőrzött lockfájllal települnek. Futásidőben a játék saját ES-modulokat és böngésző-API-kat használ.

## Lokalizáció

Az `i18n` modul i18next-példányt, böngészőnyelv-felismerést és tárolt kézi választást kezel. A meglévő, adatvezérelt magyar forrásszövegek természetes kulcsok; a megjelenítési határon `tr` fordít szöveget és `trHtml` a biztonságosan összeállított jelölés szövegcsomópontjait. A DOM-attribútumok, a statikus feliratok és a canvas-szövegek ugyanazt a szótárt használják. Szöveg-/jelöléscache és WeakMap őrzi a már lokalizált csomópontok forrását; nincs képkockánkénti teljes DOM-keresés vagy MutationObserver. A nyelvváltás egyszer újralokalizálja a felületet, a folyamatos műszerek közvetlenül az aktív nyelven rajzolnak. A szimulációs feltételek és azonosítók nem fordulnak le.

A helyi, MIT-licencű i18next-csomag az egyetlen kivétel a böngészőmodulok `src/` alatti importhatára alól; az architektúrateszt konkrétan ezt és a nyelvi JSON-adatot engedi. A függőség és a kiszolgált példány verzióegyezését külön teszt ellenőrzi.
