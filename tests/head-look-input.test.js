import test from 'node:test';import assert from 'node:assert/strict';import {HeadLook,headLookLimits} from '../src/headLook.js';import {HeadLookInput} from '../src/headLookInput.js';
function fixture(){const head=new HeadLook(),doc={pointerLockElement:null,exitPointerLock(){this.pointerLockElement=null;}},surface={requestPointerLock(){doc.pointerLockElement=this;}},state={enabled:true,escaped:0};const input=new HeadLookInput(surface,head,doc,{canLook:()=>state.enabled,onEscape:()=>state.escaped++});return {head,doc,surface,state,input};}
function settle(head,start){for(let i=0;i<300;i++)head.update(1/120,start+i/120);}
test('head look restarts from neutral at any cursor coordinate without recentering',()=>{
 const {head,input}=fixture();input.capture();input.changed();input.move({movementX:140,movementY:-70,clientX:1279,clientY:0},0);head.update(.08,.08);assert.ok(head.yaw>0);settle(head,.3);assert.equal(head.yaw,0);assert.equal(head.pitch,0);
 input.move({movementX:10,movementY:-4,clientX:0,clientY:719},3);assert.equal(head.targetYaw,10*headLookLimits.sensitivity);assert.equal(head.targetPitch,4*headLookLimits.sensitivity);
});
test('relative movement continues at screen edges and ignores the hidden cursor hit target',()=>{
 const {head,input}=fixture();input.capture();input.changed();const event={movementX:10,movementY:0,clientX:1279,target:{closest:()=>true}};input.move(event,0);input.move(event,.01);assert.equal(head.targetYaw,20*headLookLimits.sensitivity);
});
test('freeing the cursor for the panel stops head motion; reacquisition starts cleanly',()=>{
 const {head,input,state}=fixture();input.capture();input.changed();input.move({movementX:100,movementY:0},0);input.release();input.changed();input.move({movementX:-200,movementY:100},1);assert.equal(head.targetYaw,0);assert.equal(state.escaped,0);input.capture();input.changed();input.move({movementX:5,movementY:0,clientX:1280},2);assert.equal(head.targetYaw,5*headLookLimits.sensitivity);
});
test('browser Escape releases the head and pauses once; intentional release does not pause',()=>{
 const {input,doc,state}=fixture();input.capture();input.changed();doc.pointerLockElement=null;input.changed();input.changed();assert.equal(state.escaped,1);assert.equal(input.wanted,false);
});
test('a lock granted after pause is immediately released instead of trapping the cursor',()=>{
 const {input,doc,surface,state}=fixture();surface.requestPointerLock=()=>undefined;input.capture();state.enabled=false;input.release();doc.pointerLockElement=surface;input.changed();assert.equal(doc.pointerLockElement,null);assert.equal(input.wanted,false);
});
test('unsupported pointer lock falls back to relative movement and still respects UI exclusion',()=>{
 const {input,surface,head}=fixture();surface.requestPointerLock=undefined;input.capture();input.move({movementX:50,movementY:0,target:{closest:()=>true}},0);assert.equal(head.targetYaw,0);input.move({movementX:5,movementY:0,clientX:999},1);assert.equal(head.targetYaw,5*headLookLimits.sensitivity);
});

test('a rejected browser lock request is handled without trapping the cursor or an unhandled rejection',async()=>{
 const {input,surface,head}=fixture();surface.requestPointerLock=()=>Promise.reject(new Error('unavailable'));input.capture();await new Promise(resolve=>setImmediate(resolve));assert.equal(input.pending,false);assert.equal(input.fallback,true);input.move({movementX:5,movementY:0},0);assert.equal(head.targetYaw,5*headLookLimits.sensitivity);input.release();assert.equal(input.wanted,false);
});
