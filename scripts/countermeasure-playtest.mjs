import {Vec3,Quat} from '../src/math.js';
import {weaponProfiles} from '../src/weaponDynamics.js';
import {createCountermeasures,deployCountermeasures,updateCountermeasures,countermeasureTarget} from '../src/countermeasures.js';
import {aircraft} from '../src/aircraftSpec.js';
const spec=aircraft.find(a=>a.id==='f16');
export function runCountermeasureProbe({beam=false,guidance='sam',seeds=100}={}){let diverted=0;
for(let seed=1;seed<=seeds;seed++){let state=Math.imul(seed,2654435761)>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};for(let j=0;j<10;j++)random();const s={spec,position:new Vec3(0,2000,0),velocity:beam?new Vec3(145,0,0):new Vec3(0,0,145),orientation:new Quat(),onGround:false,throttle:.7,damage:0,fuel:100,countermeasures:createCountermeasures(spec)},p={id:seed,profile:weaponProfiles[guidance],position:new Vec3(0,2000,-2500),velocity:new Vec3(0,0,650)};let releaseAt=0;
for(let i=0;i<120*5;i++){const dt=1/120,t=i*dt;s.position.add(s.velocity.clone().scale(dt));p.velocity=s.position.clone().sub(p.position).normalize().scale(650);p.position.add(p.velocity.clone().scale(dt));updateCountermeasures(s,dt);if(t>=releaseAt){deployCountermeasures(s,guidance==='aim9m'?'flare':'chaff');releaseAt=t+1.5;}countermeasureTarget(p,s,dt,random);if(p.decoyId!==undefined){diverted++;break;}}}
return {seeds,diverted,beam,profile:guidance};}
if(process.argv[1]?.endsWith('countermeasure-playtest.mjs'))console.log(JSON.stringify([runCountermeasureProbe(),runCountermeasureProbe({beam:true}),runCountermeasureProbe({guidance:'aim9m'})]));
