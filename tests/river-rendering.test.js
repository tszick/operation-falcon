import test from 'node:test';
import assert from 'node:assert/strict';
import {Vec3} from '../src/math.js';
import {configureTerrain,terrainWorld,pathPoint,terrainHeight} from '../src/terrain.js';
import {riverSection,projectFeaturePolygon} from '../src/terrainFeatures.js';
function seeded(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
test('successive curved river tiles share exact bank vertices without cracks',()=>{
 configureTerrain({id:'bridge'},new Vec3(22000,0,0),()=>0);const r=terrainWorld.river;for(let t=-40000;t<40000;t+=100){const a=riverSection(r,t,100),b=riverSection(r,t+100,100);assert.deepEqual(a[2],b[1]);assert.deepEqual(a[3],b[0]);assert.ok(a.every(p=>p.y===r.level));}
});
test('river bed is below water and both banks meet its level rather than forming a floating strip',()=>{
 configureTerrain({id:'bridge'},new Vec3(22000,0,0),()=>0);const r=terrainWorld.river;for(let t=1000;t<5000;t+=100){const p=pathPoint(r,t);assert.ok(terrainHeight(p.x,p.z)<r.level);for(const edge of riverSection(r,t,100))assert.ok(Math.abs(terrainHeight(edge.x,edge.z)-r.level)<1e-7);for(const bank of riverSection(r,t,100,r.width+18))assert.ok(terrainHeight(bank.x,bank.z)>r.level);}
});
test('the former home-base cutout becomes a continuous detour and preserves the bridge crossing',()=>{
 configureTerrain({id:'bridge'},new Vec3(22000,0,0),()=>0);const r=terrainWorld.river;assert.deepEqual(pathPoint(r,0),new Vec3(22000,0,0));for(let t=-50000;t<=25000;t+=100){const p=pathPoint(r,t);assert.ok(Math.hypot(p.x,p.z)>4500);const section=riverSection(r,t,100);assert.ok(section.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));}
});
test('generated rivers are not dammed by their airfield plateau or home-base protection',()=>{
 for(const id of ['bridge','airbase','bunker','convoy'])for(let seed=1;seed<=25;seed++){const rng=seeded(seed*2654435761),angle=rng()*Math.PI*2;configureTerrain({id},new Vec3(Math.sin(angle)*22000,0,Math.cos(angle)*22000),rng);const r=terrainWorld.river;if(!r)continue;for(let t=-60000;t<=60000;t+=300){const p=pathPoint(r,t);assert.ok(terrainHeight(p.x,p.z)<r.level+1,`${id} seed ${seed} at ${t}`);}}
});
test('water crossing the near camera plane is clipped to a valid polygon instead of vanishing',()=>{
 const r={w:1200,h:800,focal:640,local:p=>p.clone()},points=[new Vec3(-20,0,-5),new Vec3(20,0,-5),new Vec3(20,0,100),new Vec3(-20,0,100)],screen=projectFeaturePolygon(r,points);assert.equal(screen.length,4);assert.ok(screen.every(p=>p.depth>=1&&Number.isFinite(p.x)&&Number.isFinite(p.y)));assert.equal(projectFeaturePolygon(r,points.map(p=>new Vec3(p.x,p.y,-10))).length,0);
});
