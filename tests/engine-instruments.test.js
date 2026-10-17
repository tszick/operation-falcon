import test from 'node:test';
import assert from 'node:assert/strict';
import {engineInstruments} from '../src/instruments.js';
const state=(g,throttle=.25)=>({g,throttle,spec:{maxG:9}});
test('throttle indication follows the commanded lever from idle to full and clamps its display',()=>{
 for(const [input,expected] of [[0,0],[.25,25],[.675,68],[1,100],[-.1,0],[1.2,100]])assert.equal(engineInstruments(state(1,input)).throttle,expected);
});
test('signed G indication warns near the appropriate positive or negative structural limit',()=>{
 for(const [g,expected] of [[1,'normal'],[7,'normal'],[7.2,'warning'],[8.9,'warning'],[9,'danger'],[10,'danger'],[-2,'normal'],[-3,'warning'],[-3.6,'danger'],[-4,'danger']]){const r=engineInstruments(state(g));assert.equal(r.g,g);assert.equal(r.level,expected,`${g} G`);}
});
test('a damaged wing lowers the indicated positive load limit exactly as in the damage model',()=>{
 const s=state(7);s.condition={parts:{leftWing:.25,rightWing:1}};
 const r=engineInstruments(s);assert.equal(r.limits.positive,9*(.65+.35*.25));assert.equal(r.level,'danger');assert.equal(r.limits.negative,-3.6);
});
