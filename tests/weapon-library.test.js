import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft} from '../src/aircraftSpec.js';
import {armament} from '../src/armament.js';
import {weaponEntries,countermeasureEntries,weaponLibraryRows} from '../src/weaponLibrary.js';
import {weaponPreviewMesh} from '../src/weaponPreview.js';
import {weaponProfile,fireSolution} from '../src/weaponDynamics.js';
import {createAircraft} from '../src/physics.js';
import {Vec3,Quat} from '../src/math.js';
test('library covers every installed weapon name and aircraft with the live dynamics profile',()=>{
 for(const a of aircraft)for(const [type,mount]of Object.entries(armament(a).weapons)){const profile=weaponProfile(a,type),entry=weaponEntries.find(e=>e.profile?.id===profile.id);assert.ok(entry,a.id+'/'+mount.name);assert.ok(entry.aliases.includes(mount.name));assert.ok(entry.carriers.includes(a.name));assert.equal(entry.profile,profile);assert.ok(weaponLibraryRows(entry).every(([key,value])=>key&&value));}
 assert.ok(!weaponEntries.some(e=>['sam','groundGun','defense'].includes(e.profile?.id)));
});
test('documented missile target restrictions agree with the actual firing solution for every carrier',()=>{
 for(const a of aircraft)for(const type of ['aam','agm']){if(!armament(a).weapons[type])continue;const s=createAircraft(a);s.position=new Vec3(0,3000,0);s.velocity=new Vec3(0,0,200);s.orientation=new Quat();const e=weaponEntries.find(e=>e.profile===weaponProfile(a,type)),wrong={kind:type==='aam'?'ground':'air',position:new Vec3(0,3000,3000),velocity:new Vec3()};assert.equal(fireSolution(s,wrong,type).status,'wrong-type');assert.match(e.cannot,type==='aam'?/Földi célokra nem indítható/:/Repülőgépre nem indítható/);assert.match(e.operation,/Zavarózónában nincs indítás/);}
});
test('weapon and countermeasure entries all have valid preview geometry and distinct defensive guidance',()=>{
 for(const e of [...weaponEntries,...countermeasureEntries]){const mesh=weaponPreviewMesh(e);assert.ok(mesh.faces.length>0);assert.ok(mesh.points.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));assert.ok(mesh.faces.every(face=>face.length>=3&&face.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.points.length)));}
 const flare=countermeasureEntries.find(e=>e.type==='flare'),chaff=countermeasureEntries.find(e=>e.type==='chaff');assert.match(flare.usable,/Infravörös/);assert.match(chaff.usable,/radaros/);assert.match(flare.operation,/5:/);assert.match(chaff.operation,/6:/);assert.match(flare.cannot,/gránát/);assert.match(chaff.cannot,/gránát/);
});

test('naval library documents active Sea Sparrow and RAM profiles and the SeaRAM system separately',()=>{const sea=weaponEntries.find(e=>e.id==='weapon-seaSparrow'),ram=weaponEntries.find(e=>e.id==='weapon-ram'),system=weaponEntries.find(e=>e.id==='weapon-searam');assert.equal(sea.profile.guidance,'sarh');assert.equal(sea.profile.maxRange,9000);assert.equal(ram.profile.id,'ram');assert.match(ram.operation,/két rakéta/);assert.match(system.description,/működik/);assert.ok(weaponLibraryRows(ram).some(([k,v])=>k==='Hordozó egységek'&&v.includes('romboló')));});
