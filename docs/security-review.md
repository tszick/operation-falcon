# Biztonsági áttekintés

A vizsgálat a jelenlegi forrásra és a helyi Node-kiszolgálóra vonatkozik. A GitHub CodeQL futási eredménye külön, a feltöltött commit elemzéséből származik; helyi teszt nem jelent CodeQL-futtatást vagy sérülékenységmentességi garanciát.

## Javított problémák

| Terület                  | Korábbi kockázat                                                         | Javítás / ellenőrzés                                                                                    |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Statikus fájlkiszolgálás | A repó gyökerének fájljai, köztük `.git`, nem voltak megfelelően elzárva | Engedélyezett könyvtárak és kiterjesztések; belső és ponttal kezdődő útvonalelemek tiltása              |
| Útvonalak és symlinkek   | Szöveges prefixellenőrzés nem elég a gyökéren belül tartáshoz            | Kanonikus `realpath`, `path.relative`, és a kanonikus cél engedélyezett útvonalának ismételt vizsgálata |
| Helyi HTTP-felület       | Tetszőleges Host, kevés böngészős védőfejléc                             | Loopback bind, Host-whitelist, GET/HEAD, időkorlátok, CSP, nosniff, same-origin erőforrások             |
| HTML-szöveg              | Több helyen másolt escape függvény                                       | Egy közös, tesztelt primitív; nincs eval vagy dinamikus Function a kódban                               |
| Hibás helyi tárolás      | Üres catch blokkok                                                       | Eredményt/alapértéket adó tárolóadapter és teszt                                                        |
| GPU életciklus           | Másolt fordító, fordítási hibánál hiányos felszabadítás                  | Egyetlen, sikeres és hibás úton is tesztelt erőforrás-kezelés                                           |
| Ellátási lánc            | Nem volt lockfájl és automatikus ellenőrzés                              | Pontos dev-verziók, npm lock, audit, Dependabot és commitra rögzített Actions                           |

## CSP és diagnosztikai oldalak

A normál alkalmazás `script-src 'self'` szabályt kap, eval és inline JavaScript nélkül. A `tests/` diagnosztikai HTML-oldalak meglévő, helyi inline moduljai miatt csak ezen a fejlesztői útvonalon engedélyezett az inline script. Ez szándékos, külön tesztelt eltérés; éles statikus tárhelyen a tesztoldalakat nem szükséges publikálni. A stílusoknál az inline stílusok a műszerfal dinamikus perspektivikus elhelyezéséhez szükségesek.

A média helyi `assets` fájlokból jön. Nincs beépített, külső AI-inferencia vagy automatikus naplófeltöltés. A statikus kiszolgáló szabályai nem helyettesítik egy éles tárhely HTTPS-, hozzáférés- és fejléckonfigurációját.

## Automatizálás

A quality workflow a Node 24 LTS és 26 stabil ág friss patchverzióján fut. A CodeQL JavaScript/TypeScript, Python és GitHub Actions forrásokat vizsgál `security-extended` lekérdezésekkel. A Dependabot npm- és Actions-frissítéseket kér; nincs automatikus összeolvasztás. Az órákat és az aktiválás feltételeit a README tartalmazza.

## Hatókör és korlát

A tesztek konkrét regressziókat zárnak ki, nem bizonyítják minden támadás hiányát. A közös modulokra bontás és a formázás nem egy teljes szimulátormotor újraírása: a meglévő, ellenőrzött szabályokat tartja meg. Egy jövőbeli külső adatimportot, felhasználói tartalmat, hálózati többjátékos funkciót vagy publikus backend API-t külön fenyegetési modellel kell tervezni.

## Helyi eredmény — 2026. október 21.

- Node.js 26.12.0: teljes `npm run verify` sikeres, 606/606 teszt, kihagyás nélkül.
- ESLint, teljes JS/MJS szintaxisellenőrzés és Prettier-ellenőrzés sikeres.
- npm audit: 0 ismert sérülékenység a rögzített függőségi fában.
- Heurisztikus privátkulcs-/ismert API-token-mintakeresés a követett munkafájlokon: nincs találat; ez nem teljes Git-történeti titokkeresés.
- A védett szerver külön helyi portján a hangár és a WebGL2 tengeri kabinpróba betöltött; CSP- vagy JavaScript-konzolhiba nem jelent meg. A hang nélküli leszállási próba a feltöltött állapotig eljutott.
- CodeQL-konfiguráció elkészült; távoli CodeQL-futtatást vagy GitHub repóbeállítás-módosítást ez a helyi ellenőrzés nem állít.
