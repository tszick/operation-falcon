import test from 'node:test';import assert from 'node:assert/strict';
import {cityBatches} from '../src/cityVisuals.js';import {createBattleTargets} from '../src/scenarioSpawn.js';import {missions,aircraft} from '../src/aircraftSpec.js';import {Vec3} from '../src/math.js';import {terrainWorld,pathCoordinates} from '../src/terrain.js';import {groundInstances,buildingDetail} from '../src/groundModels.js';import {buildFeatureBuffers,featureWindow,featurePatchInView} from '../src/gpuFeatures.js';import {runwaySurfaceMesh} from '../src/runwayVisuals.js';
function scene(){return createBattleTargets(missions.find(m=>m.id==='defend-city'),aircraft.find(a=>a.id==='f16'),{rng:()=>.99});}
test('city streets run through all block gaps without crossing any building footprint',()=>{
 const city=scene().filter(t=>t.city),roads=terrainWorld.cityRoads;assert.equal(roads.length,12);
 for(const road of roads)for(const t of city){const p=pathCoordinates(road,t.position.x,t.position.z),half=road.angle===0?t.buildingDepth:t.buildingWidth;assert.ok(Math.abs(p.across)>half+road.width/2);}
 const camera=new Vec3(0,1500,13000),data=buildFeatureBuffers(camera);assert.ok(data.vertices.length>0);assert.ok([...data.vertices].every(Number.isFinite));assert.equal(data.vertices.length%27,0);assert.equal(featureWindow(camera).key,featureWindow(new Vec3(1,1500,13000)).key);
});
test('distant city batches preserve every building face while reducing 25 submissions to one',()=>{
 const targets=scene(),city=targets.filter(t=>t.city),r={camera:new Vec3(0,2000,0),focal:600},batches=cityBatches(r,targets);assert.equal(batches.length,1);assert.equal(batches[0].mesh.faces.length,city.reduce((n,t)=>n+groundInstances(t,{detail:buildingDetail(t,r.camera,r.focal)})[0].mesh.faces.length,0));
 const points=batches[0].mesh.points.map(p=>p.clone().add(batches[0].position)),expected=city.flatMap(t=>groundInstances(t,{detail:'far'}).flatMap(i=>i.mesh.points.map(p=>i.rotation.rotate(p).add(i.position))));assert.equal(points.length,expected.length);points.forEach((p,i)=>assert.ok(p.distance(expected[i])<1e-8));assert.equal(cityBatches(r,targets)[0].mesh,batches[0].mesh);
 city[0].alive=false;const damaged=cityBatches(r,targets);assert.equal(damaged.length,2);assert.ok(damaged.some(b=>b.color==='#56645b'));assert.equal(city[1].alive,true);
});
test('runway pavement is opaque, cached and fits inside the unchanged runway markings',()=>{const m=runwaySurfaceMesh();assert.equal(m,runwaySurfaceMesh());assert.equal(m.faces.length,1);assert.ok(m.points.every(p=>Math.abs(p.x)===45&&Math.abs(p.z)===1600&&p.y>0&&p.y<.8));});

test('road fade rejects distant invisible patches but retains patches straddling the fade boundary',()=>{
 const r={w:1200,h:800,focal:640,local:p=>p};
 assert.equal(featurePatchInView(r,{center:new Vec3(0,0,10505),radius:4,maxDepth:10500}),false);
 assert.equal(featurePatchInView(r,{center:new Vec3(0,0,10502),radius:4,maxDepth:10500}),true);
 assert.equal(featurePatchInView(r,{center:new Vec3(0,0,30000),radius:50,maxDepth:36000}),true);
 assert.equal(featurePatchInView(r,{center:new Vec3(0,0,36051),radius:50,maxDepth:36000}),false);
 assert.equal(featurePatchInView(r,{center:null,radius:0,maxDepth:10500}),false);
});
