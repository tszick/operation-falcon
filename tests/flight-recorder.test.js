import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightRecorder} from '../src/flightRecorder.js';
import {analyzeFlight} from '../src/flightLogAnalysis.js';
import {aircraft,missions} from '../src/aircraftSpec.js';
import {createMissionAircraft} from '../src/missionStart.js';
import {createAircraft,stepAircraft} from '../src/physics.js';
import {createTargets,Targeting} from '../src/targeting.js';
import {Mission} from '../src/mission.js';
import {Weapons} from '../src/weapons.js';
import {Vec3,Quat,DEG} from '../src/math.js';
import {applyDamage} from '../src/damage.js';
import {approachSpeeds,atmosphere} from '../src/performance.js';
import {touchdownProblems} from '../src/landing.js';
const spec=aircraft.find(a=>a.id==='f16');
function setup(id='escort-transport'){const scenario=missions.find(m=>m.id===id),targets=createTargets(scenario,spec,{rng:()=>.2}),s=createMissionAircraft(spec,scenario),w=new Weapons(),aim=new Targeting(),mission=new Mission(scenario);mission.update(s,targets,w,aim);const batches=[],resets=[],rec=new FlightRecorder({onReset:m=>resets.push(m),onBatch:(m,entries)=>batches.push({m,entries})});rec.start(s,mission,targets,w,aim);return {s,w,aim,mission,targets,rec,batches,resets};}
test('logs phases and discrete actions at simulation time, samples at 10 Hz, and captures AI/world state',()=>{
 const x=setup();for(let i=1;i<=120;i++){x.s.elapsed=i/120;if(i===60)x.mission.setPhase('return','HAZATÉRÉS','BASE');x.rec.capture(x.s,x.mission,x.targets,x.w,x.aim,{pitch:i<60?1:0});}x.rec.flush();const log=x.rec.export(),samples=log.entries.filter(e=>e.kind==='sample');assert.equal(samples.length,11);assert.equal(log.entries.filter(e=>e.kind==='world').length,3);assert.equal(log.entries.filter(e=>e.kind==='phase').at(-1).data.id,'return');assert.equal(log.entries.filter(e=>e.kind==='controls').length,3);assert.ok(samples[1].data.player.massKg>0);assert.equal(log.entries.find(e=>e.kind==='world').data.units.length,x.targets.length);assert.ok(x.batches.length>0);
});
test('every restart discards the previous mission, including entries, pending chunks and unit state',()=>{
 const x=setup();x.rec.event('marker',{old:true});x.rec.finish({result:'abandoned'});x.rec.start(x.s,x.mission,[],x.w,x.aim);assert.equal(x.resets.length,2);assert.equal(x.rec.entries.some(e=>e.kind==='marker'||e.kind==='mission-end'),false);assert.equal(x.rec.entries.find(e=>e.kind==='world').data.units.length,0);assert.equal(x.rec.entries[0].seq,0);
});
test('samples are immutable and a finished flight stops collecting while its result remains exportable',()=>{
 const x=setup(),before=x.rec.export().entries.find(e=>e.kind==='sample').data.player.position.y;x.s.position.y=9999;x.rec.finish({result:'crash'});const count=x.rec.entries.length;x.rec.capture(x.s,x.mission,x.targets,x.w,x.aim,{},true);assert.equal(x.rec.entries.length,count);assert.equal(x.rec.export().entries.find(e=>e.kind==='sample').data.player.position.y,before);assert.equal(x.batches.at(-1).m.result.result,'crash');
});
test('crash contact retains actual speed, sink, attitude, damage and rejection reasons before velocity is zeroed',()=>{
 const x=setup('landing');x.s.position=new Vec3(0,2.0001,-1000);x.s.velocity=new Vec3(0,-7,75);x.s.orientation=Quat.euler(0,3*DEG,0);x.s.gear=false;stepAircraft(x.s,{});x.rec.capture(x.s,x.mission,x.targets,x.w,x.aim,{},true);assert.equal(x.s.crashed,true);assert.equal(x.s.velocity.length(),0);const touchdown=x.rec.entries.find(e=>e.kind==='touchdown').data;assert.ok(touchdown.speedKmh>200);assert.ok(touchdown.sinkMps>6);assert.ok(touchdown.problems.some(s=>s.includes('futómű')));const a=analyzeFlight(x.rec.export());assert.ok(a.observations.some(s=>s.includes('süllyedés')));
});
test('loaded damaged aircraft may touch down at the IAS requested by the landing guide',()=>{
 const s=createAircraft(aircraft.find(a=>a.id==='mig31'));s.position=new Vec3(0,2,-1000);s.orientation=Quat.euler(0,3*DEG,0);applyDamage(s,50,{part:'leftWing'});const target=approachSpeeds(s).target;assert.ok(target>396);const speed=target/3.6/Math.sqrt(atmosphere(s.position.y).density/1.225);assert.equal(touchdownProblems(s,1,speed).some(s=>s.includes('sebesség')),false);assert.ok(touchdownProblems(s,1,speed*1.5).some(s=>s.includes('sebesség')));
});
test('practice and combat aircraft use the same touchdown checks when their flight state is the same',()=>{
 for(const a of aircraft){const practice=createMissionAircraft(a,missions.find(m=>m.id==='landing')),combat=createAircraft(a);for(const s of [practice,combat]){s.position=new Vec3(0,2,-1000);s.orientation=Quat.euler(0,3*DEG,0);s.gear=true;s.fuel=a.fuelCapacity*.15;s.ammo={gun:0,aam:0,agm:0,bomb:0};}assert.deepEqual(touchdownProblems(practice,1,72),touchdownProblems(combat,1,72),a.id);}
});
