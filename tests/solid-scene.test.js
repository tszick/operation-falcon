import test from 'node:test';import assert from 'node:assert/strict';
import {Renderer} from '../src/renderer.js';import {Vec3,Quat} from '../src/math.js';
function renderer(){const r=Object.create(Renderer.prototype);r.w=1000;r.h=800;r.focal=400;r.setup(new Vec3(),new Quat());const fills=[],strokes=[];let path=[];r.ctx={beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},fill(){fills.push({color:this.fillStyle,path:[...path]});},stroke(){strokes.push({color:this.strokeStyle,path:[...path]});}};return {r,fills,strokes};}
const panel={points:[new Vec3(-2,-2,0),new Vec3(2,-2,0),new Vec3(2,2,0),new Vec3(-2,2,0)],faces:[[0,1,2,3]],details:[]};
function overlap(reverse){const {r,fills,strokes}=renderer();r.meshQueue=[];const objects=[{z:10,color:'#near'},{z:20,color:'#far'}];if(reverse)objects.reverse();for(const {z,color}of objects)r.mesh(panel,new Vec3(0,0,z),new Quat(),1,color);assert.equal(fills.length,0);r.flushMeshes();return {fills,strokes};}
test('overlapping solids share a depth pass regardless of submission order; the far outline stays hidden',()=>{
 const forward=overlap(false),reverse=overlap(true);assert.deepEqual(forward,reverse);assert.equal(forward.fills.length,2);assert.equal(forward.strokes.length,1);assert.equal(forward.strokes[0].color,'#near');
});
test('a wall crossing the pilot near plane is clipped and remains opaque instead of disappearing',()=>{
 const {r,fills,strokes}=renderer(),wall={points:[new Vec3(-2,-2,.2),new Vec3(2,-2,10),new Vec3(2,2,10),new Vec3(-2,2,.2)],faces:[[0,1,2,3]],details:[]};r.mesh(wall,new Vec3(),new Quat());assert.equal(fills.length,1);assert.ok(fills[0].path.length>=4);assert.ok([...fills,...strokes].every(({path})=>path.every(p=>p.every(Number.isFinite))));
});
