# Felhők fordulás közben és teljesítmény

A képernyőre vetített világvízszintes iránya `atan2(right.y, up.y)`. A korábbi negatív előjel a felhőképeket a tereppel ellentétes irányba forgatta. A bárányfelhők és a téli páraréteg most ugyanazt a helyes szöget használják. A felhők küldetésen belüli égi pozíciója továbbra is állandó.

A felhők raszterezése korábban az első láthatóságkor, az animáció fő szálán történt. Egy közös modul-worker most mind a négy bárányfelhő-változatot és a téli páraréteget háttérben készíti el. A képkocka csak a kész, gyorsítótárazott képet használja. Forduláskor egy újonnan látható változat így nem indít hosszú szinkron raszterezést.

## Helyi összehasonlítás, 2026-10-22

1600×900 WebGPU, 60 bemelegítő és 240 mért képkocka, civil gyakorló, folyamatos irány- és bedöntésváltozás, rögzített fizikai helyzet. Ez renderelési próba; nem mér teljes harci szimulációt.

| Mérés                      | Javítás előtt | Javítás után |
| -------------------------- | ------------: | -----------: |
| Égbolt induláskori maximum |         37 ms |         1 ms |
| Égbolt medián              |        0,2 ms |       0,2 ms |
| Képkockaköz medián         |       16,4 ms |      16,4 ms |
| Műszerréteg medián         |        0,4 ms |       0,5 ms |

A korábbi kabinképpel a műszerréteg mediánja 0,6 ms volt; ebben a mintában az új statikus kép nem okozott mérhető többletet. Műszerréteg nélkül annak mért ideje 0 ms, de időnkénti világ-renderelési tüskék akkor is előfordultak. Ebből a mérésből nem állítható, hogy a teljes játék minden lehetséges akadását a felhők okozták.

Ismétlés: `/tests/graphics-regression.html?mission=civil&scene=sky&surface=grass&turn=1&benchmark=1`. Kontrollkapcsolók: `clouds=off`, `frame=old`, `instruments=off`. A kiírás külön mutatja az égbolt, világ, műszerek és teljes képkocka idejét.

## Civil gyakorló lezárása

A kötelező feladatok a sértetlen civil gép sikeres befogása és a saját gép biztonságos leszállása/megállása. A civil ezt követő, autonóm kivonulását nem kell a földön kivárni; a játék nem számolja hiányzó feladatnak és nem szervizeli új bevetésre a játékost. Befogás nélküli visszatérés nem ad sikert, a civil sérülése továbbra is sikertelenség. A harci küldetések közbeni általános újrafeltöltés szabálya megmarad.
