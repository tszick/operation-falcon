import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft,missions} from '../src/aircraftSpec.js';
import {missionGroups} from '../src/missionCatalog.js';
import {createMissionAircraft} from '../src/missionStart.js';
import {createTargets,updateTargets,applyTargetHit,Targeting} from '../src/targeting.js';
import {Mission} from '../src/mission.js';
import {Weapons} from '../src/weapons.js';
import {Vec3,Quat} from '../src/math.js';
import {groundInstances,groundHit,groundMesh} from '../src/groundModels.js';
import {ballisticHit} from '../src/ballisticFlight.js';
import {fireSolution,predictBombImpact} from '../src/weaponDynamics.js';
import {defaultLoadout,configureAircraft} from '../src/loadoutPlanner.js';
const spec=aircraft.find(a=>a.id==='f16');
function setup(id,options={}){const scenario=missions.find(m=>m.id===id),targets=createTargets(scenario,spec,{rng:()=>.23}),s=createMissionAircraft(spec,scenario),m=new Mission(scenario),w=new Weapons(options),aim=new Targeting();return {s,m,w,targets,aim,by:id=>targets.find(t=>t.id===id)};}
function landed(x){x.s.airborne=true;x.s.onGround=true;x.s.speed=0;x.s.landing={success:true,descent:1,offset:0};x.m.update(x.s,x.targets,x.w,x.aim);}

test('practice and story order, numbering and difficulty match the requested campaign',()=>{
 assert.deepEqual(missionGroups.map(g=>g.id),['practice','story1']);assert.deepEqual(missions.filter(m=>m.group==='practice').map(m=>m.id),['landing','canyon','civil','practice-bombing']);assert.deepEqual(missions.filter(m=>m.group==='story1').map(m=>[m.id,m.order,m.difficulty]),[['convoy',1,'KEZDŐ'],['defend-base',2,'KEZDŐ'],['escort-transport',3,'HALADÓ'],['defend-city',4,'TOP-GUN'],['airbase',5,'HALADÓ'],['ballistic',6,'TOP-GUN'],['air-superiority',7,'TOP-GUN'],['iron-veil',8,'TOP-GUN']]);
});
test('transport and player start together well before the threat zone and survive an initial preparation minute',()=>{
 const x=setup('escort-transport',{enemyFire:true}),transport=x.by('TRANSPORT');assert.ok(x.s.position.distance(transport.position)<1800);assert.ok(Math.min(...x.targets.filter(t=>t.team==='enemy').map(t=>t.position.distance(transport.position)))>25000);
 for(let i=0;i<60*60;i++){updateTargets(x.targets,1/60);x.w.update(x.s,x.targets,1/60);}assert.equal(transport.alive,true);assert.equal(transport.damage||0,0);
});
test('city has separate taller central buildings, matching rendered boxes and destructible health',()=>{
 const x=setup('defend-city'),city=x.targets.filter(t=>t.city),center=x.by('CITY-2-2'),edge=x.by('CITY-0-0');assert.equal(city.length,25);assert.ok(center.buildingHeight>edge.buildingHeight);
 const instance=groundInstances(center)[0];assert.ok(instance.mesh.bounds.y[1]>=center.buildingHeight);assert.ok(groundHit(center,center.position.clone().add(new Vec3(0,200,0)),center.position.clone().add(new Vec3(0,-20,0))));applyTargetHit(center,'bomb',{amount:100});assert.equal(center.alive,false);assert.equal(edge.alive,true);assert.ok(groundInstances(center)[0].mesh.bounds.y[1]<10);
});
test('two friendly fighters depart ahead of the player without starting airborne',()=>{
 const x=setup('defend-city'),friends=x.targets.filter(t=>t.type==='fighter'&&t.team==='ally');assert.equal(friends.length,2);assert.ok(x.s.onGround);assert.ok(friends.every(t=>t.position.z>x.s.position.z&&t.position.y===2));for(let i=0;i<120*30;i++)updateTargets(x.targets,1/120);assert.ok(friends.every(t=>t.position.y>150&&t.position.z>0));assert.ok(friends[0].position.z>friends[1].position.z);
});
test('second city wave cannot count as destroyed before activation and activates after the first wave is defeated',()=>{
 const x=setup('defend-city');x.m.update(x.s,x.targets,x.w);assert.equal(x.targets.filter(t=>t.wave===1&&t.alive).length,4);assert.equal(x.targets.filter(t=>t.wave===2&&t.pending).length,3);assert.equal(x.m.objectiveComplete,false);for(const t of x.targets.filter(t=>t.wave===1))t.alive=false;x.m.update(x.s,x.targets,x.w);assert.equal(x.targets.filter(t=>t.wave===2&&t.alive&&!t.pending).length,3);assert.equal(x.m.wave,2);assert.equal(x.m.objectiveComplete,false);
});
test('city protection accepts exactly eighty percent and irreversibly fails below it',()=>{
 for(const lost of [5,6]){const x=setup('defend-city');for(const t of x.targets.filter(t=>t.city).slice(0,lost))applyTargetHit(t,'bomb',{amount:100});x.m.update(x.s,x.targets,x.w);assert.equal(x.m.failed,lost===6);if(lost===6){landed(x);assert.equal(x.m.serviceCount,undefined);assert.equal(x.m.complete,false);}}
});
test('city victory waits for both waves, falling bombs and a final safe landing',()=>{
 const x=setup('defend-city');for(const t of x.targets.filter(t=>t.wave===1))t.alive=false;x.m.update(x.s,x.targets,x.w);for(const t of x.targets.filter(t=>t.team==='enemy'))t.alive=false;
 x.w.projectiles.push({owner:'enemy',type:'bomb',targetEntityId:'CITY-2-2'});x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,false);x.w.projectiles=[];x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,true);landed(x);assert.equal(x.m.complete,true);assert.equal(x.m.serviceCount,undefined);
});
test('silo has a real five minute deadline, launches one independent target, and destruction before launch prevents it',()=>{
 const x=setup('ballistic');x.s.elapsed=299.9;x.m.update(x.s,x.targets,x.w);assert.equal(x.by('BALLISTIC'),undefined);x.s.elapsed=300;x.m.update(x.s,x.targets,x.w);assert.ok(x.by('BALLISTIC').alive);x.m.update(x.s,x.targets,x.w);assert.equal(x.targets.filter(t=>t.type==='ballistic').length,1);applyTargetHit(x.by('SILO'),'bomb',{amount:200});assert.equal(x.by('BALLISTIC').alive,true);assert.equal(x.m.objectiveComplete,false);
 const y=setup('ballistic');applyTargetHit(y.by('SILO'),'bomb',{amount:200});y.s.elapsed=400;y.m.update(y.s,y.targets,y.w);assert.equal(y.by('BALLISTIC'),undefined);assert.equal(y.m.objectiveComplete,true);landed(y);assert.equal(y.m.complete,true);
});
test('launched ballistic target really moves at extreme speed, coasts under gravity, and destroys the base if not intercepted',()=>{
 const x=setup('ballistic');x.s.elapsed=300;x.m.update(x.s,x.targets,x.w);const missile=x.by('BALLISTIC');let minimum=Infinity,maximum=0;for(let i=0;i<120*30&&missile.alive;i++){updateTargets(x.targets,1/120);minimum=Math.min(minimum,missile.velocity.length());maximum=Math.max(maximum,missile.position.y);x.s.elapsed+=1/120;x.m.update(x.s,x.targets,x.w);}assert.ok(minimum>2500);assert.ok(maximum>5000);assert.ok(missile.impacted);assert.equal(x.by('BASE').alive,false);assert.equal(x.m.failed,true);
});
test('intercepting the launched target resolves the ballistic threat without requiring the empty silo to be destroyed',()=>{
 const x=setup('ballistic');x.s.elapsed=300;x.m.update(x.s,x.targets,x.w);applyTargetHit(x.by('BALLISTIC'),'aam',{amount:50});x.m.update(x.s,x.targets,x.w);assert.equal(x.by('SILO').alive,true);assert.equal(x.m.objectiveComplete,true);assert.equal(x.by('BASE').alive,true);
});
test('ballistic interception uses moving swept collision rather than the endpoint or a fighter silhouette',()=>{
 const t={radius:2,previousPosition:new Vec3(0,0,100),position:new Vec3(0,0,-100)};assert.ok(ballisticHit(t,new Vec3(0,0,-10),new Vec3(0,0,10)));assert.equal(ballisticHit(t,new Vec3(20,0,-10),new Vec3(20,0,10)),null);assert.ok(groundMesh('ballistic').points.length>20);
});
test('a close head-on air-to-air shot can actually intercept a ballistic target, but tail chase and distant launch are rejected',()=>{
 const x=setup('ballistic');x.s.onGround=false;x.s.airborne=true;x.s.position=new Vec3(0,6000,0);x.s.velocity=new Vec3(0,0,250);x.s.orientation=new Quat();const target={id:'FAST',type:'ballistic',kind:'air',team:'enemy',alive:true,position:new Vec3(0,6000,2000),previousPosition:new Vec3(0,6000,2000),velocity:new Vec3(0,0,-3300),radius:2,health:25,maxHealth:25};x.w.selected='aam';assert.ok(fireSolution(x.s,target,'aam').canLaunch);assert.equal(x.w.fire(x.s,[target],{id:'FAST',locked:true}),'RAKÉTA INDÍTVA');
 for(let i=0;i<120*2&&target.alive;i++){target.previousPosition=target.position.clone();target.position.add(target.velocity.clone().scale(1/120));x.w.update(x.s,[target],1/120);}assert.equal(target.alive,false);assert.equal(target.intercepted,true);
 target.alive=true;target.position=new Vec3(0,6000,2000);target.velocity.z=3300;assert.equal(fireSolution(x.s,target,'aam').canLaunch,false);target.velocity.z=-3300;target.position.z=8000;assert.equal(fireSolution(x.s,target,'aam').canLaunch,false);
});
test('intermediate stop replaces aircraft at full configured stores/fuel while preserving the mission clock and threats',()=>{
 const choice=defaultLoadout(spec);choice.stations=choice.stations.map(()=> 'aam');const x=setup('defend-base');x.s.spec=configureAircraft(spec,choice);x.s.ammo={gun:1,aam:0,agm:0,bomb:0};x.s.damage=20;x.s.fuel=50;x.s.elapsed=150;const before=x.targets.map(t=>t.position.clone());landed(x);assert.equal(x.s.damage,0);assert.equal(x.s.fuel,spec.fuelCapacity);assert.equal(x.s.ammo.aam,6);assert.equal(x.s.ammo.agm,0);assert.equal(x.s.elapsed,150);assert.equal(x.s.airborne,false);assert.equal(x.s.landing,null);assert.equal(x.m.serviceCount,1);assert.equal(x.m.complete,false);assert.ok(x.targets.every((t,i)=>t.position.distance(before[i])===0));x.m.update(x.s,x.targets,x.w);assert.equal(x.m.serviceCount,1);
});
test('a failed mandatory objective cannot be undone by landing and servicing',()=>{
 const x=setup('escort-transport');x.by('TRANSPORT').alive=false;landed(x);assert.equal(x.m.failed,true);assert.equal(x.m.serviceCount,undefined);assert.equal(x.m.complete,false);
});

test('a city bomber chooses city buildings and its actual bombs can destroy them',()=>{
 const x=setup('defend-city',{enemyFire:true}),city=x.targets.filter(t=>t.city),bomber=x.targets.find(t=>t.type==='bomber'&&t.alive),target=city[0];bomber.position=target.position.clone().add(new Vec3(0,1800,-2500));bomber.velocity=new Vec3(0,0,bomber.cruiseSpeed);bomber.heading=0;const predicted=predictBombImpact({spec:x.s.spec,position:bomber.position,velocity:bomber.velocity});bomber.position.z-=predicted.z-target.position.z;x.w.enemyCombat.activeTime=10;
 const units=[...city,bomber];for(let i=0;i<60*40&&city.every(t=>t.alive);i++){updateTargets(units,1/60);x.w.update(x.s,units,1/60);}assert.ok(city.some(t=>!t.alive));assert.ok(x.w.events.some(e=>e.type==='bomb-release'&&e.targetId.startsWith('CITY-')));
});
test('timed second wave activates exactly once even if the first wave remains alive',()=>{
 const x=setup('defend-city');x.s.elapsed=239.9;x.m.update(x.s,x.targets,x.w);assert.equal(x.m.wave,1);x.s.elapsed=240;x.m.update(x.s,x.targets,x.w);assert.equal(x.m.wave,2);assert.equal(x.targets.filter(t=>t.wave===1&&t.alive).length,4);x.m.update(x.s,x.targets,x.w);assert.equal(x.w.events.filter(e=>e.type==='mission-wave').length,1);
});
test('servicing at the silo deadline preserves countdown, pending launch and world state',()=>{
 const x=setup('ballistic');x.s.elapsed=299;landed(x);assert.equal(x.m.serviceCount,1);assert.equal(x.s.elapsed,299);assert.equal(x.by('SILO').launchAt,300);x.s.elapsed=300;x.m.update(x.s,x.targets,x.w);assert.ok(x.by('BALLISTIC').alive);assert.equal(x.m.complete,false);
});

test('base-defense SAMs have an explicit base-protection assignment on each side',()=>{for(const id of ['defend-base','air-superiority']){const x=setup(id);for(const sam of x.targets.filter(t=>t.type==='sam-system'))assert.ok(sam.defendId,id+' '+sam.id);}});
