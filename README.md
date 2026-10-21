# Operation Falcon: Redline

Böngészős repülőszimulátor magyar kezelőfelülettel, 120 Hz-es repülésfizikával, küldetésekkel és helyben futó gépi ellenfelekkel. A 3D világ WebGL 2-vel, a HUD és a műszerfal Canvas/DOM réteggel jelenik meg. A játékhoz nincs külső futásidejű npm-függőség vagy felhős AI-szolgáltatás; a rádiófelvételek helyi fájlok.

## Indítás

Az elsődleges fejlesztői verzió **Node.js 26.12.0**, az `.nvmrc` szerint. A támogatott LTS ág **24.22.0 vagy újabb 24.x**. A CI mindkét ágat a legfrissebb elérhető javítóverzióval ellenőrzi.

```sh
npm ci --ignore-scripts
npm start
```

A játék: [localhost:5173](http://localhost:5173). Más portot a `PORT` környezeti változóval lehet megadni. A szerver kizárólag `127.0.0.1`-en hallgatózik; nem publikus éles webszerver. A fejlesztői csomagok a kódellenőrzéshez kellenek, nem kerülnek a böngészőbe.

## Fejlesztés és ellenőrzés

```sh
npm run verify       # teljes szintaxis, lint, formázás és minden Node-teszt
npm run format       # egységes Prettier formázás
npm run lint         # ESLint, hibát jelent a holt változókra/importokra is
npm audit            # közvetlen és tranzitív fejlesztői csomagok ellenőrzése
```

A `check` minden JS/MJS forrást ellenőriz, nem csak a belépőfájlt. Az architektúratesztek ellenőrzik az importok feloldhatóságát, a körkörös függőségek hiányát, valamint a harci és shader-életciklus modulok DOM-függetlenségét. A fizikát és a játékmenetet külön regressziós tesztek fedik le.

A böngészős próbák a `tests/*.html` oldalakon érhetők el, például `/tests/naval-cockpit.html` és `/tests/mission-performance.html`. Ezek fejlesztői diagnosztikai oldalak. FPS-t csak érvényes frissítési ütem mellett mérj; háttérbe tett lap lassítása nem hardverteljesítmény-mérés. A rádiógeneráló offline eszközök a `scripts/` mappában vannak; generálás után futtasd a formázást és ellenőrzést.

## Játékszabályok és kézikönyv

Az aktuális irányítás, küldetések, gépek, fegyverek és célkorlátozások a játékbeli **Egységtárban** (`/encyclopedia.html`) olvashatók. A [pilótaútmutató](tutorial.html) nyomtatható leírás. A részletes küldetéslistát és a fegyverzetet a hangár az élő adatmodellekből állítja össze.

A repülési napló csak az aktuális küldetést tárolja a böngésző IndexedDB-adatbázisában. Új küldetés lecseréli; a JSON-export a `/flight-log.html` oldalon tölthető le. A napló és a kiértékelés helyben marad. Ne tegyél személyes adatot vagy naplót nyilvános hibajegybe.

## Automatikus ellenőrzések GitHubon

A workflow-k pushra, pull requestre és kézi indításra is futnak. Esti ütemezés **Europe/Budapest** időzónában, a nyári/téli időszámítást követve:

| Ellenőrzés                            | Tervezett idő |
| ------------------------------------- | ------------- |
| Teljes minőségellenőrzés és npm audit | 22:15         |
| Dependabot npm-verziófrissítések      | 22:30         |
| Dependabot GitHub Actions-frissítések | 22:40         |
| CodeQL: JavaScript, Python és Actions | 22:45         |

A Dependabot külön szolgáltatás, nem saját Actions-lépés. Az Actions-hivatkozások teljes commitazonosítóhoz vannak rögzítve, módosításukra a Dependabot tesz javaslatot. A workflow-k minimális tokenjogosultságot és időkorlátot használnak; nincs automatikus merge vagy publish.

Az ütemezések a workflow-fájlok **alapértelmezett ágra történő feltöltése után** működnek, ha az Actions és a code scanning engedélyezett. Meglévő CodeQL default setup mellett az advanced workflow használatához a beállításokat is egyeztetni kell. A GitHub késleltetheti az ütemezett futást, és inaktív publikus repóban letilthatja azt. A Dependabot alerts/automatikus security update külön repóbeállítás; a verziófrissítési konfiguráció nem kapcsolja be helyettük ezeket.

## Felépítés és biztonság

- [Architektúra és réteghatárok](docs/architecture.md)
- [Biztonsági áttekintés és helyi ellenőrzések](docs/security-review.md)
- [Vulnerabilitás bejelentése](.github/SECURITY.md)
- [Archivált fejlesztési feljegyzések](docs/archive/development-notes.md)

A WebGL 2 böngésző-API: nem npm-csomagként frissül. A böngésző és a videóillesztő frissítése adja a legújabb implementációt. A WebGPU külön API, ezért nem része egy WebGL-verziófrissítésnek.
