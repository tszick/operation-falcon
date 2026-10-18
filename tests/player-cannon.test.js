import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft} from '../src/aircraftSpec.js';
import {aiAircraft} from '../src/aiAircraftSpec.js';
import {armament} from '../src/armament.js';
import {createAircraft} from '../src/physics.js';
import {Weapons} from '../src/weapons.js';
import {createDamage} from '../src/damage.js';
import {Vec3,Quat} from '../src/math.js';
import {gunLead,weaponProfile} from '../src/weaponDynamics.js';
import {applyTargetHit,updateTargets} from '../src/targeting.js';
const dt=1/120;
function setup(shooter='f16',target='mig29',offset=0){
 const s=createAircraft(aircraft.find(a=>a.id===shooter));Object.assign(s,{onGround:false,airborne:true,position:new Vec3(0,2000,0),velocity:new Vec3(0,0,160)});s.condition=createDamage(11);
 const t={id:'ENEMY',type:'fighter',team:'enemy',kind:'air',aircraftId:target,alive:true,radius:28,heading:0,position:new Vec3(offset,2000,400),previousPosition:new Vec3(offset,2000,400),velocity:new Vec3(0,0,160)};
 // Initialise the target's actual flight state without applying any damage.
 applyTargetHit(t,'gun',{amount:0});t.flight.condition=createDamage(7);
 let seed=13;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const w=new Weapons({random});w.selected='gun';return {s,t,w,events:[],aim:{id:null,locked:false}};
}
function tick(x,{fire=true,track=true}={}){
 const {s,t,w}=x;
 if(track){const d=gunLead(s,t,weaponProfile(s.spec,'gun')).direction;s.orientation=Quat.euler(Math.atan2(d.x,d.z),Math.atan2(d.y,Math.hypot(d.x,d.z)),0);}
 if(fire)w.fire(s,[t],x.aim);
 s.previousPosition=s.position.clone();s.position.add(s.velocity.clone().scale(dt));s.elapsed+=dt;updateTargets([t],dt);w.update(s,[t],dt);x.events.push(...w.drainEvents());
}
function engage(x){for(let i=0;i<120*8&&x.t.alive;i++)tick(x);}
test('real unlocked player cannon shots can destroy every selectable enemy aircraft model and the military AI aircraft',()=>{
 const targets=[...aircraft,...aiAircraft.filter(a=>a.id!=='airliner')];
 for(const a of targets){const x=setup('f16',a.id);engage(x);assert.equal(x.t.alive,false,a.id);assert.equal(x.t.falling,true,a.id);assert.equal(x.t.flight.dying,true,a.id);assert.equal(x.w.hits,1,a.id);assert.ok(x.events.some(e=>e.type==='target-hit'&&e.weapon==='gun'&&e.part&&e.amount>0&&e.destroyed),a.id);assert.equal(x.aim.locked,false);}
});
test('every player aircraft with an equipped cannon can kill a moving enemy through actual projectile collisions',()=>{
 for(const a of aircraft.filter(a=>armament(a).weapons.gun)){const x=setup(a.id,a.faction==='west'?'mig29':'f16');engage(x);assert.equal(x.t.alive,false,a.id);assert.ok(x.w.damageHits>1,a.id);assert.ok(x.s.ammo.gun<createAircraft(a).ammo.gun,a.id);}
});
test('cannon destruction continues into physical falling, ground impact and an explosion without awarding another kill',()=>{
 const x=setup();engage(x);assert.equal(x.t.falling,true);
 for(let i=0;i<120*90&&!x.t.flight.crashed;i++)tick(x,{fire:false,track:false});
 assert.equal(x.t.flight.crashed,true);assert.equal(x.t.falling,false);assert.equal(x.w.hits,1);assert.ok(x.events.some(e=>e.type==='explosion'&&e.ground===true));
});
test('gunfire does not home onto an enemy or damage a selected model outside the projectile path',()=>{
 const x=setup('f16','mig29',80);x.aim={id:'ENEMY',locked:true};for(let i=0;i<120*3;i++)tick(x,{track:false});assert.ok(x.w.used>10);assert.equal(x.t.damage,0);assert.equal(x.t.alive,true);assert.equal(x.w.hits,0);assert.equal(x.events.some(e=>e.type==='target-hit'),false);
});
