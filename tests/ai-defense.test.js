import test from 'node:test';
import assert from 'node:assert/strict';
import {Vec3} from '../src/math.js';
import {aircraft} from '../src/aircraftSpec.js';
import {createAircraft} from '../src/physics.js';
import {defenseState,updateAIDefense,retreatFlightInput} from '../src/aiDefense.js';
import {applyTargetHit,updateTargets} from '../src/targeting.js';
import {weaponProfiles} from '../src/weaponDynamics.js';
import {Weapons} from '../src/weapons.js';
import {battleObjectives} from '../src/missionObjectives.js';
const spec=aircraft.find(a=>a.id==='f16');
function player(){const s=createAircraft(spec);s.position=new Vec3(20000,2000,20000);s.onGround=false;s.airborne=true;s.agl=2000;return s;}
function plane(team='enemy'){return {id:team+'-F',type:'fighter',kind:'air',team,faction:team==='ally'?'west':'east',aircraftId:'f16',alive:true,radius:28,position:new Vec3(0,2200,5000),velocity:new Vec3(0,0,160),heading:0,cruiseSpeed:160,threats:['missile','gun']};}
function incoming(t,{guidance='ir',owner=t.team==='ally'?'enemy':undefined,id=1,distance=2000}={}){return {id,type:'aam',owner,sourceId:owner?'SHOOTER':undefined,targetId:owner?undefined:t.id,targetEntityId:owner?t.id:undefined,profile:{...weaponProfiles.aim9m,guidance},position:t.position.clone().add(new Vec3(0,0,-distance)),previous:t.position.clone(),velocity:new Vec3(0,0,700),age:1,travelled:500};}
function bases(){return [{id:'BASE',team:'ally',type:'airbase',kind:'ground',alive:true,position:new Vec3(0,0,0),health:320,maxHealth:320},{id:'ENEMY-BASE',team:'enemy',type:'airbase',kind:'ground',alive:true,position:new Vec3(0,0,30000)}];}
test('both sides react after a delay with the correct finite dispenser, not before threat range',()=>{
 for(const team of ['ally','enemy'])for(const guidance of ['ir','sarh']){
  const s=player(),t=plane(team),w=new Weapons(),p=incoming(t,{guidance});w.projectiles=[p];const cm=defenseState(t).countermeasures,initial=cm.flare;
  updateAIDefense(s,[t],w,.1);assert.equal(cm.used,0);for(let i=0;i<5;i++)updateAIDefense(s,[t],w,.1);
  assert.equal(cm.used,guidance==='ir'?2:1);assert.equal(cm.flare,guidance==='ir'?initial-2:initial);assert.equal(w.events[0].sourceId,t.id);
  cm.flare=cm.chaff=0;for(let i=0;i<30;i++)updateAIDefense(s,[t],w,.1);assert.equal(cm.used,guidance==='ir'?2:1);
 }
 const t=plane(),w=new Weapons(),s=player();w.projectiles=[incoming(t,{distance:8000})];for(let i=0;i<50;i++)updateAIDefense(s,[t],w,.1);assert.equal(defenseState(t).countermeasures.used,0);
});
test('receding, unsupported-guidance and already diverted missiles do not waste defensive stores',()=>{
 const s=player(),t=plane(),w=new Weapons();w.projectiles=[incoming(t,{guidance:'laser'}),{...incoming(t,{id:2}),velocity:new Vec3(0,0,-700)},{...incoming(t,{id:3}),decoyId:1},{...incoming(t,{id:4}),seekerLost:true}];
 for(let i=0;i<20;i++)updateAIDefense(s,[t],w,.1);assert.equal(defenseState(t).countermeasures.used,0);
});
test('damage creation preserves spent AI dispensers; decoys expire even after aircraft loss',()=>{
 const s=player(),t=plane(),w=new Weapons();w.projectiles=[incoming(t)];for(let i=0;i<6;i++)updateAIDefense(s,[t],w,.1);const cm=t.defense.countermeasures;applyTargetHit(t,'gun',{amount:1});assert.equal(defenseState(t).countermeasures,cm);assert.ok(cm.used>0);
 t.alive=false;t.falling=true;for(let i=0;i<100;i++)updateAIDefense(s,[t],w,.1);assert.equal(cm.decoys.length,0);
});
test('missile guidance can be diverted by AI decoys on either side using the shared seeker model',()=>{
 for(const team of ['ally','enemy']){const s=player(),t=plane(team),w=new Weapons({random:()=>.001}),p=incoming(t);w.projectiles=[p];
  for(let i=0;i<240&&!p.decoyId;i++){updateTargets([t],1/120);w.update(s,[t],1/120);}assert.ok(p.decoyId,team);assert.ok(t.defense.countermeasures.used>0);assert.equal(t.damage||0,0);}
});
test('minor damage does not abort; structural and weapon failure trigger a single persistent retreat on both sides',()=>{
 for(const team of ['ally','enemy'])for(const failure of ['structural','weapons']){const s=player(),t=plane(team),w=new Weapons(),bs=bases();applyTargetHit(t,'gun',{amount:5});updateAIDefense(s,[t,...bs],w,.1);assert.equal(t.retreat,undefined);
  if(failure==='weapons')t.flight.condition.parts.weapons=.3;else applyTargetHit(t,'gun',{amount:35});
  updateAIDefense(s,[t,...bs],w,.1);const r=t.retreat;assert.ok(r);assert.equal(r.homeId,team==='ally'?'BASE':'ENEMY-BASE');assert.equal(t.alive,true);assert.equal(t.aiRole,'returning');updateAIDefense(s,[t,...bs],w,.1);assert.equal(t.retreat,r);assert.equal(w.events.filter(e=>e.type==='ai-retreat').length,1);
 }
});
test('returning aircraft stop attacking and remain damageable; fatal ones fall instead of safely exiting',()=>{
 const s=player(),t=plane(),w=new Weapons({enemyFire:true});applyTargetHit(t,'gun',{amount:40});w.update(s,[t,...bases()],.1);assert.ok(t.retreat);assert.equal(w.enemyCombat.units.has(t.id),false);assert.equal(t.retired,undefined);
 applyTargetHit(t,'aam',{amount:100});assert.equal(t.flight.dying,true);const before=t.position.y;for(let i=0;i<120;i++)updateTargets([t],1/120);assert.notEqual(t.position.y,before);assert.equal(t.exited,undefined);
});
test('a homeward controller physically turns toward its base without healing, teleportation or replenishing',()=>{
 const s=player(),t=plane(),w=new Weapons();t.heading=0;t.position=new Vec3(5000,2500,5000);applyTargetHit(t,'gun',{amount:40});updateAIDefense(s,[t,...bases()],w,.1);
 const before=t.position.clone(),damage=t.flight.damage,fuel=t.flight.fuel;for(let i=0;i<120*20;i++)updateTargets([t],1/120);
 assert.ok(t.position.distance(before)>500);assert.ok(t.velocity.x<0);assert.ok(t.velocity.z>0);assert.ok(t.flight.damage>=damage);assert.ok(t.flight.fuel<fuel);assert.equal(t.retired,undefined);assert.equal(t.flight.crashed,false);
});
test('only arrival at the departure point retires an aircraft, without awarding a kill or blocking defense victory',()=>{
 const s=player(),t=plane(),w=new Weapons(),bs=bases();applyTargetHit(t,'gun',{amount:40});updateAIDefense(s,[t,...bs],w,.1);
 t.flight.position=t.retreat.home.clone();t.flight.position.y=2500;retreatFlightInput(t,.1);assert.equal(t.retreat.stage,'exit');assert.equal(t.alive,true);
 t.flight.position=t.retreat.exit.clone();t.flight.position.y=2500;retreatFlightInput(t,.1);assert.equal(t.retired,true);assert.equal(t.exited,true);assert.equal(t.falling,undefined);assert.equal(w.hits,0);assert.equal(w.alliedKills||0,0);
 const report=battleObjectives({spec:{objective:'defend-base'}},s,[t,bs[0]],w);assert.equal(report.complete,true);assert.equal(report.failure,'');
});
test('protected transport retains its exit mission; civilians and pending aircraft do not deploy or retreat',()=>{
 const s=player(),t=plane('ally'),w=new Weapons();t.aiRole='escortee';applyTargetHit(t,'gun',{amount:40});updateAIDefense(s,[t,...bases()],w,.1);assert.equal(t.retreat,undefined);assert.equal(t.aiRole,'escortee');
 for(const extra of [{civilian:true},{pending:true}]){const u={...plane(),...extra};w.projectiles=[incoming(u)];for(let i=0;i<30;i++)updateAIDefense(s,[u],w,.1);assert.equal(u.defense,undefined);}
});

test('available countermeasures improve survival without guaranteeing immunity',()=>{
 const s=player(),t=plane(),w=new Weapons({random:()=>1-1e-15});w.projectiles=[incoming(t)];
 for(let i=0;i<120*8&&!t.damage;i++){updateTargets([t],1/120);w.update(s,[t],1/120);}
 assert.ok(t.defense.countermeasures.used>0);assert.ok(t.damage>0);
});
test('damaged fighters and heavy bombers can actually reach home and exit under the ordinary physics',()=>{
 for(const id of ['f16','f15','mig29','su27','b52','tu95']){
  const s=player(),t={...plane(),aircraftId:id,type:['b52','tu95'].includes(id)?'bomber':'fighter'},w=new Weapons();
  t.position=new Vec3(5000,2500,5000);t.velocity=new Vec3(0,0,170);t.cruiseSpeed=170;applyTargetHit(t,'gun',{amount:40});t.flight.condition.seed=42;updateAIDefense(s,[t,...bases()],w,.01);
  for(let i=0;i<120*600&&t.alive;i++)updateTargets([t],1/120);
  assert.equal(t.retired,true,id);assert.equal(t.flight.crashed,false,id);assert.equal(t.flight.damage,40,id);
 }
});
