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

### Egyedi hajtóműsérülés és szárnyhoz tartozó alkatrészek

A motorok külön integritást kapnak: a találat a ténylegesen eltalált hajtóművet károsítja. A rendelkezésre álló tolóerő az egyes motorok teljesítményének összege; egy egészséges ikerhajtóműves gépnél egy teljes kiesés felezi, a B–52-nél nyolcadával csökkenti a teljes tolóerőt. Az aszimmetrikus nyomaték a motor oldalából és a törzstől mért távolságából adódik. A sérült AI oldalkormánnyal is ellenkormányoz. Az összesített sérülés mellett a gépállapot-rajz és a napló hajtóművenkénti állapotot is őriz; a kiesés kis összsérülés mellett is figyelmeztetést ad.

A szárnyra szerelt gondola, légcsavar, fegyvertartó és szárnyvégi sín a saját szárnyával deformálódik és tűnik el. A törzsre szerelt motor megmarad. A CPU- és WebGL2-rajzoló, valamint a találatvizsgálat ugyanazt a leválási állapotot követi. A tönkrement motor füstje a motor helyéről indul. Kritikus károsodásnál erősebb a fizikai billegés és a pilótanézet szögirányú remegése; a csökkentett mozgás beállítás a kameraremegést kikapcsolja.

Összehasonlító képi próba: `/tests/engine-damage-preview.html` (B–52, Tu–95, A–10; WebGL2/CPU váltás). Ezek továbbra is játékmeneti közelítések, nem hitelesített sérüléstűrési adatok.

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

### Légifölény · Top-gun

A 7. Story #1 küldetés saját oldalon 3×4, az ellenségnél 4×4 géppel indul a levegőből. A játékos a saját 12 gép egyike, véletlen rajban. Minden raj három vadász és egy bombázó; a csapásmérő/közvetlen támogató játékosgép a bombázóhelyet tölti be. A saját raj Falcon (a játékos mindig One), a két másik Ironfist és Viper, külön One–Four számozással. A bombázó rajtagok is rádióznak. Mindkét oldalnak egy reptere és egy külön védő rakétarendszere van. Kötelező a 16 ellenséges repülő és az ellenséges reptér megsemmisítése, a saját bázis megóvása és a hazatérés/leszállás; opcionális az ellenséges SAM kiiktatása. A rajok 30 km-nél nagyobb kezdeti ellenségtávolságot kapnak, a szokásos radar- és fegyverhatótávokkal. A saját oldali AI-találatok is teljesítik a célokat.

Indulási rádiófegyelem: a névvel és One–Four számozással rendelkező rajokból csak a One jelent készenlétet, rajonként egyszer. A játékos Falcon One, ezért a saját rajából nem hangzik el külön AI-készenléti jelentés. Az Ironfist One és Viper One jelentkezése időben eltolva szól. A raj nélküli régebbi kísérőgépek közül egy képviselő jelentkezik. A találati, támadás alatti és zuhanási bemondás továbbra is minden gépnél külön működik.

A Légifölény negyedik ellenséges raja Spectre One–Four: három vadász és egy bombázó, már induláskor aktív. A három eredeti ellenséges és a három saját raj kezdőhelye, felszerelése és harci paraméterei változatlanok.


### GPU model rendering and launch auditing

Opaque aircraft, buildings and vehicles now use a WebGL 2 depth buffer for transforms and hidden-edge removal, composited beneath the existing Canvas HUD. The opaque shaded terrain and its vector grid also render with WebGL 2, using cached mission/camera-grid buffers and depth testing instead of per-frame CPU projection and face sorting. Terrain still writes the model depth mask, while target markers remain HUD overlays. The road/river overlay and weapon effects remain on Canvas. Geometry is uploaded once per mesh; obsolete flap/sweep variants are reclaimed. WebGL unavailability or context loss falls back to the CPU renderer. Road shoulders, markings and river banks reuse mission-scoped geometry, invalidated when the terrain changes.

`tests/fleet-performance.html?combat=1` measures a dense, deterministic 27-AI-aircraft battle with live projectiles; `&backend=cpu` compares the fallback renderer. In the local 1280×720 run, mean frame processing was about 26 ms with WebGL 2 and 71 ms with the CPU fallback (both include the terrain-feature cache). These are browser CPU submission timings, not guaranteed end-to-end FPS or GPU timings.

AI missile launches now repeat the shared live launch check immediately before firing, beyond the cached envelope used while acquiring a lock. Their combat events record `distanceM`, `radarRangeM`, `launchRangeM` and `nominalRangeM`. The current western superiority roster uses F-15/AIM-7M versus eastern Su-27/R-73: this gives the western side a loadout advantage, without extra team-dependent range. An F-16 player normally carries the shorter-range AIM-9M. No loadout rebalance is included in this performance change.


Terrain-only comparison: add `&terrain=cpu` to the fleet fixture to retain GPU models but use the prior Canvas terrain. At 1280×720, the local near-combat measurement reported about 6.3 ms of CPU terrain work with Canvas versus 0.16 ms with WebGL 2; these submission timings exclude GPU completion. Terrain heights, collision, slope shading, grid extent and near/far projection stay the same. Context restoration rebuilds the terrain buffers, and unavailable terrain shaders fall back to Canvas independently of the models.


### Distant mountain horizon

`assets/environment/horizon-mountains.png` is a generated transparent-sky panorama; its exact generation prompt is preserved in the adjacent JSON file. A cached WebGL fullscreen sky pass maps the image by world bearing and elevation, including head look, pitch, roll and altitude depression. Mirrored sampling closes the circular panorama without a hard texture join. It replaces the old flat ground-horizon band when ready, sits above the star background and below all terrain/models/HUD, and has no collision or mission role. The scene keeps the previous flat horizon while loading or if WebGL is unavailable. `tests/horizon-preview.html` provides heading, seam, bank and high-altitude views.


### Reticle-first target cycling

T/Tab starts with the selectable radar contact nearest the fixed forward gunsight. Contacts inside a 1.5-degree reticle region are ordered by range; outside that region angular proximity wins. Further presses exhaust that contact's squad by current distance, then other airborne squads (the nearest remaining member determines the next squad), then ground contacts by distance. A complete traversal restarts at the reticle. Destroyed/out-of-radar contacts are skipped and newly available contacts join the live traversal. Pointing the nose more than four degrees away onto a clearly different reticle contact starts a fresh traversal. This follows the aircraft gunsight, not the moving gun-lead pipper or mouse head look; radar range/cone, jamming, civil intercept eligibility, friendly exclusion and acquisition time remain unchanged. A first ground selection remains possible by aiming at that ground target.


### Smoke-heavy battle and wreck-view performance

The reconstructed flight-log cases at 84 and 90 seconds exposed three sources of wasted work: offscreen smoke/effect terrain rays, completely faded road patches still undergoing visibility checks, and a global maximum-height bound that let a distant 2171 m peak force ray marching for unrelated sight lines. View-frustum rejection now precedes world-effect occlusion, zero-alpha feature patches are skipped before visibility work, and each terrain sight ray uses a conservative local peak bound (including the road fitting margin and training-canyon wall bound). No physics tick, hit detection, combat decision or visible smoke budget is reduced.

`tests/log-stutter-performance.html` uses game-only snapshots in `tests/fixtures/stutter-scenes.json`; smoke/explosion details are reconstructed, not exact replay. `&legacy=1` restores the earlier offscreen effect-ray path only, not the old terrain bounds. Historical before/after CPU submission measurements are in `tests/fixtures/stutter-results.json`: approximately 74→7 ms for the cockpit scene and 111→10 ms for external wreck view. These are rendering measurements, not the original session's FPS.

Current mission logs now record a `performance` summary every five wall-clock seconds and flush partial windows on pause/end: actual frame interval/FPS, p95/max interval, long-frame count, CPU/simulation/render/UI times, renderer backends, viewport, nearby ally, aircraft/falling/smoke/projectile/effect counts. The summary has no on-screen UI and resets with the mission. Unit snapshots also retain kind, home/civil status, radius and falling state for better reconstruction.


### Startup radio and missile-following diagnostics

The 26-second superiority log showed 44 FPS initially, then approximately 12 FPS after six allied AIM-7M launches at 6.008 s. The affected windows averaged 62–65 ms of simulation work per displayed frame versus 12 ms of drawing and 2–3 ms of UI/audio work. These timings implicate combat/weapon simulation; the old log has no radio-start events, so temporal coincidence with speech does not establish an audio cause.

Weapon line-of-sight checks now share the conservative local terrain height bound used by rendering, skip samples guaranteed above the landscape and avoid intermediate vector allocation. Their original 6–100 sample spacing and two-metre clearance are unchanged. Autonomous IR missiles no longer calculate unused launcher radar support. An explicit benchmark, `node tests/startup-simulation-bench.mjs <flight-log.json>`, reconstructs the early simulation without graphics/audio; its results are diagnostics, not exact input replay or an FPS guarantee. In one same-process run, 2400 actual launch sight-ray checks fell from 332 ms to 0.71 ms with identical visibility decisions.

Radio assets load through two bounded workers with initial callouts/callsigns prioritized, instead of decoding every WAV simultaneously. Clips and composed callsigns remain cached. Actual audible line starts are now written as `radio` events in the current flight log, so future stalls can be aligned with speech. Asset requests are same-origin `/assets/radio/` requests; no cloud AI, remote speech synthesis or flight-log upload occurs during gameplay. The static development server listens on loopback, and saved logs stay in local IndexedDB or explicit user downloads.


### AI defensive dispensers and damage withdrawal

Both friendly and hostile military aircraft use the same finite flare/chaff supplies and missile seeker/decoy probability model as the player. A targeted approaching missile inside 4.5 km and seven seconds estimated closing time triggers a 0.35-second reaction delay, then IR/imaging threats receive flares and radar-guided threats receive chaff. Dispensers retain their stock through the transition into damaged flight physics; they neither refill nor guarantee survival. Releases are rendered and recorded per aircraft.

At 40% damage, or a disabled weapon system, a controllable AI aircraft stops attacking and attempts to fly to its own airfield, then an outward departure corridor 18 km beyond it. The controller uses the existing damaged flight physics, terrain look-ahead and limited bank, with trim compensation for persistent damage torque. It does not heal, teleport or replenish the aircraft; terminal damage still produces a crash. The protected escort transport retains its designated mission exit route while using dispensers. Civilian aircraft remain on their existing neutral logic.

Only physical arrival at the departure point sets `retired`/`exited`. Withdrawn enemies count as neutralized attackers for defense/superiority objectives without awarding a missile hit or kill, and friendly departures do not trigger a false shot-down radio call. Unit logs retain withdrawal stage/reason/home, dispenser stocks and release events. Missile/gun evasion manoeuvres remain a separate next step.


### Bomber defensive-fire audit

The 341-second superiority log contained 35 allied, 27 hostile and two player missile launches; enemy launches were distributed among multiple allied aircraft. Performance summaries stayed at 58.8–60 FPS. It exposed two separate bomber bugs: the main bombing target also controlled gunfire (so bombers ignored nearby air threats and shot the airfields), and damage-created flight physics had no mission pilot input below the retreat threshold.

Bomber turrets now independently choose an eligible hostile aircraft, including the player, within a limited aft cone and the existing gun ballistic range. The muzzle is located at the tail, and both current and predicted interception directions must be inside its sector; neutral/ground targets are excluded. The Tu-95 uses the modelled GSh-23 profile; B-52 uses a historical armed M61 configuration, not the modern gunless B-52. The 65-degree half-cone and finite ammunition budget are gameplay approximations. References: US Army Worldwide Equipment Guide (Tu-95 armament) and https://www.afgsc.af.mil/News/Article-Display/Article/1188813/the-last-b-52-gunner/ (B-52 gun retirement).

Lightly damaged AI now retains physically controlled mission heading/altitude tracking with the same damaged-force model and trim compensation used by returning aircraft. Severe damage still triggers withdrawal; no repairs, invulnerability or forced trajectory are added. Logs retain independent mission/defensive target IDs, turret type, muzzle position, effective firing range and navigation goal. Eight dedicated tests cover independent air defense, turret sector, projectile damage, simultaneous bomb release, ammunition/failure and continued damaged flight.


### Player bomber tail-gunner station

B-52 (classic armed H configuration) and Tu-95 are now selectable under NATO classic and Soviet aircraft. Each has twelve compatible internal bomb positions, no invented forward cannon or air-to-air missile, and a separately configurable aft ammunition stock (0–1800 rounds). The planner, starting aircraft, weapon consumption, servicing and mass calculation share this quantity. As with other guns, complete-round mass is estimated at projectile mass times 2.2.

V now switches cockpit/tail-gunner station only on these types; normal aircraft no longer have a player-selected external chase view. The automatic crash camera remains. Mouse motion aims the tail gun within its limited sector and retains its aim when stationary; Space fires only the aft gun from its own stock, regardless of the forward selected weapon. V restores the pilot view and its existing mouse-look behavior. The rear view has a dedicated reticle, ammunition/status and compact IAS/AGL information. Ground, training, fatal/weapon-system failure, empty stock and out-of-sector aim inhibit fire.

The B-52 fuel capacity was corrected from an inflated 180000 kg to 141610 kg, matching the USAF fact sheet: https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104465/b-52-stratofortress/b-52h-stratofortress/ . Its ordinary departure default is 90% (adjustable); both heavy aircraft retain their own engine count, thrust, wing area, G limit and slow control rates. The 60 km/60-degree radar setting is an explicit gameplay detection approximation, not a certified radar specification. Full-load runway takeoff and damaged AI return were tested with the ordinary physics.


### Vasfátyol / Operation Iron Veil (Top-gun, story 8)

A runway-start, staged combined-arms mission. Destroy two SAM sites and stop reinforcement before its bridge crossing (bridge OR convoy). Clearance arms a mandatory subsequent full-stop service gate; earlier services do not satisfy it. Only then do Nomad One and two Viper fighters activate. Two interceptors launch farther along the transport route. Once the transport exits, two flanking bombers counterattack the player's base; two escort fighters join unless the optional command bunker was destroyed before activation. Further services preserve time, units, ammunition and stage progress. Final victory requires the surviving base, transport exit, neutralized bomber raid, resolved incoming base-targeted weapons, and a final safe landing/full stop.

Five optional goals: jammer, route flak, command bunker, convoy, and both Viper pilots surviving. Stage-specific cockpit objectives and help keep the full checklist from overflowing; the wiki and briefing explain tactical effects. Operation transitions/waves and pending/cancelled units are recorded. Dormant allied units do not report false losses over radio.


### Tactical map zoom and paused Mission Control

0 (including numpad 0) cycles the minimap through 1x, 2x and 4x. Overview retains the existing automatic bounds around the base and detected contacts; magnified levels center on the player. Zoom persists through servicing and resets on a new mission. Terrain contours use a bounded cache of padded, quantized map tiles so moving the player-centered map does not resample terrain every frame.

O or clicking the radar opens a paused Mission Control chart with the full primary/optional objective checklist and current contact labels/list. Sensor range/cone, jamming and landing route rules are identical to the minimap; opening the chart never reveals hidden units. Zoom inside this view is independent of the cockpit setting. O/Esc closes it, resuming only if the chart itself paused the game; opening from the pause menu returns to that menu. Resize redraws the frozen chart. Map-open/close and cockpit zoom changes are recorded.


### Iron Veil diagnostic playtests and pacing refinements

`scripts/mission-playtest.mjs --mode strike|escort|counter --seed 17 --seconds 500 --out <folder>` runs a simple scripted pilot using ordinary 120 Hz flight physics, finite weapons, real launch checks, countermeasures and combat AI, writing standard recorder logs plus summaries. Escort/counter modes explicitly initialize checkpoints; these are isolated diagnostic runs, not claimed human playthroughs or difficulty benchmarks. No production autopilot or invulnerability is added. The pilot is deliberately limited and its defeats alone do not justify reducing enemy capability.

The initial escort probe lost Nomad at 374.8 seconds: flak and the optional bridge convoy could repeatedly hit its straight route. The revised corridor skirts the flak envelope at 6.2 km lateral separation and runs outside the convoy, keeping these optional targets useful without making their destruction an implicit requirement. The damaged escort now uses the same physical damage/torque compensation as other AI pilots, while preserving its fixed route altitude and exit; damage and fuel are not restored. The same seeded escort probe subsequently exited at 472.8 seconds with about 53.6% damage and entered the counterstrike phase, without requiring the optional flak/convoy kills. This is one diagnostic case, not a survival guarantee.

Viper elements now receive separate interceptor assignments and new bomber-intercept orders after the transport exits. Assigned fighters may navigate to distant objectives with a limited cruise turn rate; unassigned off-radar targets do not trigger distant steering, and all launch/radar limits remain. The designated home SAM prioritizes detected bombers attacking its protected base instead of exhausting its stock on nearer escort fighters. Withdrawal remains higher priority than new orders. Dedicated tests cover both factions, navigation/weapon-range separation, split tasks and long damaged C-130/Il-76 route flights.


### Second-stage escort follow-up

Four checkpoint probes compared F-16 seeds 29 and 71, MiG-29 seed 29, and F-16 seed 29 with the optional flak already destroyed. Three transports exited (about 465-480 seconds); the uncleared F-16 seed 29 lost Nomad under combined cannon/flak damage. These simple scripted-pilot cases demonstrate the optional target's tactical value, not a human success-rate estimate. Two repeated F-16 probes retained the same win/loss outcomes after the following changes.

Both sides' AI now preserve the latter half of their finite missile load for an engagement inside the smaller of 8 km and 65% of the current effective envelope. Opening shots remain possible near the outer permitted envelope. This is a tactical conservation decision, not a range/profile change; all fresh launch checks still apply. In the repeated escort logs, several final Viper launches moved from 11-20 km to 2-8 km. Cached-envelope prechecks avoid repeatedly calculating a fresh trajectory at physics frequency while ammunition is deliberately held. Unit logs include initial stock and the current hold decision.

Escort Mission Control help distinguishes joining and matching Nomad's pace from the active interceptor wave. Current bearing/distance is shown only for a radar-visible Nomad; the player keeps free target selection. 440 automated tests passed after these refinements.

## T–45C kiképzés és inert bombázógyakorlat

A négy gyakorlópálya kötelező gépe a T–45C Goshawk; harci küldetéshez nem választható. Az első három gyakorlat fegyvertelen. A negyedik a **Gyakorlóbombázás**: kifutóról indulás, pontosan három inert Mk 76 (11,34 kg/db), ugyanabba az 50 m sugarú célkörbe legalább két találat, majd sikeres leszállás és megállás. Középen kiszuperált tank, két kör és célkereszt látható. Találatot a tényleges talajbecsapódás vízszintes távolsága ad, robbanás, sebzés vagy közeli-mellé tolerancia nélkül. A célt nem lehet elfogyasztani az első találattal. Nincs újratöltés; a még repülő bombák végkimenetelét megvárjuk, mielőtt az elérhetetlen célt sikertelennek jelöljük. Két találat után a harmadik bomba megtartható.

A gép alapadatai: 4261 kg üres tömeg, 1 × F405-RR-401, 24,585 kN utánégető nélküli tolóerő, 11,98 m hossz, 9,39 m fesztáv, 12 954 m csúcsmagasság. Forrás: [US Navy T–45 fact file](https://www.navy.mil/DesktopModules/ArticleCS/Print.aspx?Article=2166516&ModuleId=724&PortalId=1). A szárnyfelület, üzemanyag-kapacitás és repülési modell további közelítései a típust követik; az aerodinamikai együtthatók és kormánysebességek játékhangolásúak. A 45 km-es civil elfogási érzékelő **szimulált kiképzési radar**, nem valódi harci radar. A T–45C és Mk 76 tényleges kiképzési alkalmazását a [US Navy gyakorlatbeszámolója](https://www.navy.mil/Press-Office/News-Stories/display-news/Article/2402468/training-wings-strike-pilot-detachment-makes-impact/) dokumentálja. A játék nem egy hivatalos TOPGUN tanterv másolata.

A valós Mk 76 tartalmazhat jelzőpatront. A játék változata teljesen inert, ezt képernyős becsapódásjelölés helyettesíti. Forrás a 25 fontos tömeghez és a valós jelzőpatronhoz: [US Navy gyakorlóbomba ismertetés](https://www.secnav.navy.mil/fmc/fmb/Documents/10pres/PANMC_BA_1_Justification_Book.pdf). A wiki külön tárgyalja a kiképzőgépet, az inert bombát, a célterületet, az új gyakorlat lépéseit, és az egyedi hajtóműsérülés mai frissítését. A napló megőrzi az oldások számát, a találatokat, a becsapódási pontot és a középtől mért eltérést; a kiértékelés ezeket az eseményeket is használja.

A kiképzőgép használható JP-5-kapacitása 2904 lb-ból kerekített 1317 kg, a terhelési határ 7,3 G, a szárazföldi felszállótömeg-határ 14 500 lb-ból kerekített 6577 kg. Forrás: [CNATRA T–45 konfigurációs oktatási kézikönyv, tükrözött példány](https://navyflightmanuals.tpub.com/P-1239/T-45A-Overview-26.htm). A bombák a játékban egy szárny alatti gyakorlófüggesztő három lőszerhelyén vannak.


### Radar alatti repülés, szállítós szerep és bevetéspróbák

A közös radar most hatótávot, látókúpot, tereptakarást és 4/3 effektív Föld-sugárral közelített horizontot vizsgál. A generikus SAM antennája az egység referenciapontjától 6 m-rel magasabban van, alsó nyalábszéle +0,15°. Ez játékhangolás, nem valamely valódi légvédelmi típus hitelesített adata. Saját/ellenséges radar, célbefogás és támogatást igénylő rakéta ugyanazt a szabályt használja. A már önálló végfázisban repülő rakétát vagy az optikai gépágyút az alacsony repülés nem teszi automatikusan hatástalanná. Fizikai háttér: https://www.history.navy.mil/research/library/online-reading-room/title-list-alphabetically/u/operational-characteristics-of-radar-classified-by-tactical-application.html

A szállítóvédő küldetésen öt fegyvertelen típus vezethető: C-130H, C-130J, Il-76, Il-76MD-90A, Y-20. Két Falcon vadász védi a játékos szállítóját; nincs második, láthatatlan sérülésmodell. A kijárat elérése után visszatérés és leszállás szükséges. Vasfátyolnál a hangár külön ismerteti a szállítóval repülhető kimenekítési szakaszt; a fegyveres változat az eredeti teljes művelet. A szállítók taktikai helyzetképe szintetikus játéksegéd, a légcsavaros típusok tolóereje ekvivalens közelítés. USAF C-130: https://www.af.mil/About-Us/Fact-Sheets/Display/Article/1555054/c-130-hercules/ ; UAC Il-76MD-90A: https://uacrussia.ru/en/aircraft/lineup/l/IL-76MD-90A/ ; Y-20: https://eng.chinamil.com.cn/CHINA_209163/TopStories_209189/10215713.html

Mindkét oldal gépei rakétaveszélyre késleltetve, véges készletből elterelőznek, és időkorlátos kitérő fordulót kezdenek. A szállítók 25°-os kitérési bedöntés után fokozatosan térnek vissza útvonalukra. A chaff Doppler-elutasítása erősebb; az ismételt elterelés nem jelent automatikus védelmet. A radaros kitérés és a folyamatos egyenes repülés különbségét determinisztikus próbák ellenőrzik; ezek nem valós találati valószínűségek.

`scripts/campaign-playtest.mjs`: fizikai vezérlést használó, 120 Hz-es bevetéspróba, véges fegyverekkel és rendes küldetésfeltételekkel. Nem teleportál, nem sebez közvetlenül, nem léptet át célokat. A robotpilóta eredménye diagnosztika, nem emberi nehézségi mérce. A gyakorlóbombák egyidejű becsapódásai külön találatszámot kapnak; az azonos időbélyegű fázisváltásnál az eseménysorrend dönt. Sérülés miatti megszakítás után a később megsemmisült város/bázis nem marad tévesen teljesített cél.


### Általános AI rakétataktika

A fizikai indíthatóság mellett a közös AI-döntés megköveteli a sebesség/magasság/célmozgás alapján becsült kedvező lőtávot. Az első rakéta sem használhatja automatikusan a teljes szélső indítási burkot. Bázist támadó bombázó, illetve a védett légi egység 10 km-es körzetében levő, azt kijelölten támadó ellenfél sürgős védelemnek számít: ekkor legfeljebb 10% többlet engedett a kedvező lőtávhoz képest, a fizikai felső határon belül.

Célonként, az egész oldalon közös rakétakötelezettség-számláló működik. Normál távoli helyzetben egy, közeli vagy sürgős védelemben kettő követő rakéta engedett. A játékos rakétája is beleszámít a saját oldal keretébe; a két oldal kerete különálló. Célt vesztett, elterelt és lejárt rakéta nem foglalja a keretet. A számláló egy lövedéklistás átfutással készül, az ugyanazon szimulációs lépésben indított lövések azonnal frissítik. A lőszer második fele továbbra is közelebbi helyzetre tartalék. Az aktív kitérést végző hordozó nem kezd új SARH/lézeres, illetve még hordozói támogatást igénylő aktív rakétaindítást.

A szabály küldetésfüggetlen, baráti és ellenséges vadászokra és földi rakétarendszerekre azonos. Nem változtat fegyverprofilt, radarhatótávot, sebzést vagy elterelő-ellenállást. A napló indítási eseménye az `aiTacticalRangeM`, `aiInboundOnTarget`, `aiSalvoLimit` mezőket is tartalmazza; a világmintákban a visszatartás indoka is látszik.


### Kötelékrepülés, kísérők és sérült AI-k kivonása

A raj hívójele és oldala szerinti One a vezér; a játékos is lehet One. A gépek külön kötelékhelyre állnak, a vezér aktuális sebességéhez igazodnak, fokozatosan gyorsítva vagy lassítva. A tervezett sebességet a típus Mach-határa és emelt átesési tartalék korlátozza; a könnyített AI-mozgás gyorsulását a típus tolóerejével, fél tankkal becsült tömegével és légellenállásával közelítjük. A gyorsulás legfeljebb 6 m/s²; nincs helyre ugrás. A sérült gépek továbbra is a rendes erőalapú repülési modellt használják. A rajvezér kiesése vagy hazatérése után a legalacsonyabb megmaradt hívószámú repülőképes gép lesz a követendő vezér, hívójel-átnevezés nélkül.

Észlelt közeli ellenfélnél a rajtagok kiválhatnak harcolni; utána visszacsatlakoznak. A kijelölt légi egységet védő vadászok annak előretolt, oldalt eltolt fedezetét adják, a rá támadó észlelt ellenfelet részesítik előnyben, és túl nagy eltávolodásnál visszazárkóznak. A szabály oldaltól és küldetéstől független; a Vasfátyol Viper gépei is Nomad védelmét kapják. A fegyveres cél és a navigációs cél különálló. A napló `coordinatedFlight` mezője rögzíti a vezért, a módot és a célsebességet.

A korábbi, 2500 m-es hazai és 1200 m-es kilépési pontba érkezést megkövetelő sérült AI-útvonal gyors gépeknél tartós körözést okozhatott. A vezérlés most az útvonalon előretekintő célt követ, egy elvétett pont után nem fordul vissza. A kilépési folyosó végének fizikai átlépése vagy a 3 km-es kilépési körzet tényleges elérése engedi a távozást; időtúllépés vagy oldalirányú távolság önmagában nem. Saját működő reptér hiányában nincs mögé képzett mesterséges hazai pont: a fenyegetéstől kifelé indul. A távozás nem javít, nem teleportál és nem ad lelövési pontot. `scripts/retreat-playtest.mjs` 16 irány/típus/bázishelyzet próbáját menti összehasonlíthatóan.


### Fegyverzet- és veszélyfüggő AI földi támadás

A vadászok közös célválasztása már földi célokat is mérlegel. A fegyverkészlet, a kijelölt feladat, a saját/védett egység közvetlen veszélye, a védett gép következő 120 másodperces útvonalának légvédelmi lefedettsége, az észlelés, a tiszta tűzvonal és a távolság pontozott sorrendet ad; egy kijelölés nem feltétlenül írja felül a sürgős védelmet. A hasonló célok közötti ugrálást kis megtartási előny csökkenti. Nincs külön játékosra vadászó bónusz. Az észlelt álló cél helyét a visszaforduló rácsapás alatt, 25 km-en belül megjegyzik; ez nem old fel indítási tiltást.

A tényleges alapfegyverzetből külön véges AGM- és bombakészlet készül. Földi célra az AI nem alakítja át az AAM-et: a saját Maverick/Brimstone/Kh család profilt használja, ugyanazzal a radarral, zavarási tiltással, látókúppal, indítási burkolattal, támogatási igénnyel és közös rakétakötelezettség-számlálóval. Gépágyúnál valódi előretartás és szűk célzási szöghatár kell, rácsapás–kirepülés–új ráfordulás útvonallal. A repülőgépágyúk korábbi 1,8-as AI-alapsebzése 18-ra, a sorozaton belüli időköz 0,085 s-ra változott: a játékoséval azonos, mindkét oldalon. A földi általános gépágyú profilja és sebzése nem változott. A bombakioldás a tényleges gép bombaprofiljából számol, nem egy fix F-16-példányéból.

Játékos vezette szállító mellé a nyugati F-15E és az orosz Su-35S többfeladatú kísérő kerül; a kínai J-10C marad a saját alapfegyvereivel. A napló `ai.targetDecision` mezője az indokot, a `coordinatedFlight` a földi támadás fázisát is mutatja. Az új `tests/ai-ground-attack.test.js` valódi lövedékkel, ütközéssel és sebzéssel vizsgálja az AGM-et és az ismételt gépágyús támadást; mindkét oldalra ellenőrzi a célválasztást és a készletfogyást.


### City Shield metropolis

A város 25 külön rombolható célja közel 4 × 4 km-es, 900 méteres osztású toronynegyedet alkot. A fél szélesség/mélység 80–140 m: az utcafolyosók legalább 620 m szélesek. A külső tornyok 180–300 m, a belvárosi gyűrű 400–560 m, a központ 820–900 m magas. A 80%-os védelmi követelmény és az épületek száma megmaradt. A közeli szintjelző vonalak száma épületenként legfeljebb 24; távolról ugyanúgy 8 pont / 6 tömör lap jelenik meg. A city-optimization tesztek a széles folyosók átjárhatóságát, a magassági profilt és a részletesség felső korlátját is ellenőrzik.


### Városvédelmi naplóteszt utáni AI-finomítás

A City Shield baráti vadászai `defendGroup: city` csoportvédelmet kapnak. A közös célpontozás a védett csoportot támadó bombázó távolságából és sebességéből becsült beérkezési idővel számol. A 4 km-en belüli, közvetlenül a védőre támadó repülő önvédelmi prioritása felülírhatja a bombázóelfogást. A feladat nem ad nagyobb radart, lőtávot vagy végtelen lőszert.

A várost bombázó gépek választásakor számítanak más bombázók célhozzárendelései és a már úton levő bombák. Minden AI-bombavetés előtt a cél megmaradt életereje és a már hozzárendelt bombák 100-as játékbeli alapsebzése szab határt; a számláló az adott lépésben azonnal frissül. Ez megakadályozza a tucatnyi bomba elpazarlását ugyanarra a 60 HP-s épületre, és másik célra ösztönöz. A számláló az élő lövedékekből újraépül: a mellément bombát nem tekinti találatnak. A repülési napló a védett csoportot is menti.

A hang nélküli kampánypróba nem inicializál hangrendszert, tényleges 120 Hz-es repülést és véges fegyverkészletet használ. A tesztpilóta irányított fegyvernél most a kedvező indítási burkolatig vár; ez csak a tesztvezérlés taktikáját változtatja, a játékos tüzelési engedélyét nem.


### AI repteres javítás és utánpótlás

A `src/aiResupply.js` mindkét oldalra azonos kiszolgálási állapotgépet ad. Elfogyott, ténylegesen használt fő fegyverkészletnél, repülőképes javítási igénynél vagy a repülési állapot 12% alatti üzemanyagánál saját működő repteret választ. Fegyverhiánynál a még támogatandó rakéta megszűnéséig vár. A kifutó forgalma sorba állított: várakozás, beállás, végső megközelítés, valódi erőalapú földetérés/fékezés, 60 s kiszolgálás, legfeljebb 8 m/s gurulás a szabad oldalon vissza a küszöbhöz, fizikai felszállás és feladatra visszatérés. A gurulás kormányzott, korlátozott sebességű AI-mozgás; nincs pályaelejére teleportálás. A levegőben és a kifutón az AI a játékos repülési modelljét használja.

A leszállási vizsgálatok kifutóhoz viszonyított helyzetet és irányt kezelnek. A repterek látható kifutója 3,2 km-es; a terep ugyanitt és a megközelítési folyosón ténylegesen a repülőtér magasságához igazodik. Távoli, elforgatott, 180 m-en fekvő ellenséges reptéren is végigpróbált ciklus. A kiszolgálás teljes, eredeti fegyverzetet, üzemanyagot, elterelőket és javítást ad; csak a megállás és a 60 s után. Az ép harci AI korábbi könnyített mozgatása továbbra is megmarad, a kiszolgálási repülés és az utána megmaradó repülési állapot erőalapú.

Reptér nélkül lőszerhiánynál külön kijárati útvonal, 60 s külső kiszolgálás és visszarepülés működik. A korábbi sérült AI-kivonulási szabály most súlyos sérülésnél csak saját működő reptér nélkül végleges; reptérrel javítási leszállást próbál. Végzetes sérülés, lezuhanás, illetve földön kiszolgáló bázis megsemmisülése nem ad visszatérő gépet. Az átmenetileg kiszolgált gép `alive=true` marad, tehát nem oldja fel a minden ellenség leküzdését kérő célt; külső kiszolgálásnál `exited=true` miatt nem látható és nem lőhető. Az eredeti objektumazonosító és hívójel megmarad.

A `Mission.update` minden lépés végén közzéteszi a `weapons.missionEnded` állapotot; a kiszolgálás célok miatti siker/vereség, megszakított küldetés lezárása, illetve játékos dying/crashed állapot után nem léphet tovább és nem hozhat vissza egységet. A napló menti a `service`, `serviceCount` mezőket és a ciklus eseményeit. `scripts/ai-service-playtest.mjs` és `tests/ai-resupply.test.js` valódi fizikai repüléssel ellenőrzi a szövetséges, ellenséges, sérült, reptér nélküli és B-52-ciklust, valamint a küldetésvégi és bázisvesztési korlátokat.


### Gyakorlóküldetések teljes repülési ellenőrzése

A hang nélküli kampánypilótával a leszállás, a nyolckapus kanyon, a civil elfogás és a két találatos bombagyakorlat teljesült. Civil elfogásra és bombázásra három indulási véletlenértékkel is sikeres volt a teljes repülés és a megállással záruló leszállás. A felszállási Mission Control már az aktuális tömegből számolt megközelítési referencia alapján ad közelítő elemelési tartományt (95%-ra kerekített célsebesség és +20 km/h), nem fix 280–330 km/h-t. A T–45 utánégető nélküli típus, ezért a felszállási és hazatérési segítség nem kér Shift-használatot. A sebességtartomány tájékoztató; a tényleges elemelést a fizikai felhajtóerő dönti el.

A megállt bombagyakorlat nem zárható le, amíg ledobott inert bomba van a levegőben: külön várakozási fázis őrzi meg az utolsó becsapódás és találatszám naplózását. A gyakorló kiértékelés a gyakorlat céljairól beszél, nem harcászati célról. A többi gyakorló továbbra is eredeti teljesítési feltételeit használja: szabad N-segéd a leszálláshoz, sorrendben átjárt kanyonkapuk, békés befogás és sértetlen civil távozás, illetve legalább két célkör-találat és teljes megállás bombázáskor.


### Harci küldetések változatos diagnosztikai próbái

A `scripts/campaign-playtest.mjs` a `--style conservative|objective|aggressive` kapcsolóval különböző sebességet, bedöntést, indítási tartalékot, rakétaszámot és hazatérési üzemanyagküszöböt használ. A játék rendes fizikájával, érzékelőivel, véges készletével és teljesítési feltételeivel repül; nincs célok közvetlen sebzése vagy teleportálás. A vezérlő ismeri a küldetés navigációs célhelyeit, ezért diagnosztikai segéd, nem emberi teljesítmény mércéje. A hang és a renderelés nem része ezeknek a próbáknak. Explicit stílusnál a napló neve a küldetést, gépet, stílust és véletlenmagot is tartalmazza.

A cél nélküli AI-köteléktag most is megkapja az aktuális navigációs parancsot, akkor is, ha nincs tüzelhető cél. Az egyedül maradt vezér járőrözik a saját reptérnél vagy a várakozás kezdeti helyén. Az Iron Veil ellencsapását a lőszerért átmenetileg kivonuló bombázó nem teljesíti; a végleg kivont sérült gép továbbra is semlegesített fenyegetés. A végzetesen sérült gép becsapódása külön `impact` esemény: a kiértékelés nem talál ki hozzá futómű- vagy megközelítési hibát. Szintén külön becsapódás a kifutón kívüli terepütközés, ha nincs futó, bekapcsolt leszállási mód vagy aktív megközelítés. A valódi leszállási kísérletek továbbra is a leszállási szabályokat használják.


### Kapcsolható kísérleti felületek

A hangár és a szünetmenü **Táj és megvilágítás** választója: eredeti vektoros, füves/kék ég, poros sivatag, sziklás hegyvidék, naplemente, csillagos éjszaka és borús havas tél. Új beállításnál a füves táj az alap, a korábbi mentett választás érvényben marad; a választás helyben megmarad. A repülés, az érzékelés, a radar, az ütközés és a nehézség nem változik. A fényszínek dekoratívak, nem jelentenek időjárási vagy éjszakai érzékelési modellt. A napló `visual-style` eseménye és a teljesítményminta `visualStyle` mezője rögzíti a választást.

WebGL2-ben helyben generált, 256×256 pixeles RGBA felületek adják a gépek szürke panelmintáját, a katonai egységek terepmintáját, az épületek betonfelületét, az otthoni hangárok kapuit és a terep finom részleteit. A textúrák egyszer kerülnek a GPU-ra, mipmapokkal és ismétléssel, új geometria vagy külső letöltés nélkül. Öt textúra teljes mipmapsora kb. 1,7 MiB színadatot jelent; ez nem a teljes renderer memóriaigénye. Egyszerű felületfény és a meglévő mélységi takarás marad, új dinamikus árnyék/reflexió nincs. Canvas2D-visszaeséskor egyszerű színezett felületek jelennek meg. A csillagos ég továbbra is a meglévő, világirányhoz rögzített csillagmező, nem fényképes panoráma. Az ellenséges reptér összetett modellje az első kísérletben betonfestést kap, a kapuminta a saját reptér hangárjain látszik.

A `/tests/surface-preview.html` hang nélküli összehasonlító oldalon táj, közeli hangár, gép/jármű, nagy magasság és egy 32 gépes + 25 épületes terhelési jelenet választható. Az ötmódos mérés 30 bemelegítő képkocka után 70 mintát mutat módonként: rajzolási parancsok CPU-ideje és böngésző képkockaideje, nem GPU-időmérő. Nem futtat harci AI-t/fizikát. A csillagok száma és az ég módonként eltér; a vektoros módhoz viszonyított esetleges javulás nem a textúrák általános gyorsító hatása. Valódi légicsata teljesítményét a repülési naplóval külön kell összevetni.


### Küldetésterhelés és stabil távoli terep

A `/tests/mission-performance.html` hangrendszer nélkül méri a Légifölény és a városvédő küldetés közeli, zsúfolt és magaslati diagnosztikai jeleneteit, vektoros és füves felületekkel. A valódi egységlistát, AI-t, fegyvereket, fizikát, műszerfalat és naplóépítést futtatja. Az egységek mérési elhelyezést kapnak, a városnál a későbbi hullám is aktív. Nem teljes küldetés-végigjátszás: képkockánként rögzített két fizikai lépés, 30 bemelegítő és 120 mért képkocka. A CPU-idő, a böngésző képkockaideje és a p95 látható; a GPU önálló idejét nem méri. A képernyő frissítése korlátozhatja az elérhető FPS-t.

Az ég/horizont, a terep, az utak és folyók közös GPU-képet adnak, egyetlen környezeti Canvas-másolással. A modellek külön mélységi rétege megmarad. A statikus út/folyó geometriája ablakonként egyszer töltődik fel; a tényleges procedurális terepláthatóságot render-only, legfeljebb 8 m vízszintes / 1 m függőleges elmozdulásra újrahasznált teszt őrzi. Ez megakadályozza, hogy a keskeny medret nem reprezentáló ritka terepháló eltüntesse a vizet. Fizika és fegyvervezetés nem használja ezt a vizuális cache-t. WebGL-hiba esetén a meglévő Canvas-rajzolás kapja vissza az út/folyó megjelenítést; a hangárba visszatéréskor a kép nem marad késleltetett állapotban.

A saját kifutó vonalai közös GPU-kötegbe kerülnek. A nagyon távoli, másfél képpontnál kisebb dipólköteg látható pontként jelenik meg, közelről megmarad a teljes minta. Az infracsapda fénye egyszer elkészített képet használ. A kijelző nem építi újra a változatlan céllistát és kapcsolófeliratokat. A lövedékek változatlan részletes találati szabályai elé forgatott objektumokat is befoglaló dobozos előszűrés került; a gyakori távolság- és szegmensszámítások nem hoznak létre fölösleges ideiglenes vektorokat. A napló `featureBackend` mezője rögzíti a környezeti részletek rajzolóját.

A távoli tereprács mintapontjai világkoordinátákhoz igazodnak, a markáns csúcsok külön rögzített minták. A változatlan magasságminták újrahasználódnak. Kis hiszterézis akadályozza meg, hogy a kamera egy határ közelében folyamatosan két háló között váltogasson; az út/folyó ablaknak és magaslati részletváltásnak is van holtsávja. A `/tests/terrain-stability.html` nézetben a kamera 20 méteres elmozdulása mellett ellenőrizhető a világban rögzített csúcs. A ritkább távoli megjelenítés továbbra is közelítés, a fizikai terepmagasság nem változik.

### Tömör tájak és égboltok

A textúrázott változatok a játékban is élvonalak nélkül jelennek meg; a vektoros mód külön megmaradt. A fegyverjelzések, HUD, radar, kifutójelölések és tényleges vonalas modellrészletek megmaradnak. A hangár előnézetei is elhagyják a modelléleket textúrázott módban (Canvas2D-ben egyszerű felületszínezés).

A sivatag homokmintát és poros távoli párát, a hegyvidék réteges kőzetmintát kap. A meredek oldalak sziklásak, a hegyvidék magasabb részein hó jelenik meg. Téli módban a lankás felszíneken összefüggő hó, a meredek falakon sötétebb kőzet látszik. Az ég borús; csapadék, jegesedés és csúszós pálya nincs modellezve. A naplemente világirányhoz kötött napkorongot és meleg égboltot, az éjszaka a meglévő csillagmezőt és sötétebb felületeket használja. A terep színezése magasság- és lejtőfüggő; a világ geometriája és a fizikai magasságok nem változnak a látványváltástól.

A textúrák és a borultság foltjai gyorsítótárazottak, nincs képkockánkénti textúragenerálás, csapadékrészecske vagy új dinamikus árnyék. A textúrák GPU-ra másolása anyagonként egyszer történik, mipmapokkal. Az összehasonlító nézet: `/tests/solid-surface-preview.html` (tájválasztó, élvonal-kapcsoló, hang nélküli mérés).

### Szél: jelenlegi állapot és következő fejlesztés

Jelenleg nincs szélmező: a `physics.js` és `maneuverDynamics.js` a talajhoz viszonyított sebességvektort használja a légáramlás, felhajtóerő, légellenállás, IAS és Mach számításához. A borús ég és a poros táj csak látvány.

A bevezetéshez közös, determinisztikus `windAt(position,time)` mező és külön relatív légsebesség szükséges: `airVelocity = groundVelocity - wind`. A légellenállás, felhajtóerő, állásszög, IAS és Mach a relatív légsebességgel számolandó, a földi elmozdulás a talajsebességgel. Ezt a játékosra és az AI-ra, a bombákra és rakétákra, az útvonal/leszállási előrejelzésre, valamint a naplózásra együtt kell átvezetni; pusztán oldalirányú eltolás fizikailag és a találati becslésekben hibás lenne. Első lépésnek állandó, választható erősségű/irányú szél ajánlott, gyakorlópályákon alapból szélcsend. Széllökések és magasságfüggés később, tesztelt állandó szél után következhetnek. Ez a változtatás még nincs bekapcsolva.

### Harci számítások optimalizálása

A repülőgép-találatvizsgálat a háromszögeket, alkatrészcímkéket és befoglaló téglatesteket gyorsítótárazza. A gyorsítótár az aktuális flap/sweep modellhez és a két szárny épségéhez igazodik, ezért a leszakadt szárny/hajtómű nem marad található a régi helyén. A lövedék teljes, relatív mozgást tartalmazó szakasza és a közelségi gyújtó sugara megmarad. A háromszög pontos vizsgálata csak akkor marad ki, ha a sugárral kibővített befoglaló doboz szerint biztosan nem érhető el; a közeli robbanás legközelebbi felületének keresése szintén konzervatív távolsági előszűrést kap.

Az AI a kilőtt lövedékek korlátaihoz egy számolást oszt meg egységenkénti új tömblisták helyett. A közben indított lövedékek azonnal beleszámítanak. A város épületeinek célpontszáma és pontozása egy döntésen belül egyszer számolódik ki, nem minden rendezési összehasonlításkor. A döntési időköz, fegyverparaméter, tűzgyorsaság és létszám változatlan.

Az ellenőrzés két küldetésben, azonos véletlenmaggal és 1200 darab 1/120 s-os lépéssel történt, bemelegítés után három, váltakozó sorrendű összehasonlításban. A 10 lépésenként rögzített repülési/fegyverállapot és az összes harci esemény egyezett, továbbá 2025 találati sugár és 243 legközelebbi felületvizsgálat is pontosan azonos eredményt adott. A CPU-próbában a fegyver/harci lépések összideje kb. 43%-kal csökkent a Légifölény és 40%-kal a városvédelmi jelenetben. Ez nem FPS-adat, és nem tartalmaz GPU-t, böngészős felületet vagy rádiót.

A `/tests/mission-performance.html` FPS-mérő a rejtett lapot, mérés közbeni felbontásváltást és a nagyon alacsony CPU-terhelés mellett másodperces RAF-időzítést érvénytelen mérésként jelöli. FPS-t előtérben, takaratlan tesztlappal és azonos felbontással érdemes összehasonlítani.


### Városi utak és olvasható felületek

A városvédő pálya 12, a tömbök közötti folyosókat követő utcát kapott. Az utak a meglévő, gyorsítótárazott GPU-s tereptárgyrajzolás részei; nem új játékmeneti egységek. A statikus épületek részletesség és sérülési állapot szerint közös rajzolási csoportokba kerülnek: a távoli, ép 25 ház 25 helyett 1 modellbeküldést igényel. A házak külön célpontjai, ütközései és sérülései változatlanok. Ez beküldésszám-csökkentés, nem mért FPS-növekedés.

A teljes képernyős CRT-csíkozás kikerült. A kifutók külön, sötét aszfaltfelületet kapnak; az aszfaltnál nincs a talaj mögé toló poligoneltolás. A hangártextúra 512×512-es, élesebb kapurészletekkel és legfeljebb négyszeres anizotropikus szűréssel, ha azt a GPU támogatja. A célkeretek és feliratok sötét kontrasztkontúrt kaptak. A `tests/solid-surface-preview.html` hang nélküli kifutó- és városnézetet is tartalmaz.


### SEA GUARD · anyahajó-védelem

A 9. Story #1 küldetés TOP-GUN nehézségű, rögzített nappali tengeri környezettel. Az egyéb bevetések minden indításkor véletlen szárazföldi tájat kapnak; az előző táj közvetlen ismétlését elkerüljük. A tájválasztó kikerült a hangárból és a szünet/kiértékelés képernyőről is.

A 320 m-es, szürke játékbeli anyahajó 20 m magas fedélzetén sötét, aszfalthatású csúszásgátló felület van. A horizont tengerszinti: körbefutó, kékes tengeri párával, dél felé távoli sivatagos parttal és metropoliszsziluettel. A part szélei fokozatosan nyílt tengerbe vesznek; a háttér rögzített világirányt követ, nem ütközhető célpont. A víz folytonos panorámája eltakarja a véges terepháló határát. A hajó helyben áll; hullámzást, fedélzetmozgást és szelet ez a változat nem szimulál. Falcon Two indul előbb, Falcon Three és Falcon Four már a levegőben fedezi az anyahajót; egyetlen ellenséges raj támad (3 vadász + 1 bombázó). Nincs második hullám. Egy 150 m-es, mozgó romboló is közeledik, 23,44 km-ről indulva, a 9 km-es névleges Sea Sparrow rakétalőtávján kívülről. Az anyahajó két gépágyúval (1,8 km játékbeli hatásos lőtáv) és két RIM-7 Sea Sparrow védelmi rakétával (9 km névleges játékbeli lőtáv), a romboló a közös radar/lőtávszabályok szerinti rakétával és gépágyúval tüzel. Mind a négy támadó és a romboló leküzdése, az anyahajó túlélése és a fedélzeti visszatérés kötelező.

F/A-18C és F-14: R teljes gáz, U katapult (legalább 5 s után). A visszatérés 352°-os ferde sávra, 3,5° siklásban történik. G futó, X fékszárny, K fékezőhorog; a horog a G-LIM kapcsoló helyén is látszik a tengeri bevetésen. Négy külön drót metszése vizsgált, csak kiengedett horoggal. A lassítás sebesség/út alapján, legfeljebb 3 G-vel történik. Elvétett kötél után bolter-segítség: teljes gáz, orr fel, új kör. Kötélfogás nélküli fékezés nem nyerheti meg a küldetést. Köztes, sikeres visszatérés javít és feltölt. A fedélzeti AI is használja a megközelítést, horgot, szervizt és katapultot.

Az AV-8B Harrier II Plus új, egyhajtóműves modell. A NAVAIR típusoldala alapján 14,12 m hossz, 9,25 m fesztáv és kb. 98,75 kN Pegasus-tolóerő szerepel. A tömeg és az aerodinamikai/vezérlési együtthatók közelítő játékparaméterek. Z: 0 / 45 / 90° fúvócső, a korábbi utánégető-kapcsoló helyén is látható. Nincs utánégető, katapult vagy fékezőhorog. A tolóerő a test tengelyei között fordul át; a függőleges komponens nem adódik hozzá még egyszer a normál tolóerőhöz. A lebegési tartalék a pillanatnyi tömegből, légsűrűségből és rendelkezésre álló tolóerőből következik: teljes terheléssel 45°-os rövid nekifutás és finom orrfelhúzás szükséges, könnyű gépnél 90°-kal valódi függőleges emelkedés lehetséges. A fedélzeten <3 m/s függőleges és <12 m/s vízszintes sebességű, kieresztett futós leszállás engedett. A hajó és a Harrier eljárásai szerepelnek a wikiben; a naval-state napló rögzíti a speciális állapotváltozásokat.

Források: [NAVAIR AV-8B](https://www.navair.navy.mil/product/AV-8B-Harrier), [NAVAIR katapult és fékezőberendezés](https://www.navair.navy.mil/product/advanced-arresting-gear-aag). A saját katapult-, fékezőkötél- és VTOL-modell játékhoz hangolt közelítés, nem hitelesített fedélzeti eljárásszimulátor.

Hang nélküli ellenőrzők: `tests/naval-flight.html` (modellek, fizikai repülési esetek, harci próba), `tests/naval-cockpit.html` (valódi műszerfal), `tests/naval-mission.test.js` és `tests/naval-combat.test.js` (fizika, hullámok, fegyverek, sikerkritériumok, AI-feltöltési ciklus). Nincs AudioSystem a böngészős próbákban.

Az anyahajó két önálló gépágyúállása külön célt követ, külön sorozat- és újratüzelési idővel, állásonként 1800 lőszerrel. Két elérhető légi cél esetén megosztják a tüzet; egy cél esetén mindkettő támadhatja. A közös 1,8 km-es lőtáv, radar, tereptakarás és lövedékszám-korlát továbbra is érvényes. Ez kizárólag az anyahajó működését módosítja.

Mindkét hadihajó a közös `seaSparrow` (RIM-7) profilt használja: 0,45–9 km névleges játékbeli indítási tartomány, félaktív radaros támogatás a találatig, dipól elleni érzékenység. Anyahajó: 2 Sea Sparrow + 2 RAM, romboló: 6 Sea Sparrow + 2 RAM; a szárazföldi SAM 24 km-es profilja változatlan. A Sea Sparrow, RAM és SeaRAM önálló wikiadatlapot kapott, a RAM/SeaRAM most aktív automatikus rakétaelfogó védelem. Forrás: https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2168965/seasparrow-missile-rim-7/ és https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2167555/searam-close-in-weapon-system-ciws-anti-ship-missile-defense-system/ .

SeaRAM: az anyahajó és a romboló külön, 2–2 darabos RAM-készletből védekezik. Csak ellenséges, a hajót közelítő AAM/AGM lövedékeket követ, a beérkezés ideje szerint. Ugyanarra a rakétára saját oldalon egy követő elfogórakéta jut. A minimum/maximum indítási távolság, radar, tereptakarás és indításköz számít. Az elfogó fizikailag repül, élesedik és a relatív mozgás alapján működő közelségi gyújtóval talál; az eredmény nem garantált. Bombák és interkontinentális egységek ellen nincs elfogás. A találat mindkét rakétát eltávolítja, de nem számít repülőgép-lelövésnek vagy küldetési cél teljesítésének. A napló tartalmazza az indító hajót, a célrakéta azonosítóját és az elfogás vagy elfogórakéta eltűnésének eseményét.

A tengeri küldetésben egyetlen négygépes támadó raj van; nincs második hullám. Az átmenetileg lőszerért hazatérő gép nem esett ki: bázis nélkül a légtéren kívül tölt, majd visszatérhet. Ilyenkor a küldetéslistán az újratöltő gépek száma látható. Sérülten, saját repülőtér nélkül végleg kivonuló gép nem tér vissza.
