import {trainingAircraft,isPracticeMission,unarmedPractice} from '../src/trainingAircraft.js';
import {defenseState} from '../src/aiDefense.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {missions,aircraft} from '../src/aircraftSpec.js';
import {unitTypes,teamOf} from '../src/unitTypes.js';
import {Vec3,Quat} from '../src/math.js';
import {createMissionAircraft} from '../src/missionStart.js';
import {createTargets,updateTargets,Targeting,radarContacts,applyTargetHit} from '../src/targeting.js';
import {sensorTargets,navigationJammed} from '../src/electronicWarfare.js';
import {Weapons} from '../src/weapons.js';
import {Mission} from '../src/mission.js';
import {EnemyCombat} from '../src/enemyCombat.js';
import {predictBombImpact} from '../src/weaponDynamics.js';
import {terrainWorld,pathCoordinates} from '../src/terrain.js';
const spec=aircraft.find(a=>a.id==='f16'),scenario=id=>missions.find(m=>m.id===id);
function seeded(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function setup(id){const mission=scenario(id),targets=createTargets(mission,spec,{rng:seeded(4)}),s=createMissionAircraft(spec,mission),w=new Weapons({enemyFire:true}),m=new Mission(mission),aim=new Targeting();s.airborne=true;s.onGround=false;s.position=new Vec3(0,1600,-8000);s.velocity=new Vec3(0,0,165);s.orientation=new Quat();s.agl=1600;return {mission,targets,s,w,m,aim,by:id=>targets.find(t=>t.id===id)};}
function land(x){x.s.onGround=true;x.s.speed=0;x.s.landing={success:true,descent:1,offset:0};x.m.update(x.s,x.targets,x.w,x.aim);}
test('the mission compositions match their brief, with no radar station or armed airfield/transport',()=>{
 assert.equal(missions.length,12);assert.equal(unitTypes.radar,undefined);for(const m of missions){const targets=createTargets(m,spec,{rng:seeded(4)});for(const r of m.roster)assert.equal(targets.filter(t=>t.type===r.type&&t.team===r.team).length,r.count,`${m.id}/${r.type}`);assert.equal(targets.some(t=>t.type==='radar'),false);for(const t of targets.filter(t=>['airbase','transport','bridge'].includes(t.type)))assert.deepEqual(t.threats,[]);}
});
test('outside jamming every hostile is selectable, including the passive airfield before its defenses are destroyed',()=>{
 const x=setup('airbase');x.s.position=new Vec3(0,1600,0);let z=8500;for(const t of x.targets.filter(t=>t.team==='enemy')){t.position=new Vec3(0,1600,z);z+=1000;}assert.equal(navigationJammed(x.s,x.targets),false);const eligible=sensorTargets(x.s,x.targets);assert.equal(eligible.length,4);const ids=new Set();for(let i=0;i<4;i++){x.aim.cycle(x.s,x.targets);ids.add(x.aim.id);}assert.ok(ids.has('ENEMY-BASE')&&ids.has('ENEMY-SAM')&&ids.has('JAMMER')&&ids.has('ATTACK-CONVOY'));assert.ok(!ids.has('BASE'));x.aim.id='ENEMY-BASE';x.aim.update(x.s,x.targets,3);assert.equal(x.aim.locked,true);x.s.position=x.by('JAMMER').position.clone().add(new Vec3(0,0,-1000));x.aim.update(x.s,x.targets,.1);assert.equal(x.aim.locked,false);assert.equal(radarContacts(x.s,x.targets).length,0);
});
test('landing training remains unarmed and manual, while transport escort starts airborne with ordinary fuel and weapons for all aircraft',()=>{
 for(const a of aircraft){const landing=createMissionAircraft(a,scenario('landing')),escort=createMissionAircraft(a,scenario('escort-transport'));assert.equal(landing.training,true);assert.equal(landing.landingMode,'off');assert.equal(landing.fuel,trainingAircraft.fuelCapacity*.15);assert.equal(escort.onGround,false);assert.equal(escort.airborne,true);assert.ok(escort.position.y>=1600);assert.equal(escort.gear,false);assert.equal(escort.training,undefined);assert.equal(escort.fuel,a.fuelCapacity*(a.id==='b52'?.9:1));assert.ok(escort.ammo.gun+escort.ammo.aam+escort.ammo.agm+escort.ammo.bomb>0);}
});
test('bridge mission succeeds after timely bridge destruction and landing without requiring the optional convoy kill',()=>{
 const x=setup('convoy');applyTargetHit(x.by('BRIDGE'),'bomb');x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,true);assert.equal(x.m.complete,false);assert.equal(x.by('CONVOY').alive,true);for(let i=0;i<600;i++)updateTargets(x.targets,1);assert.equal(x.by('CONVOY').crossedBridge,undefined);assert.equal(x.by('CONVOY').stopped,true);assert.ok(x.m.objectives.some(o=>o.optional&&!o.done));land(x);assert.equal(x.m.complete,true);
});
test('an intact bridge lets the convoy cross and irreversibly fails the beginner mission',()=>{
 const x=setup('convoy');for(let i=0;i<500&&!x.by('CONVOY').crossedBridge;i++)updateTargets(x.targets,1);assert.equal(x.by('CONVOY').crossedBridge,true);x.m.update(x.s,x.targets,x.w);assert.equal(x.m.failed,true);applyTargetHit(x.by('BRIDGE'),'bomb');land(x);assert.equal(x.m.complete,false);
});
test('base defense requires all three attackers, survival of the base and landing; allied kills count',()=>{
 const x=setup('defend-base'),enemies=x.targets.filter(t=>t.team==='enemy');enemies[0].alive=false;x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,false);for(const t of enemies)t.alive=false;x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,true);assert.equal(x.m.complete,false);assert.ok(x.by('ALLY-SAM').alive&&x.by('ALLY-BUNKER').alive);land(x);assert.equal(x.m.complete,true);
 const lost=setup('defend-base');lost.by('BASE').alive=false;lost.m.update(lost.s,lost.targets,lost.w);assert.equal(lost.m.failed,true);
});
test('killing the bomber does not declare the base safe while its bombs are still falling',()=>{
 const x=setup('defend-base');for(const t of x.targets.filter(t=>t.team==='enemy'))t.alive=false;x.w.projectiles.push({owner:'enemy',targetEntityId:'BASE',type:'bomb'});x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,false);x.w.projectiles=[];x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,true);
});
test('escort succeeds when a surviving transport exits, with live optional enemies; losing it fails immediately',()=>{
 const x=setup('escort-transport'),t=x.by('TRANSPORT');t.position.z=t.exitZ-5;updateTargets(x.targets,1);assert.equal(t.exited,true);x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,true);assert.equal(x.m.complete,false);assert.ok(x.targets.some(t=>t.team==='enemy'&&t.alive));land(x);assert.equal(x.m.complete,true);
 const lost=setup('escort-transport');lost.by('TRANSPORT').alive=false;lost.m.update(lost.s,lost.targets,lost.w);assert.equal(lost.m.failed,true);
});
test('airbase strike has separate missile defense and two mandatory goals; own base loss fails',()=>{
 const x=setup('airbase');assert.deepEqual(x.by('ENEMY-BASE').threats,[]);assert.ok(x.by('ENEMY-SAM').threats.includes('missile'));x.by('ENEMY-BASE').alive=false;x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,false);x.by('ATTACK-CONVOY').alive=false;x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,true);land(x);assert.equal(x.m.complete,true);const lost=setup('airbase');lost.by('BASE').alive=false;lost.m.update(lost.s,lost.targets,lost.w);assert.equal(lost.m.failed,true);
});
test('the base-attacking convoy approaches along its road instead of circling or teleporting',()=>{
 const x=setup('airbase'),t=x.by('ATTACK-CONVOY'),before=t.position.length();for(let i=0;i<1000;i++)updateTargets(x.targets,1);assert.ok(t.position.length()<before);assert.ok(t.routeDistance>=1200);assert.ok(Math.abs(pathCoordinates(terrainWorld.road,t.position.x,t.position.z).across)<1e-6);
});
test('a friendly SAM targets enemies while the player is on the runway and its actual missiles damage them',()=>{
 const x=setup('defend-base'),sam=x.by('ALLY-SAM'),enemy=x.by('FIGHTER1');sam.position=new Vec3(0,3,0);enemy.position=new Vec3(0,700,4000);enemy.velocity=new Vec3(0,0,-90);enemy.heading=Math.PI;Object.assign(defenseState(enemy).countermeasures,{flare:0,chaff:0});x.s.onGround=true;x.s.airborne=false;const units=[sam,enemy];x.w.enemyCombat.activeTime=10;for(let i=0;i<120*30&&enemy.alive;i++){updateTargets(units,1/120);x.w.update(x.s,units,1/120);}assert.ok(enemy.damage>0);assert.equal(x.s.damage,0);assert.ok(x.w.enemyCombat.unit(sam).missiles<6);assert.equal(teamOf(sam,x.s),'ally');
});
test('a fighter missile can hit the protected transport rather than always homing onto the player',()=>{
 const x=setup('escort-transport'),t=x.by('TRANSPORT'),enemy=x.by('FIGHTER1');t.position=new Vec3(0,1700,3000);t.velocity=new Vec3(0,0,100);enemy.position=new Vec3(0,1700,0);enemy.velocity=new Vec3(0,0,165);enemy.heading=0;x.w.enemyCombat=null;const ai=new EnemyCombat();Object.assign(defenseState(t).countermeasures,{flare:0,chaff:0});ai.launch('missile',enemy,t,x.w,ai.unit(enemy));assert.equal(x.w.projectiles[0].targetEntityId,t.id);for(let i=0;i<120*25&&!t.damage;i++){updateTargets([t],1/120);x.w.update(x.s,[enemy,t],1/120);}assert.ok(t.damage>0);assert.equal(x.s.damage,0);
});
test('an unopposed bomber drops ballistic bombs that really destroy the defended base',()=>{
 const x=setup('defend-base'),t=x.by('BOMBER'),base=x.by('BASE');t.position=new Vec3(0,1800,-2500);t.velocity=new Vec3(0,0,t.cruiseSpeed);t.heading=0;t.position.z-=predictBombImpact({spec:x.s.spec,position:t.position,velocity:t.velocity}).z;x.s.onGround=true;x.s.airborne=false;const units=[base,t];x.w.enemyCombat.activeTime=10;for(let i=0;i<60*40&&base.alive;i++){updateTargets(units,1/60);x.w.update(x.s,units,1/60);}assert.equal(base.alive,false);assert.equal(x.s.damage,0);assert.ok(x.w.enemyCombat.unit(t).bombs<12);
});
test('a lightly damaged transport keeps flying its route and still registers its exit',()=>{
 const x=setup('escort-transport'),t=x.by('TRANSPORT');t.position.z=t.exitZ-400;applyTargetHit(t,'gun',{amount:1});for(let i=0;i<120*10&&!t.exited&&t.alive;i++)updateTargets([t],1/120);assert.equal(t.exited,true);assert.equal(t.flight.crashed,false);x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,true);assert.equal(x.m.failed,false);
});
test('the attacking convoy really damages the base, without charging its missed bullets to the player',()=>{
 const x=setup('airbase'),t=x.by('ATTACK-CONVOY'),base=x.by('BASE');t.routeDistance=1200;const units=[base,t];x.w.enemyCombat.activeTime=10;for(let i=0;i<60*50&&base.health===base.maxHealth;i++){updateTargets(units,1/60);x.w.update(x.s,units,1/60);}assert.ok(base.health<base.maxHealth);assert.equal(x.w.used,0);assert.equal(x.w.hits,0);assert.equal(x.w.misses,0);assert.equal(x.s.damage,0);
});
test('flak aimed at the transport bursts near it and damages that aircraft rather than the player',()=>{
 const x=setup('escort-transport'),t=x.by('TRANSPORT'),flak=x.by('FLAK1');t.position=new Vec3(0,1700,3000);t.velocity=new Vec3(0,0,125);flak.position=new Vec3(0,300,1500);x.w.enemyCombat=null;const ai=new EnemyCombat();ai.launch('flak',flak,t,x.w,ai.unit(flak));for(let i=0;i<60*10&&!t.damage;i++){updateTargets([t],1/60);x.w.update(x.s,[flak,t],1/60);}assert.ok(t.damage>0&&t.damage<7);assert.equal(x.s.damage,0);
});


test('base defense adds two distinct friendly launchers and an armed wingman from the player side',()=>{
 for(const player of aircraft){
  const targets=createTargets(scenario('defend-base'),player,{rng:seeded(4)}),s=createMissionAircraft(player,scenario('defend-base'));
  const sams=targets.filter(t=>t.team==='ally'&&t.type==='sam-system'),wingman=targets.find(t=>t.id==='ALLY-FIGHTER');
  assert.equal(sams.length,2);assert.ok(sams[0].position.distance(sams[1].position)>1000);
  assert.equal(wingman.team,'ally');assert.equal(wingman.faction,player.faction);assert.ok(wingman.position.y>1500);
  assert.ok(wingman.velocity.dot(targets.find(t=>t.id==='BOMBER').position)>0);
  const model=aircraft.find(a=>a.id===wingman.aircraftId);assert.equal(model.faction,player.faction);
  const ai=new EnemyCombat(),target=ai.chooseTarget(wingman,s,targets);assert.equal(target.team,'enemy');assert.ok(ai.unit(wingman).missiles>0);
  assert.equal(sensorTargets(s,targets).some(t=>t.id===wingman.id),false);
 }
});

test('the friendly wingman turns on attackers and fires a missile that damages an enemy aircraft',()=>{
 const x=setup('defend-base'),wingman=x.by('ALLY-FIGHTER'),enemy=x.by('FIGHTER1');
 wingman.position=new Vec3(0,2000,0);wingman.velocity=new Vec3(0,0,210);wingman.heading=.2;
 enemy.position=new Vec3(0,2000,4000);enemy.velocity=new Vec3(0,0,145);enemy.heading=0;
 enemy.threats=[];Object.assign(defenseState(enemy).countermeasures,{flare:0,chaff:0});x.s.onGround=true;x.s.airborne=false;
 const units=[wingman,enemy],ai=x.w.enemyCombat;ai.activeTime=10;const heading=wingman.heading;
 for(let i=0;i<120*35&&!enemy.damage;i++){updateTargets(units,1/120);x.w.update(x.s,units,1/120);}
 assert.notEqual(wingman.heading,heading);assert.ok(ai.unit(wingman).missiles<8);assert.ok(enemy.damage>0);assert.equal(x.s.damage,0);
});
