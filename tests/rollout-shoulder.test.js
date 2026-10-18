import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft,missions} from '../src/aircraftSpec.js';
import {createAircraft,stepAircraft} from '../src/physics.js';
import {createDamage} from '../src/damage.js';
import {Mission} from '../src/mission.js';
import {Weapons} from '../src/weapons.js';
import {Vec3,Quat} from '../src/math.js';
import {configureTerrain,runway,homeHangars} from '../src/terrain.js';
import {rolloutSurface,rolloutLateralTolerance,assessTouchdown} from '../src/landing.js';
const spec=aircraft.find(a=>a.id==='f16'),dt=1/120;
function rolling(x=52,z=0,speed=65){
 configureTerrain({id:'landing'},undefined,()=>.99);
 const s=createAircraft(spec);Object.assign(s,{position:new Vec3(x,2,z),previousPosition:new Vec3(x,2,z),velocity:new Vec3(0,0,speed),orientation:new Quat(),airborne:true,onGround:true,landing:{success:true,descent:1,offset:0},speed,ias:speed,throttle:0});s.condition=createDamage(1);return s;
}
test('both runway shoulders survive braking after touchdown and can finish landing practice',()=>{
 for(const side of [-1,1]){const s=rolling(side*52);assert.equal(rolloutSurface(s).shoulder,true);let warned=false;for(let i=0;i<120*30&&!s.crashed&&s.speed>=.3;i++){stepAircraft(s,{brake:true},dt);warned ||= s.warning.includes('PÁLYASZÉL');}assert.equal(s.crashed,false);assert.ok(s.speed<5);assert.equal(s.landing.success,true);assert.equal(s.damage,0);assert.equal(warned,true);const m=new Mission(missions.find(m=>m.id==='landing'));m.update(s,[],new Weapons());assert.equal(m.complete,true);}
});
test('a real runway touchdown can cross either painted edge while braking without instant destruction',()=>{
 for(const sign of [-1,1]){const s=rolling(sign*44.5);s.onGround=false;s.landing=null;s.position.y=2.001;s.velocity=new Vec3(sign*1.5,-1,65);stepAircraft(s,{},dt);assert.equal(s.landing.success,true);let crossed=false;for(let i=0;i<120*20&&!s.crashed&&s.speed>=.3;i++){stepAircraft(s,{brake:true},dt);crossed ||= Math.abs(s.position.x)>runway.halfWidth;}assert.equal(crossed,true);assert.equal(s.crashed,false);assert.ok(s.speed<5);}
});
test('shoulder tolerance is limited, does not expand runway ends, and does not excuse off-runway touchdown',()=>{
 assert.equal(rolloutLateralTolerance,25);for(const sign of [-1,1]){const s=rolling(sign*(runway.halfWidth+25.1));stepAircraft(s,{brake:true},dt);assert.equal(s.crashed,true);}const end=rolling(0,runway.halfLength+1);stepAircraft(end,{brake:true},dt);assert.equal(end.crashed,true);
 const off=rolling(52);off.onGround=false;off.landing=null;assert.equal(assessTouchdown(off,1,65).fatal,true);
 const takeoff=rolling(52);takeoff.airborne=false;takeoff.landing=null;stepAircraft(takeoff,{},dt);assert.equal(takeoff.crashed,true);
});
test('a small shoulder excursion can return to the runway and remains safe briefly without held brake',()=>{
 const s=rolling(-52);stepAircraft(s,{},dt);assert.equal(s.crashed,false);s.position.x=-44;stepAircraft(s,{brake:true},dt);assert.equal(s.crashed,false);assert.equal(rolloutSurface(s).shoulder,false);assert.ok(!s.warning.includes('PÁLYASZÉL'));
});
test('hangar boxes still cause physical ground collisions even at taxi speed; the open shoulder does not',()=>{
 for(const h of homeHangars){const s=rolling(h.x-h.halfWidth-1,h.z,4);stepAircraft(s,{brake:true},dt);assert.equal(s.crashed,true);assert.match(s.landing.reasons.join(' '),/hangár/);}
 const clear=rolling(65,-900,4);stepAircraft(clear,{brake:true},dt);assert.equal(clear.crashed,false);
});
