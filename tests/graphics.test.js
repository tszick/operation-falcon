import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft} from '../src/aircraftSpec.js';
import {missions} from './fixtures/scenarios.js';
import {aircraftMesh,airframes} from '../src/airframes.js';
import {createTargets} from '../src/targeting.js';
import {createStars,projectStar,starOccluded} from '../src/sky.js';
import {Vec3,Quat,forward,up,right} from '../src/math.js';

test('each selectable aircraft has finite geometry, closed faces and its own silhouette',()=>{
 const signatures=new Set();
 for(const spec of aircraft){assert.ok(airframes[spec.id],spec.name);const mesh=aircraftMesh(spec.id);assert.equal(mesh.id,spec.id);assert.ok(mesh.points.length>100);assert.ok(mesh.faces.length>50);assert.ok(mesh.points.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));for(const face of mesh.faces){assert.ok(face.length>=3);assert.ok(face.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.points.length));}signatures.add(JSON.stringify(mesh.points));}
 assert.equal(signatures.size,aircraft.length);
});
test('swept wings narrow with Mach without moving the nose or tail geometry',()=>{const open=aircraftMesh('f14',0),swept=aircraftMesh('f14',1);const width=m=>Math.max(...m.points.map(p=>Math.abs(p.x)));assert.ok(width(swept)<width(open)*.85);assert.equal(open.points[0].z,swept.points[0].z);assert.equal(airframes.a10.fins,2);assert.equal(airframes.mig29.engines,2);assert.equal(airframes.f16.engines,1);});
test('all selectable aircraft face opposing-faction air targets with matching models',()=>{for(const spec of aircraft)for(const m of missions.filter(m=>m.kind==='air')){const t=createTargets(m,spec)[0];assert.notEqual(t.faction,spec.faction,`${spec.name}/${m.id}`);assert.ok(airframes[t.aircraftId],t.name);assert.equal(aircraftMesh(t.aircraftId).id,t.aircraftId);assert.ok(t.name);assert.ok(Math.abs(Math.atan2(t.velocity.x,t.velocity.z)-t.heading)<1e-12);if(m.id==='fighter'){assert.equal(aircraft.find(a=>a.id===t.aircraftId).faction,t.faction);}}});
test('bomber and transport missions preserve their own silhouettes on both sides',()=>{for(const [faction,expected]of[['west',['tu95','il76']],['east',['b52','c130']]]){assert.equal(createTargets(missions.find(m=>m.id==='bomber'),{faction})[0].aircraftId,expected[0]);assert.equal(createTargets(missions.find(m=>m.id==='transport'),{faction})[0].aircraftId,expected[1]);}});
test('stars stay in the world upper hemisphere and rotate to the lower screen when inverted',()=>{const stars=createStars();assert.deepEqual(stars,createStars());assert.ok(stars.every(s=>s.direction.y>0&&Math.abs(s.direction.length()-1)<1e-12));const star={direction:new Vec3(0,.3,Math.sqrt(.91))};const basis=q=>({f:forward(q),u:up(q),r:right(q)}),normal=projectStar(star,basis(new Quat()),1000,600,480),inverted=projectStar(star,basis(Quat.euler(0,0,Math.PI)),1000,600,480);assert.ok(normal.y<600*.53);assert.ok(inverted.y>600*.53);assert.equal(projectStar(star,basis(Quat.euler(Math.PI,0,0)),1000,600,480),null);});
test('mountains occlude low stars, while high stars and flat open sky remain clear',()=>{const low=new Vec3(0,.04,Math.sqrt(1-.04**2)),position=new Vec3(0,100,0);assert.equal(starOccluded(low,position,()=>600),true);assert.equal(starOccluded(low,position,()=>0),false);assert.equal(starOccluded(new Vec3(0,.5,Math.sqrt(.75)),position,()=>600),false);});
