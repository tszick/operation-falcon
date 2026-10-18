# Operation Falcon: Redline

A mellékelt vadászrepülő-szimulátor terv alapján készült első, játszható böngészős prototípus. Magyar kezelőfelület, függőségmentes Canvas 2D-re vetített 3D világ; külön, 120 Hz-es fizikai ciklus és kvaterniós tájolás. A repüléshez asztali böngésző és billentyűzet szükséges.

## Indítás

Node.js 20 vagy újabb szükséges. A projekt mappájában:

```
npm start
```

Nyisd meg: http://localhost:5173 . Telepítés és külső csomag nem szükséges. Más port: a PORT környezeti változóval. A kiszolgáló kizárólag a helyi gépen hallgatózik.

## Küldetéstervezés és egységek

A hangár bal oldalán hat összetett küldetés közül választhatsz, jobb oldalon a 25 repülőgép öt csoportja közül. A leírás alatt az elsődleges és opcionális célok, a fenyegetésikonok és a forgó egységmodellek láthatók. Az **Egységtár** (`/encyclopedia.html`) a földi objektumok, repülők és fegyverzetük játékbeli adatlapja.

- **Gyakorlás – Civil gép elfogása:** felszállás, békés befogás, a civil távozása, majd leszállás. A civil bármilyen sérülése kudarc.
- **Gyakorlás – Leszállás:** levegőből, a pályára állítva, 15% üzemanyaggal és fegyverzet nélkül. N: leszállási segéd.
- **Kezdő – Konvoj megállítása:** rombold le a hidat, mielőtt a konvoj átjut. A konvoj megsemmisítése opcionális; a lerombolt híd előtt megáll. Végül szállj le.
- **Haladó – Védd meg a repteret:** bombázó és két vadász támad; szövetséges bunker, két rakétarendszer és egy baráti vadászgép segít. A saját bázis maradjon épen, minden támadó pusztuljon el, majd szállj le.
- **Haladó – Védd meg a szállítógépet:** levegőből indulsz a szállító mellett. Egy vadászgép és egy üteg támadja; kísérd ki a légtérből, majd szállj le. Minden ellenfél kiiktatása opcionális.
- **Top-gun – Bombázd le a repteret:** pusztítsd el a saját bázisodat támadó konvojt és az ellenséges repteret, majd szállj le. A célrepteret külön jelzavaró és rakétarendszer védi.

A sikerhez biztonságos leszállás és 18 km/h alá lassítás szükséges. A Mission Control követi a célok állapotát. A saját reptér és a védendő szállító tényleges találatoktól sérülhet; az AI egységek egymást is támadják. A bombázó ballisztikus bombákat vet, a baráti rakétarendszer követő rakétákat indít. A kék jel szövetséges, a narancs ellenség, a világoskék civil.

**Szabad célkijelölés:** T/Tab-bal bármely észlelt ellenséges objektum kiválasztható, amíg nem vagy zavarózónában. Nincs kötelező támadási sorrend vagy „előbb minden támadót” szabály. A radar látókúpja és hatótávja továbbra is számít. Szövetséges egységre nincs irányított célkijelölés; a civil békés elfogáshoz befogható.

A reptér és a híd nem tüzel. A bunker tüzelő objektum; a vadászok, bombázó, konvoj, üteg és rakétarendszer tüzelő egységek. A jelzavaró külön kategória, a szállító és a civil fegyvertelen. Az önálló radarállomás kivezetve.

## Az első repülés

1. Válassz célt és gépet. A minősítés a feladathoz szükséges képességek egyezéséből származik. Nem ajánlott géppel is elindulhatsz.
2. R: teljes gáz, Shift: utánégető. 280–330 km/h körül finoman S-sel emeld az orrot. Egyes típusok más sebességnél emelkednek el.
3. G: futómű be; X: fékszárny be. A/D: billentés, S/W: orr fel/le. A bankolt gép koordináltan fordul.
4. Tab: célkiválasztás. Tartsd a radarkúpban 2 másodpercig. 1: ágyú; 2: légiharc-rakéta; 3: földi rakéta; 4: bomba. Szóköz: tűz.
5. Kövesd a BASE jelzést. A saját pálya tengelye észak–déli. Déli megközelítéshez két, 3 fokos siklópályán elhelyezett kapu segít. Futómű és fékszárny ki, kis süllyedés. Földetéréskor 3 m/s-nál kisebb süllyedés, 10 foknál kisebb bank, pályán belüli és a pályával közel párhuzamos helyzet szükséges.
6. F: gáz le, Ctrl: kerékfék. A győzelemhez célmegsemmisítés után sikeres leszállás és 18 km/h alá lassítás kell.

H: teljes súgó; P/Esc: szünet; V: külső nézet; L: G-korlátozás; B: légfék; Q/E: oldalkormány; M: némítás. Fókuszvesztéskor a repülés megáll. A legjobb pontszám helyileg mentődik, ha a böngésző engedi.

## Megvalósított rendszerek

- 25 adatvezérelt gépváltozat, öt hangárcsoport, hat összetett küldetés és képességalapú ajánló.
- Sűrűséggel változó légkör, tolóerő, poláris ellenállás, állásszögfüggő felhajtóerő, átesés, fogyó tömeg, utánégető, felületek, G- és Mach-túllépésből eredő kár.
- Perspektivikus drótvázas terep, pálya, épületek, egyszerű gépformák, belső/külső nézet, HUD, repülési pályajel és szintvonalas térkép/radar.
- Radarkúp, időzített és megszakadó befogás, gépágyú előretartási jel, arányos navigációjú rakéta, ballisztikus bomba és CCIP.
- Teljes küldetésállapot, ütközés, földetérési feltételek, pontozás, szünet, újrakezdés, Web Audio hangok.

## A prototípus korlátai / következő lépések

A gépadatok közelített játékmeneti adatok. A saját vektormodellek az eredeti típusok jellegzetességeit közelítik. A terep procedurális, nem valós földrajz. A repülés és az érzékelők egyszerűsített modellek; nincs részletes tehetetlenségi vagy hajtóműtérkép, földi kiszolgálás vagy gamepad/touch vezérlés. A többegységes küldetések nehézsége további berepüléssel hangolható.

## Ellenőrzés

```
npm test
npm run check
```

A tesztek a repülés, befogás, fegyverek és küldetésfeltételek lényegi invariánsait vizsgálják. A modulok: `physics`, `aircraftSpec`, `terrain`, `targeting`, `weapons`, `mission`, `audio`, `renderer`, `hud`; a `main` köti össze a felületet és az időzítést.

## Frissített irányítás és leszállási segéd

A gázállás, a bedöntés és az orrhelyzet a gomb elengedése után megmarad. A gép nem áll automatikusan vízszintbe; ellenkező irányú kormánymozdulattal állítsd vissza. A bedöntve hagyott gép tovább fordul. Az L csak a G-korlátozást kapcsolja. A sebességet továbbra is a tolóerő, az ellenállás és a gravitáció változtatja; a megtartott gázállás nem sebességtartó automatika.

A leszállási segéd a küldetés állapotától függetlenül, a pálya mindkét végéről automatikusan működik (7 km-en belül, 650 m alatt, közel pályairányon érkezve). N-nel kézzel is kapcsolható; kikapcsolás után N-nel kapcsolható vissza. A radar helyén megjelenik a futómű, a fékszárny, a célsebesség, a süllyedés, a siklópálya-eltérés, a pályairány, a tengelyeltérés, a bedöntés és a beérkezési szög ellenőrzőlistája. A megfelelő pályamegközelítésnél a talajközelségi jelzést a konkrét leszállási hibák váltják fel; a pályától távol vagy veszélyes terepközelben a talajriasztás megmarad.

Megközelítés délről 000°, északról 180° irányon. 2 km-rel a küszöb előtt kb. 107 m magasság szükséges a 3° siklópályához. Utánégető ki, G: futómű ki, X: fékszárny ki, majd a kijelzett típusfüggő célsebesség tartása gázszabályozással. Földközelben (10–15 m) finoman emeld az orrot és csökkentsd 3 m/s alá a süllyedést. A 3° megközelítés önmagában nem elég a földetéréshez: 260 km/h-nál még kb. 3.8 m/s süllyedést jelent, ezért szükséges a szintbe vétel. A pálya felett a bedöntés maradjon 10° alatt, és igazodj a pályairányhoz. Földetérés után F-fel gáz le, Ctrl-lal kerékfék. A sikertelen földetérés jelentése kiírja a konkrét okokat.

A hajtóműhang halkabb, szűrt zajból és halk turbinasípolásból áll. A figyelmeztetések hangereje külön maradt.


## Repülési fázis és üzemanyagszint

A felső repülési sáv folyamatosan kiírja a pillanatnyi fázist és a következő teendőt: felszállási előkészület, felszállás, emelkedés, légi cél elfogása / földi cél megközelítése, légiharc / szárazföldi cél támadása, hazatérés, leszállási megközelítés, szintbe vétel, kifutás, teljesítés vagy sikertelenség. A támadási fázist a céltávolság, a célbefogás és a fegyverhasználat váltja ki; a távolsági küszöbök eltérnek belépéskor és kilépéskor, hogy a felirat ne váltogasson a határon. Megszakított leszállás után a küldetés szerinti fázis folytatódik.

Az üzemanyag egy íves skálájú FUEL TOT műszeren látszik a bal alsó sarokban, a számérték ezer kilogrammban értendő. 25% alatt BINGO, 10% alatt FUEL LOW, üres tartálynál FUEL OUT jelzést ad. A pontos százalék és kilogramm akadálymentesen továbbra is kiolvasható.

## Finomabb bedöntés és célbefogás

A billentési sebesség maximuma 150-ről 85 fok/másodpercre csökkent, a gomb lenyomásakor 0,2 másodperc alatt fokozatosan épül fel. Elengedéskor az orsózás azonnal megáll, a bedöntés megmarad.

T vagy Tab egyszeri megnyomásával válassz radarkúpon belüli célt; a CÉLBEFOGÁS gomb ugyanígy működik. Tartsd a célt a gép előtt 2 másodpercig. Az egyetlen cél ismételt kiválasztása már nem kezdi elölről a befogást. A külön panel mutatja az észlelést, a befogás százalékát, a befogott/tűzkész állapotot, a hibás fegyvert és a hatótávon vagy radarkúpon kívüli célt. Utóbbi esetben a cél irányát és a szükséges orrmozgatást is jelzi. A cél megjelenítése önmagában navigációs jel, nem feltétlen radarkontakt.

Légi cél: 2, földi rakéta: 3, tűz: Szóköz. A/D: bedöntés és ebből következő fordulás; S: orr fel; W: orr le. Jobbra bedöntés után a gép jobbra fordul; A-val kell visszaállítani vízszintesre, amikor a megfelelő irányt eléred.

A jobb felső Mission Control számozott, billentyűkhöz rendelt lépésekkel segít az aktuális fázisban. Az elvégzett lépések pipát kapnak, a következő lépés kiemelést. Az × bezárja, a ? újra megnyitja; a választás a következő repülésekre is megmarad. A részletes kézikönyv H-val érhető el. A folyamatos magyarázó szövegek a fő HUD-ról a gyorssegédbe kerültek.

## Csillagos ég és felismerhető vektormodellek

A csillagmező a világ felső félgömbjéhez kötött, a kamerával együtt perspektivikusan fordul és bedől. Nem követi a repülőgép helyzetét, a talaj és a hegyek kitakarják. A geometriai horizont teljes orsózás és függőleges nézet közben is követi a világ fent/lent irányát.

Mind a 25 választható típus saját, méterarányos, kézzel szerkesztett vektormodellt használ. A szárny körvonala, a vezérsíkok, a kabin, a hajtóművek, a beömlők és jellegzetes kiegészítők különböznek. A modellek stilizált felismerési modellek, nem pontos CAD-másolatok. A takart felületeket sötét lapok fedik el, megőrizve a drótvonalas megjelenítést. A változtatható nyilazású típusok külső repülési nézetben Mach-függő szárnyállást kapnak; a hangárban kinyitott állás látható.

Nyugati saját géphez szovjet, szovjet géphez nyugati légi ellenfél tartozik. A vadászfeladatok típuspárosítást használnak; bombázó célként Tu-95 / B-52, szállító célként Il-76 / C-130 jelenik meg. A radar és a céljelzés kiírja az ellenfél típusát.

Sziluett-referenciák: National Naval Aviation Museum F-14A (https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/f/f-14a-tomcat.html), National Museum of the USAF A-10A (https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/195855/fairchild-republic-a-10a-thunderbolt-ii/), Bundeswehr MiG-29 (https://www.bundeswehr.de/de/organisation/luftwaffe/aktuelles/30-jahre-armee-der-einheit-uebernahme-der-mig-29-3248728).


## Fegyverhangok és harci effektek

A fegyverek külön eseményeken keresztül indítják a hangot: pergő ágyúsorozat, rakétaindítási impulzus és hajtóműzaj, bombakioldási mechanikus hang, illetve mély, lecsengő robbanás. A távoli robbanások halkabbak, kevesebb magas hangot tartalmaznak és késleltetve érkeznek; a késleltetés a játszhatóság érdekében legfeljebb 2,5 másodperc. A fegyvereffektek külön, dinamikakompresszorral védett hangágat használnak. A bevált hajtóműhang beállításai megmaradtak. A némítás és a szünet a fegyverhangokra is érvényes, újraindításkor a régi hangok törlődnek.

A lövésekhez rövid torkolattűz és nyomjelző, a rakétákhoz égésidőhöz kötött láng és leváló, elhalványuló füstcsóva tartozik. A találatnál rövid fényvillanás, szabálytalan tűzgömb, ballisztikus vektortörmelék és lassabban eloszló füst jelenik meg. A talajba csapódó ágyúlövedék kis szikrákat, a bomba nagyobb földi robbanást okoz. Egy becsapódás egyetlen robbanási eseményt hoz létre.

Fejlesztői hang- és effektellenőrző oldal: `/tests/effects-preview.html`; valódi Web Audio offline rendereléssel ellenőrzi a kimeneti jelszinteket, és külön gombokkal lehet meghallgatni az effekteket.

## Lassítás megközelítéskor

Az F a gázállást csökkenti (kb. 3,2 másodperc alatt teljes gázról alapjáratra), nem közvetlen sebességfék. Süllyedésben a gravitáció alapjáraton is fenntarthat nagy sebességet. Ha a gáz már 0%, a gyorssegéd B-vel légféket kér; a HUD-on BRK jelzi a nyitott légféket. Futómű és fékszárny kiengedése is növeli az ellenállást. Enyhítsd a süllyedést, és hagyj elegendő távolságot a lassulásra. A célsebesség elérésekor zárd a légféket, majd finom gázzal tartsd a sebességet és a 3°-os siklópályát. A Ctrl csak a földi kerékfék.

A megközelítési célsebesség a gép pillanatnyi tömegéből (üzemanyag és fegyverzet), szárnyfelületéből és a leszálló fékszárnyállás maximális felhajtóerejéből számolódik. Legalább az így számolt átesési sebesség 1,23-szorosa, és nem alacsonyabb a típus alapértékénél. Az érték IAS, tehát a HUD IAS skálájához kell hasonlítani. A célsebesség és figyelmeztetései ugyanazt a számítást használják a leszállási panelen és a gyorssegédben.

## Pilótaútmutató és típushoz kötött fegyverzet

A `/tutorial.html` géptípustól független, nyomtatható magyar útmutató: kijelzők, felszállás, elfogás, légi/földi támadás, elhaladó célra visszafordulás, hazatérés, pályára fordulás, lassítás, leszállás és átstartolás. A hangár Irányítás gombjával vagy repülés közben H-val megnyitható súgó közvetlenül hivatkozza.

A `src/armament.js` minden géphez konkrét változatot és konzervatív, előre összeállított készletet rendel. Ez a játékban felkínált készlet, nem a típus összes lehetséges fegyverének katalógusa. A készletek különböző korszakokat képviselnek, nem egy adott év közös hadrendjét. A MiG-25PD nem kap gépágyút; az F-15C, Su-27S és MiG-31B elfogó/légiharc-készletet kap; a MiG-29A nem örökli a későbbi változatok földi irányított rakétáit; a Tornado IDS készletében nincs más változatból átvett földi rakéta. Az A-10A és a szovjet csapásmérők önvédelmi légiharc-rakétát is kapnak.

A bal felső felülnézet a saját típus modelljét használja. A függesztmények helye sematikus, nem hitelesített állomás- és adapterrajz; a beépített ágyú közös jelképes jelölést kap. A kiválasztott fegyver világos; kilövés/kioldás után a megfelelő hely kiürül. A rakéták és bombák ugyanabból a nyilvántartott helyből indulnak, amelyet a kijelző mutat. Az 1–4 gombok és a kattintható lista csak a felszerelt, még rendelkezésre álló fegyverek közül választanak. A közvetlen tüzelési ellenőrzés is tiltja az inkompatibilis fegyvert. A hangár, a küldetésajánlás és a fázissúgó ugyanezt a készletet használja.

A valós kompatibilitás a fegyvertípusokra vonatkozik. A repülés és a befogás egyszerűsített; a fegyverek külön dinamikai profiljai, a keresőfej-családok absztrakciója és a korlátok az alábbi Fegyverdinamika részben szerepelnek. A gépágyúk tűzüteme játékbeli mintavételezés, nem a valós teljes lövésszám. A bombakészletek szabadesésű bombákat tartalmaznak, légellenállást is számoló CCIP-előrejelzéssel. A mennyiségek választott játékkészletek, nem minden típus maximális terhelhetősége.

Elsődleges fegyverzet-referenciák (gyártói, katonai és katonai múzeumi anyagok):

- [USAF National Museum – MiG-25PD: négy R-40 családú rakéta](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/196331/AFmuseum/mikoyan-gurevich-mig-25/).
- [USAF National Museum – MiG-29A: ágyú, légiharc-rakéták, bombák](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/197174/mikoyan-gurevich-mig-29a/).
- [USAF – A-10: GAU-8/A, AIM-9, AGM-65, Mk 82](https://www.af.mil/Portals/1/documents/aboutus/FactSheets/A10_Thunderbolt_II.pdf).
- [US Navy Museum – Hornet: M61, Sidewinder, Maverick, hagyományos bombák](https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/f/f-a-18-hornet--tactical-.html).
- [USAF National Museum – F-4E, M61 és Sparrow](https://www.nationalmuseum.af.mil/Upcoming/Photos/igphoto/2000541102/).
- [USAF National Museum – F-16](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/196735/general-dynamics-f-16a-fighting-falcon/).
- [RAF – Typhoon FGR4: BK-27, AMRAAM és Brimstone](https://www.raf.mod.uk/aircraft/current-aircraft/typhoon-fgr41/).
- [Saab – Gripen C fegyverintegrációs ismertető](https://www.saab.com/globalassets/products/aeronautics/gripen-c-series/gripen_c-foldout.pdf).
- [Bundeswehr – Tornado, hagyományos Mk 82/83/84 fegyverek](https://www.bundeswehr.de/en/organization/german-air-force/pa-200-tornado).
- [Rheinmetall – Mk 82-EP, Mirage 2000 és Rafale kompatibilitás](https://www.rheinmetall.com/en/media/news-watch/news/2020/2020-12-02_rheinmetall-s-advanced-mk82-ep-general-purpose-aircraft-bomb-wins-orders-in-france-and-germany).
- [US Army Worldwide Equipment Guide, 2011, 2. kötet – géptípusok és fegyverzet](https://cgsc.contentdm.oclc.org/digital/api/collection/p4013coll11/id/2090/download) (katonai könyvtár; a közvetlen letöltést a szolgáltató JavaScript-kapuja korlátozhatja).
- [Ukrspecexport – Ukrainian Defence Industry, repülőgép-fegyverzet](https://www.ukrspecexport.com/uploads/files/Categories/pdf_1/a205b8.pdf).

## Öt hangárcsoport, 25 gép

A hangár NATO klasszikus (9), NATO modern (5), szovjet (7), orosz modern (2), kínai modern (2) csoportot használ. A Rafale, Typhoon és Gripen a modern NATO csoportba került. Új gépek: F-22A, F-35A, Su-35S, Su-57E, J-10C, J-20. A fülek a saját utolsó választást megőrzik, nyílgombokkal/Home/End-del is kezelhetők. A kategória hangárbeli korszakcsoport, nem szigorú történeti vagy generációs osztályozás.

Mindegyik új gép saját méretarányos, kézzel készített felismerési modellt kapott. F-22: szögletes törzs, trapézszárny, kifelé döntött ikervezérsík és lapos fúvócső; F-35A: széles egyhajtóműves törzs és ikervezérsík; Su-35: kacsaszárny nélküli Flanker-elrendezés; Su-57: lapos, széles törzs, távol ülő hajtóművek és alacsony ikervezérsík; J-10C: egyhajtóműves delta-kacsa; J-20: hosszú törzs, nagy kacsaszárnyak, delta főszárny, ikervezérsík, hátsó vízszintes vezérsík nélkül. A modellek felismerési közelítések, nem gyári CAD-adatok. Fejlesztői galéria: `/tests/graphics-preview.html?modern`.

A nyilvános adatokhoz igazított tömeg, üzemanyag, szárnyfelület, száraz és utánégetős tolóerő, Mach-határ, G-határ és magasság mellett külön hangolást kapott az irányítás. Az ismeretlen vagy változattól függő adatok, különösen radar, modern orosz/kínai gépek üres tömege, üzemanyaga és felhajtóerő-tényezői játékbeli becslések. A kis észlelhetőség, tolóerővektorálás, AESA és szenzorfúzió jelenleg nincs külön modellezve; a modern gép nem válik automatikusan láthatatlanná.

Az F-22A, F-35A, Su-57E és J-20 most konzervatív belső légiharc-készletet kapott. A teljes valós arzenál nem választható; az F-35A földi képességét például ez a készlet nem használja ki. A J-20-hoz bizonytalan gépágyút nem rendelünk. Belső rakéták a törzsben jelennek meg, szaggatott jelöléssel és „belső fegyvertér” leírással. A Su-35S földi rakétát és bombát is kapott. Modern vadászgépek modern ellenfelet kapnak; kínai saját gép NATO ellenfelet, az F-35A kínai J-20-at.

Referenciák: [USAF F-22](https://www.jble.af.mil/Portals/46/F-22%20Fact%20Sheet.pdf), [USAF Museum F-22 fegyverzet](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/196040/lockheed-martin-f-22a-raptor/), [USAF F-35A](https://www.afnwc.af.mil/About-Us/Fact-Sheets/Article/2074660/f-35a-lightning-ii/), [UAC Su-35](https://uacrussia.ru/en/aircraft/lineup/military/su-35/), [Rosoboronexport Su-57E](https://roe.ru/pdfs/pdf_6929.pdf), [Rostec – Su-57E/RVV-SDM](https://rostec.ru/en/media/news/rosoboronexport-presents-the-latest-missile-for-the-su-57e/), [orosz katonai exporthatóság – Su-35 fegyverzet](https://www.fsvts.gov.ru/catalog/680.ru.html), [US Army ODIN – PL-15 hordozók](https://odin.t2com.army.mil/WEG/Asset/PL-15_%28Thunderbolt-15%29_Chinese_Active_Radar-Guided_Very_Long_Range_Air-to-Air_Missile), [CSIS – J-20 méret- és elrendezés-elemzés](https://chinapower.csis.org/china-chengdu-j-20/).

## Fokozatos sérülések és lezuhanás

A sérülés külön integritásértéket vezet a két szárnyhoz, a vezérsíkhoz, a hajtóművekhez, a hidraulikához és a fegyverrendszerhez. Egy repülés elején egyszer választott, rögzített hibaminta dönti el a gyengébb oldalt és a beszoruló szerkezetet. A fizikai lépések közben nincs képkockánkénti véletlen hibaváltás. A sérülések nem gyógyulnak meg. Alapfokozatok a névleges károsodás szerint:

| Kár | Állapot | Jellemző következmény |
| --- | --- | --- |
| 15–39% | Enyhe | Rezgés, gyengülő kormányhatás, növekvő ellenállás |
| 40–64% | Rendszerhibák | Aszimmetrikus bedőlési hajlam, tolóerővesztés, kényszerhelyzet fázis |
| 65–84% | Súlyos | Beszoruló futómű/fékszárny/légfék; eléggé sérült fegyverrendszernél rakétatilalom |
| 85–99% | Kritikus | Nagyon gyenge irányíthatóság, nagyobb süllyedési hajlam, súlyos hajtóműkárnál továbbterjedő tűz |
| 100% vagy kritikus alkatrész elvesztése | Végzetes | Pilóta beavatkozása hatástalan, automatikus külső kamera, folyamatos fizikai zuhanás |

A hatások ténylegesen az alkatrészek állapotából számolódnak, ezért a táblázat jellemző sorrend, nem minden esetben egyszerre bekapcsoló hibacsomag. Szárnyveszteség csökkenti a hatásos felhajtóerőt és növeli a leszállási referencia-/átesési sebességet. A bal/jobb felhajtóerő-különbség billentő nyomatékot hoz létre; ikerhajtóműves gépnél az eltérő tolóerő elfordító nyomatékot. A nyomatékokat becsült tehetetlenséggel, légsebességtől függő csillapítással integráljuk. Vezérsík/hidraulika sérülése a pilóta kormányparancsának hatását csökkenti. A beszorult mechanika a pillanatnyi állásában marad, a rakétahiba pedig nem fogyaszt lőszert és nem indít lövedéket. A sebességet és magasságot nem mesterséges számmal korlátozzuk: az erőegyensúly változása okozza a romlást. A kamera rezgése csökkentett mozgás beállításnál kikapcsol, a fizikai sérülés megmarad.

A saját gépet jelenleg túlterhelés, sebességhatár-túllépés és farokrész-leérés károsíthatja; az ellenség továbbra sem lő vissza. Légi cél gépágyútalálatok után fokozatosan sérül, több találat harcképtelenné teszi; egy rakétatalálat a mostani egyszerűsített sebzésben végzetes. A sérült légi cél ugyanazt a sérülési és repülési modellt használja. Az addig ép AI célok korábbi kinematikus egyenes repülése megmaradt; bombázó/szállító sérülésénél a vadászgépes fizika referenciahelyettesítést használ, nem típus-specifikus nagy repülőgép-modellt. A földi célok eddigi egyszerű megsemmisítése megmaradt.

Végzetes kár nem állítja `crashed` állapotba a gépet a levegőben. A kamera világfüggő, stabil követési helyzetből figyeli a forgó/süllyedő gépet; a sérült szárny vizuálisan is deformálódik, füst/tűz keletkezik. Tényleges terepérintéskor áll meg a gép és indul egyetlen földi robbanás. A repülési jelentés 5 másodperccel ezután jelenik meg; a levegőben nincs időzített eltüntetés. A fizika továbbra is játékhoz hangolt közelítés, nem teljes hitelesített hat szabadságfokú aeroelasztikus/sérüléstűrési modell.

Próbalap: `/tests/damage-preview.html` — ép, enyhe, közepes, súlyos és végzetes helyzet, működési hibák gombokkal, több kontaktos radar. A fő játék és a próbalap ugyanazokat a fizikai, sérülési, kamerás, effekt- és radar modulokat használja.

Fizikai alapok: [NASA felhajtóerő-egyenlet](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-equation/), [NASA felhajtóerő és légellenállás](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-to-drag-ratio/), [NTSB – aszimmetrikus tolóerő és irányíthatóság](https://www.ntsb.gov/Advocacy/safety-alerts/Pages/SA-081.aspx). Ezek az összefüggéseket támasztják alá; a játék sérülési százalékai és hiba-küszöbei saját hangolási értékek.

## Távolabbi terep és irányjelzős radar

A procedurális terepnek nincs merev fizikai széle. A korábbi kb. 10 km-es részletes rajztávon kívül további, ritkább rács rajzolódik kb. 48 km-ig. A közeli, részletes terep megmaradt. A radar alapképe 60 km széles, nagy távolságnál automatikusan tágul, ezért a saját gép és a BASE nem fut le róla. Leszállási módban 20 km-es alapképre közelít, mutatja a pálya meghosszabbított tengelyét és 000°/180° irányait; a radar ekkor is látható a leszállási műszerek mellett.

Az ellenségek kizárólag a saját radar tényleges háromdimenziós látókúpján és hatótávján belül láthatók. Több kontakt egyidejűleg jelenhet meg; megsemmisült vagy látókúpból kiesett cél nem marad a képen. A térkép automatikus tágulása sem veszi figyelembe a rejtett ellenségek helyét. A légi cél háromszöge és irányvonala a pillanatnyi vízszintes sebességből számolt haladási irányt mutatja; mozgó földi célhoz is tartozik iránynyíl. A radarkúp az orrhoz, a saját haladási nyíl a sebességhez igazodik. Fent továbbra is észak van.

## Civil elfogás és légvédelmi üteg

A hangárban hat összetett küldetés szerepel kéthasábos kártyarácsban; a jelenlegi feladatokat a Küldetéstervezés szakasz részletezi.

A Civil feladat semleges, kék jelölésű, általános kétmotoros utasszállítót használ; ez saját felismerési modell, nem egy konkrét gyártmány másolata. Felszállás után a szokásos radaros befogás egyszer elindítja a visszafordulását. A forduló folyamatos, a befogás elvesztése vagy megismétlése nem indítja újra. A forduló után az indulási távolságnál 4 km-rel nagyobb sugarú feladatlégtér elhagyása jelenti az elfogási cél teljesítését. A civil cél sértetlenül, megsemmisítési pont nélkül tűnik el a térképről. A játékos közben hazafelé indulhat, a teljes küldetéshez továbbra is biztonságos leszállás és megállás kell. A civil gép bármilyen találata végleges küldetéskudarc; fegyverhasználatot a szimulátor nem varázspajzzsal tilt, hanem egyértelmű tűztilalmi figyelmeztetéssel és a szabály megszegésének következményével kezeli. A jelentés ilyenkor civilvédelmi kudarcot ír, nem a saját repülőgép elvesztését.

A légvédelmi üteg a szállítókísérő küldetésben egy támadható állásként jelenik meg. Az üteg robbanógránátokkal és alacsony célok ellen gépágyúval tüzel.


## Ellenséges tűz és sérülési térkép

A célok minden induláskor véletlen irányban, a légi egységek 22–32 km-re, a földiek 18–28 km-re jelennek meg. A radar továbbra is csak a saját gép látókúpjába és hatótávjába eső kontaktokat mutatja.

A küldetéskártyák jobb felső sarkában a rakéta, robbanógránát és gépágyú ikonjai jelzik a veszélyeket. Kiválasztás után a leírás mellett szöveges felsorolás is látszik. A Légvédelmi üteg mellett külön Légvédelmi rakétarendszer küldetés választható; a 12. kártyát a Leszállás gyakorlóküldetés tölti ki.

- Követő rakéta: vadászgép, bombázó, rakétarendszer, repülőtér.
- Rövid, háromlövetű robbanógránát-sorozat: légvédelmi üteg, konvoj, repülőtér. A gránát az előre számított helyen, időzítve robban; a távolsággal csökken a repeszkár.
- Rövid, tízlövetű gépágyúsorozat: vadászgép, bombázó, szállítógép, légvédelmi üteg, rakétarendszer, konvoj, bunker, repülőtér. A földi ágyúk 900 m AGL alatt tüzelnek; a vadász ágyúja előrefelé lő.

A terep takarása megakadályozza a célzott indítást. Az egységek korlátozott lőszerrel, szünetekkel és befogási idővel működnek, a földön álló játékost nem támadják. Az ellenséges rakéták ugyanazt az egyszerűsített arányos navigációt használják, mint a saját rakéták; érkezésükkor figyelmeztetés és hangjelzés szól. A paraméterek játékegyensúlyt szolgálnak, nem valós légvédelmi rendszerek hiteles adatai.

A gyors lövedékek ütközését a teljes két képkocka közötti útszakaszon, az elmozduló gép saját térbeli modelljén vizsgáljuk. A találat a megfelelő szárnyat, vezérsíkot, törzset, hajtóművet vagy rendszerterületet sérti. A közelségi rakétagyújtó és a gránátrepeszek a legközelebbi felületre hatnak. Egy rakétatalálat 50, egy közeli repeszrobbanás legfeljebb 7, egy ellenséges gépágyúlövedék 1,8 sérüléspont: az adott rész korábbi károsodása is számít. A saját légirakéta-találat is helyi, túlélhető sérülést okozhat; a pusztulást a sérülési modell dönti el. A saját találati pontszámot az ellenséges lövések nem növelik.

A bal felső felülnézet a sérült részeket sárgától pirosig színezi, a GÉP ÁLLAPOTA a teljes megmaradt szerkezeti állapotot mutatja (100% = ép). A túlterhelésből, túl nagy sebességből és hibás repülésből származó kár ugyanebben a jelzésben jelenik meg.

## Leszállási helyzetjelző

Leszállási fázisban a bal oldalon külön kis műszer jelenik meg. Felül a pályához viszonyított orrirány (ORR) és a tényleges vízszintes haladási irány (IRÁNY, szaggatott vonal) eltérése látszik; 0° a párhuzamos érkezés. Alatta a gép oldalnézete és a bólintási szög mutatja az orrhelyzetet. A játék földetérési határaihoz igazodva −3° alatt orr túl lent, +15° fölött orr túl magasan jelzés jelenik meg. A BEDÖNTÉS és a SIKLÁS külön érték: a siklás a repülési pálya süllyedési szöge, nem az orrhelyzet. Az eszköz a pálya mindkét végén működik, és leszállás után eltűnik. Kézzel N-nel kapcsolható a leszállási fázis.


## Fegyverdinamika és indítási helyzet

A `src/weaponDynamics.js` minden felszerelt fegyverhez külön profilt rendel. Az AIM-9L/M, Magic II, MICA IR, AIM-7E/M, AIM-120/C, R-60M, R-73, R-40, R-33, R-77-1, RVV-SDM, PL-15, Maverick, Brimstone, Kh-29L és Kh-25ML saját tömeggel, motorral, égésidővel, homlokfelülettel, ellenállással, élettartammal és manőverhatárral működik. A repülőgép függesztményterhelése is ezekből a tömegekből számolódik; a lőszerhez a lövedéktömeg 2,2-szerese tartozik mint közelítő teljes tölténytömeg.

A profilok játékbeli közelítések. A nyilvános források a fegyvercsaládokat és azok jellegét támasztják alá; a motor- és ellenállási együtthatók, az energiaküszöbök és a teljes indítási tartomány nem hitelesített gyártói adatok. A kevéssé dokumentált modern fegyverekhez sem állítunk titkos vagy pontos teljesítményadatokat.

Rakétánál ténylegesen számoljuk a hajtóanyag égésével csökkenő tömeget, a véges motorüzemet, a légsűrűség és Mach-szám szerinti ellenállást, a gravitációt, a forduló felhajtóerejének indukált ellenállását, a dinamikus nyomással csökkenő kormányhatást és a fordulási korlátokat. A motor leállása után a rakéta lassul; a kormányzás nem termel ingyen sebességet. A közelségi gyújtó csak az élesedési idő és biztonsági úthossz után működik. A cél a keresőfej látómezejéből kikerülhet, a terep takarhatja, vagy túl kevés sebesség maradhat a követéshez. Az elvesztett célra a rakéta már nem fordul vissza varázslatosan: továbbhalad, majd eléri a terepet vagy lejár az élettartama.

Az AIM-7 és a játékban radarosnak tekintett R-40/R-33 támogatást igényel a hordozótól; a lézeres Kh-25/29 ugyanilyen egyszerűsített, célon tartást igénylő megvilágítást használ. Az aktív radaros rakéták a végfázisig hordozói támogatást igényelnek, utána önállóak. Az infravörös/képalkotó családok önállóan követnek. A támogatás ebben a játékban élő hordozót, radartávolságot, előrenéző látómezőt és szabad rálátást jelent; nincs külön lézeres célzókonténer, radarcsatorna, zavarás vagy részletes hőkép-szimuláció.

A BECSÜLT LŐTÁV a pillanatnyi magasságból, saját sebességből, a cél radiális/keresztirányú sebességéből, szintkülönbségből és az adott rakéta energiamodelljéből számolódik. A becslés a végfázisra tartalék sebességet hagy, és a profil névleges felső határánál nem lehet nagyobb. Ez konzervatív indítási becslés, nem garantált találat: a cél későbbi manővere megváltoztathatja a helyzetet. A KEDVEZŐ és HATÁRESET jelzés a becsült tartalékot különbözteti meg; túl közeli, túl távoli, túl nagy szögű vagy tereppel takart rakétaindítás nem fogyaszt lőszert. A fegyver tényleges indítási ellenőrzése és a kijelző ugyanazt a számítást használja.

A gépágyúk külön lövedéksebességet, tömeget, légellenállást és Gauss-eloszlású szórást kapnak. A távolsággal arányosan nő a szóráskör; hosszan tüzelve, sérülten és nagy G-n romlik a stabilitás. A lövedék valóban eltérő pályán repül, nem egy utólag kisorsolt találati százalék dönt. A sérülés a becsapódás relatív mozgási energiájával csökken. A SZÓRÁSKÖR R≈ adat a modell 80%-os sugarának becslése, nem a teljes találati valószínűség. Az előretartási kör numerikusan figyelembe veszi a két gép sebességét, a gravitációt és a lövedék lassulását; a hatásos tartományon túl nem jelenik meg félrevezető célzójel. Távolra is lehet tüzelni, de a kijelző nem mondja rá, hogy tűzkész. Az ellenség ugyanazokat a dinamikai profilokat használja; a földi és bombázó önvédelmi fegyverek általános játékbeli profilok.

A bombák és a CCIP is ugyanazzal a légellenállásos ballisztikával működnek. A kijelző külön jelzi a becsült becsapódási pont eltérését. Az alap, szárnyakkal jelölt repülési irányjelző változatlanul a saját sebességvektort mutatja; ez nem a fegyver célzójele.

Elsődleges támpontok: [USAF AIM-9M](https://www.acc.af.mil/Portals/92/Docs/Fact%20Sheets%20-%202020%20Update/AIM-9M_Formatted.pdf?ver=2020-06-23-093759-823), [USAF AIM-120](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104576/aim-120-amraam/), [USAF Maverick](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104577/agm-65-maverick/), [MBDA MICA](https://www.mbda-systems.com/products/air-dominance/mica-family/mica), [Rosoboronexport RVV-SD](https://roe.ru/pdfs/pdf_4710.pdf), [USAF tesztközpont: GAU-8 és szóráskúp](https://www.aftc.af.mil/News/On-This-Day-in-Test-History/Article-Display-Test-History/Article/2482833/february-26-1974-live-firing-tests-of-a-30mm-gau-8-cannon-mounted-in-a-10/). A hivatkozások nem igazolják a szimulátor összes numerikus profilértékét.

## Üzemanyag és hajtóműfogyasztás

A jelző közvetlenül a fizikai állapot kilogrammban tárolt üzemanyagát használja. A fő számlap KG × 1000 egységű: a 3,20 érték 3200 kilogrammot jelent. A mutató és a jobb oldali százalékos kijelzés most azonos kerekítést használ. A műszer fölé vitt egér megmutatja a pillanatnyi kg/perc fogyasztást és az ezen a beállításon becsült hátralévő időt.

A korábbi közös 0,65 kg/s alap helyett minden géptípus saját közelítő hajtóműcsalád-együtthatókat kapott a `src/fuel.js` fájlban. A fogyasztás a tényleges hajtóműigénytől, az utánégetőtől, a magasságtól, a Mach-számtól és a működő hajtóművektől függ. Alapjárati fogyasztás is van. A névleges tolóerő már az összes hajtómű összege, ezért a hajtóművek számával nem szorozzuk meg még egyszer. Az együtthatók játékbeli becslések, nem gyártói fogyasztási térképek. A nagyobb tömeg, függesztmény és manőverterhelés a szükséges felhajtóerőn és légellenálláson át igényel több tolóerőt; nincs külön, másodszor felszámolt tömegszorzó.

F-16 földközeli próbán a modell teljes száraz tolóerőn kb. 1,8 kg/s, teljes utánégetőn kb. 7,4 kg/s fogyasztást ad, míg a régi értékek kb. 0,65 és 3,35 kg/s voltak. Ez a próba nem szolgálatban mért valós adat; repülés közben a körülmények módosítják. Nincs automatikus újratöltés: nullán leáll a tolóerő, az utánégető kikapcsol és a gép tovább siklik/zuhan. A BINGO és kritikus jelzés 25%, illetve 10% alatt működik. Szünetben az idő és a fogyasztás is áll.


## Látható fékszárnyak és elterelők

A repülés kiengedett fékszárnnyal indul. Az X minden választható gépen kézzel kapcsolja, és a kapcsolás üzenetet ad. A bal felső konfigurációs sor a súgótól függetlenül látható: FUTÓ KINN/BENN és X FÉKSZÁRNY KINN/BENN/NYÍLIK/BEHÚZÁS, mozgás közben százalékkal. A kapcsoló kattintható is. A teljes út kb. 1,7 másodperc; a felhajtóerő és ellenállás a tényleges állásból számolódik. A hidraulikahiba részlegesen nyitott helyzetben is megállíthatja. Leszálláskor a lista csak a ténylegesen kiengedett fékszárnyat jelöli késznek.

V külső nézetben a szárnyak hátsó vezérlőfelületei 0–30° között elmozdulnak, kiengedve világosabb színt kapnak. A deformáció és a felület elhelyezése típusonként a meglévő szárnyrajzból származik; ez közös fékszárny/flaperon közelítés, nem az egyes gépek automatikus vezérlési törvényeinek vagy teljes mechanikájának másolata. A hangár előnézete behúzott állást mutat.

- C: vegyes önvédelmi csomag, két infracsapda (flare) és egy dipólköteg (chaff).
- 5: csak infracsapdák; 6: csak dipólköteg.
- Két kioldás között 0,7 másodperc telik el. A készlet véges, nem töltődik újra repülés közben. A bal felső IR/R szám a megmaradt infracsapda/dipólköteg készlet; a C gomb kattintható is.

Az önvédelmi készletek a játékhoz választott általános terhelések: könnyebb klasszikus gépek 32/32, nehezebbek 48/48, modern csoportok 60/60 egységet kapnak. Ez nem ellenőrzött történelmi felszereltséglista az összes megnevezett változathoz. Földön vagy végzetes gépsérülés után nem lehet kioldani.

Az infracsapda az IR/képalkotó keresőfej számára fényes, majd kihűlő célpont. A dipólköteg radart visszaverő, lassuló és szétszóródó felhő. Mindkettő örökli a gép mozgásának egy részét, majd légellenállással lassul és süllyed. Az IR-t nem zavarja a hideg dipólköteg; a radaros rakétát nem téríti el az infracsapda. A lézeres célmegjelölést ezekkel nem szakítjuk meg. Az aktív radaros rakéták önálló végfázisában vizsgáljuk a chaff hatását.

A rakéta csak közeli, a kereső látómezejében és a valódi célhoz szögben közel eső csalit vehet át. A siker a jelaránytól, az eltelt megfigyelési időtől és a kereső típusonként hangolt megtéveszthetőségétől függ. Az utánégető erősebb IR-célt tart fenn, a modern kereső jobban szűr, a radar Doppler-különbsége pedig segít elválasztani a gépet a lassuló felhőtől. Az esély számítása időben integrált kitettséget használ, csalinként egyszer választott küszöbbel; nem minden képkockában új dobás dönt, ezért a frissítési frekvencia nem ad mesterséges előnyt.

Siker esetén ugyanaz a rakéta valóban a mozgó csali felé kormányoz. A csali kihunyása után nem ugrik vissza automatikusan a gépre: a rakéta elveszti a követést, és tovább repül a megmaradt mozgásával. A valódi repülőgéppel való ütközést továbbra is ellenőrizzük. A csalinál működésbe lépő közelségi gyújtó 35 m-en belül repeszkárt is okozhat, ezért egy nagyon késői kioldás nem jelent sérthetetlenséget. A túl korán kilőtt csali elfogyhat, mire a rakéta közel ér. A gépágyúlövedék és a légvédelmi robbanógránát nem térül el. Az ellenség saját automatikus elterelőhasználata nem része ennek a frissítésnek.

Ezek saját játékbeli érzékelő- és valószínűségi modellek, nem valós rakéták hitelesített védelmi esélyei. Alapelvek: [USAF: chaff és flares](https://www.af.mil/News/Photos/igphoto/2003494197/), [Eglin: IR-csalik vizsgálata](https://www.eglin.af.mil/News/Article-Display/Article/393054/aircraft-countermeasures-put-to-test/). A hivatkozások az eljárások jellegét támasztják alá, nem a játék számszerű készleteit és esélyeit.


## Leszállás gyakorlóküldetés

A Leszállás kártya mind a 25 géppel választható. Indításkor már repülünk: a déli pályaküszöb előtt 6000 m-rel (világkoordináta z = −7600), 316,4 m tengerszint feletti magasságon, 000° irányon, vízszintes szárnyakkal. A kezdő mozgás 3°-os süllyedés; a sebesség a könnyű gép leszállási célsebessége +25 km/h IAS. A bólintást és a gázt a tömeghez és a levegőhöz közelítő egyensúlyi értékre állítjuk. Nincs kezdeti forduló, felszállás, ellenség vagy célmegsemmisítés.

A tartály 15%-os; minden fegyverkategória lőszere nulla, a függesztmények hiányoznak a sematikus ábráról, a gyakorlórepülés fegyverhasználatot sem enged. A futómű és a fékszárny behúzva kezd, ezeket a játékos G/X-szel készíti elő. A kevés üzemanyag miatt a szokásos BINGO jelzés megjelenhet.

A leszállási mód kezdetben kifejezetten KI állapotú, az automatikus megközelítésfelismerés itt nem indítja el. A fázis neve LESZÁLLÁSI GYAKORLAT; a jobb oldali gyorssegéd első lépése N. N-nel a játékos kapcsolja be az ismert leszállási műszereket, és ugyanígy ki is kapcsolhatja. A biztonságos földetérés után KIFUTÁS következik; a sikerhez 5 m/s alá kell lassítani. Segéd nélkül is lehet teljesíteni: a fizikai földetérés feltételeit nem az N gomb szabja meg. Hibás földetéréskor a szokásos becsapódási sorozat és a hiba oka látszik; az újraindítás ugyanebbe a légi helyzetbe tesz vissza.

A pálya két végének meghosszabbításában 120 m-es fél szélességű, 600 m-ig simán visszaolvadó megközelítési völgyet alakítottunk ki. Ez megszünteti azt a generálási hibát, amely a javasolt 3°-os siklópályába dombokat helyezett. A folyosó a bázis helyi, minden küldetésben használt terepéhez tartozik; a távolabbi és oldalirányú terep megmaradt.


## Jelzavaróállomás, új terep és földi modellek

A Top-gun reptértámadó küldetésben a reptér mellett, külön célként antennás zavarókocsi működik, 7 km sugarú térbeli hatókörrel. A körön kívül minden észlelt ellenség szabadon kiválasztható, a zavaró működésétől függetlenül.

A körön belül minden radarkontakt eltűnik; a minimap fekete-fehér zajt mutat. Megszűnik a befogás, a cél- és BASE-nyíl, az irányszalag, a sebességvektor, a CCIP és a leszállási navigáció. A sebesség, magasság, bólintás, üzemanyag és sérülés műszerei tovább működnek. Az objektumok a terepen láthatók és tovább támadnak. Belül kézzel célzott ágyú vagy bomba használható; kívülről megfelelő földi rakéta is indítható. A zavaró megsemmisítése helyreállítja a navigációt, de önmagában nem kötelező küldetéscél. A radaros rakéták hordozói támogatását a zavarás megszakítja; az önálló optikai/infravörös rakéta repülését nem törli.

Ez egy tudatosan összevont radar/GNSS játékszabály, nem egy valódi berendezés hiteles hatásmodellje. A valóságban a zavarás hatása az érzékelőtől, frekvenciától, jelerősségtől és tartalék navigációtól függ. Háttér: [FAA GNSS interference](https://www.faa.gov/about/office_org/headquarters_offices/avs/offices/afx/afs/afs400/afs410/GNSS), [NATO elektronikai hadviselés](https://www.nato.int/cps/uk/natohq/topics_80906.htm?selectedLocale=en).

Minden új küldetésindítás új terepváltozatot választ. A folyó esélye 55%, szélessége 70–300 m; az úté 65%, a kanyoné 35%, a külön magas hegycsúcsé 55%. Az irányok, hajlatok, szélességek és csúcsmagasságok is változnak. A Híd mindig folyó és keresztező út fölé kerül, tartóoszlopos híddal és felvezető szakaszokkal. A Konvojhoz mindig tartozik út: öt külön teherautó 50 km/h körül követi annak hajlatait, a küldetéshez tartozó útvonalon. A Bunker és a Légvédelmi üteg mindig legalább 850 m magas fennsíkra kerül. A saját bázis két leszállófolyosója minden változatban szabad marad. A minimap a folyót és az utat is kirajzolja, amikor nincs zavarás; a terepkontúr gyorsítótára új pályán érvénytelenül.

A földi célok közös térbeli modelljeit használja a játék és a forgó küldetés-előnézet: lapos, túlnyúló tetős bunker; ponyvás, kerekes konvoj; teherautó és mellette függőleges rakéta; talpas, többcsövű légvédelmi üteg; hangárok, pálya és irányítótorony; antennás zavarókocsi. Minden küldetés a benne szereplő ellenséges egységek előnézetét mutatja. Az ütközési térfogatok a modellek helyét és irányát követik, a konvojnál teherautónként.

Az új név Operation Falcon: Redline; a repülés közbeni fázissúgó neve Mission Control. A korábbi helyi rekordok és súgóbeállítások tárolási kulcsai megmaradtak.


### Út és figyelmeztető hang finomítása

Az út sötét burkolatot, kétoldali padkát, fehér szegélyt és közelről látható, térbeli méretű szaggatott középvonalat kapott. A sűrűbb terepmintavétel csökkenti a levegőben áthúzott szakaszokat; a dombok mögötti útrészeket és folyószakaszokat tereptakarás rejti el. Távolodva a burkolat elhalványul, a fényes szegélyvonalak megszűnnek. Új generáláskor a magas csúcsokat sima kerülő ívek veszik körül; a konvoj ugyanazt az útvonalat követi. A minimapon elkülönülő útjel és ÚT/FOLYÓ jelmagyarázat látszik.

Sérült gépnél a korábbi félmásodperces, szögletes hang helyett 620 Hz-es halk szinuszhang szól: három 0,12 másodperces csipogás, 0,28 másodperces indítási közökkel, tíz másodpercenként. A sérülési figyelmeztetés szövegváltásai nem indítják újra a sorozatot. Szünet közben a sorozat ideje áll; új repülésnél újraindul, becsapódás után elhallgat. Az egészséges gép közvetlen átesés-/talajveszélye és a közeledő rakéta gyakoribb, de szintén lágyabb jelzést ad; ezek elsőbbséget élveznek a radarhanggal szemben.


### Indítási engedély és lőtáv

A cél befogása és a lőtáv önmagában nem indítási engedély. A trigger és a célkijelző ugyanazt a `firingStatus` döntést használja: fegyver megléte, lőszer, sérülés, zavarás, befogás, célfajta, indítási szög, tereptakarás, dinamikus lőtáv és újraindítási várakozás. Tiltás esetén a kijelző kiírja a konkrét okot. A becsült lőtáv sora csak engedélyezett indításnál javasolja a Szóközt; rossz szögnél az orr célra fordítását, tereptakarásnál emelkedést vagy kerülést kér. A Mission Control a tiltást és az előkészítési várakozást is figyelembe veszi.

A 7 km-es zavarási körön belül a jelenlegi játékszabály szerint nincs új irányított rakétaindítás; a gépágyú és a kézzel vetett bomba továbbra is használható. A körön kívül indított Maverick önálló optikai rávezetése működik akkor is, ha a játékos utána belép a körbe és elveszti a befogást. Ezt tényleges rakétarepüléssel és találattal ellenőrzött regressziós teszt fedi.


### Folyó folytonossága és partillesztése

A folyó többé nem szakad meg a saját bázis 4,5 km-es körénél: a meder és a minimap ugyanazt a bázist elkerülő kanyart követi. A repülőtéri cél sík területét is kikerüli, így a generált fennsík nem takarja le gátszerűen a vízfelületet. A Híd küldetés hídja továbbra is a folyón át vezet.

A szomszédos vízszakaszok ugyanazokat a partpontokat használják, és a part a vízszint magasságához illeszkedik. A kamera közelében a sokszögek vágást kapnak teljes szakaszok eldobása helyett; ez az út felületére is érvényes. A folyó rajztávja nagyobb lett, finom távoli elhalványulással, a víz kitöltése és a nedves partsáv pedig elkülönül. A tereptakarás megmaradt. Új regressziós tesztek fedik a szakaszcsatlakozást, a part magasságát, a korábbi báziskivágást, a generált pályák folytonos medrét és a kamera közeli vágását.

## Szimulációs javítások és fegyverlexikon

Az azonos típusú, repülőgépről indított rakéták a hordozó sebességét és ugyanazt a 35 m/s indítási sebességet kapják, saját, ellenséges és baráti oldalon is. A földi SAM 260 m/s induló gyorsítófokozata külön profiladat; a lőtávbecslés is ezzel számol. Az elfogási idő az egyenlet lineárissá válását is kezeli, numerikusan stabil gyökökkel; elérhetetlen célra nem hoz létre hamis légvédelmi lövést.

A C-130, Il-76, B-52, Tu-95 és a civil utasszállító külön fizikai adatsort használ sérülés után: tömeg, üzemanyag, szárnyfelület, hajtóműszám, tolóerő és terhelési határ. Nincs F-15 helyettesítés. A légcsavaros típusok továbbra is egyenértékű tolóerőt használnak az egyszerűsített erőmodellben; az aerodinamikai együtthatók játékmeneti közelítések. Viszonyítási források: [USAF C-130](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/1555054/c-130-hercules/), [USAF B-52](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104465/b-52h-stratofortress/), [UAC Tu-95MS](https://www.uacrussia.ru/ru/aircraft/lineup/military/tu-95ms/), [Volga-Dnepr Il-76](https://volga-dnepr.com/fleet/IL-76/ts/). Ezek nem hitelesített repülési táblázatok.

Az Egységtár fegyverszűrője az összes felszerelhető gépágyút, légiharc- és földi rakétát, bombát, valamint az infracsapdát és dipólköteget mutatja. A fegyverváltozatok közös dinamikai profilon belül együtt szerepelnek. Minden adatlapon külön szerepel a használható cél, az ajánlott helyzet, a tiltás, a kezelés, az elterelés és a hordozógépek; a lőtávok közvetlenül a játék profiljaiból jönnek. A 3D fegyverábrák sematikus felismerési modellek.

## Aktuális küldetés repülési naplója

A napló automatikusan indul és minden új küldetésnél / újraindításnál nullázódik. Nincs előzménylista. A szünetmenüben és a repülési jelentésben a **Repülési napló** nyitja meg a `/flight-log.html` elemzőt; a hangárból is elérhető. A **Napló letöltése** teljes JSON-fájlt ad, amely később visszaelemzéshez megosztható. A napló a böngészőben, helyben tárolódik; nem küldjük szerverre.

- Saját gép: 10 Hz mintavétel, pozíció, sebességvektor, IAS/TAS, Mach, MSL/AGL, V/S, kvaternió és szögek, állásszög, G, tömeg, üzemanyag és fogyasztás, felhajtóerő/ellenállás/tolóerő, vezérlés, gépkonfiguráció, fegyverzet, részletes sérülés és leszállási műszerek.
- Világ: 2 Hz, minden ellenséges, baráti és semleges egység helyzete, mozgása, állapota, AI-célja, befogása, lőszerkészlete és saját fizikai állapota; lövedékek és elterelők mozgása.
- Események: a 120 Hz-es ciklusban észlelt fázisváltás, célbefogás, kezelői gomb, konfigurációváltás, figyelmeztetés, találat, indítás, egységvesztés, szünet és eredmény. A folyamatos számértékek mintavételezettek, nem minden fizikai lépés külön teljes állapotmentés.
- Földetérés: külön, a sebesség nullázása előtti teljes kontaktpillanat, pontos hibák és alkalmazott határok. A zuhanás a becsapódásig és a jelentésig követhető.

A tárhelyre kétmásodpercenként, valamint szünetben és a küldetés végén kerül új adatcsomag. Új küldetés törli a korábbi helyi csomagokat; a régi böngészőlap későbbi írása sem írhatja vissza őket. Rendellenes böngészőleálláskor az utolsó, még nem mentett csomag elveszhet. Ha a böngésző tiltja a tárolást, a szünetmenü jelzi; az aktuális lap memóriájából a JSON továbbra is letölthető.

A visszanéző sebesség- és magassággörbét, időcsúszkát, fázisonkénti időt, eseményszűrőt és nyers állapotadatokat mutat. Ez diagnosztikai napló, nem teljes vizuális visszajátszás. A kimenet őrzi az induló terepet, fizikai és fegyverprofilokat, valamint a sérülési és AI-véletlenmagokat.

A gyakorló és harci küldetések ugyanazt a leszállási fizikát használják. A gyakorlat alacsony üzemanyaggal, fegyverzet nélkül és beállított megközelítéssel indul; harci visszatéréskor a nagyobb tömeg és sérülés emelheti a szükséges sebességet. A földetérés IAS-határa ezért legalább 396 km/h, de követi a segéd által kiszámított felső sebességhatárt, ha az magasabb. A 3 m/s alatti süllyedés, futómű, pályán belüli helyzet és megfelelő géphelyzet követelménye megmaradt.

## Pilótakézikönyv a wikiben

Az Egységtár 13 részletes, géptípustól független pilótafejezetet tartalmaz: műszerek és alapkezelés, felszállás, elfogás, civil elfogás, célzás és indítási engedély, légiharc, földi objektum támadása, földi egység támadása, hazatérés, landolás, átstartolás, sérülés és jelzavarás. Minden fejezet sorrendbe rendezett kezelési lépéseket, figyelendő kijelzőket és gyakori hibákat ad. A légiharc külön kitér az elhaladó ellenfél utáni visszafordulásra; a földi egységek fejezete a mozgó konvoj célzására; a hazatérés a pályatengelyre állásra.

Öt külön baráti adatlap ismerteti a saját repteret, vadászgépet, bunkert, rakétarendszert és védendő szállítót, a szerepükkel, korlátaikkal és a küldetéseikben kiosztott számukkal. Az adatlapok egymásra és a felszerelhető fegyverekre hivatkoznak. Közvetlen link például `/encyclopedia.html#guide-landing` vagy `/encyclopedia.html#friendly-transport`; a címben szereplő fejezet újratöltés után is megmarad. A hangár Egységtár hivatkozása és a H súgó is elvezet a kézikönyvhöz. A korábbi `/tutorial.html` folyamatos, nyomtatható útmutató megmaradt.

## Egérrel körbenézés és leszállási segédív

Belső nézetben az egér relatív mozgása a pilóta kameráját fordítja. A játékbeli komfortkorlát oldalra ±100°, felfelé 65°, lefelé 45°; ezek nem orvosi mozgástartomány-adatok. A mozgás simított és szögsebesség-korlátos. 0,18 s egércsend után a nézet simán előre tér vissza. A repülő tájolása, a radar látókúpja és a fegyverek iránya változatlan. A HUD a gép orrához kötve mozdul ki a látótérből; oldalra nézve nincs hamis, előre tüzelő középső célkereszt. Külső nézetben, zuhanásnál, szünetben és a felületi gombok/műszerpanelek kezelésekor nincs aktív fejforgatás.

Leszállási módban az **I** vagy az **I SEGÉDÍV** gomb kapcsolja a kékes-lila útvonalat. A térkép és a terep ugyanazt a pontsort rajzolja, irányjelöléssel és a végső egyenes kapuival. A kapcsoló megmarad a következő repülésre. Az útvonal nem irányítja a gépet; a pilóta a sebességet, süllyedést és géphelyzetet továbbra is a műszerek alapján állítja. Jelzavarásban az ív sem látszik.

A ráfordulás Dubins-pályákból választ, érintőleges állandó sugarú fordulókkal és egyenesekkel. A sugár a vízszintes sebességből, közel 30°-os bedöntéshez készül, 700–12000 m játékmeneti határokkal. A tervet a játék nem számolja újra minden képkockában: jelentős, 2 km feletti letérés után vagy a segéd újrakapcsolásakor újratervez. A kész egyenes a pálya választott küszöbéhez vezet, körülbelül 3° siklópályán; a távolabbi szakaszok a terep fölé emelhetők. A világ és a minimap közös útvonalat használ, nem két külön becslést.

A repülési napló mintáiban a fej két szöge és a segédív kapcsolóállása is szerepel.


### Fegyverzettervezés és küldetésértékelés

A hangárban minden modellezett függesztési hely külön állítható; az üres hely is választható. A beépített ágyúnál a lőszer felvétele kapcsolható. Csak a meglévő, név szerint meghatározott gépváltozat fegyverei érhetők el: nincs általános NATO/orosz/kínai fegyvercsere. A külső földi fegyverhelyek ugyanazon változat légiharc-fegyverére is átállíthatók, a dedikált légiharc- és belső helyek konzervatívan megtartják a saját kategóriájukat. Nincs többes függesztő vagy még nem modellezett fegyverintegráció. A helyek száma és a felület kifejezetten játékbeli engedélyezett terhelése korlátoz: az utóbbi géptípusonként megadott, kerekített játékérték, a belső fegyvertereknél konzervatív korláttal. A modellezett állomások száma hamarabb is elfogyhat, mint a teljes fegyverterhelési keret. A valós gépek összes függesztőjét, többes tartóját és integrált fegyverét nem modellezzük. A kiválasztás a lőszermennyiséget, a fegyverek tömegét, a kezdő fegyvert és a fedélzeti fegyverrajzot is módosítja. A leszállási gyakorlat továbbra is fegyvertelen.

A 3 m/s süllyedés leszállási minőségi cél, nem azonnali megsemmisülési határ. Futóval 3–8 m/s között a függőleges ütközési energia többletével (a süllyedési sebesség négyzetével) nő a törzs/hidraulika sérülése. 8 m/s-tól, futó nélküli legalább 5 m/s-os érkezésnél, nagy szárny-/orrleérésnél, oldalirányú vagy pályán kívüli ütközésnél továbbra is végzetes lehet az érkezés. A korábbi sérülések miatt a kemény földetérés is összeroppanthatja a szerkezetet. A kifutó fölötti szintbe vételnél a segéd nem kéri többé a küszöbre számolt 3°-os siklópálya követését.

A jelentés és a naplónézet ugyanazzal a szabályalapú elemzővel értékeli az aktuális naplót. Fázisonként megjelenik a végrehajtás állapota, a tartós eltérések mért időtartama, a találatok, a tüzelési akadályok, a földetérési adatok és a rögzített küldetésvégi ok. A biztonsági eltérések hiánya nem jelent automatikusan harcászati sikert. Nincs külső szolgáltatás, mesterséges pontszám vagy előzménytár.

A terhelési adatok támpontjai: [Dassault Rafale](https://www.dassault-aviation.com/en/defense/rafale/specifications-and-performance-data/), [USAF A-10](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104490/a-10c-thunderbolt-ii/), [Saab Gripen C](https://www.saab.com/products/gripen-c-series). A játékadatok kerekítettek, nem tanúsított függesztési táblázatok.


### Induló üzemanyag és tömeg

A hangár üzemanyagcsúszkája 0–100% között állítható, és a kiválasztott gép tartálykapacitása alapján kilogrammban is kijelzi a tankolást. A kiválasztás gépenként megmarad a hangárban töltött munkameneten belül; a leszállási gyakorlás külön, alapból 15%-os beállítást kap. Minden indulási mód a kiválasztott üzemanyagot használja, az induló légsebességhez szükséges állásszög számítását megelőzően.

A hangár tömegbontása és a fizika ugyanazt a `massBreakdown` függvényt használja: üres gép + aktuális üzemanyag + rakéták + bombák + gépágyúlőszer. Az üres fegyverhely nem ad fegyvertömeget; a beépített ágyú és az alapvető szerelvények az üres gép tömegében maradnak. A gépágyúprofil lövedéktömegéből 2,2-es szorzó becsüli a teljes lőszert (lövedék, hüvely, hajítótöltet); ez egyszerűsítés, nem típusonkénti hüvelyvisszatartás-szimuláció. Az elfogyasztott üzemanyag, kilőtt lőszer és kioldott fegyver a repülés közben is csökkenti a tömeget. A napló `metadata.departure` mezője megőrzi az induló tankolást és tömegbontást.


### Repülési oldalpanelek

A bal oldali gépállapot-panel fogja össze az üzemanyagot, a pillanatnyi repülésből becsült hátralévő hatótávot, a futóművet, fékszárnyat, légféket, kerékféket, gázt/utánégetőt és a terheléskorlátozást. A leszállási helyzetrajz és a megközelítési ellenőrzések is itt jelennek meg. A fegyverzet/sérülésrajz lenyitható; leszálláskor automatikusan összecsukódik, hogy a műszerek kapjanak helyet.

A jobb oldali, 240×300-as radar azonos méter/pixel skálát használ a két tengelyen, így a nyújtott nézet nem torzítja a terepet vagy az irányokat. Alatta a küldetés neve, szimulációs ideje, fázisa és elsődleges/opcionális céljainak állapota látható. A nem gyakorló küldetés 40% sérülésnél vagy a levegőben kifogyó üzemanyagnál megszakad: a már teljesített célok megmaradnak, minden hátralévő eredeti cél elbukik, és új Hazatérés feladat kerül előre. A sikeres leszállás ekkor külön hazatérési jelentéssel zárul, nem harcászati győzelemmel vagy rekordponttal. A Mission Control továbbra is bezárható.

A hatótáv `üzemanyag / pillanatnyi fogyasztás × vízszintes sebesség`: tartalék és siklótáv nélkül, nem optimális elméleti maximális hatótáv. Álló gépnél vagy értékelhető fogyasztási adat nélkül nincs kitalált hatótáv; üres tanknál a hajtóműves hatótáv nulla.


A szintjelző körében nagy százalékérték és kisebb becsült hatótáv jelenik meg; a kitöltés inline dash-offsetet kap, hogy ne írja felül a korábbi stílus. A kapcsolók állapota semleges/sárga/piros, és képernyőolvasó számára szövegesen is jelzett. A veszélyjelzés az aktuális helyzethez igazodik (például leszállásnál hiányzó futó/fékszárny, nyitott légfék kis sebességnél, aktív utánégető). N/P/H gombkártya nincs a játéktéren; a billentyűk működnek. A céljegyzékben a kör a hátralévő, a zöld pipa az elvégzett, a piros X az elbukott célt jelöli, ismétlődő kísérőszöveg nélkül.


## Story #1 and intermediate servicing

The hangar groups landing/civil practice separately from six numbered story missions. City defense has 25 individually destructible buildings, a 20-building survival threshold, two runway-departing allies, and 4+3 enemy waves. Wave two activates when wave one has been defeated or at 240 seconds. Bombs already in flight must resolve before victory. Transport escort starts at z=-22 km (player -23 km).

The intercontinental missile mission launches at 300 simulation seconds if its silo survives. The missile is a separate air entity with swept relative-motion interception, a compressed 3-second powered arc and gravity-only coast. Launch speed is 3300 m/s; the shortened path and boost duration are gameplay approximations for this map, not a certified missile model. Air-to-air launch eligibility is limited to a very close, rapidly closing encounter. Destroying the silo after launch does not remove the missile. General flight phase reference: https://www.mda.mil/system/elements.html

A safe intermediate stop replaces the player aircraft with full configured stores, fuel and countermeasures, and clears damage while preserving mission time, objectives, opponents and in-flight weapons. A real mandatory-objective failure cannot be reversed. Completing primary goals still requires the final landing; landing practice finishes normally. The flight log records service counts, wave activation, silo launch and missile state.


## City rendering and shared combat limits

City buildings use near/medium/far meshes based on distance and projected height: facade lines below 1.8 km, solid blocks/roofs at medium range, and a single opaque box beyond 6 km or at subpixel detail sizes. Collision always uses the detailed physical bounds. Shared mesh vertices, cached static ground instances, world bounding rejection, per-frame vertical visibility reuse, and a screen-space face index reduce work without allowing terrain/model transparency. `tests/city-performance.html` measures a repeatable near/far city battle; renderer timings are CPU measurements, not a guaranteed FPS.

`guidedLaunchStatus` is shared by player and AI. Radar range/cone, weapon minimum and nominal/dynamic maximum range, angle, terrain and seeker/support constraints apply to both teams. AI cannon range uses the same altitude correction as the player's gun, without the previous extra multiplier. AI launchers retain their real aircraft/ground radar profile throughout missile support, and opposing jammers affect both sides. Ground radar, missile, cannon and flak ranges in the encyclopedia come from the same definitions used in combat. Different weapons and aircraft can still have different ranges.

Cockpit configuration labels are short, borderless text without printed key names. Green/yellow/red state colors remain; shortcuts stay in accessible labels and tooltips.

### Kanyongyakorlat

A gyakorlás sorrendje: 1. Leszállás, 2. A kanyon, 3. Civil gép elfogása. A kanyon fegyvertelen légi indulást, alapból 50% üzemanyagot, öt alacsony (40–350 m AGL), majd három gerinc-/kijárati kaput kapott. A kapuk sorrendben, előre irányuló, térben interpolált áthaladással teljesülnek; kihagyott kapu újra megközelíthető. A záró gerinc 1450 m magas, a kijárat a túloldalon van; sikerhez nem szükséges leszállás. A kapuk, fázisok és állapotok az aktuális repülési naplóban követhetők. A türkiz segédkapuk nem ellenséges célpontok.

### Interkontinentális rakétasiló és rakéta az egységtárban

Az interkontinentális rakétasiló és az önálló interkontinentális rakéta külön, forgó modelles adatlapot és részletes játékleírást kapott. A küldetéscím, célnevek, riasztások és fenyegetésikonok az új nevet használják. A régi belső azonosítók megmaradtak a naplók és hivatkozások kompatibilitásához. Az ICBM a ballisztikus rakéták hatótáv szerinti alkategóriája; a wiki külön jelzi a rövidített játékmodell eltéréseit. Az általános bombaballisztika elnevezése változatlan. Forrás a valós osztályozáshoz: https://www.gao.gov/assets/a278947.html

### Pályaszéli tűrés kifutás közben

Sikeres, pályán történt földetérés után, kiengedett futóművel, a kifutó mindkét oldalán 25 méter türelmi sáv használható. A gép itt azonnali becsapódás helyett tovább gurul, kissé nagyobb gördülési ellenállással; Ctrl-lal fékezhető és visszakormányozható. Ez nem engedélyez pályán kívüli földetérést vagy a pályavégen túli nagy sebességű kifutást. A három hazai hangár közös megjelenítési/ütközési dobozokat használ, így a valódi akadálynak gurulás továbbra is becsapódást okoz.

### Több baráti pilóta rádióhívójele

A baráti vadászok stabil, gépenkénti hívójele Falcon Two, Falcon Three, Falcon Four stb. A készenléti, támadás alatti és zuhanási jelzés külön géphez és külön ismétlési korláthoz kötött. Egy gép elvesztése csak a saját elavult üzeneteit törli. A bemondott hívójel és a bal oldali felirat azonos; a további számokat helyben előállított angol beszédrészletekből állítja össze a játék. A játékos Falcon One marad.
