import test from 'node:test';
import assert from 'node:assert/strict';
import {Vec3,Quat,forward} from '../src/math.js';
import {aircraft} from '../src/aircraftSpec.js';
import {aiAircraft} from '../src/aiAircraftSpec.js';
import {createAircraft} from '../src/physics.js';
import {applyTargetHit,updateTargets} from '../src/targeting.js';
import {mass} from '../src/performance.js';
import {Weapons} from '../src/weapons.js';
import {EnemyCombat,interceptTime} from '../src/enemyCombat.js';
import {missileLaunchVelocity,weaponProfiles,missileEnvelope,stepMissile} from '../src/weaponDynamics.js';
const f16=aircraft.find(a=>a.id==='f16');
test('intercept solver handles linear, stationary, crossing, unreachable and coincident targets',()=>{
 const origin=new Vec3(),pos=new Vec3(0,0,1000);
 assert.equal(interceptTime(pos,new Vec3(0,0,-680),origin,680),1000/1360);
 assert.equal(interceptTime(pos,new Vec3(0,0,680),origin,680),null);
 assert.equal(interceptTime(pos,new Vec3(0,0,800),origin,680),null);
 assert.equal(interceptTime(pos,new Vec3(),origin,500),2);
 assert.equal(interceptTime(origin,new Vec3(),origin,500),0);
 assert.equal(interceptTime(pos,new Vec3(),origin,0),null);
 for(const velocity of [new Vec3(300,40,-100),new Vec3(0,0,-680+1e-7),new Vec3(0,0,679.999),new Vec3(0,0,-1000)]){
  const time=interceptTime(pos,velocity,origin,680);assert.ok(time>0);const impact=pos.clone().add(velocity.clone().scale(time));assert.ok(Math.abs(impact.length()-680*time)/Math.max(1,impact.length())<1e-8);
 }
});
test('player, enemy and friendly F16 launch the same missile with identical velocity and trajectory',()=>{
 const s=createAircraft(f16);s.position=new Vec3(0,2000,0);s.velocity=new Vec3(0,0,200);s.orientation=Quat.euler(.1,.04,.2);s.onGround=false;s.airborne=true;
 const target={id:'T',aircraftId:'mig29',kind:'air',team:'enemy',alive:true,position:new Vec3(0,2000,3000),velocity:new Vec3(0,0,100)};
 const w=new Weapons();w.selected='aam';w.fire(s,[target],{id:'T',locked:true});assert.equal(w.projectiles.length,1);const own=w.projectiles[0];
 for(const team of ['enemy','ally']){const ai=new EnemyCombat(),t={id:team,type:'fighter',kind:'air',aircraftId:'f16',team,position:s.position.clone(),velocity:s.velocity.clone(),flight:{orientation:s.orientation}};ai.launch('missile',t,target,w,ai.unit(t));const shot=w.projectiles.at(-1);assert.equal(shot.profile.id,own.profile.id);assert.ok(shot.velocity.distance(own.velocity)<1e-12);
  shot.position=own.position.clone();for(let i=0;i<600;i++){const dt=1/120;shot.age+=dt;own.age+=dt;stepMissile(shot,target,s,dt);stepMissile(own,target,s,dt);shot.position.add(shot.velocity.clone().scale(dt));own.position.add(own.velocity.clone().scale(dt));}assert.ok(shot.position.distance(own.position)<1e-9);own.age=0;own.position=s.position.clone();own.velocity=missileLaunchVelocity(s.velocity,forward(s.orientation),own.profile);
 }
});
test('SAM booster is explicit in its profile and the ground launch envelope',()=>{
 const profile=weaponProfiles.sam,source={position:new Vec3(0,2000,0),velocity:new Vec3()},target={position:new Vec3(0,2000,5000),velocity:new Vec3()};
 assert.equal(missileLaunchVelocity(source.velocity,new Vec3(0,0,1),profile,{ground:true}).length(),260);
 assert.equal(missileLaunchVelocity(source.velocity,new Vec3(0,0,1),profile).length(),35);
 assert.ok(missileEnvelope({...source,ground:true},target,profile).maxRange>missileEnvelope(source,target,profile).maxRange);
});
test('unreachable flak solutions do not create a fictitious shot',()=>{
 const ai=new EnemyCombat(),w=new Weapons(),t={id:'F',type:'sam',kind:'ground',team:'enemy',position:new Vec3(0,3,0),velocity:new Vec3()},target={position:new Vec3(0,1000,5000),velocity:new Vec3(0,0,800)};
 assert.equal(ai.launch('flak',t,target,w,ai.unit(t)),false);assert.equal(w.projectiles.length,0);
});
test('every AI-only airframe retains its own mass and wing data after a hit and remains numerically stable',()=>{
 for(const spec of aiAircraft){const t={id:spec.id,kind:'air',aircraftId:spec.id,alive:true,position:new Vec3(0,2000,0),velocity:new Vec3(0,0,145),heading:0};applyTargetHit(t,'gun',{amount:1});assert.equal(t.flight.spec.id,spec.id);assert.equal(mass(t.flight),spec.emptyMass+spec.fuelCapacity*.5);assert.equal(t.flight.flapPosition,0);
 for(let i=0;i<1200&&!t.flight.crashed;i++)updateTargets([t],1/120);assert.ok([t.position.x,t.position.y,t.position.z,t.flight.speed,t.flight.fuel].every(Number.isFinite));assert.equal(t.flight.crashed,false,spec.id);
 }
});
