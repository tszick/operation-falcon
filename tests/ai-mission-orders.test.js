import test from 'node:test';
import assert from 'node:assert/strict';
import {EnemyCombat} from '../src/enemyCombat.js';
import {Vec3,Quat} from '../src/math.js';
import {aircraft} from '../src/aircraftSpec.js';
import {createAircraft} from '../src/physics.js';
import {applyTargetHit,updateTargets} from '../src/targeting.js';
import {createDamage,applyDamage} from '../src/damage.js';
import {Weapons} from '../src/weapons.js';
const player=()=>{const p=createAircraft(aircraft.find(a=>a.id==='f16'));p.onGround=true;p.airborne=false;return p;};
const fighter=team=>({id:team+'-F',kind:'air',type:'fighter',team,aircraftId:'f16',position:new Vec3(0,2500,0),velocity:new Vec3(0,0,165),heading:0,cruiseSpeed:165});

test('assigned fighters can navigate to distant off-nose orders without receiving an out-of-range firing permit',()=>{
 for(const team of ['ally','enemy']){const t=fighter(team),target={id:'MISSION-TARGET',position:new Vec3(60000,2500,0),velocity:new Vec3(0,0,145)},ai=new EnemyCombat();t.aiTargetId=target.id;ai.steer(t,target,1);assert.ok(t.heading>0&&t.heading<=.04);assert.ok(Math.abs(t.velocity.length()-165)<1e-9);const w=new Weapons();ai.activeTime=10;target.kind='air';target.team=team==='ally'?'enemy':'ally';target.alive=true;ai.update(player(),[t,target],w,.1);assert.equal(w.projectiles.length,0);}
});

test('unassigned distant targets outside the radar cone or range do not cause omniscient steering',()=>{
 const t=fighter('ally'),ai=new EnemyCombat();ai.steer(t,{id:'HIDDEN',position:new Vec3(60000,2500,0),velocity:new Vec3()},1);assert.equal(t.heading,0);ai.steer(t,{position:new Vec3(60000,2500,0),velocity:new Vec3()},1);assert.equal(t.heading,0);t.aiTargetId='KNOWN';ai.steer(t,{id:'HIDDEN',position:new Vec3(60000,2500,0),velocity:new Vec3()},1);assert.equal(t.heading,0);
});

test('a designated SAM prioritizes detected bombers attacking its protected base, symmetrically for either side',()=>{
 for(const side of ['ally','enemy']){const other=side==='ally'?'enemy':'ally',s=player(),base={id:'BASE',type:'airbase',kind:'ground',team:side,alive:true,position:new Vec3(),velocity:new Vec3()},sam={id:'SAM',type:'sam-system',kind:'ground',team:side,alive:true,position:new Vec3(),velocity:new Vec3(),defendId:'BASE'},bomber={id:'B',type:'bomber',kind:'air',team:other,alive:true,position:new Vec3(0,2000,12000),velocity:new Vec3(0,0,-145),cruiseSpeed:145,aiTargetId:'BASE'},near={...bomber,id:'F',type:'fighter',position:new Vec3(0,2000,4000),aiTargetId:null},ai=new EnemyCombat();assert.equal(ai.chooseTarget(sam,s,[base,sam,bomber,near]),bomber);bomber.position.z=50000;assert.equal(ai.chooseTarget(sam,s,[base,sam,bomber,near]),near);bomber.position.z=12000;bomber.retreat={stage:'home'};assert.equal(ai.chooseTarget(sam,s,[base,sam,bomber,near]),near);bomber.retreat=null;bomber.aiTargetId='OTHER-BASE';assert.equal(ai.chooseTarget(sam,s,[base,sam,bomber,near]),near);}
});


test('damaged escort pilots compensate asymmetric control damage while physically following their exit route',()=>{
 for(const aircraftId of ['c130','il76']){const t={id:'T',type:'transport',kind:'air',team:'ally',aircraftId,alive:true,aiRole:'escortee',routeX:8000,routeAltitude:2200,exitZ:30000,position:new Vec3(8000,2200,-6000),velocity:new Vec3(0,0,125),heading:0,cruiseSpeed:125};applyTargetHit(t,'gun',{amount:0});t.flight.condition=createDamage(14);applyDamage(t.flight,18,{part:'leftWing',source:'test'});const fuel=t.flight.fuel;let minAltitude=Infinity;for(let i=0;i<120*330&&!t.exited&&!t.flight.crashed;i++){updateTargets([t],1/120);minAltitude=Math.min(minAltitude,t.position.y);}assert.equal(t.flight.crashed,false,aircraftId);assert.equal(t.exited,true,aircraftId);assert.ok(minAltitude>1700,`${aircraftId} altitude ${minAltitude}`);assert.ok(Math.abs(t.position.x-t.routeX)<500,aircraftId);assert.equal(t.flight.damage,18);assert.ok(t.flight.fuel<fuel);}
});
