import test from 'node:test';
import assert from 'node:assert/strict';
import {aiMissileDecision,missileCommitments} from '../src/aiFireDiscipline.js';
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

test('urgent base defense releases reserves earlier without overriding any launch rejection',()=>{const u={initialMissiles:6,missiles:3},solution={canLaunch:true,distance:12000,effectiveRange:20000};assert.equal(aiMissileDecision(u,solution).allow,false);assert.equal(aiMissileDecision(u,solution,{defendingBase:true}).allow,true);for(const status of ['radar','range','terrain','angle'])assert.equal(aiMissileDecision(u,{...solution,canLaunch:false,status},{defendingBase:true}).allow,false);});


test('a full load no longer permits marginal long-range opening shots',()=>{
 const u={initialMissiles:4,missiles:4},solution={canLaunch:true,status:'marginal',distance:37500,maxRange:43000,effectiveRange:29240};const held=aiMissileDecision(u,solution);assert.equal(held.allow,false);assert.equal(held.reason,'wait-favorable-range');assert.equal(aiMissileDecision(u,{...solution,distance:29240}).allow,true);
});
test('urgent defense allows a bounded extra margin, never the entire marginal envelope',()=>{
 const u={initialMissiles:6,missiles:6},solution={canLaunch:true,maxRange:40000,effectiveRange:20000,distance:21000};assert.equal(aiMissileDecision(u,solution).allow,false);assert.equal(aiMissileDecision(u,solution,{urgentDefense:true}).allow,true);assert.equal(aiMissileDecision(u,{...solution,distance:23000},{urgentDefense:true}).allow,false);assert.equal(aiMissileDecision(u,{...solution,canLaunch:false,status:'radar'},{urgentDefense:true}).allow,false);
});
test('long-range salvos wait for one viable inbound; close or urgent engagements admit at most two',()=>{
 const u={initialMissiles:4,missiles:4},solution={canLaunch:true,effectiveRange:20000,maxRange:30000,distance:15000};assert.equal(aiMissileDecision(u,solution,{inbound:1}).reason,'await-inbound-result');assert.equal(aiMissileDecision(u,{...solution,distance:4000},{inbound:1}).allow,true);assert.equal(aiMissileDecision(u,{...solution,distance:4000},{inbound:2}).allow,false);assert.equal(aiMissileDecision(u,solution,{urgentDefense:true,inbound:1}).allow,true);assert.equal(aiMissileDecision(u,solution,{urgentDefense:true,inbound:2}).allow,false);
});
test('commitments count only live guided missiles, separating teams and unifying the player target',()=>{
 const p={type:'aam',owner:'ally',targetEntityId:'T',age:1,profile:{life:30}},shots=[p,{...p,targetEntityId:null,targetId:'T'},{...p,seekerLost:true},{...p,decoyId:4},{...p,age:30},{...p,type:'gun'},{...p,owner:'enemy'},{...p,owner:'enemy',targetEntityId:null,targetPlayer:true}];const counts=missileCommitments(shots);assert.equal(counts.get('ally:T'),2);assert.equal(counts.get('enemy:T'),1);assert.equal(counts.get('enemy:PLAYER'),1);assert.equal(counts.size,3);
});
test('a support-dependent missile is held during evasion, without blocking an autonomous shot',()=>{
 const u={initialMissiles:4,missiles:4},solution={canLaunch:true,distance:4000,effectiveRange:12000};assert.equal(aiMissileDecision(u,solution,{supportAtRisk:true}).reason,'preserve-guidance-support');assert.equal(aiMissileDecision(u,solution,{supportAtRisk:false}).allow,true);
});
test('two launchers coordinate in the same tick on either team, and retry after diversion',()=>{
 for(const side of ['ally','enemy']){const player=createAircraft(aircraft.find(a=>a.id==='f16')),opponent=side==='ally'?'enemy':'ally';player.airborne=false;player.onGround=true;
 const make=id=>({id,team:side,faction:side==='ally'?'west':'east',kind:'ground',type:'sam-system',alive:true,position:new Vec3(id==='A'?-100:100,3,0),velocity:new Vec3(),threats:['missile']}),a=make('A'),b=make('B'),target={id:'T',team:opponent,kind:'air',type:'transport',aircraftId:'c130',alive:true,position:new Vec3(0,1800,10000),velocity:new Vec3()},ai=new EnemyCombat(),w=new Weapons();ai.activeTime=10;
 for(const source of [a,b]){const u=ai.unit(source);u.missile=0;u.lock=20;u.targetId='T';}
 ai.update(player,[a,b,target],w,.1);assert.equal(w.projectiles.length,1);assert.equal(ai.unit(b).missileDecision.reason,'await-inbound-result');assert.equal(w.events[0].aiInboundOnTarget,0);assert.equal(w.events[0].aiSalvoLimit,1);assert.ok(w.events[0].distanceM<=w.events[0].aiTacticalRangeM);
 w.projectiles[0].decoyId=1;ai.update(player,[a,b,target],w,.1);assert.equal(w.projectiles.length,2);assert.equal(w.projectiles[1].sourceId,'B');}
});
