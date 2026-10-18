import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft,missions} from '../src/aircraftSpec.js';
import {createTargets} from '../src/targeting.js';
import {createMissionAircraft} from '../src/missionStart.js';
import {terrainHeight,terrainWorld,pathPoint} from '../src/terrain.js';
import {Mission} from '../src/mission.js';
import {phaseGuide} from '../src/phaseGuide.js';
import {FlightRecorder} from '../src/flightRecorder.js';
import {evaluateFlight} from '../src/flightDebrief.js';
const spec=missions.find(m=>m.id==='canyon'),plane=aircraft.find(a=>a.id==='f16');
function setup(a=plane){const targets=createTargets(spec,a),s=createMissionAircraft(a,spec),m=new Mission(spec),events=[],w={used:0,misses:0,projectiles:[],emit:e=>events.push(e)};return {s,m,w,targets,events};}
function cross(x,g,{dx=0,dy=0,reverse=false}={}){const p=g.position.clone();p.x+=dx;p.y+=dy;x.s.position=p.clone();x.s.position.z+=reverse?2:-2;x.m.update(x.s,x.targets,x.w);x.s.position=p.clone();x.s.position.z+=reverse?-2:2;x.s.elapsed+=.025;x.m.update(x.s,x.targets,x.w);}
test('canyon has a stable authored valley, high terminal ridge and safe unarmed airborne starts for all aircraft',()=>{
 for(const a of aircraft){const x=setup(a),s=x.s;assert.deepEqual(x.targets,[]);assert.ok(terrainWorld.canyon.training);assert.equal(terrainWorld.river,null);assert.equal(s.training,true);assert.equal(s.onGround,false);assert.equal(s.landingMode,'off');assert.equal(s.gear,false);assert.equal(s.flaps,false);assert.equal(s.fuel,a.fuelCapacity*.5);assert.deepEqual(s.ammo,{gun:0,aam:0,agm:0,bomb:0});assert.ok(s.agl>=200);assert.ok(s.ias>0);assert.equal(s.canyonTraining.gates.length,8);}
 const valley=pathPoint(terrainWorld.canyon,5000),crest=pathPoint(terrainWorld.canyon,15000);assert.ok(terrainHeight(valley.x+1000,valley.z)>terrainHeight(valley.x,valley.z)+500);assert.ok(terrainHeight(crest.x,crest.z)>1400);
});
test('gates require forward, sequential, bounded crossings, interpolating the swept position',()=>{
 const skipped=setup();cross(skipped,skipped.s.canyonTraining.gates[3]);assert.equal(skipped.s.canyonTraining.index,1);const x=setup(),g=x.s.canyonTraining.gates[0];x.s.canyonTraining.previous=g.position.clone();x.s.canyonTraining.previous.z+=2;cross(x,g,{reverse:true});assert.equal(x.s.canyonTraining.index,0);cross(x,g,{dy:1000});assert.equal(x.s.canyonTraining.index,0);assert.equal(x.s.canyonTraining.missed,true);cross(x,g,{dx:900});assert.equal(x.s.canyonTraining.index,0);cross(x,g);assert.equal(x.s.canyonTraining.index,1);assert.equal(x.s.canyonTraining.missed,false);assert.equal(x.events.filter(e=>e.type==='canyon-gate').length,1);
});
test('practice completes airborne only after valley and all ridge gates, with phase help and recorded progress',()=>{
 const x=setup(),rec=new FlightRecorder(),aim={id:null,locked:false,progress:0};x.w.enemyCombat={units:new Map()};rec.start(x.s,x.m,x.targets,x.w,aim);
 for(const [i,g]of x.s.canyonTraining.gates.entries()){cross(x,g);rec.capture(x.s,x.m,x.targets,x.w,aim,{},true);if(i<7){assert.equal(x.m.complete,false);assert.equal(x.m.phaseId,i<4?'canyon-run':'canyon-climb');assert.ok(phaseGuide(x.s,x.m,aim,{...x.w,selected:'none'},[]).length);}}
 assert.equal(x.m.complete,true);assert.equal(x.s.onGround,false);assert.equal(x.s.landing,null);assert.ok(x.m.score>0);assert.ok(x.m.objectives.every(o=>o.done));rec.finish({result:'success'});const log=rec.export();assert.ok(log.entries.some(e=>e.kind==='canyon-progress'&&e.data.gate===8));assert.match(evaluateFlight(log).summary,/kanyon/);
});
test('crash or terminal structural damage cannot award a gate or finish the exercise',()=>{
 const x=setup();x.s.crashed=true;cross(x,x.s.canyonTraining.gates[0]);assert.equal(x.m.complete,false);assert.equal(x.s.canyonTraining.index,0);assert.equal(x.m.phaseId,'failed');const y=setup();y.s.dying=true;cross(y,y.s.canyonTraining.gates[0]);assert.equal(y.m.complete,false);assert.equal(y.s.canyonTraining.index,0);
});

test('the opening canyon has alternating S bends while the final pull-up corridor stays unchanged',()=>{
 setup();const path=terrainWorld.canyon,baseline=t=>12000-650*Math.sin(t/6000);
 const deviations=[2000,6000,8500].map(t=>pathPoint(path,t).x-baseline(t));
 assert.ok(deviations[0]<-300);assert.ok(deviations[1]>300);assert.ok(deviations[2]>0);
 for(const t of [11000,12500,15000,18000])assert.ok(Math.abs(pathPoint(path,t).x-baseline(t))<1e-6);
 for(let t=0;t<9500;t+=100){const a=pathPoint(path,t),b=pathPoint(path,t+100);assert.ok(a.distance(b)<125,'no sharp corners or discontinuities');}
});
