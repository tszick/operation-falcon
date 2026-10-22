# Futópályák megjelenése

A szárazföldi repterek közös `renderAirfield` megjelenítést használnak: aszfalt, valódi szélességű, kitöltött fehér szél- és középvonal, kétirányú küszöbjelölések és célzópontok. A felfestések a burkolat fölötti külön hálóban vannak; nem kapnak zöld vektorkontúrt vagy betontextúrát. A pálya fizikai mérete és a leszállási szabályok nem változtak.

A kis mélységtesztelt lámpatestek 60 méterenként kerülnek a pálya szélén kívülre. A két vég közelében sárga figyelmeztető fényeket, a küszöböknél a nézési iránytól függő zöld/piros sort használnak. A halók éjszaka erősebbek, nappal visszafogottak; a terep mögötti és túl távoli fények nem kapnak halót. A navigáció zavarása nem kapcsolja le a fizikai pályafényeket.

Éjszakai ellenőrzés: `ballistic` küldetés, Közép-Ázsia. Ismételhető böngészős nézetek: `/tests/graphics-regression.html?mission=ballistic&scene=runway&lang=hu` és `scene=runway-approach`. Nappali ellenőrzés: `mission=canyon&scene=runway`.
