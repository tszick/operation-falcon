import test from 'node:test';import assert from 'node:assert/strict';import {Renderer} from '../src/renderer.js';import {Vec3,Quat} from '../src/math.js';import {segmentInView,projectedInView} from '../src/viewCulling.js';
import {renderTerrainFeatures,terrainFeatureAlpha,terrainFeatureVisible} from '../src/terrainFeatures.js';import {configureTerrain,terrainWorld,terrainHeight} from '../src/terrain.js';
function renderer(){const r=Object.create(Renderer.prototype);Object.assign(r,{w:1200,h:800,focal:640});r.setup(new Vec3(),new Quat());return r;}
test('invisible smoke centres skip terrain rays while screen-edge smoke retains a safety margin',()=>{
 const r=renderer();let rays=0;r.worldVisible=()=>{rays++;return true;};assert.equal(r.projectWorld(new Vec3(0,0,-10)),null);assert.equal(r.projectWorld(new Vec3(4000,0,100)),null);assert.equal(rays,0);
 const p=new Vec3(-650*100/640,0,100);assert.ok(r.projectWorld(p));assert.equal(rays,1);assert.equal(r.projectWorld(p,0),null);assert.equal(rays,1);assert.equal(projectedInView(r,null),false);
});
test('segment rejection conservatively keeps lines that cross the screen or near plane',()=>{
 const r=renderer();assert.equal(segmentInView(r,new Vec3(-1000,0,100),new Vec3(1000,0,100)),true);assert.equal(segmentInView(r,new Vec3(0,0,-10),new Vec3(0,0,100)),true);
 for(const [a,b]of [[new Vec3(1000,0,100),new Vec3(2000,0,100)],[new Vec3(0,1000,100),new Vec3(0,2000,100)],[new Vec3(0,0,-10),new Vec3(0,0,-20)]])assert.equal(segmentInView(r,a,b),false);
 r.setup(new Vec3(100,200,300),Quat.euler(.4,.7,.8));const toWorld=p=>r.q.rotate(p).add(r.camera);assert.equal(segmentInView(r,toWorld(new Vec3(-1000,0,100)),toWorld(new Vec3(1000,0,100))),true);
});
test('a fully offscreen world line performs no terrain visibility work',()=>{
 const r=renderer();r.worldOcclusion=true;let rays=0,lines=0;r.worldVisible=()=>{rays++;return true;};r.rawLine=()=>lines++;
 r.line(new Vec3(5000,0,100),new Vec3(6000,0,100));assert.equal(rays,0);assert.equal(lines,0);r.line(new Vec3(-50,0,100),new Vec3(50,0,100));assert.ok(rays>0&&lines>0);
});
test('fully faded road and river patches do not issue any Canvas draw calls',()=>{
 assert.equal(terrainFeatureAlpha('road',10500),0);assert.equal(terrainFeatureAlpha('river',36000),0);assert.ok(terrainFeatureAlpha('road',9000)>0);assert.equal(terrainFeatureAlpha('river',1000),1);
 configureTerrain({id:'none'},new Vec3(22000,0,0),()=>.99);terrainWorld.road={x:0,z:20000,angle:0,bend:0,phase:0,width:14};
 const r=renderer();r.setup(new Vec3(0,1000,0),new Quat());let draws=0;r.ctx=new Proxy({},{get:()=>()=>{draws++;},set:()=>{draws++;return true;}});renderTerrainFeatures(r);assert.equal(draws,0);assert.ok(r.terrainFeatureCache.tiles.size>0);
});


test('local sight-ray terrain bounds match unshortened visibility sampling on roads, peaks and the training canyon',()=>{
 let seed=7331;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const reference=(a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,steps=Math.min(80,Math.ceil(Math.hypot(dx,dz)/100));for(let i=1;i<steps;i++){const t=i/steps;if(terrainHeight(a.x+dx*t,a.z+dz*t)>a.y+dy*t+1.5)return false;}return true;};
 for(const id of ['none','bunker','bridge','canyon']){configureTerrain({id},new Vec3(12000,0,14000),random);for(let i=0;i<180;i++){const a=new Vec3(random()*40000-8000,random()*2600,random()*40000-8000),b=new Vec3(random()*40000-8000,random()*2600,random()*40000-8000);assert.equal(terrainFeatureVisible(a,b),reference(a,b),id+'/'+i);}}
});
