import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft} from '../src/aircraftSpec.js';
import {Vec3,Quat} from '../src/math.js';
import {createAircraft,stepAircraft,STEP} from '../src/physics.js';
import {aircraftMesh} from '../src/airframes.js';
import {toggleActuator,createDamage} from '../src/damage.js';
import {flapStatus} from '../src/flaps.js';
import {Weapons} from '../src/weapons.js';
import {weaponProfiles} from '../src/weaponDynamics.js';
import {createCountermeasures,deployCountermeasures,updateCountermeasures,countermeasureTarget,decoyKind} from '../src/countermeasures.js';
function plane(){const s=createAircraft(aircraft.find(a=>a.id==='f16'));s.condition=createDamage(1);s.position=new Vec3(0,500,0);s.velocity=new Vec3(0,0,180);s.onGround=false;s.airborne=true;s.throttle=.6;s.gear=false;s.flaps=false;s.flapPosition=0;return s;}
test('flaps retract and deploy over time, visibly report motion, and hydraulics freeze partial deployment',()=>{
 const s=plane();assert.equal(flapStatus(s).label,'BENN');toggleActuator(s,'flaps');for(let i=0;i<60;i++)stepAircraft(s,{});assert.ok(s.flapPosition>.25&&s.flapPosition<.4);assert.match(flapStatus(s).label,/NYÍLIK/);s.condition.parts.hydraulics=.1;const partial=s.flapPosition;for(let i=0;i<60;i++)stepAircraft(s,{});assert.equal(s.flapPosition,partial);assert.match(flapStatus(s).label,/BESZORULT/);s.condition.parts.hydraulics=1;for(let i=0;i<240;i++)stepAircraft(s,{});assert.equal(flapStatus(s).deployed,true);toggleActuator(s,'flaps');for(let i=0;i<240;i++)stepAircraft(s,{});assert.equal(flapStatus(s).retracted,true);
});
test('every selectable aircraft has finite moving trailing surfaces; retracted cached geometry stays unchanged',()=>{
 for(const spec of aircraft){const clean=aircraftMesh(spec.id),snapshot=clean.points.map(p=>p.clone()),deployed=aircraftMesh(spec.id,0,1);assert.equal(clean.flapFaces.length,2,spec.id);assert.ok(deployed.points.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));assert.ok(deployed.flapFaces.some(face=>face.some(i=>deployed.points[i].y<clean.points[i].y-.1)),spec.id);assert.deepEqual(clean.points,snapshot);assert.equal(aircraftMesh(spec.id,0,0),clean);}
});
test('actual flap position changes aerodynamic forces before motion is complete',()=>{
 const a=plane(),b=plane();a.flaps=b.flaps=true;a.flapPosition=0;b.flapPosition=1;stepAircraft(a,{});stepAircraft(b,{});assert.ok(b.g>a.g);assert.ok(b.velocity.z<a.velocity.z);
});
test('mixed release consumes a finite load, is rate limited, does not touch weapon ammunition and resets per flight',()=>{
 const s=plane(),ammo={...s.ammo},before={...s.countermeasures};assert.equal(deployCountermeasures(s).released,3);assert.equal(s.countermeasures.flare,before.flare-2);assert.equal(s.countermeasures.chaff,before.chaff-1);assert.equal(deployCountermeasures(s).released,0);updateCountermeasures(s,.8);assert.equal(deployCountermeasures(s,'flare').released,2);assert.deepEqual(s.ammo,ammo);assert.equal(createCountermeasures(s.spec).decoys.length,0);s.countermeasures.flare=s.countermeasures.chaff=0;updateCountermeasures(s,1);assert.equal(deployCountermeasures(s).released,0);assert.equal(s.countermeasures.decoys.length,5);
});
test('countermeasure deployment is inhibited on the ground and in a terminal aircraft',()=>{for(const key of['onGround','dying','crashed']){const s=plane();s[key]=true;assert.equal(deployCountermeasures(s).released,0);assert.equal(s.countermeasures.used,0);}});
test('decoys inherit momentum, separate from aircraft, cool/disperse and expire without replenishing stock',()=>{
 const s=plane();deployCountermeasures(s);const before=s.countermeasures.flare,flare=s.countermeasures.decoys[0],initial=flare.velocity.length();for(let i=0;i<120;i++)updateCountermeasures(s,STEP);assert.ok(flare.velocity.length()<initial);assert.ok(flare.position.distance(s.position)>20);for(let i=0;i<120*9;i++)updateCountermeasures(s,STEP);assert.equal(s.countermeasures.decoys.length,0);assert.equal(s.countermeasures.flare,before);
});
function encounter(profile=weaponProfiles.aim9m,type='flare'){const s=plane();s.countermeasures.decoys=[{id:1,type,position:new Vec3(20,500,-30),previous:new Vec3(20,500,-30),velocity:new Vec3(),age:.2,life:5}];return {s,p:{profile,position:new Vec3(0,500,-1500),velocity:new Vec3(0,0,500),age:2}};}
test('flares affect IR and chaff affects radar, while unrelated types and laser guidance ignore them',()=>{
 for(const [profile,type,expected]of [[weaponProfiles.aim9m,'flare',true],[weaponProfiles.aim9m,'chaff',false],[weaponProfiles.aim7m,'chaff',true],[weaponProfiles.aim7m,'flare',false],[weaponProfiles.kh29,'flare',false]]){const {s,p}=encounter(profile,type);const result=countermeasureTarget(p,s,.1,()=>0);assert.equal(result!==s,expected,`${profile.id}/${type}`);}
 assert.equal(decoyKind(weaponProfiles.pl15),'chaff');assert.equal(decoyKind(weaponProfiles.mica),'flare');
});
test('very early releases and decoys outside the seeker cannot divert a missile',()=>{
 const {s,p}=encounter();p.position.z=-12000;assert.equal(countermeasureTarget(p,s,1,()=>0),s);p.position.z=-1500;s.countermeasures.decoys[0].position.x=1000;assert.equal(countermeasureTarget(p,s,1,()=>0),s);
});
test('decoy decisions integrate exposure rather than rerolling every frame; fade does not teleport a missile back',()=>{
 const a=encounter(),b=encounter();for(let i=0;i<30;i++)countermeasureTarget(a.p,a.s,1/30,()=>.02);for(let i=0;i<120;i++)countermeasureTarget(b.p,b.s,1/120,()=>.02);assert.equal(a.p.decoyId,b.p.decoyId);assert.equal(a.p.decoyId,1);a.s.countermeasures.decoys=[];assert.equal(countermeasureTarget(a.p,a.s,STEP),null);assert.equal(a.p.seekerLost,true);
});
test('afterburner heat, modern seeker rejection and Doppler separation reduce decoy success without immunity',()=>{
 function exposure(profile,ab=false,beam=false){const {s,p}=encounter(profile,decoyKind(profile));s.afterburner=ab;s.throttle=ab?1:.6;if(beam)s.velocity=new Vec3(180,0,0);countermeasureTarget(p,s,.15,()=>.999999);return p.decoyEvidence.get(1).exposure;}
 assert.ok(exposure(weaponProfiles.aim9m)>exposure(weaponProfiles.aim9m,true));assert.ok(exposure(weaponProfiles.aim9l)>exposure(weaponProfiles.mica));assert.ok(exposure(weaponProfiles.aim7m,false,true)>exposure(weaponProfiles.aim7m));const {s,p}=encounter();countermeasureTarget(p,s,.1,()=>.999999);assert.equal(p.decoyId,undefined);
});
test('a decoy really changes a hostile missile path and can prevent the hit without awarding score',()=>{
 function run(useDecoy){const s=plane(),w=new Weapons({random:()=>0});w.projectiles=[{id:1,owner:'enemy',type:'aam',profile:weaponProfiles.defense,damage:50,position:new Vec3(0,500,-1800),velocity:new Vec3(0,0,260),age:0,trailTimer:0,trailAnchor:new Vec3(0,500,-1800),travelled:0}];let fired=false,diverted=false;for(let i=0;i<120*25&&w.projectiles.length;i++){s.previousPosition=s.position.clone();s.position.add(s.velocity.clone().scale(STEP));if(useDecoy&&!fired&&w.projectiles[0].position.distance(s.position)<1000){deployCountermeasures(s);fired=true;}w.update(s,[],STEP);diverted ||=w.projectiles.some(p=>p.decoyId!==undefined);}assert.equal(w.hits,0);return {s,diverted};}
 const baseline=run(false),defended=run(true);assert.equal(baseline.s.damage,50);assert.equal(defended.diverted,true);assert.ok(defended.s.damage<baseline.s.damage);
});
test('a diverted missile close to the real aircraft can still cause damage',()=>{
 const s=plane(),w=new Weapons();s.countermeasures.decoys=[{id:1,type:'flare',age:1,life:5,position:s.position.clone().add(new Vec3(12,0,0)),previous:s.position.clone().add(new Vec3(12,0,0)),velocity:new Vec3()}];w.projectiles=[{owner:'enemy',type:'aam',profile:weaponProfiles.defense,damage:50,decoyId:1,position:s.position.clone().add(new Vec3(12,0,-2)),velocity:new Vec3(0,0,300),age:1,travelled:300,trailTimer:0,trailAnchor:s.position.clone()}];w.update(s,[],STEP);assert.equal(w.projectiles.length,0);assert.ok(s.damage>0);assert.equal(w.effects[0].kind,'explosion');
});
