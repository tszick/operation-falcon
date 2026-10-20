import test from 'node:test';import assert from 'node:assert/strict';
import {rotationMatrix,meshBuffers,GpuModels} from '../src/gpuModels.js';import {Quat,Vec3} from '../src/math.js';import {aircraftMesh} from '../src/airframes.js';import {groundMesh} from '../src/groundModels.js';
test('GPU rotation matches the simulation quaternion transform for yaw, pitch and bank',()=>{
 for(const q of [new Quat(),Quat.euler(.4,.6,-.8),Quat.euler(Math.PI,.2,1.1)])for(const p of [new Vec3(1,2,3),new Vec3(-8,.4,12)]){const m=rotationMatrix(q),v=q.rotate(p);for(const [index,key]of ['x','y','z'].entries())assert.ok(Math.abs(m[index]*p.x+m[index+3]*p.y+m[index+6]*p.z-v[key])<1e-5);}
});
test('cached GPU geometry keeps closed model faces, edges and detailed collision geometry independent',()=>{
 for(const mesh of [aircraftMesh('f15'),aircraftMesh('tu95'),groundMesh('airbase')]){const faces=mesh.faces.length,points=mesh.points.length,data=meshBuffers(mesh);assert.equal(data.vertices.length,points*5);assert.equal(data.triangles.length,mesh.faces.reduce((sum,f)=>sum+(f.length-2)*3,0));assert.ok(data.edges.length>0);assert.ok([...data.triangles,...data.edges].every(i=>i>=0&&i<points));assert.equal(mesh.faces.length,faces);assert.equal(mesh.points.length,points);}
 const flaps=meshBuffers(aircraftMesh('f16',0,1));assert.ok(flaps.flapCount>0);assert.equal(meshBuffers(aircraftMesh('f16',0,0)).flapCount,0);
 assert.equal(GpuModels.create(),null);
});

test('wire-free GPU buffers separate structural details from face outlines and retain line-only markers',()=>{
 const points=[new Vec3(),new Vec3(1,0,0),new Vec3(0,1,0),new Vec3(0,0,1)];
 const data=meshBuffers({points,faces:[[0,1,2]],details:[[2,3]]});
 assert.deepEqual([...data.details],[2,3]);assert.equal(data.edges.length,8);assert.equal(data.triangles.length,3);
 const markings=meshBuffers({points,edges:[[0,1],[2,3]]});assert.deepEqual([...markings.details],[0,1,2,3]);assert.equal(markings.triangles.length,0);
});
