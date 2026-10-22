# Általános kigurulás és ütközések

A kigurulási tűrés a közös `landing.js` és `physics.js` része. Minden szárazföldi küldetésen és mindkét oldalon működik, a saját repülőtér helyi koordinátáiban, elforgatott és távoli pályán is. Csak egy túlélt, pályán történt földetérés után érvényes; a pályán kívüli földetérést nem teszi szabályossá. Az anyahajó fedélzete nem kap szárazföldi vállat.

A megengedett oldalirányú és hosszirányú távolság a pillanatnyi vízszintes talajsebességtől függ. A sarokterület ellipszissel korlátozott, így nem adódik össze a teljes oldalsó és hosszirányú engedmény.

| Talajsebesség         | Pályaszél mellett | Pályavégen túl |
| --------------------- | ----------------: | -------------: |
| 72 km/h vagy kevesebb |             120 m |          300 m |
| 180 km/h              |            44,6 m |        108,1 m |
| 288 km/h              |            10,3 m |         20,8 m |
| 324 km/h vagy több    |               8 m |           15 m |

A tűrésen kívüli kigurulás kis sebességnél is végzetes; a terület véges. A pályán kívüli többlet gördülési ellenállás és a pályaszéli figyelmeztetés megmarad. A megengedett területen belül is végzetes a fizikai objektummal való ütközés.

Az `aircraftCollisions.js` a közös fegyver- és harcfrissítésben fut minden küldetésnél. A játékos és az AI, barát és ellenség egyaránt ütközhet. Gyors mozgásnál az előző és aktuális pozíció közötti mozgásszakaszt vizsgálja; a repülő középpontja, orra, farka, felső része és szárnyszélei a másik modell háromszögeivel ütköznek. Ez játékbeli geometriai közelítés, nem merevtest-szimuláció. A földi modellek valódi felületeit használja, nem a teljes repülőteret vagy a hajó felépítménye körüli üres térfogatot tekinti tömör akadálynak. A meglévő lövedék-találati geometria változatlan marad.

Légi ütközéskor mindkét gép végzetes szerkezeti sérülést kap, megtartja a mozgását, és a közös sérülési fizikával zuhan tovább a becsapódásig. Földi helyzetben az ütköző gép azonnal elveszik. Objektumba repüléskor a gép végzetesen sérül, az objektumra pedig a relatív sebesség és a gép tömegéből számított mozgási energia hat. A játékbeli sebzés `energia / 2 000 000`, 5 és 400 életerőpont között. A teherautóhoz hasonló kis cél elpusztulhat, a nagy objektum a megmaradt életerejével tovább működik; a város külön épületei önálló célok. Ha az objektum életereje elfogy, megsemmisül és robbanás keletkezik.

Az ütközés és a kölcsönös találat naplózott esemény. Egy gép ugyanarra az objektumra nem okoz minden képkockán újabb ütközési sebzést. A távoli objektumokat és géppárokat egyszerű térbeli előszűrés kihagyja; a változatlan földi modellek befoglaló dobozait és háromszögeit gyorsítótár őrzi.
