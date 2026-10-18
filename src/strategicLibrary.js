import {missions} from './missionCatalog.js';
const delay=missions.find(m=>m.id==='ballistic').launchDelay;
const reference={title:'GAO · rakéták hatótáv szerinti osztályozása',url:'https://www.gao.gov/assets/a278947.html'};
const context='Az interkontinentális rakéta (ICBM) a ballisztikus rakéták egyik kategóriája; a valós besorolás 5500 km fölötti hatótávhoz kötött. A játék rövid térképre sűrített, fiktív küldetést használ: az útvonal, az idő és a repülési paraméterek nem egy valós ICBM teljesítményadatai.';
export const strategicArticles={
 'ballistic-silo':{
  rows:[['Indítási határidő',`${delay/60} perc küldetésidő az indulástól`],['Indítások száma','Egy rakéta'],['Célpont','A játékos saját repülőtere'],['Védelem a küldetésben','Külön jelzavaró és ellenséges vadászgép'],['Ajánlott fegyver','Levegő–föld rakéta vagy bomba']],
  sections:[
   {title:'Mi ez?',paragraphs:['Megerősített, helyhez kötött interkontinentális rakétasiló, külön kiszolgálóépülettel. A földi objektumot és a kilövés után megjelenő rakétát a játék két külön célként kezeli.']},
   {title:'Hogyan működik a küldetésben?',paragraphs:[`Ha a siló ${delay/60} perc elteltével még áll, egyetlen rakétát indít a saját bázisod ellen. A visszaszámlálás küldetésidő: a repülés közbeni hazatérés vagy újratöltés nem indítja újra. A szünetben az idő megáll. A siló kilövés előtti megsemmisítése megakadályozza az indítást.`, 'Az ellenséges vadász és a jelzavaró külön egység. A siló önmagában nem lő rád légvédelmi rakétát vagy gépágyút. A zavarózónán kívül közvetlenül is kijelölheted a silót; nem kötelező előbb minden védőt megsemmisíteni.']},
   {title:'Mivel támadd?',paragraphs:['Elsősorban földi cél elleni rakétával vagy bombával. A gépágyú is károsítja, de több találat kell a megerősített objektumhoz. Levegő–levegő rakétát a silóra nem indíthatsz. A jelzavaró hatókörében irányított rakétaindítás nincs; kézzel célzott bomba vagy gépágyú használható, illetve ki lehet repülni a zónából.']},
   {title:'Kilövés után',paragraphs:['A már elindított rakétát a siló lerombolása nem tünteti el. Ekkor a levegőben lévő rakétát kell elfogni. A küldetéshez a saját bázisnak túl kell élnie, végül haza kell térned és biztonságosan le kell szállnod.']},
   {title:'Valós elnevezés és játékmodell',paragraphs:[context]}
  ],related:['ballistic','jammer','guide-ground-object','guide-jamming','weapon-maverick'],reference
 },
 ballistic:{
  rows:[['Elnevezés','Interkontinentális rakéta · ICBM'],['Eredet','Az interkontinentális rakétasiló indítja'],['Hajtott szakasz (játék)','3 másodperces, sűrített indítási ív'],['Sebesség alakulása','3300 m/s-ról indul; a hajtott és szabadeső szakaszban változik'],['Indítás utáni viselkedés','Önálló légi célpont; a siló állapotától független'],['Ajánlott elhárítás','Elsősorban az indítás megakadályozása']],
  sections:[
   {title:'Mi ez?',paragraphs:['A silóból induló, nagyon gyors stratégiai rakéta. A játékban külön befogható és sérülő légi egység, saját mozgással és találatkezeléssel. A rövid hajtott indítási ív után a játék gravitációval számolt pályán vezeti a saját bázisod felé.']},
   {title:'Mit jelent a fenyegetés?',paragraphs:['A rakéta a repülőteredet támadja, nem a vadászgépedre vezérelt légiharc-rakéta. A siló megsemmisítése kilövés után már nem állítja meg. Bázisba csapódása elbukja a kötelező védelmi célt. A legbiztosabb megoldás a silót még a visszaszámlálás vége előtt megsemmisíteni.']},
   {title:'Hogyan foghatod el a játékban?',paragraphs:['Ha a rakéta a saját radarod hatótávján és látókúpján belül van, T/Tab-bal kijelölheted, majd befoghatod. A levegő–levegő rakéta indításához nagyon közeli, gyorsan záródó szembetalálkozás és megfelelő indítási helyzet kell. Kövesd az aktuális fegyver lőtáv- és indíthatósági jelzését.', 'Hátulról üldözve a fegyvered nem éri utol. A befogás önmagában nem jelent biztos találatot. A gépágyú közvetlen lövedéktalálata is károsíthatja, de az apró cél és a rendkívüli sebesség miatt ez nagyon nehéz. Levegő–föld rakétát nem indíthatsz rá; a bomba sem követi a légi célt.']},
   {title:'Mi nem állítja meg?',paragraphs:['Az infracsapda és a dipólköteg a gépedre indított követő rakéták ellen való; ezt a bázis felé repülő célpontot nem tereli el. A siló utólagos elpusztítása és a védők lelövése sem törli a már elindult rakétát.']},
   {title:'Valós elnevezés és játékmodell',paragraphs:[context,'A vadászgépes, közeli légiharc-rakétás elfogás itt játékszabály, nem valós ICBM-elhárítási eljárás.']}
  ],related:['ballistic-silo','guide-intercept','guide-aiming','guide-air-combat'],reference
 }
};
