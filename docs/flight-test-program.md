# Berepülési programok és kísérleti repülőgépek

A „Berepülés” önálló kategória a gyakorlás és a bevetések mellett. Két fegyvertelen program: Edwards (USA, sivatagi táj), illetve Zsukovszkij (szovjet/orosz tesztközpont, füves táj). A géplista a programhoz rögzített, nincs oldalcserével megfordított harci változat. A prototípusok a normál harci kínálatba nem kerülnek be.

## Tesztlap

| Gép                    | Első repülés | Tesztmagasság | Teszt-IAS |
| ---------------------- | ------------ | ------------- | --------- |
| Grumman X-29A          | 1984         | 3000 m        | 550 km/h  |
| Northrop YF-23A PAV-1  | 1990         | 5000 m        | 650 km/h  |
| Boeing X-32A           | 2000         | 3000 m        | 500 km/h  |
| Szuhoj T-4 „Sotka”     | 1972         | 3500 m        | 600 km/h  |
| Szuhoj Szu-47 „Berkut” | 1997         | 4000 m        | 600 km/h  |
| MiG 1.44 MFI           | 2000         | 1500 m        | 400 km/h  |

Ezek virtuális, konzervatív tesztlapok, nem konkrét történelmi repülések rekonstrukciói. Felszállás után 12 másodperc folyamatos szinttartás szükséges: a magasság ±150 m, az IAS ±40 km/h tartományon belül, a bedöntés 8° alatt, a függőleges sebesség 4 m/s alatt. Futó és fékszárny behúzva, légfék zárva. Ezután bal, majd jobb 20–40°-os bedöntés 3–3 másodpercig, a megadott magasság és sebesség megtartásával. A megszakított tartás számlálója újraindul; a teljesített pont megmarad. Hazatérés után sikeres leszállás és 5 m/s alatti megállás zárja a küldetést, újrafeltöltés nélkül.

A kiválasztott gép célértékei már a katalógusban és a felszerelési lapon látszanak, repülés közben a feladatlista és Mission Control is mutatja őket. Az IAS műszer szerinti sebesség, nem azonos a magasságfüggő valódi sebességgel. A saját geometriai modellek a jellegzetes alaprajzot és hajtómű-elrendezést követik, nem CAD-modellek.

## Források és bizonytalanság

A típusok és programok története elsődleges, intézményi forrásokból ellenőrzött. A csúcsadatokat nem minden demonstrátor repülte ki. A T-4, Szu-47 és MiG 1.44 adatlapja ezért a közölt felső határokat **tervezési adatként** címkézi. Különösen nem állítjuk, hogy a T-4 ténylegesen Mach 3-mal, vagy a MiG 1.44 Mach 2,6-tal repült. A Szu-47 és 1.44 szovjet eredetű program, de az elkészült gépek már Oroszországban repültek. Az X-32A hagyományos felszállású; nem kapta meg a B változat függőleges üzemmódját.

- [NASA X-29 adatlap](https://www.nasa.gov/wp-content/uploads/2021/09/fs-008-afrc.pdf): méret, tömeg, F404 hajtómű, Mach 1,6 és 50 000 láb üzemhatár; a tömeg kerekített SI-érték.
- [NASA X-29 repülési vizsgálati jelentés](https://ntrs.nasa.gov/api/citations/19880008260/downloads/19880008260.pdf): szárnyfelület és üzemanyagadatok.
- [USAF Múzeum YF-23](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/195766/northrop-mcdonnell-douglas-yf-23a-black-widow-ii/): a két ATF-prototípus és a YF119-hajtóműves változat, közelítő tolóerő és sebesség.
- [USAF Múzeum X-32A](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/198058/boeing-x-32a/): a koncepciódemonstrátor és tesztprogramja, közölt Mach 1,2-es sebesség.
- [Boeing történeti termékkatalógus](https://www.boeing.com/content/dam/boeing/boeingdotcom/history/pdf/Boeing_Products.pdf): X-32 méretek és közelítő hajtóműadat; az eltérő változatokat nem keverjük össze az X-32A-val.
- [CIAM történeti hajtómű- és repülőgépanyag](https://ciam.ru/novikov/pdf/Новиков_Часть2.pdf): T-4 első repülése 1972. augusztus 22-én, négy RD36-41 és a tízrepüléses program.
- [Rostec: Szu-47 története](https://www.rostec.ru/media/news/nevidannyy-berkut-k-25-letiyu-pervogo-poleta-su-47/): szovjet előzmények, egyetlen prototípus, első repülés 1997-ben.
- [Rostec: MFI / 1.44 története](https://www.rostec.ru/media/news/umenie-mechtat-artema-mikoyana-chast-ii/): szovjet program és a 2000. február 29-i első repülés.

A nem teljesen nyilvános üres- és üzemanyagtömegek egy része, a légellenállási/felhajtóerő-együtthatók, a G- és kormányhatárok, illetve a tesztlapok **játékbeli becslések**. Különösen a ritka szovjet/orosz demonstrátorok teljes teljesítménytáblái nem tekinthetők igazoltnak pusztán a történeti forrás alapján. A modell nem hitelesített repülési kézikönyv. A tesztmagasságokon külön ellenőrizzük a felhajtóerő- és tolóerő-tartalékot.

## Általános függesztmény-légellenállás

Minden típus közös `externalStoreCount` függvényt használ. Az aktuális konfiguráció belső állomásain vitt bombák és rakéták a tömegbe beleszámítanak, külső függesztmény-légellenállást nem adnak. A külső állomáson ténylegesen megmaradt eszközök adnak légellenállást; kioldás után ez csökken. A számítás a játékos egyedi fegyverválasztását is követi, nem típusnév alapján tesz kivételt. A belső bombatérajtó rövid nyitási többletét a jelenlegi modell nem szimulálja. Az összes normál géptípus bombásra átkonfigurált változatával, valamint kioldás után fizikai erő-összehasonlításos teszt fut.

## B-52

A tele tankkal, a játékbeli 12 Mk 82-vel és farokgépágyú-lőszerrel a kiinduló tömeg 228 148 kg. A [Boeing 488 000 fontos, 221 353 kg-os felszállótömeg-határa](https://www.boeing.com/defense/fighters-and-bombers/b-52) alatt ez nem marad. A hangár ezért tiltja az indulást és megadja az adott fegyverzethez még választható üzemanyagszázalékot; itt 95%. Az alapérték továbbra is 90%. A határ minden olyan gépnél közös tervezői ellenőrzés, amelynél `maxTakeoffMass` szerepel.

A [MIT B-52 esettanulmánya](https://ocw.mit.edu/courses/16-885j-aircraft-systems-engineering-fall-2004/3ff9e94b5c439382add47c4bd9e5238f_b52_a_1_49.pdf) ismerteti a hatfokos szárnybeállítást és a tandem futómű összefüggését. Ennek közelítésére a B-52 típusfüggő alap-felhajtóerőt kapott, így kis törzs-orremeléssel is felszállhat. A kezdeti és AI-trimelés ugyanazzal az alapértékkel számol. Ez a csökkentett rendű modell nem helyettesít típus szerinti felszállási táblázatot. A 95%-os tankolású, teljes játékbeli bombakészletű gép a változatlan 3200 méteres pályán, kis orremeléssel sérülés nélkül elemelkedik az automatikus próbában.

## Rakéták megjelenése

A hajtóműcsóva korábbi 130 rad/s-os hosszmodulációja megszűnt. A láng folyamatos és a kiégés előtt röviden elhalványul; kiégett hajtómű nem gyulladhat vissza egy hibás alapérték miatt. A rakétatest és a csóva vetített mérete korlátozott, a kamera mögötti részek nem rajzolnak képernyőn átívelő fénycsíkot. A közvetlenül a kamerát keresztező füstszakaszokat elhagyjuk. A fizikai pályát, találatot és vezérlést ez nem változtatja. A konkrét játék közbeni jelenséghez napló nem állt rendelkezésre; a javítás kamera közeli reprodukciós és kiégési próbával ellenőrzött.

## Ellenőrzés

`tests/flight-test-program.test.js`: programválasztás, hat egyedi véges modell, fegyvertelenség, mind a hat felszállása, stabil tartás megszakítása, bal/jobb forduló, sikeres megállás, B-52 tömegkorlát, valamennyi gép egyedi bombás konfigurációjának légellenállása, kioldás és rakéta-kiégés/kamera közeli vetítés. Böngészőben a valódi hangár, az X-29 indítása, mindkét katalógus és a B-52 100%→95% tiltás/engedélyezés ellenőrzött. A `scene=missile-close` grafikus tesztlap a korábbi óriáscsíkot kiváltó közeli geometriát rajzolja.
