# Küldetés vége és menüzene

A küldetés végén egy rövid eredménylap jelenik meg. A részletes kiértékelés, a fázisonkénti megállapítások, a naplóoldal és a letöltés a „Részletes kiértékelés és napló” lenyitása után érhető el. A szünetképernyő továbbra is folytatható.

## Értékelés

A `missionRating.js` a rögzített végeredményt és a `flightDebrief.js` megállapításait használja. Csillagot kizárólag `success` eredmény kaphat:

- 3 csillag, 100%: nincs rögzített levonás.
- 2 csillag, 70–99%: kisebb hibák vagy kihagyott kiegészítő célok.
- 1 csillag, 1–69%: súlyos hiba vagy több kisebb hiba mellett sikeres küldetés.
- 0 csillag, 0%: sikertelen, lezuhant, megszakított vagy elhagyott küldetés. A biztonságos hazatérés önmagában nem teljesíti az elsődleges feladatot.

A százalék a küldetés teljesítését és a repülés minőségét együtt mutatja: sikeres feladatért 60 pont jár, a fennmaradó 40 pont a repülés minősége. A csillagok a hibák súlyosságát jelölik, ezért egy súlyos hibával teljesített küldetés magasabb százaléknál is egycsillagos lehet. Sikertelen küldetés továbbra is 0%.

A minőségi levonások a korábbi súlyok 40%-a, egész pontra kerekítve, összesen legfeljebb 40 pont. Kemény földetérés: 6 pont; súlyos földetérés: 14 pont. A leszállás során rögzített új sérülést kivonjuk az általános sérüléslevonás alapjából, így ugyanaz a földetérés nem jár két büntetéssel. Az eljárási levonás különálló repülési fázistípusonként 2 pont, legfeljebb 10; az ismételt átstartolás nem sokszorozza meg ugyanazt a fázislevonást. A földetérés szöveges megállapításait nem számítjuk újra eljárási hibának. A súlyos sérülés és a saját tűzben elveszített baráti egység súlyos hibának számít. A szövetséges AI ellenséges találatai nem számítanak baráti tűznek.

## Visszajátszás

A `flightReplay.js` a saját gép 10 Hz-es mintáiból és a világ 2 Hz-es pillanatképeiből interpolálja a pozíciókat és a forgást. A lövedékek indulási és eltűnési eseményei megtartják az élettartamot. A robbanások a napló eseményeiből determinisztikus részecskékkel épülnek újra. Nem fut újra a fizika vagy a harci AI; az eredeti játékmenet állapotát és a naplót nem módosítjuk.

A jelenetek alapértelmezett hossza 15 másodperc; a felvétel elején és végén a teljes időablakot eltoljuk, nem vágjuk rövidebbre. A 10–15 másodperces küldetések teljes felvétele játszható vissza; 10 másodpercnél rövidebb felvételből nem készül részlet. A gépágyú fénycsíkja legfeljebb a lövedék addig megtett útjáig nyúlik vissza, így az új lövedék csíkja nem lóg át a repülő farkán. A napló az első észleléskor megőrzi a lövedék korát is.

A jelenetválogatás legfeljebb hat részletet emel ki: valóban rögzített felszállást, földetérést, fegyverhasználatot és találatot. Kerüli a túlzottan átfedő részleteket, és előnyben részesíti a különböző eseménytípusokat. Ha nem volt ilyen esemény, egy rögzített repülési részletet mutat. Felszállásnál és leszállásnál a külső kamera a saját gépet követi. A harci részlet eltárolja az eseményben szereplő célpont azonosítóját; légi cél esetén a kamera azt a gépet mutatja közelről a teljes részletben, így a távoli rakétatalálat és az ellenfél manővere is látható. A teljes fizikai állapot nélküli AI-gépek is megfelelő típussal és interpolált forgással épülnek vissza. A háttér a repült küldetés aktuális terepét és vizuális stílusát használja.

Ez élőben renderelt 3D-s rekonstrukció, nem rögzített vagy exportált videófájl. A ritkábban mintavételezett ellenfelek mozgása, a részecskék és a korábbi füstnyomok nem pixelazonosak az eredeti képpel. A `prefers-reduced-motion` beállításnál a háttér állóképpel indul; a felhasználó külön elindíthatja. Szüneteltetett visszajátszásnál a változatlan jelenetet nem rendereljük újra minden képkockán.

Az értékelőlaphoz nem kell plusz grafikus eszköz: ugyanazt a renderert használja. Hang és HUD nélküli képet ad; a visszalépés és újraindítás visszaállítja a normál kamerát. A zuhanási kamera a korábbi 125 méteres hátsó eltérés helyett 82 méterről követ, kisebb oldalirányú és magassági eltéréssel.

## Menüzene

A `menuMusic.js` a „Madárka, madárka / Csácsogó madárka / Vidd el a levelem” hagyományos dallamának saját, 66 BPM-es hangszerelését állítja elő. A fő dallamot kürthangszín, a kíséretet lágy vonósok, mély szólam és visszafogott pergő adja. A hangsávot egyszer, OfflineAudioContext segítségével előállítjuk, majd egyetlen AudioBufferSourceNode ismétli; nincs hálózatról streamelt felvétel vagy harmadik fél felvétele.

A dallam forrása: [ImMusic toolkit, 24. oldal](https://www.tudatosifjusag.hu/wp-content/uploads/2025/03/ImMusic_toolkit.pdf). Az alapdallam és a változó 3/4–2/4 metrum megmarad; a díszítések egyszerűsítettek, a hangszerelés saját.

A nyelvválasztó melletti kapcsoló tárolja a választást. Böngészős hangindítási szabályok miatt a zene az első felhasználói művelet után indulhat. Bevetés közben és háttérbe tett oldalon nem szól. Gyors kattintások esetén is csak egy indítás futhat; a fülek közös Web Lockot használnak, a kikapcsolást storage-esemény és BroadcastChannel továbbítja. A kikapcsolás a hangforrást leállítja, és a még készülő hangsáv késői indítását is érvényteleníti. Web Locks nélküli böngészőben a tárolt tulajdonosjelzés állítja le a korábbi lejátszót.

## Próbák

- `/tests/mission-result.html?stars=3&lang=hu`: rögzített tesztrepülés, ugyanazzal a felülettel és naplókezelővel. `stars=2`, `1`, `0` a többi eredményhez; `lang=en` az angol felülethez.
- `/tests/menu-music.html`: a tényleges hangsáv előállítása, lejátszás, WAV-letöltés, csúcsszint és RMS ellenőrzése.
- `/tests/menu-music-tabs.html`: hang nélküli többfüles vezérlőteszt, valódi böngészőzárral.
- `tests/mission-result.test.js`: pontozás, rövid forgási ív, interpoláció, lövedék-élettartam, változatlan napló és zenei ütemezés.
- `tests/menu-music.test.js`: párhuzamos indítás, előállítás közbeni kikapcsolás, közös zár és némítás.
