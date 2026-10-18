import test from 'node:test';import assert from 'node:assert/strict';
import {visibleMeshEdges} from '../src/hiddenLines.js';
const panel=[{x:-1,y:-1,depth:10},{x:1,y:-1,depth:10},{x:1,y:1,depth:10},{x:-1,y:1,depth:10}];
for(const perspective of [true,false])test(`solid face hides rear details, retains front details and clips partially exposed edges (${perspective?'perspective':'hangar'})`,()=>{
 const screen=[...panel,{x:-2,y:0,depth:20},{x:2,y:0,depth:20}];
 const rear=visibleMeshEdges(screen,[[0,1,2,3]],[[4,5]],{perspective}).filter(([a,b])=>a.y===0&&b.y===0);
 assert.equal(rear.length,2);assert.ok(rear.every(([a,b])=>b.x<=-1||a.x>=1));
 screen[4].depth=screen[5].depth=5;const front=visibleMeshEdges(screen,[[0,1,2,3]],[[4,5]],{perspective}).filter(([a,b])=>a.y===0&&b.y===0);
 assert.ok(front.some(([a,b])=>a.x<=0&&b.x>=0));
 screen[4].depth=screen[5].depth=10;assert.ok(visibleMeshEdges(screen,[[0,1,2,3]],[[4,5]],{perspective}).some(([a,b])=>a.y===0&&b.y===0&&a.x<=0&&b.x>=0));
});
test('solid faces keep their own exposed silhouette and ignore missing near-plane vertices',()=>{
 const outline=visibleMeshEdges(panel,[[0,1,2,3]]);assert.equal(outline.length,4);assert.deepEqual(visibleMeshEdges([null,...panel.slice(1)],[[0,1,2,3]]).length,2);
});
