import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft} from '../src/aircraftSpec.js';
import {createAircraft,stepAircraft,STEP} from '../src/physics.js';
import {aircraftMesh} from '../src/airframes.js';
import {ensureDamage,applyDamage,damageResponse,damageMotion,damageStage,damageWarnings,damageVibration,updateDamage} from '../src/damage.js';
import {engineLayout} from '../src/engineDamage.js';
import {damagedVertex,modelFacePresent,vertexWingHealth} from '../src/modelDamage.js';
import {aircraftHit} from '../src/hitGeometry.js';
import {meshBuffers} from '../src/gpuModels.js';
import {Vec3,Quat} from '../src/math.js';
const flight=id=>{const s=createAircraft(aircraft.find(a=>a.id===id));s.position=new Vec3(0,3000,0);s.orientation=new Quat();s.velocity=new Vec3(0,0,180);s.onGround=false;s.airborne=true;s.elapsed=2.3;s.gear=false;s.flaps=false;ensureDamage(s);return s;};
const kill=(s,i)=>applyDamage(s,67,{part:engineLayout(s.spec)[i].side==='left'?'engineLeft':'engineRight',engineIndex:i});
test('a direct engine hit disables only that engine on two, four and eight engine aircraft',()=>{
 for(const id of ['f15','tu95','b52']){const s=flight(id),count=s.spec.engineCount;kill(s,0);const r=damageResponse(s);assert.equal(r.engines.count,count);assert.equal(r.engines.operating,count-1);assert.equal(r.engine,(count-1)/count);assert.equal(r.engines.health[0],0);assert.ok(r.engines.health.slice(1).every(v=>v===1));assert.equal(s.dying,false);assert.match(damageWarnings(s).join(' '),new RegExp(`${count-1}/${count}`));assert.ok(s.damage<67);}
});
test('independent engines on the same wing can fail without disabling the whole bank',()=>{const s=flight('b52');kill(s,0);kill(s,6);const r=damageResponse(s);assert.equal(r.engines.operating,6);assert.equal(r.engine,.75);assert.equal(r.engines.health[2],1);assert.equal(r.engines.health[4],1);assert.equal(s.dying,false);});
test('engine-out yaw follows the lost engine side and lever arm, and cancels for a symmetric pair',()=>{
 const torque=(indices,id='b52')=>{const s=flight(id);for(const i of indices)kill(s,i);for(let n=0;n<120;n++)damageMotion(s,0,20000,0,150000,STEP);return s.condition.rates.yaw;};
 assert.ok(torque([0])<0);assert.ok(torque([1])>0);assert.ok(Math.abs(torque([6]))>Math.abs(torque([0]))*1.5);assert.ok(Math.abs(torque([0,1]))<1e-12);assert.equal(torque([0],'f16'),0);
});
test('all wing-mounted nacelles and propeller faces share wing deformation and GPU masks',()=>{
 for(const id of ['tu95','b52','c130','il76','airliner']){const mesh=aircraftMesh(id),condition={parts:{leftWing:.4,rightWing:1}},data=meshBuffers(mesh);let checked=0;for(let face=0;face<mesh.faces.length;face++){const index=mesh.faceEngines[face];if(index===null)continue;for(const point of mesh.faces[face]){const left=mesh.points[point].x<0;assert.equal(vertexWingHealth(mesh,point,condition),left?.4:1);assert.equal(data.vertices[point*5+(left?3:4)],1);if(left)assert.ok(damagedVertex(mesh,point,condition).y<mesh.points[point].y);checked++;}}assert.ok(checked>50,id);}
});
test('severing a wing removes its engines and collision surfaces, preserving the opposite wing and body engines',()=>{
 for(const id of ['b52','tu95']){const s=flight(id),mesh=aircraftMesh(id),engine=engineLayout(s.spec).at(-2),start=new Vec3(engine.x,engine.y-5,engine.z).add(s.position),end=new Vec3(engine.x,engine.y+5,engine.z).add(s.position),hit=aircraftHit(s,start,end,{radius:0,moving:false});assert.equal(hit?.engineIndex,engine.index,id);s.condition.parts.leftWing=.08;damageResponse(s);assert.equal(aircraftHit(s,start,end,{radius:0,moving:false}),null,id);for(let i=0;i<mesh.faces.length;i++){const engineIndex=mesh.faceEngines[i];if(engineIndex!==null)assert.equal(modelFacePresent(mesh,mesh.faces[i],s.condition),engineLayout(s.spec)[engineIndex].side==='right');}assert.equal(damageResponse(s).engine,.5);}
 const s=flight('a10'),mesh=aircraftMesh('a10');s.condition.parts.leftWing=.08;assert.equal(damageResponse(s).engine,1);for(let i=0;i<mesh.faces.length;i++)if(mesh.faceEngines[i]!==null)assert.ok(modelFacePresent(mesh,mesh.faces[i],s.condition));
});
test('missile and gun geometry identifies a specific engine rather than a complete side',()=>{const s=flight('b52');for(const e of engineLayout(s.spec)){const a=new Vec3(e.x,e.y-4,e.z).add(s.position),b=new Vec3(e.x,e.y+.3,e.z).add(s.position),hit=aircraftHit(s,a,b,{radius:0,moving:false});assert.equal(hit?.engineIndex,e.index);}});
test('critical airborne damage creates stronger deterministic vibration without changing flight attitude',()=>{
 const s=flight('f16'),before=s.orientation.clone();const strength=()=>Object.values(damageVibration(s)).reduce((sum,v)=>sum+v*v,0);assert.equal(strength(),0);applyDamage(s,30);const light=strength();applyDamage(s,60);assert.ok(strength()>light*10);assert.deepEqual(damageVibration(s),damageVibration(s));assert.deepEqual(s.orientation,before);s.onGround=true;assert.equal(strength(),0);
});
test('smoke originates at the failed engine and a fresh aircraft restores every engine',()=>{const s=flight('b52');kill(s,6);updateDamage(s,.1);assert.ok(s.condition.smoke.length>0);assert.ok(s.condition.smoke[0].position.x<-15);assert.equal(damageResponse(flight('b52')).engines.operating,8);});

test('individual engine failure reduces actual physics thrust rather than only the status display',()=>{for(const id of ['f15','b52']){const intact=flight(id),damaged=flight(id);intact.throttle=damaged.throttle=.8;kill(damaged,0);stepAircraft(intact,{});stepAircraft(damaged,{});assert.ok(Math.abs(damaged.forces.thrustN/intact.forces.thrustN-(damaged.spec.engineCount-1)/damaged.spec.engineCount)<1e-9);assert.ok(damaged.fuelFlow<intact.fuelFlow);}});
test('an isolated engine failure warns even below the general structural damage threshold',()=>{const s=flight('b52');kill(s,6);assert.ok(s.damage<15);assert.equal(damageStage(s).label,'HAJTÓMŰHIBA');assert.ok(damageWarnings(s).length>0);});
