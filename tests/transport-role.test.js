import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft,missionAircraftChoices,missions,transportAircraft} from '../src/aircraftSpec.js';
import {aircraftMesh} from '../src/airframes.js';
import {createMissionAircraft} from '../src/missionStart.js';
import {createTargets,updateTargets} from '../src/targeting.js';
import {Mission} from '../src/mission.js';
import {Weapons} from '../src/weapons.js';
import {missionForAircraft,syncPlayerTransport} from '../src/transportRole.js';
import {updateAIDefense,defenseState,moveEvasiveAircraft} from '../src/aiDefense.js';
import {weaponProfiles} from '../src/weaponDynamics.js';
import {Vec3} from '../src/math.js';
import {defaultLoadout,configureAircraft} from '../src/loadoutPlanner.js';
import {EnemyCombat} from '../src/enemyCombat.js';
const mission=missions.find(m=>m.id==='escort-transport');
test('five transport choices are restricted to transport sorties and have finite defensive stores but no offensive weapons',()=>{
 assert.equal(transportAircraft.length,5);
 for(const spec of transportAircraft){assert.ok(missionAircraftChoices(mission).includes(spec));assert.ok(missionAircraftChoices(missions.find(m=>m.id==='iron-veil')).includes(spec));assert.ok(!missionAircraftChoices(missions.find(m=>m.id==='defend-base')).includes(spec));const s=createMissionAircraft(configureAircraft(spec,defaultLoadout(spec)),mission);assert.ok(s.countermeasures.flare>0&&s.countermeasures.chaff>0);assert.equal(Object.values(s.ammo).reduce((a,b)=>a+b,0),0);assert.equal(s.onGround,false);assert.ok(aircraftMesh(spec.id).points.length>100);assert.throws(()=>createMissionAircraft(spec,missions.find(m=>m.id==='defend-base')));}
});
test('player transport is the protected aircraft, with two escorts and delivery followed by a real landing requirement',()=>{
 const spec=transportAircraft[0],targets=createTargets(mission,spec,{rng:()=>.5}),s=createMissionAircraft(spec,mission),m=new Mission(mission),w=new Weapons();m.update(s,targets,w);const proxy=targets.find(t=>t.playerControlled),escorts=targets.filter(t=>t.defendId===proxy.id);assert.equal(escorts.length,2);assert.deepEqual(proxy.position,s.position);const before=proxy.position.clone();updateTargets([proxy],1);assert.deepEqual(proxy.position,before);
 s.position=new Vec3(proxy.routeX,1700,proxy.exitZ+10);s.agl=1700;m.update(s,targets,w);assert.equal(proxy.exited,true);assert.equal(m.objectiveComplete,true);assert.equal(m.complete,false);s.onGround=true;s.airborne=true;s.landing={success:true,descent:1,offset:0};s.speed=0;m.update(s,targets,w);assert.equal(m.complete,true);
});
test('enemy weapons target the real player, never damage a second hidden transport',()=>{
 const spec=transportAircraft[0],targets=createTargets(mission,spec,{rng:()=>.5}),s=createMissionAircraft(spec,mission);syncPlayerTransport(s,targets);const proxy=targets.find(t=>t.playerControlled),enemy=targets.find(t=>t.type==='fighter'&&t.team==='enemy'),w=new Weapons(),combat=new EnemyCombat();combat.launch('missile',enemy,proxy,w,combat.unit(enemy));assert.equal(w.projectiles[0].targetPlayer,true);assert.equal(w.projectiles[0].targetEntityId,null);assert.equal(combat.chooseTarget(enemy,s,targets),proxy);
});
test('transport version of Iron Veil explicitly briefs its extraction-only role',()=>{const m=missions.find(m=>m.id==='iron-veil'),variant=missionForAircraft(m,transportAircraft[0]);assert.equal(variant.objective,'escort-transport');assert.match(variant.description,/szakasz/);assert.equal(missionForAircraft(m,aircraft[0]),m);});
test('AI transports on either side evade real incoming missiles, spend finite countermeasures and resume their exit route',()=>{
 for(const team of ['ally','enemy']){const spec=transportAircraft[0],s=createMissionAircraft(spec,mission),t={id:'T',kind:'air',type:'transport',aircraftId:'c130',faction:team==='ally'?'west':'east',team,alive:true,position:new Vec3(0,1700,-18000),velocity:new Vec3(0,0,125),cruiseSpeed:125,heading:0,aiRole:'escortee',routeX:0,exitZ:24000},w=new Weapons();w.projectiles=[{id:1,type:'aam',profile:weaponProfiles.aim9m,owner:team==='ally'?'enemy':'ally',targetEntityId:t.id,position:t.position.clone().add(new Vec3(0,0,-2000)),velocity:new Vec3(0,0,700),age:1}];for(let i=0;i<10;i++){updateAIDefense(s,[t],w,.1);updateTargets([t],.1);}assert.ok(t.evasion);assert.ok(Math.abs(t.position.x)>0);assert.ok(defenseState(t).countermeasures.used>0);assert.ok(Math.abs(t.bank)<=25*Math.PI/180+1e-8);w.projectiles=[];for(let i=0;i<200;i++){updateAIDefense(s,[t],w,.1);updateTargets([t],.1);}assert.equal(t.evasion,undefined);assert.ok(t.velocity.z>0);assert.ok(t.alive);}
});

test('lightweight transport evasion does not accumulate vertical speed as new forward energy every frame',()=>{
 const t={alive:true,type:'transport',position:new Vec3(0,1000,0),velocity:new Vec3(0,0,125),heading:0,evasion:{heading:1,remaining:20,altitude:2500}};
 for(let i=0;i<120*10;i++)moveEvasiveAircraft(t,1/120);
 assert.ok(Math.abs(Math.hypot(t.velocity.x,t.velocity.z)-125)<1e-7);assert.ok(t.velocity.length()<126);assert.ok(t.position.y>1000);
});
