export const unitTypes={
 airbase:{name:'Repülőtér',category:'Nem tüzelő objektum',kind:'ground',weapons:[],health:240,description:'Kifutópálya, hangárok és irányítótorony. Önmagában nem tüzel; külön védelmi egységek oltalmazhatják.',role:'Stratégiai objektum',size:'720 m-es célterület'},
 bridge:{name:'Híd',category:'Nem tüzelő objektum',kind:'ground',weapons:[],health:100,description:'Folyón átvezető közúti átkelő. Megsemmisítésével a közeledő konvoj útja elvágható.',role:'Útvonal lezárása',size:'A folyó szélességéhez igazodik'},
 bunker:{name:'Bunker',category:'Tüzelő objektum',kind:'ground',weapons:['gun'],health:140,description:'Megerősített, lapos kupolás állás. Közeli légi és földi célokra gépágyúval tüzel.',role:'Területvédelem',size:'74 m széles tető'},
 fighter:{name:'Vadászgép',category:'Tüzelő egység',kind:'air',weapons:['missile','gun'],description:'Rakétával és a saját géptípusának megfelelő gépágyúval küzd. Az ellenfél típusa a választott géphez igazodik.',role:'Légi elfogás',speed:165},
 bomber:{name:'Bombázó',category:'Tüzelő egység',kind:'air',weapons:['bomb','gun'],description:'A kijelölt objektum felé repül, majd valódi ballisztikus bombákat old. Védő gépágyúja a közeli repülőkre veszélyes.',role:'Objektumok támadása',speed:145},
 transport:{name:'Szállítógép',category:'Nem tüzelő egység',kind:'air',weapons:[],description:'Fegyvertelen szállító. Kísérni és megvédeni kell, amíg elhagyja a műveleti légteret.',role:'Védendő szövetséges',speed:125},
 convoy:{name:'Konvoj',category:'Tüzelő egység',kind:'ground',weapons:['flak','gun'],health:110,description:'Öt teherautó az úton halad. Légvédelmi gránáttal és gépágyúval védekezik; támadó feladatban a bázis közelében tüzet nyit.',role:'Mozgó földi egység',speed:14},
 sam:{name:'Légvédelmi üteg',category:'Tüzelő egység',kind:'ground',weapons:['flak','gun'],health:90,description:'Magasabban repülő célra időzített légvédelmi gránátokat, alacsony célra rövid gépágyúsorozatokat lő.',role:'Közeli légvédelem',size:'Kb. 20 m-es állás'},
 'sam-system':{name:'Légvédelmi rakétarendszer',category:'Tüzelő egység',kind:'ground',weapons:['missile','gun'],health:90,description:'Teherautó és függőleges rakétaindító. Követő rakétákkal és közeli gépágyúval védi a kijelölt területet.',role:'Rakétás légvédelem',size:'Kb. 30 m-es telepítés'},
 jammer:{name:'Jelzavaró',category:'Zavaró ellenség',kind:'ground',weapons:['jammer'],health:65,description:'7 km sugarú körben letiltja az ellenséges navigációt és a célbefogást. Kívülről a többi aktív védővel együtt kijelölhető.',role:'Radar / GPS zavarás',range:7000},
 civil:{name:'Civil repülő',category:'Nem támadó repülő',kind:'air',weapons:[],description:'Tilos megtámadni. A békés befogás után visszafordul és elhagyja a légteret.',role:'Békés elfogás',speed:120}
};
export const unitDefinition=type=>unitTypes[type]||{name:type,kind:'ground',weapons:[],health:100};
export const teamOf=(t,s)=>t===s?'ally':t.team||((t.civilian||t.faction==='neutral')?'neutral':t.faction===s?.spec?.faction?'ally':'enemy');
export const isHostile=(t,s)=>teamOf(t,s)==='enemy';
export const isActiveDefender=t=>t.alive&&t.type==='jammer'||t.alive&&(t.threats||unitDefinition(t.type).weapons).some(w=>w!=='jammer');
