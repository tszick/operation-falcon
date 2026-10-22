# Tengeri táj és navigáció

A tengeri küldetés indításakor a `terrainWorld.islands` a generált szigeteket, a `skySeed` a statikus felhők elrendezését tárolja. Ezek a repülési napló terep-pillanatképének részei, ezért az aktuális küldetés és a visszajátszás ugyanazt a tájat használja. A szárazföldi küldetések is kapnak saját felhőmagot.

A szigetvilág 8 km-es, véletlenszerűen eltolt rácson tölti ki a központi ±72 km-es repülési területet. A szigetek félátmérője 450–1700 méter körüli, magasságuk 35–275 méter, alakjuk elforgatott és hullámos partvonalú. Az anyahajó felszállási és leszállási folyosója, valamint a romboló indulási helye szabad víz marad.

A szárazföld homokos árnyalatot és dűnés felületi textúrát kap. A parttól kifelé türkiz, majd fokozatosan mélykék és átlátszó sekélyvízi sáv húzódik; a tengerszint mindenhol azonos. A negatív part menti csúcsmagasság a kirajzolás mélységjelölése, a repülés fizikája a vízfelszínnél 0 métert használ. A sziget szárazföldi magasságát a látható háromszögekből interpoláljuk, így a fizikai és a kirajzolt talajszint egyezik.

A WebGPU és a WebGL ugyanazokat a szigetcsúcsokat és partközeli árnyalást használja. A végtelen tenger továbbra is az égbolt/horizont rétegben készül; a vízszintes nyíltvíz-háló nem fest rá véges kék négyzetet. A szigetek mélységmaszkja a hajókat és gépeket is helyesen takarja. A CPU tartalékmód ugyanazt a geometriát használja egyszerűbb színezéssel. A közeli, 36 km sugarú szigetháló gyorsítótárazott; a tengeri terep ablaka nagyobb, 3 km-es lépésekben vált, és nem minden képkockán épül újra.

A romboló a szigeteket biztonsági sugárral kibővített akadályoknak tekinti. A `planSeaRoute` láthatósági gráfon keres járható kerülőt a célja felé. A hajó korlátozott sebességgel fordul; a következő mozgásszakaszt külön ellenőrzés védi a partra futástól. Ha nincs járható szakasz, a hajó megáll, nem halad át szárazföldön. Az útvonal a hajóhoz és terepverzióhoz gyorsítótárazott; az állapotfrissítés és a fegyverek a valódi hajópozíciót használják.

A bárányfelhők puha, áttetsző, egyszer generált képi maszkok. Elrendezésük a teljes égbolton véletlenszerű, de a küldetésen belül állandó; nem mozognak és nincs fizikai ütközési modelljük. Nappali, sivatagi, havas, naplementés és éjszakai színpalettájuk a tájhoz igazodik. A képkockák csak a kész képeket rajzolják ki, új Canvas2D motor vagy hálózati képletöltés nélkül.

A magasságmező az eredeti HUD-megjelenést használja. A radar a szigetek és sekélyvizek körvonalát is mutatja.
