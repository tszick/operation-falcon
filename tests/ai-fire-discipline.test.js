import test from 'node:test';
import assert from 'node:assert/strict';
import {aiMissileDecision} from '../src/aiFireDiscipline.js';
import {EnemyCombat} from '../src/enemyCombat.js';
import {Weapons} from '../src/weapons.js';
import {aircraft} from '../src/aircraftSpec.js';
import {createAircraft} from '../src/physics.js';
import {Vec3} from '../src/math.js';

test('AI keeps the latter half of its finite load for closer engagement, preserving one opening shot',()=>{
 const solution={canLaunch:true,status:'good',distance:15000,effectiveRange:20000};for(const initialMissiles of [1,2,3,4,6]){const unit={initialMissiles,missiles:initialMissiles};assert.equal(aiMissileDecision(unit,solution).allow,true);unit.missiles=Math.floor(initialMissiles/2);assert.equal(aiMissileDecision(unit,solution).allow,false);assert.equal(aiMissileDecision(unit,{...solution,distance:4000}).allow,unit.missiles>0);}
 assert.equal(aiMissileDecision({initialMissiles:4,missiles:2},{...solution,effectiveRange:5000,distance:4000}).allow,false);
});

test('no conservation decision can override radar, weapon range, terrain or angle rejection',()=>{
 for(const status of ['radar','range','near','terrain','angle'])assert.equal(aiMissileDecision({initialMissiles:4,missiles:4},{canLaunch:false,status,distance:1000,effectiveRange:10000}).allow,false);
});

test('friendly and enemy launchers both hold their reserve at long range and release it in a valid close shot',()=>{
 for(const team of ['ally','enemy']){const player=createAircraft(aircraft.find(a=>a.id==='f16'));player.airborne=false;player.onGround=true;const other=team==='ally'?'enemy':'ally',source={id:'SAM',team,faction:team==='ally'?'west':'east',kind:'ground',type:'sam-system',alive:true,position:new Vec3(0,3,0),velocity:new Vec3(),threats:['missile']},target={id:'T',team:other,kind:'air',type:'transport',alive:true,aircraftId:'c130',position:new Vec3(0,1800,18000),velocity:new Vec3(0,0,-125)},ai=new EnemyCombat(),w=new Weapons(),u=ai.unit(source);u.missiles=3;u.missile=0;u.lock=20;u.targetId=target.id;ai.activeTime=10;ai.update(player,[source,target],w,.1);assert.equal(w.projectiles.length,0);assert.equal(u.missileDecision.reason,'reserve-close-range');target.position.z=4000;u.lock=20;ai.update(player,[source,target],w,.1);assert.equal(w.projectiles.length,1);assert.equal(u.missiles,2);}
});
