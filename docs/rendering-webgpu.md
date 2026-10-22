# WebGPU-megjelenítés

A böngészős alkalmazás alapértelmezett grafikus megvalósítása WebGPU. A 3D világ, a HUD, a műszerfal, a radar, az effektek, a modell-előnézetek és a napló grafikonja ugyanazon eszközt használó GPU-felületekre rajzolódik.

## Felépítés

- `src/rendering/webgpu/`: eszköz és felületek, WGSL-shaderek, modellek/terep/környezet, GPU-s 2D primitívek és szöveg.
- `src/rendering/webgl/`: a korábbi WebGL2-megvalósítás összehasonlításhoz.
- `src/rendering/shared/`: közös geometria-előkészítés, textúrapixelek és 2D alakzatok.
- `src/rendering/createBackend.js`: megvalósítás- és rajzolófelület-választás.
- `src/rendering/flightInstrumentLayer.js`: a műszerfal látható GPU-rétege. A HTML-elemek az elrendezést, a bemeneti eseményeket és az akadálymentes szemantikát őrzik; a repülési felület látható képe GPU-n készül. A menük, dialógusok és dokumentumoldalak HTML-felületek maradnak.

A `renderer.js`, a terep-/modelladatok, a fizika és a játékszabályok közösek. A korábbi `gpuModels.js`, `gpuTerrain.js`, `gpuFeatures.js`, `horizon.js` és `graphics/shaderProgram.js` útvonalak kompatibilis exportfelületek, nem második implementációk.

## Kiválasztás

- `/`: WebGPU.
- `/?backend=webgpu`: kényszerített WebGPU.
- `/?backend=webgl`: WebGL2 és a korábbi Canvas/DOM-kép összehasonlításhoz.
- `/?backend=cpu`: a korábbi Canvas2D-megjelenítés.

Ugyanezek a paraméterek használhatók a diagnosztikai HTML-oldalakon. A natív WebGPU-útvonal nem kér Canvas2D- vagy WebGL-kontextust. A 2D rajzolási műveletek közös, szűk felületét a WebGPU-megvalósítás háromszögekké, textúrázott glyph-ekké és GPU-parancsokká alakítja; nincs Canvas-kép átmásolása a GPU-ra. A betűatlaszt SVG-kép dekódolása készíti, Canvas2D nélkül.

## Életciklus

Az adapter/eszköz létrehozása aszinkron; a bevetésindítás megvárja a `Renderer.ready` ígéretet. Nem elérhető adapter vagy eszközvesztés látható hibát eredményez. Eszközvesztés után az oldal újratöltésével indítható újra a grafikus állapot. Nincs csendes automatikus visszaváltás másik API-ra.

A felületek négymintás élsimítást, külön mélységi textúrát és tartós GPU-s színtextúrát használnak. Az ég, terep, utak/folyók, modellek és HUD sorrendjét egymás után sorba állított parancsok őrzik. Az átlátszó GPU-felületek előszorzott alfával kerülnek egymásra. A fragmentkoordináták CSS-pixelre váltása figyelembe veszi az eszközpixelsűrűséget. A WebGPU mélységi vetítése a 0–1 tartományt használja.

A változó modellgeometria korábbi változatai felszabadulnak; a terep- és útpufferek csak kulcsváltáskor épülnek újra. A modellek határolóadatai gyorsítótárazottak, a uniform adatok feltöltése újrahasznált CPU-pufferből történik. A színátmenetek cache-e korlátos.

A műszerfal a fő kép fizikai felbontásán készül, azonos pixelsűrűséggel. Panelenként megtartott GPU-geometriát használ; csak a tényleges DOM-változások érvénytelenítik a panelt. A változatlan értékre ismételt attribútumírások nem okoznak újrafestést. A frissítések képkockák között oszlanak el, körönként 3 ms-os előkészítési kerettel (egy panel előkészítése és a GPU-parancsok kiadása túllépheti ezt). Az első kép teljesen felépül, a későbbi panelek legfeljebb néhány képkockával késhetnek. A változó paneleknél is újrahasználjuk a GPU-puffereket.

Az üzenetek szöveggeometriája külön gyorsítótárazott. A CSS-átmenetek pozícióját és átlátszóságát minden képkockán követi; a 10 Hz-es műszeradat-frissítés nem korlátozza az animációt. Az üzenetek a saját csatornájuk területére vannak vágva. A beállítás- és nyelvváltásokat a meglévő adatmodell kezeli.

## Ellenőrzés

- `/tests/webgpu-diagnostics.html`: adapter és eszköz ellenőrzése.
- `/tests/webgpu-shaders.html`: a WGSL-modulok fordítási diagnosztikája.
- `/tests/graphics-regression.html?backend=webgpu&mission=landing&lang=en`: rögzített, hang és fizikai időlépés nélküli teljes műszerfal. Ugyanez `backend=webgl` paraméterrel referenciakép. Magyarul `lang=hu`. Tengeri próba: `mission=carrier-defense`.
- A regressziós oldal WebGPU-módban hibát dob, ha a kód `2d` vagy `webgl2` kontextust kér. Az állapotmező megmutatja az API-kat és a GPU-validációs hibákat.
- Terhelési mérés: `/tests/graphics-regression.html?mission=carrier-defense&lang=hu&contacts=24&benchmark=1`. A fizika áll, 24 további repülőgép látható; 60 bemelegítő és 240 mért képkocka után CPU-időket és képkockaközöket ír ki (medián, p95, maximum). Nem GPU-időmérés vagy teljes szimulációs FPS-benchmark. A `hostile=1` ellenséges gépsablont választ, a `messages=1` ismétlődő rádióüzenetekkel teszteli a beúszást és elhalványulást. Összevetéskor ezek a paraméterek is egyezzenek.
- `/tests/surface-preview.html?backend=webgpu`: közel/távol, modellek, város és tájpaletták.
- `/tests/horizon-conformance.html?backend=webgpu`: önálló horizont, azonos kamerával; WebGL-referenciához `backend=webgl`.
- `tests/webgpu.test.js`: mélységtartomány, mátrixelrendezés, konkáv HUD-polygonok és szín-/koordinátaadatok érdemi ellenőrzése.

A képi összevetésnél a viewport, pixelsűrűség, nyelv, küldetés, kamera és paletta egyezzen. A szöveg és a vékony vonalak raszterizációja eltérhet a Canvas/DOM-referenciától; bitazonos pixelkép nem elvárás. Gyorsulási állítást csak azonos feltételekkel végzett mérések alapján tegyünk; a CPU-s szimuláció és láthatóságvizsgálatok külön költségek.
