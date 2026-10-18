import test from 'node:test';
import assert from 'node:assert/strict';
import {Vec3,Quat} from '../src/math.js';
import {configureTerrain,terrainWorld} from '../src/terrain.js';
import {buildTerrainSurface,renderTerrainSurface} from '../src/terrainSurface.js';
import {Renderer} from '../src/renderer.js';

test('terrain uses a connected opaque triangle surface with shared edges and slope shading',()=>{
 const faces=buildTerrainSurface(0,0,(x,z)=>Math.max(0,1500-Math.hypot(x-3000,z-3000)*.5));
 assert.equal(faces.length,56*56*2);
 const colors=new Set(faces.map(f=>f.color));assert.ok(colors.size>5);
 assert.ok(faces.every(f=>/^rgb\(/.test(f.color)&&f.points.every(p=>Number.isFinite(p.y))));
 // Each internal edge is shared twice; only the perimeter is open.
 const edges=new Map();for(const f of faces)for(let i=0;i<3;i++){const key=[f.points[i],f.points[(i+1)%3]].map(p=>`${p.x},${p.y},${p.z}`).sort().join('|');edges.set(key,(edges.get(key)||0)+1);}
 assert.ok([...edges.values()].every(n=>n===1||n===2));assert.equal([...edges.values()].filter(n=>n===1).length,56*4);
});

test('terrain polygons paint solid fills before visible wire edges and clip across the camera plane',()=>{
 configureTerrain({id:'none'},new Vec3(22000,0,0),()=>.99);
 const r=Object.create(Renderer.prototype);r.w=1200;r.h=800;r.focal=640;r.setup(new Vec3(12000,600,0),Quat.euler(0,-.1,0));
 let fills=0,strokes=0;r.ctx={save(){},restore(){},beginPath(){},moveTo(x,y){assert.ok(Number.isFinite(x)&&Number.isFinite(y));},lineTo(x,y){assert.ok(Number.isFinite(x)&&Number.isFinite(y));},closePath(){},fill(){assert.match(this.fillStyle,/^rgb\(/);fills++;},stroke(){strokes++;}};
 renderTerrainSurface(r);assert.ok(fills>100);assert.equal(strokes,fills*2);
 const cached=r.terrainSurface;renderTerrainSurface(r);assert.equal(r.terrainSurface,cached);
});

test('a ridge hides physical targets while the HUD target frame keeps its projected position',()=>{
 configureTerrain({id:'none'},new Vec3(22000,0,0),()=>.99);terrainWorld.peaks.push({x:12000,z:3000,height:1800,radius:1700,platform:0});
 const r=Object.create(Renderer.prototype);r.w=1200;r.h=800;r.focal=640;r.setup(new Vec3(12000,600,0),Quat.euler(0,0,0));
 const hidden=new Vec3(12000,600,6000),above=new Vec3(12000,4000,6000);
 assert.equal(r.projectWorld(hidden),null);assert.ok(r.projectWorld(above));assert.ok(r.project(hidden));
 let frame=null;r.ctx={strokeRect(...args){frame=args;},fillText(){}};
 const marker=r.marker(hidden,'TARGET',undefined,false);assert.deepEqual(marker,r.project(hidden));assert.ok(frame);
});

test('world edges are clipped at a ridge instead of drawing the hidden end of a line',()=>{
 const r=Object.create(Renderer.prototype),parts=[];r.worldOcclusion=true;r.worldVisible=p=>p.x<=0;r.rawLine=(a,b)=>parts.push([a,b]);
 r.line(new Vec3(-1000,20,0),new Vec3(1000,20,0));
 assert.ok(parts.length>0);assert.ok(parts.every(([a,b])=>a.x<=0&&b.x<=0));assert.ok(parts.at(-1)[1].x> -2);
});
