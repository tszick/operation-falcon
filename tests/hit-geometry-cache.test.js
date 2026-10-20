import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft} from '../src/aircraftSpec.js';
import {Vec3,Quat} from '../src/math.js';
import {createDamage} from '../src/damage.js';
import {aircraftHit,closestAircraftSurface} from '../src/hitGeometry.js';
const flight=()=>({spec:aircraft.find(s=>s.id==='f16'),position:new Vec3(),previousPosition:new Vec3(),orientation:new Quat(),mach:0,flapPosition:0,condition:createDamage(123)});

test('cached collision triangles follow changing wing damage and recover without affecting the other wing',()=>{
 const s=flight(),ray=x=>aircraftHit(s,new Vec3(x,10,-1),new Vec3(x,-10,-1),{radius:.05});
 assert.equal(ray(-3)?.part,'leftWing');assert.equal(ray(3)?.part,'rightWing');
 const original=closestAircraftSurface(s,new Vec3(-4.5,0,-1));
 s.condition.parts.leftWing=.05;assert.equal(ray(-3),null);assert.equal(ray(3)?.part,'rightWing');
 const damaged=closestAircraftSurface(s,new Vec3(-4.5,0,-1));assert.ok(damaged.distance>original.distance);
 s.condition.parts.leftWing=1;assert.equal(ray(-3)?.part,'leftWing');assert.deepEqual(closestAircraftSurface(s,new Vec3(-4.5,0,-1)),original);
});
test('triangle prefilter retains proximity-fuse hits and swept hits on moving, rotated aircraft',()=>{
 const s=flight();s.orientation=Quat.euler(.8,.2,-.5);s.previousPosition=new Vec3(-12,0,0);
 let hits=0;for(let x=-5;x<=5;x++){const a=s.orientation.rotate(new Vec3(x,15,-1)),b=s.orientation.rotate(new Vec3(x,-15,-1)),exact=aircraftHit(s,a,b,{radius:0}),fused=aircraftHit(s,a,b,{radius:7});if(exact){hits++;assert.ok(fused);}}
 assert.ok(hits>0);
});
