// Representative, conservative presets for the named variants; not a complete
// catalogue of every operator/upgrade. Locations are schematic metres (x, z).
// References and intentional simulation simplifications: README armament notes.
const pair=(type,x,z)=>[{type,x:-x,z},{type,x,z}];
const preset=(variant,gun,rounds,aam,stations,agm=null,bomb=null)=>({variant,weapons:{...(gun?{gun:{name:gun,quantity:rounds}}:{}),...(aam?{aam:{name:aam,quantity:stations.filter(s=>s.type==='aam').length}}:{}),...(agm?{agm:{name:agm,quantity:stations.filter(s=>s.type==='agm').length}}:{}),...(bomb?{bomb:{name:bomb,quantity:stations.filter(s=>s.type==='bomb').length}}:{})},stations});
const mixed=(outer,inner,bombX,bombZ=-1)=>[...pair('aam',...outer),...pair('agm',...inner),...pair('bomb',bombX,bombZ)];
const bombBay=()=>Array.from({length:12},(_,i)=>({type:'bomb',x:i%2?.65:-.65,z:3-Math.floor(i/2)*1.2,internal:true}));
export const armaments={
 ...Object.fromEntries(['c130','c130j','il76','il76md90a','y20'].map(id=>[id,{variant:'Fegyvertelen szállító · önvédelmi elterelők',weapons:{},stations:[]} ])),
 harrier:preset('AV-8B II Plus','GAU-12/U · 25 mm',300,'AIM-9M Sidewinder',mixed([4.1,-1.7],[2.9,-1],1.6),'AGM-65F Maverick','Mk 82'),
 t45:preset('T-45C · kiképzési függesztő · kizárólag inert bomba',null,0,null,[{type:'bomb',x:-2,z:.8},{type:'bomb',x:-2,z:0},{type:'bomb',x:-2,z:-.8}],null,'Mk 76 · inert gyakorlóbomba'),
 b52:{...preset('B-52H · klasszikus, farokgépágyús',null,0,null,bombBay(),null,'Mk 82'),tailGun:{name:'M61 · farokgépágyú · 20 mm',quantity:1800}},
 tu95:{...preset('Tu-95 · farokgépágyús',null,0,null,bombBay(),null,'FAB-250'),tailGun:{name:'GSh-23 · farokgépágyú · 23 mm',quantity:1800}},
 f22:preset('F-22A','M61A2 · 20 mm',480,'AIM-120C AMRAAM',[-.8,0,.8].flatMap(x=>[{type:'aam',x:x-.45,z:.7,internal:true},{type:'aam',x:x+.45,z:-1.5,internal:true}])),
 f35:preset('F-35A','GAU-22/A · 25 mm',180,'AIM-120C AMRAAM',[...pair('aam',.65,1),...pair('aam',.65,-1.7)].map(s=>({...s,internal:true}))),
 su35:preset('Su-35S','GSh-30-1 · 30 mm',150,'R-77-1',[...pair('aam',5,-1.5),...pair('aam',3.9,-.6),...pair('agm',2.8,-1),...pair('bomb',1.1,-2)],'Kh-29L','FAB-250'),
 su57:preset('Su-57E','9A1-4071K · 30 mm',150,'RVV-SDM',[...pair('aam',.55,1.6),...pair('aam',.55,-2)].map(s=>({...s,internal:true}))),
 j10:preset('J-10C','Type 23-3 · 23 mm',200,'PL-15',[...pair('aam',3.2,-2.3),...pair('aam',2,-1.6)]),
 j20:preset('J-20',null,0,'PL-15',[...pair('aam',.5,1.2),...pair('aam',.5,-1.5)].map(s=>({...s,internal:true}))),
 f14:preset('F-14A','M61A1 · 20 mm',675,'AIM-7M Sparrow',[...pair('aam',.55,1),...pair('aam',.55,-3),...pair('bomb',2.4,-1)],null,'Mk 82'),
 f15:preset('F-15C','M61A1 · 20 mm',940,'AIM-7M Sparrow',[...pair('aam',1.3,1),...pair('aam',1.3,-3)]),
 f16:preset('F-16C','M61A1 · 20 mm',511,'AIM-9M Sidewinder',mixed([4.65,-1.5],[3,-1],1.8),'AGM-65D Maverick','Mk 82'),
 fa18:preset('F/A-18C','M61A1 · 20 mm',578,'AIM-9M Sidewinder',mixed([5.6,-1.7],[3.7,-1],2.3),'AGM-65F Maverick','Mk 82'),
 mirage:preset('Mirage 2000C','DEFA 554 · 30 mm',250,'R550 Magic II',[...pair('aam',3.4,-3),...pair('bomb',1.8,-1)],null,'Mk 82'),
 rafale:preset('Rafale C','30 M 791 · 30 mm',125,'MICA IR',[...pair('aam',5.3,-3.5),...pair('bomb',2.5,-1.5)],null,'Mk 82-EP'),
 euro:preset('Typhoon FGR4','BK-27 · 27 mm',150,'AIM-120 AMRAAM',[...pair('aam',1,-1),...pair('agm',2.4,-1)],'Brimstone'),
 gripen:preset('JAS 39C','BK-27 · 27 mm',120,'AIM-9L Sidewinder',mixed([4.2,-2.7],[2.8,-1.5],1.6),'AGM-65 Maverick','Mk 82'),
 f4:preset('F-4E','M61A1 · 20 mm',640,'AIM-7E Sparrow',[...pair('aam',.7,1),...pair('aam',.7,-3),...pair('bomb',3,-1)],null,'Mk 82'),
 f15e:preset('F-15E','M61A1 · 20 mm',500,'AIM-120 AMRAAM',mixed([3.4,-1],[2.7,-2],1.4),'AGM-65D Maverick','Mk 82'),
 tornado:preset('Tornado IDS','2 × BK-27 · 27 mm',360,'AIM-9L Sidewinder',[...pair('aam',3.4,-1),...pair('bomb',.6,-1)],null,'Mk 82'),
 a10:preset('A-10A','GAU-8/A · 30 mm',1174,'AIM-9M Sidewinder',mixed([7.8,-1],[5.5,0],2.4,0),'AGM-65D Maverick','Mk 82'),
 mig25:preset('MiG-25PD',null,0,'R-40',[...pair('aam',3.2,-1),...pair('aam',4.8,-2)]),
 mig31:preset('MiG-31B','GSh-6-23 · 23 mm',260,'R-33',[...pair('aam',.6,1),...pair('aam',.6,-3)]),
 su27:preset('Su-27S','GSh-30-1 · 30 mm',150,'R-73',[...pair('aam',7,-2),...pair('aam',5,-1)]),
 mig29:preset('MiG-29A','GSh-30-1 · 30 mm',150,'R-73',[...pair('aam',4.8,-2),...pair('aam',3.5,-1),...pair('bomb',2.3,0)],null,'FAB-250'),
 su24:preset('Su-24M','GSh-6-23M · 23 mm',500,'R-60M',[...pair('aam',2.6,-1),...pair('agm',4,-1),...pair('bomb',.7,-1)],'Kh-29L','FAB-250'),
 mig27:preset('MiG-27K','GSh-6-30 · 30 mm',260,'R-60M',[...pair('aam',1.6,-2.5),...pair('agm',2.8,-.5),...pair('bomb',.65,-2)],'Kh-29L','FAB-250'),
 su25:preset('Su-25','GSh-30-2 · 30 mm',250,'R-60M',mixed([6.5,-1],[4.5,0],2.5,0),'Kh-25ML','FAB-250')
};
export const weaponKeys={gun:'1',aam:'2',agm:'3',bomb:'4'};
export function armament(spec){const p=spec.configuredArmament||armaments[spec.id];if(!p)throw new Error(`Missing armament: ${spec.id}`);return p;}
export function weaponAvailable(s,type){return !!armament(s.spec).weapons[type]&&s.ammo[type]>0;}
export function weaponLabel(s,type){return armament(s.spec).weapons[type]?.name||'NINCS FELSZERELVE';}
export function loadedStations(s){const p=armament(s.spec),used={};return p.stations.map((station,index)=>{const spent=p.weapons[station.type].quantity-s.ammo[station.type];const ordinal=used[station.type]||0;used[station.type]=ordinal+1;return {...station,index,loaded:ordinal>=spent};});}
export function nextStation(s,type){return loadedStations(s).find(station=>station.type===type&&station.loaded);}
