import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft} from '../src/aircraftSpec.js';
import {missions} from './fixtures/scenarios.js';
import {Vec3,Quat,DEG} from '../src/math.js';
import {createAircraft,STEP} from '../src/physics.js';
import {createDamage,applyDamage,syncDamage} from '../src/damage.js';
import {createTargets} from '../src/targeting.js';
import {Weapons} from '../src/weapons.js';
import {EnemyCombat,clearFireLine} from '../src/enemyCombat.js';
import {aircraftHit,closestAircraftSurface} from '../src/hitGeometry.js';
import {aircraftMesh} from '../src/airframes.js';
import {threatsFor,threatMarkup} from '../src/threats.js';
import {storesMarkup,integrityColor} from '../src/storesDisplay.js';
import {terrainHeight} from '../src/terrain.js';
const spec=aircraft.find(a=>a.id==='f16');
function player(){const s=createAircraft(spec);s.condition=createDamage(1);s.position=new Vec3(0,500,0);s.velocity=new Vec3(0,0,100);s.orientation=new Quat();s.onGround=false;s.airborne=true;s.agl=500;return s;}
function enemy(type='sam'){const t=createTargets(missions.find(m=>m.id===type),spec,{rng:()=>0})[0];t.position=new Vec3(0,type==='fighter'?500:8,1500);t.previousPosition=t.position.clone();t.velocity=new Vec3();t.heading=Math.PI;return t;}
test('every enemy has exactly the requested weapon categories; civil, bridge and radar are unarmed',()=>{
 const expected={fighter:['missile','gun'],bomber:['bomb','gun'],transport:[],convoy:['flak','gun'],bridge:[],bunker:['gun'],radar:[],airbase:[],civil:[],sam:['flak','gun'],'sam-system':['missile','gun']};
 for(const [id,types]of Object.entries(expected)){assert.deepEqual(threatsFor(id),types);assert.equal((threatMarkup(id).match(/role="img"/g)||[]).length,types.length);}
});
test('all missions spawn far from base at reproducible, varied bearings',()=>{
 for(const m of missions.filter(m=>m.objective!=='landing')){const points=[];for(const value of [.01,.25,.5,.75,.99]){const t=createTargets(m,spec,{rng:()=>value})[0],r=Math.hypot(t.position.x,t.position.z);assert.ok(r>=(m.kind==='air'?22000:18000)&&r<=(m.kind==='air'?32000:28000));assert.ok(t.position.y>terrainHeight(t.position.x,t.position.z));points.push(t.position);assert.deepEqual(createTargets(m,spec,{rng:()=>value})[0].position,t.position);}assert.ok(points[0].distance(points[2])>30000);}
});
test('enemy acquisition protects takeoff and startup; civilians and destroyed units never fire',()=>{
 const s=player(),w=new Weapons({enemyFire:true}),t=enemy();s.onGround=true;for(let i=0;i<1200;i++)w.enemyCombat.update(s,[t],w,STEP);assert.equal(w.projectiles.length,0);s.onGround=false;for(let i=0;i<360;i++)w.enemyCombat.update(s,[t],w,STEP);assert.equal(w.projectiles.length,0);t.alive=false;for(let i=0;i<1200;i++)w.enemyCombat.update(s,[t,enemy('civil')],w,STEP);assert.equal(w.projectiles.length,0);
});
test('flak fires three spaced rounds, cannon ten, then each pauses; ground cannon has a low altitude limit',()=>{
 const s=player(),w=new Weapons({enemyFire:true}),t=enemy();w.enemyCombat.activeTime=10;for(let i=0;i<120*2;i++)w.enemyCombat.update(s,[t],w,STEP);assert.equal(w.projectiles.filter(p=>p.type==='flak').length,3);assert.equal(w.projectiles.filter(p=>p.type==='gun').length,10);assert.equal(w.enemyCombat.unit(t).shells,87);assert.equal(w.enemyCombat.unit(t).rounds,1790);
 const high=player(),other=new Weapons({enemyFire:true});high.agl=high.position.y=1100;other.enemyCombat.activeTime=10;for(let i=0;i<240;i++)other.enemyCombat.update(high,[t],other,STEP);assert.equal(other.projectiles.filter(p=>p.type==='gun').length,0);assert.equal(other.projectiles.filter(p=>p.type==='flak').length,3);
});
test('missiles need acquisition time and respect finite ammunition; fighters cannot fire backwards',()=>{
 const s=player(),w=new Weapons({enemyFire:true}),t=enemy('sam-system');w.enemyCombat.activeTime=10;for(let i=0;i<120;i++)w.enemyCombat.update(s,[t],w,STEP);assert.equal(w.projectiles.length,0);for(let i=0;i<180;i++)w.enemyCombat.update(s,[t],w,STEP);assert.equal(w.projectiles.filter(p=>p.type==='aam').length,1);assert.equal(w.enemyCombat.unit(t).missiles,5);assert.equal(w.projectiles[0].targetPlayer,true);
 const f=enemy('fighter');f.position.z=8000;f.heading=0;const other=new Weapons({enemyFire:true});other.enemyCombat.activeTime=10;for(let i=0;i<360;i++)other.enemyCombat.update(s,[f],other,STEP);assert.equal(other.projectiles.length,0);assert.ok(f.heading>0,'fighter starts turning to face player');
});
test('fighter ammunition respects its aircraft preset, including the gunless J-20',()=>{const ai=new EnemyCombat(),t=enemy('fighter');t.aircraftId='j20';assert.equal(ai.unit(t).rounds,0);const other={...t,id:'T02',aircraftId:'mig29'};assert.equal(ai.unit(other).rounds,150);assert.equal(ai.unit(other).missiles,4);});
test('terrain blocks the firing line but clear air does not',()=>{
 assert.equal(clearFireLine(new Vec3(0,1000,0),new Vec3(0,1000,8000)),true);
 // Endpoints are above their local terrain, with a taller ridge between them.
 let blocked=false;for(let x=-20000;x<20000&&!blocked;x+=2000){const a=new Vec3(x,0,-15000),b=new Vec3(x,0,15000);a.y=terrainHeight(a.x,a.z)+10;b.y=terrainHeight(b.x,b.z)+10;if(!clearFireLine(a,b))blocked=true;}assert.equal(blocked,true);
});
test('swept geometry hits the actual wing, misses empty space and handles rotating/moving aircraft',()=>{
 const s=player(),from=new Vec3(-3,510,-1),to=new Vec3(-3,490,-1);assert.equal(aircraftHit(s,from,to,{radius:.05}).part,'leftWing');assert.equal(aircraftHit(s,new Vec3(9,510,0),new Vec3(9,490,0),{radius:.05}),null);
 s.orientation=Quat.euler(Math.PI/2,0,30*DEG);const localFrom=new Vec3(-3,10,-1),localTo=new Vec3(-3,-10,-1);assert.equal(aircraftHit(s,s.orientation.rotate(localFrom).add(s.position),s.orientation.rotate(localTo).add(s.position),{radius:.05}).part,'leftWing');
 s.orientation=new Quat();s.previousPosition=new Vec3(-20,500,0);assert.ok(aircraftHit(s,new Vec3(-10,510,0),new Vec3(-10,490,0),{radius:.35}));
 for(const a of aircraft){const p=player();p.spec=a;const hit=closestAircraftSurface(p,new Vec3(0,500,0));assert.ok(Number.isFinite(hit.distance),a.id);assert.equal(aircraftMesh(a.id).faceParts.length,aircraftMesh(a.id).faces.length);}
});
test('a high speed cannon shot damages its impact region once, without changing player score or ammunition',()=>{
 const s=player(),w=new Weapons(),ammo={...s.ammo};w.projectiles.push({owner:'enemy',type:'gun',position:new Vec3(-3,510,-1),velocity:new Vec3(0,-2400,0),age:0,damage:1.8});w.update(s,[],STEP);assert.equal(w.projectiles.length,0);assert.equal(s.damage,1.8);assert.equal(s.lastHit.part,'leftWing');assert.ok(s.condition.parts.leftWing<s.condition.parts.rightWing);assert.deepEqual(s.ammo,ammo);assert.equal(w.hits,0);assert.equal(w.used,0);w.update(s,[],STEP);assert.equal(s.damage,1.8);
});
test('hostile missile uses continuous homing, warns, then causes localized structural damage',()=>{
 const s=player(),w=new Weapons(),ai=new EnemyCombat(),t=enemy('sam-system');t.position=new Vec3(0,500,-2000);ai.launch('missile',t,s,w,ai.unit(t));let travelled=0;for(let i=0;i<120*20&&!s.lastHit;i++){s.previousPosition=s.position.clone();s.position.add(s.velocity.clone().scale(STEP));w.update(s,[],STEP);travelled++;if(i===0)assert.match(s.threatWarning,/RAKÉTA/);}assert.ok(travelled>120);assert.equal(s.lastHit.weapon,'aam');assert.equal(s.damage,50);assert.ok(s.condition.parts[s.lastHit.part]<.2);assert.equal(w.projectiles.length,0);assert.equal(s.threatWarning,'');assert.equal(w.hits,0);
});
test('flak detonates on its fuse and damages only aircraft near the burst, with less damage than a missile',()=>{
 for(const [offset,damaged]of [[15,true],[150,false]]){const s=player(),w=new Weapons();w.projectiles.push({owner:'enemy',type:'flak',position:s.position.clone().add(new Vec3(offset,0,0)),velocity:new Vec3(),age:0,fuse:.1,damage:7});for(let i=0;i<6;i++)w.update(s,[],STEP);assert.equal(s.damage,0);assert.equal(w.effects.length,0);for(let i=0;i<8;i++)w.update(s,[],STEP);assert.equal(w.projectiles.length,0);assert.equal(w.effects.length,1);assert.equal(w.effects[0].scale,.35);assert.equal(s.damage>0,damaged);assert.ok(s.damage<7);}
});
test('ballistic enemy fire leads a steadily moving player to a timed airburst',()=>{
 const s=player(),w=new Weapons(),ai=new EnemyCombat(),t=enemy();ai.launch('flak',t,s,w,ai.unit(t));const fuse=w.projectiles[0].fuse;for(let i=0;i<Math.ceil(fuse/STEP);i++){s.previousPosition=s.position.clone();s.position.add(s.velocity.clone().scale(STEP));w.update(s,[],STEP);}assert.ok(s.damage>0&&s.damage<=7);assert.equal(s.lastHit.weapon,'flak');
});
test('destroyed launchers stop firing while existing missiles continue; a fresh flight clears combat state',()=>{
 const s=player(),w=new Weapons({enemyFire:true}),t=enemy('sam-system');w.enemyCombat.activeTime=10;w.enemyCombat.launch('missile',t,s,w,w.enemyCombat.unit(t));t.alive=false;const start=w.projectiles[0].position.clone();w.update(s,[t],STEP);assert.equal(w.projectiles.length,1);assert.ok(w.projectiles[0].position.distance(start)>0);const fresh=new Weapons({enemyFire:true});assert.equal(fresh.projectiles.length,0);assert.equal(fresh.enemyCombat.units.size,0);
});
test('component display colors both combat and flight stress damage and reports remaining overall health',()=>{
 const s=player();assert.doesNotMatch(storesMarkup(s,'aam'),/class="part-damage"/);applyDamage(s,10,{part:'leftWing'});let html=storesMarkup(s,'aam');assert.match(html,/data-part="leftWing"/);assert.match(html,/>90%<\/b>/);assert.notEqual(integrityColor(.9),integrityColor(.1));s.damage=40;syncDamage(s);html=storesMarkup(s,'aam');assert.match(html,/>60%<\/b>/);assert.match(html,/data-part="tail"/);assert.match(html,/data-part="fuselage"/);
});
