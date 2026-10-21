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
