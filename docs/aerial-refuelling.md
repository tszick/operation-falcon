# Légiutántöltés

TOP-GUN nehézségű küldetés az Arab-sivatagban. Mindkét oldal levegőből indul; a pályán nincs repülőtér és nem kell leszállni.

## Nyugati oldal

A játékos 12% üzemanyaggal indul. A TEXACO ONE KC–135R a szemközti oldalról érkezik, majd köröz. Egy ellenséges vadász és három légvédelmi üteg veszélyezteti.

Kötelező: a saját tartálykapacitás legalább 50%-ának megfelelő üzemanyagot átvenni, és megsemmisíteni az ellenséges vadászt. Opcionális: minden üteget megsemmisíteni, és a tankert életben tartani a győzelemig. Ha a tanker a szükséges átadás előtt megsemmisül, a küldetés sikertelen.

## Keleti oldal

A játékos a támadó vadászt vezeti, három baráti légvédelmi üteg támogatja. Kötelező a nyugati tanker megsemmisítése. Opcionális a nyugati vadász lelövése és mindhárom üteg megőrzése. A nyugati AI-vadász ugyanazzal a kontaktzónával és üzemanyag-átadási szabállyal tankol, mint a játékos.

## Tankolás

Az **I** gomb kapcsolja a lila megközelítési segédívet a játéktéren és a radaron. A tanker mögötti egyenes szakaszra vezet, a mozgó tankerrel együtt változik. Kezdetben kikapcsolt; nem robotpilóta, a sebességet és a helyzetet a játékos tartja.

- A tanker névleges magassága 2200 m MSL, valós légsebessége 558 km/h. Az IAS ennél kisebb; a szél a talajsebességet is módosítja.
- A türkiz jelzés a tanker mögött 48 méterre, alatta 6 méterre mutatja a kontaktpontot.
- Futómű, fékszárny, légfék és utánégető legyen kikapcsolva.
- Legfeljebb 9 m eltérés, 6 m/s relatív sebesség, 10° irányeltérés és 12° relatív bedöntés engedett. A tanker legfeljebb 30°-os bedöntéssel tankolható.
- Öt másodperc stabil helyzet után automatikus az átadás, 30 kg/s játékbeli sebességgel. Kilépéskor megszakad; az addig átvett üzemanyag megmarad.
- A tanker átadható készlete véges, 18 000 kg. A fogadó tartálya nem tölthető túl; az új üzemanyag ténylegesen növeli a repülési tömeget.

A Mission Control irányt, távolságot, közelítési sebességet és kontaktállapotot mutat. A napló rögzíti az átadást és a csatlakozási eseményeket.

## Modell és egyszerűsítések

A KC–135R külön négysugárhajtóműves modellt kapott. Nincs támadófegyvere, csak véges infracsapda- és dipólkészlete. Méret- és repülési adatainak forrása: [US Air Force KC–135 Stratotanker fact sheet](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104524/kc-135-stratotanker/).

A kontaktzóna és az átadási sebesség játékhoz egyszerűsített. A rendszer mindkét fogadócsatlakozási elvű vadászgépet kezeli; nem típusminősített tankolási eljárás. A földrajzi elhelyezés és a harci helyzet kitalált.

## Ellenőrzés

Automatizált tesztek ellenőrzik mindkét oldal céljait, a repülőtér hiányát, a kontaktfeltételeket, a tömeg és az üzemanyag megmaradását, az AI tényleges fizikai megközelítését és tankolását, valamint a sikeres és sikertelen lezárásokat. A böngészős ellenőrzés hang nélkül történik.
