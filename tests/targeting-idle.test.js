import test from 'node:test';
import assert from 'node:assert/strict';
import {Targeting} from '../src/targeting.js';

test('idle targeting clears stale lock progress without touching radar geometry',()=>{
 const aim=new Targeting();aim.progress=.6;aim.locked=true;
 const contacts={ [Symbol.iterator](){throw new Error('Idle targeting must not scan contacts');} };
 for(let i=0;i<120;i++)aim.update({},contacts,1/120);
 assert.equal(aim.id,null);assert.equal(aim.progress,0);assert.equal(aim.locked,false);
});
