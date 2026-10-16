import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft} from '../src/aircraftSpec.js';
import {armament} from '../src/armament.js';
import {Vec3,Quat,DEG} from '../src/math.js';
import {createAircraft,STEP} from '../src/physics.js';
import {Weapons,impactDamage} from '../src/weapons.js';
import {weaponProfiles,weaponProfile,fireSolution,missileEnvelope,stepMissile,spreadDirection,stepBallistic,gunDispersion,gunLead} from '../src/weaponDynamics.js';
import {targetingStatus} from '../src/targeting.js';
import {EnemyCombat} from '../src/enemyCombat.js';
import {terrainHeight} from '../src/terrain.js';
function plane(id='f16',height=1500){const s=createAircraft(aircraft.find(a=>a.id===id));s.onGround=false;s.airborne=true;s.position=new Vec3(0,height,0);s.velocity=new Vec3(0,0,180);s.speed=180;s.orientation=new Quat();return s;}
const target=(distance=3000,height=1500,velocity=new Vec3())=>({id:'T',alive:true,kind:'air',radius:28,aircraftId:'mig29',heading:Math.PI,position:new Vec3(0,height,distance),velocity});
function projectile(profile=weaponProfiles.aim9m,height=1500){return {profile,position:new Vec3(0,height,0),velocity:new Vec3(0,0,300),age:0};}
function advance(p,t,launcher,seconds){for(let i=0;i<Math.round(seconds/STEP);i++){p.age+=STEP;stepMissile(p,t,launcher,STEP);p.position.add(p.velocity.clone().scale(STEP));}}
test('every equipped weapon has explicit finite dynamics; missile families do not share one range',()=>{
 for(const a of aircraft)for(const type of Object.keys(armament(a).weapons)){const p=weaponProfile(a,type);assert.ok(p.id,`${a.id} ${type}`);assert.ok(p.mass>0&&p.life>0&&p.area>0&&p.cd>0);if(p.kind==='missile'){assert.ok(p.minRange>0&&p.maxRange>p.minRange);assert.ok(p.burn>0&&p.thrust>0&&p.dryMass<p.mass);assert.equal(typeof p.guidance,'string');}}
 assert.ok(weaponProfiles.aim120c.maxRange>weaponProfiles.aim9m.maxRange);assert.ok(weaponProfiles.r73.maxRange>weaponProfiles.r60m.maxRange);assert.notEqual(weaponProfiles.maverick.maxRange,weaponProfiles.kh25.maxRange);
});
test('launch envelope improves with speed/altitude and an approaching target, shrinks in a tail chase',()=>{
 const slow=plane('f16',300),fast=plane('f16',300);slow.velocity.z=80;fast.velocity.z=350;const low=target(5000,300),p=weaponProfiles.aim9m;
 assert.ok(missileEnvelope(fast,low,p).maxRange>missileEnvelope(slow,low,p).maxRange);
 const high=plane('f16',9000),highTarget=target(5000,9000);assert.ok(missileEnvelope(high,highTarget,p).maxRange>missileEnvelope(plane('f16',300),low,p).maxRange);
 const s=plane(),toward=target(5000,1500,new Vec3(0,0,-200)),away=target(5000,1500,new Vec3(0,0,200));assert.ok(missileEnvelope(s,toward,p).maxRange>missileEnvelope(s,away,p).maxRange*1.3);
});
test('missile motor burns out, speed then decreases; thinner air preserves energy',()=>{
 const p=projectile(),high=projectile(weaponProfiles.aim9m,9000);advance(p,null,null,p.profile.burn+.5);const burnoutSpeed=p.velocity.length();assert.ok(burnoutSpeed>300);advance(p,null,null,5);assert.ok(p.velocity.length()<burnoutSpeed);
 const lowCoast=projectile(),highCoast=projectile(weaponProfiles.aim9m,9000);lowCoast.age=highCoast.age=10;advance(lowCoast,null,null,4);advance(highCoast,null,null,4);assert.ok(highCoast.velocity.length()>lowCoast.velocity.length());
});
test('turning costs missile energy instead of adding free speed; G and seeker limits are finite',()=>{
 const s=plane(),straight=projectile(),turning=projectile(),a=target(5000),b=target(5000);b.position.x=1500;a.velocity=new Vec3(0,0,-150);b.velocity=new Vec3(200,0,-150);advance(straight,a,s,3);advance(turning,b,s,3);assert.ok(turning.velocity.length()<straight.velocity.length());
 const lost=projectile();lost.age=2;stepMissile(lost,target(-5000),s,STEP);assert.equal(lost.seekerLost,true);
});
test('radar/laser support is required until independent homing, while IR remains autonomous',()=>{
 const s=plane(),t=target(3000),sarh=projectile(weaponProfiles.aim7m);s.orientation=Quat.euler(Math.PI,0,0);advance(sarh,t,s,.3);assert.equal(sarh.seekerLost,true);
 const ir=projectile(weaponProfiles.aim9m);advance(ir,t,s,.3);assert.notEqual(ir.seekerLost,true);
 const closeActive=projectile(weaponProfiles.aim120c);advance(closeActive,t,null,.3);assert.notEqual(closeActive.seekerLost,true);
 const farActive=projectile(weaponProfiles.aim120c);advance(farActive,target(30000),null,.3);assert.equal(farActive.seekerLost,true);
});
test('unarmed missile cannot detonate immediately beside its launcher',()=>{
 const s=plane(),p=projectile();p.age=.05;stepMissile(p,target(100),s,STEP);assert.equal(p.armed,false);p.age=.5;p.travelled=200;stepMissile(p,target(1000),s,STEP);assert.equal(p.armed,true);
});
test('too-close and unreachable launches preserve ammunition, while a marginal launch remains possible',()=>{
 const s=plane(),w=new Weapons(),aim={id:'T',locked:true},before=s.ammo.aam;
 assert.match(w.fire(s,[target(80)],aim),/TÚL KÖZEL/);assert.equal(s.ammo.aam,before);assert.match(w.fire(s,[target(50000)],aim),/LŐTÁVON KÍVÜL/);assert.equal(s.ammo.aam,before);
 const estimate=missileEnvelope(s,target(1000),weaponProfiles.aim9m),t=target(estimate.maxRange*.85),solution=fireSolution(s,t,'aam');assert.equal(solution.status,'marginal');assert.match(w.fire(s,[t],aim),/INDÍTVA/);assert.equal(s.ammo.aam,before-1);
});
test('gun status never says ready at 15 km and uses the same launch gate as missiles',()=>{
 const s=plane(),w=new Weapons(),aim={id:'T',locked:true,progress:2},far=target(15000);w.selected='gun';const status=targetingStatus(s,[far],aim,w);assert.match(status.label,/GÉPÁGYÚHOZ TÁVOL/);assert.doesNotMatch(status.label,/TŰZKÉSZ/);assert.equal(status.solution.status,'range');
 w.selected='aam';const long=target(45000),label=targetingStatus(s,[long],aim,w).label;assert.match(label,/LŐTÁVON KÍVÜL/);assert.match(w.fire(s,[long],aim),/LŐTÁVON KÍVÜL/);
});
test('a failed missile system cannot display a ready launch solution',()=>{const s=plane(),t=target(3000),w=new Weapons();s.condition.parts.weapons=.2;assert.equal(fireSolution(s,t,'aam').canLaunch,false);assert.doesNotMatch(targetingStatus(s,[t],{id:'T',locked:true,progress:2},w).label,/TŰZKÉSZ/);});
test('Gaussian dispersion expands linearly with distance and worsens with damage, heat and G',()=>{
 let seed=142;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const direction=new Vec3(0,0,1),samples=[];
 for(let i=0;i<4000;i++){const v=spreadDirection(direction,.002,random);samples.push(Math.hypot(v.x,v.y)/v.z);}const mean=samples.reduce((sum,r)=>sum+r*r,0)/samples.length;assert.ok(mean>6e-6&&mean<10e-6);const near=samples.map(r=>r*500),far=samples.map(r=>r*2000);assert.ok(far.reduce((a,b)=>a+b,0)>near.reduce((a,b)=>a+b,0)*3.99);
 const s=plane(),p=weaponProfiles.m61,base=gunDispersion(s,p);s.g=7;s.damage=40;assert.ok(gunDispersion(s,p,3)>base*2);
});
test('real fired gun rounds scatter without bending toward a locked target; drag reduces energy and damage',()=>{
 const s=plane(),w=new Weapons({random:()=>.3});w.selected='gun';w.fire(s,[target(500)],{id:'T',locked:true});const p=w.projectiles[0];assert.notEqual(p.velocity.x,0);assert.notEqual(p.velocity.y,0);const initial=p.velocity.length(),before=impactDamage(p,s.velocity);for(let i=0;i<120;i++){stepBallistic(p,STEP);p.position.add(p.velocity.clone().scale(STEP));}assert.ok(p.velocity.length()<initial);assert.ok(impactDamage(p,s.velocity)<before);assert.ok(p.position.y<1500);
});
test('gun lead includes relative target motion, inherited velocity, gravity and drag',()=>{
 const s=plane(),t=target(1200,1500,new Vec3(100,0,30)),profile=weaponProfile(s.spec,'gun'),lead=gunLead(s,t,profile);assert.equal(lead.reachable,true);assert.ok(lead.direction.x>0&&lead.direction.y>0);const p={profile,position:s.position.clone().add(new Vec3(0,0,15)),velocity:s.velocity.clone().add(lead.direction.clone().scale(profile.muzzleSpeed))};let elapsed=0;while(elapsed<lead.time){const dt=Math.min(STEP,lead.time-elapsed);stepBallistic(p,dt);p.position.add(p.velocity.clone().scale(dt));elapsed+=dt;}assert.ok(p.position.distance(t.position.clone().add(t.velocity.clone().scale(elapsed)))<6);assert.equal(gunLead(s,target(15000),profile).reachable,false);
});
test('a late hard defensive turn can defeat the same missile that hits a steady target',()=>{
 function run(evade){const s=plane(),t=target(3000,1500,new Vec3(0,0,-150)),w=new Weapons();let jink=false;assert.match(w.fire(s,[t],{id:'T',locked:true}),/INDÍTVA/);for(let i=0;i<120*70&&w.projectiles.length;i++){s.previousPosition=s.position.clone();s.position.add(s.velocity.clone().scale(STEP));t.previousPosition=t.position.clone();if(evade&&(jink||w.projectiles[0].position.distance(t.position)<250)){jink=true;t.velocity.x=300;t.velocity.z=180;}t.position.add(t.velocity.clone().scale(STEP));w.update(s,[t],STEP);}return w.damageHits||0;}
 assert.equal(run(false),1);assert.equal(run(true),0);
});
test('every equipped missile family can reach an ordinary supported target using actual projectile flight',()=>{
 const checked=new Set();for(const a of aircraft)for(const type of ['aam','agm']){const profile=weaponProfile(a,type);if(!profile||checked.has(profile.id))continue;checked.add(profile.id);const s=plane(a.id),t=target(3000);if(type==='agm'){t.kind='ground';t.position.y=terrainHeight(0,3000)+8;t.radius=60;}const w=new Weapons();w.selected=type;assert.match(w.fire(s,[t],{id:'T',locked:true}),/INDÍTVA/,`${a.id} ${profile.id}`);for(let i=0;i<120*30&&w.projectiles.length;i++){s.previousPosition=s.position.clone();s.position.add(s.velocity.clone().scale(STEP));w.update(s,[t],STEP);}assert.equal(w.damageHits,1,`${a.id} ${profile.id}`);}
 assert.ok(checked.size>=18);
});
test('an enemy fighter cannon follows its actual nose, while turret fire uses lead',()=>{
 const s=plane(),ai=new EnemyCombat(),w=new Weapons(),t={id:'E',type:'fighter',kind:'air',aircraftId:'mig29',position:new Vec3(0,1500,1000),velocity:new Vec3(),heading:0,pitch:0,bank:0};ai.launch('gun',t,s,w,ai.unit(t));assert.ok(w.projectiles[0].velocity.z>700,'round leaves the nose even when target is behind');assert.ok(Math.abs(w.projectiles[0].velocity.x)<20);assert.equal(w.projectiles[0].profile.id,'gsh30');
});
