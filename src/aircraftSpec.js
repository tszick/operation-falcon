import {harrier} from './navalData.js';
import {trainingAircraft,isPracticeMission} from './trainingAircraft.js';
export {trainingAircraft} from './trainingAircraft.js';
export const missionAircraftChoices=m=>m.naval?['fa18','f14','harrier'].map(id=>aircraft.find(a=>a.id===id)):isPracticeMission(m)?[trainingAircraft]:['escort-transport','iron-veil'].includes(m.objective)?[...aircraft,...transportAircraft]:aircraft;
export {transportAircraft} from './heavyAircraftData.js';
import {aiAircraft,transportAircraft} from './heavyAircraftData.js';
// Approximate gameplay data in SI units; not certified aircraft performance.
import {armament} from './armament.js';
const rows=[
['f14','F-14 Tomcat','west','Elfogó',19800,9000,249000,108,7.5,2.34,18000,140000,['radar','aam'],'swept'],
['f15','F-15 Eagle','west','Légiuralmi',12700,6100,211000,56.5,9,2.5,19800,160000,['radar','aam','agility'],'twin'],
['f16','F-16 Fighting Falcon','west','Többcélú',8570,3200,129000,27.9,9,2,15200,90000,['aam','agility','agm','bomb'],'delta'],
['fa18','F/A-18 Hornet','west','Többcélú',10400,4900,158000,38,7.5,1.8,15000,100000,['aam','agm','bomb','precision'],'twin'],
['mirage','Mirage 2000','west','Többcélú',7500,3200,95000,41,9,2.2,17000,100000,['aam','agility','bomb'],'delta'],
['rafale','Dassault Rafale','west','Többcélú',9900,4700,150000,45.7,9,1.8,16000,140000,['aam','agm','precision','bomb','agility'],'delta'],
['euro','Eurofighter Typhoon','west','Többcélú',11000,5000,180000,51.2,9,2,18000,160000,['aam','agility','bomb','precision'],'delta'],
['gripen','JAS 39 Gripen','west','Többcélú',6800,2400,80000,30,9,2,15200,100000,['aam','agm','bomb','precision','agility'],'delta'],
['f4','F-4 Phantom II','west','Csapásmérő',13750,6000,158000,49.2,7,2.2,18000,80000,['aam','bomb'],'swept'],
['f15e','F-15E Strike Eagle','west','Csapásmérő',14300,7600,258000,56.5,9,2.5,18000,140000,['aam','agm','bomb','precision'],'twin'],
['tornado','Tornado IDS','west','Csapásmérő',14000,5000,148000,30,7.5,2.2,15200,60000,['agm','bomb','precision'],'swept'],
['a10','A-10 Thunderbolt II','west','Közvetlen támogató',11300,5000,81000,47,5,.75,13700,18000,['cas','agm','bomb'],'straight'],
['mig25','MiG-25 Foxbat','east','Elfogó',20000,14000,220000,61.4,4.5,2.83,20600,150000,['radar','aam'],'swept'],
['mig31','MiG-31 Foxhound','east','Elfogó',21800,16000,304000,61.6,5,2.83,20600,200000,['radar','aam'],'swept'],
['su27','Su-27 Flanker','east','Légiuralmi',16400,9400,245000,62,9,2.35,19000,140000,['aam','agility','radar'],'twin'],
['mig29','MiG-29 Fulcrum','east','Többcélú',11000,3500,163000,38,9,2.25,18000,80000,['aam','agility','bomb'],'twin'],
['su24','Su-24 Fencer','east','Csapásmérő',22300,11000,225000,55,6.5,1.6,11000,50000,['agm','bomb','precision'],'swept'],
['mig27','MiG-27 Flogger','east','Csapásmérő',11900,4500,112000,37,7,1.7,14000,40000,['cas','agm','bomb'],'swept'],
['su25','Su-25 Frogfoot','east','Közvetlen támogató',9800,3000,88000,30.1,6.5,.82,10000,15000,['cas','agm','bomb'],'straight'],
['f22','F-22A Raptor','west','Légiuralmi',19700,8200,311000,78,9,2,19800,200000,['radar','aam','agility'],'twin'],
['f35','F-35A Lightning II','west','Többcélú',13290,8278,191000,42.7,9,1.6,15200,160000,['radar','aam','agility'],'twin'],
['su35','Su-35S Flanker-E','east','Többcélú',19000,11500,284000,62,9,2.25,18000,180000,['radar','aam','agm','bomb','agility','precision'],'twin'],
['su57','Su-57E Felon','east','Légiuralmi',18500,10300,294000,78.8,9,2,20000,200000,['radar','aam','agility'],'twin'],
['j10','Chengdu J-10C','china','Többcélú',9750,4950,140000,33.1,9,1.8,18000,140000,['radar','aam','agility'],'delta'],
['j20','Chengdu J-20','china','Légiuralmi',19000,11000,294000,73,9,2,20000,200000,['radar','aam','agility'],'delta']
];
export const hangarGroups=[{id:'nato-classic',name:'NATO klasszikus gépek'},{id:'nato-modern',name:'NATO modern gépek'},{id:'soviet',name:'Szovjet gépek'},{id:'russia-modern',name:'Orosz modern gépek'},{id:'china-modern',name:'Kínai modern gépek'}];
const modernNato=new Set(['rafale','euro','gripen','f22','f35']);
const handling={f22:{thrust:232000,cd0:.020,pitchRate:40},f35:{thrust:125000,cd0:.025,pitchRate:35},su35:{thrust:173000,pitchRate:42},su57:{thrust:176000,cd0:.021,pitchRate:42},j10:{thrust:89000,pitchRate:39},j20:{thrust:176000,cd0:.022,pitchRate:35}};
export const aircraft=rows.map(([id,name,faction,role,emptyMass,fuelCapacity,abThrust,wingArea,maxG,maxMach,ceiling,radarRange,tags,shape])=>({id,name,engineCount:['f16','mirage','gripen','mig27','f35','j10'].includes(id)?1:2,faction,group:faction==='china'?'china-modern':faction==='west'?(modernNato.has(id)?'nato-modern':'nato-classic'):['su35','su57'].includes(id)?'russia-modern':'soviet',role,emptyMass,fuelCapacity,abThrust,wingArea,maxG,maxMach,ceiling,radarRange,tags,shape,thrust:abThrust*(shape==='straight'?1:.66),hasAB:shape!=='straight',cd0:.023,inducedDrag:.075,clSlope:4.8,maxCL:1.55,stallAlpha:19*Math.PI/180,pitchRate:38,rollRate:85,radarCone:60,lockTime:2,gunAmmo:armament({id}).weapons.gun?.quantity||0,approachSpeed:shape==='straight'?65:72,...handling[id]}));
aircraft.push(harrier);for(const a of aircraft)if(['f14','fa18'].includes(a.id))a.carrierCapable=true;
aircraft.push(...aiAircraft.filter(a=>['b52','tu95'].includes(a.id)).map(a=>({...a,group:a.faction==='west'?'nato-classic':'soviet',tags:['bomb'],shape:'straight',gunAmmo:0,maxWeaponPayloadKg:a.id==='b52'?31500:15000})));
export {missions} from './missionCatalog.js';
export function suitability(s,m){if(s.transport)return ['escort-transport','iron-veil'].includes(m.objective)?'good':'bad';if(m.objective==='escort'||m.objective==='landing')return 'good';if(m.objective==='escort-transport'||m.objective==='defend-base'||m.objective==='defend-city'){const a=armament(s).weapons.aam;return a?.quantity>=4?'good':a?'ok':'bad';}const p=armament(s);const n=m.needs.filter(t=>['gun','aam','agm','bomb'].includes(t)?!!p.weapons[t]:t==='radar'?s.radarRange>0:s.tags.includes(t)).length;return n===m.needs.length?'good':n>0?'ok':'bad';}
export function loadout(s){const p=armament(s);return {...Object.fromEntries(['gun','aam','agm','bomb'].map(type=>[type,p.weapons[type]?.quantity||0])),...(p.tailGun?{tailGun:p.tailGun.quantity}: {})};}

