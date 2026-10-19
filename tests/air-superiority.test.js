import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft,missions} from '../src/aircraftSpec.js';
import {superiorityRoster,playerStrikeRole} from '../src/airSuperiority.js';
import {createTargets} from '../src/targeting.js';
import {createMissionAircraft,serviceAircraft} from '../src/missionStart.js';
import {terrainWorld,terrainHeight} from '../src/terrain.js';
import {Mission} from '../src/mission.js';
import {Weapons} from '../src/weapons.js';
import {RadioDirector} from '../src/radioDirector.js';
import {radioLines} from '../src/radioLines.js';
const scenario=missions.find(m=>m.id==='air-superiority');
function setup(id='f16',random=.5){const spec=aircraft.find(a=>a.id===id),targets=createTargets(scenario,spec,{rng:()=>random}),s=createMissionAircraft(spec,scenario),m=new Mission(scenario),w=new Weapons({enemyFire:true});return {spec,targets,s,m,w,by:id=>targets.find(t=>t.id===id)};}
function land(x){x.s.onGround=true;x.s.airborne=true;x.s.speed=0;x.s.landing={success:true,descent:1,offset:0};x.m.update(x.s,x.targets,x.w);}
test('three allied and four enemy four-ship squadrons start airborne, counting the selected player exactly once',()=>{
 for(const spec of aircraft){const x=setup(spec.id),own=[...x.targets.filter(t=>t.kind==='air'&&t.team==='ally'),{type:x.s.formationRole,squad:x.s.squad,radioCallSign:x.s.radioCallSign,position:x.s.position}],enemy=x.targets.filter(t=>t.kind==='air'&&t.team==='enemy');assert.equal(own.length,12,spec.id);assert.equal(enemy.length,16,spec.id);
 for(const side of [own,enemy])for(let squad=1;squad<=(side===own?3:4);squad++){const group=side.filter(t=>t.squad===squad);assert.equal(group.length,4);assert.equal(group.filter(t=>t.type==='bomber').length,1);assert.equal(group.filter(t=>t.type==='fighter').length,3);assert.equal(new Set(group.map(t=>t.radioCallSign.number)).size,4);assert.ok(group.every(t=>t.position.y>2000));}
 assert.equal(x.s.formationRole,playerStrikeRole(spec)?'bomber':'fighter');assert.equal(x.s.onGround,false);assert.equal(x.s.gear,false);assert.equal(x.targets.filter(t=>t.type==='airbase').length,2);assert.equal(x.targets.filter(t=>t.type==='sam-system').length,2);assert.ok(x.by('BASE').alive);assert.ok(x.by('ENEMY-BASE').position.distance(x.by('BASE').position)>50000);assert.ok(x.s.agl>1800);assert.ok(!x.targets.some(t=>t.pending));for(const r of superiorityRoster(scenario,spec))assert.equal(x.targets.filter(t=>t.type===r.type&&t.team===r.team).length,r.count);
 }
});
test('the player can start in each random squad, always as Falcon One, with full independent callsigns',()=>{
 for(const [r,group]of [[.1,1],[.5,2],[.9,3]]){const x=setup('f16',r);assert.equal(x.s.squad,group);assert.deepEqual(x.s.radioCallSign,{flight:'Falcon',number:1});const own=x.targets.filter(t=>t.team==='ally'&&t.kind==='air');assert.equal(new Set(own.map(t=>t.radioCallSign.flight+' '+t.radioCallSign.number)).size,11);assert.deepEqual(new Set(own.map(t=>t.radioCallSign.flight)),new Set(['Falcon','Ironfist','Viper']));assert.ok(own.filter(t=>t.squad===group).every(t=>t.position.distance(x.s.position)<2000));assert.ok(x.targets.filter(t=>t.team==='enemy'&&t.kind==='air').every(t=>t.position.distance(x.s.position)>30000));}
});
test('each bomber attacks the opposite base while fighters and SAMs select air targets',()=>{
 const x=setup();for(const t of x.targets.filter(t=>t.type==='bomber'))assert.equal(t.aiTargetId,t.team==='ally'?'ENEMY-BASE':'BASE');for(const t of x.targets.filter(t=>t.type==='fighter'||t.type==='sam-system')){const target=x.w.enemyCombat.chooseTarget(t,x.s,x.targets);assert.ok(target===x.s||target.kind==='air');assert.notEqual(target.team,t.team);}
 assert.equal(terrainWorld.site.x,x.by('ENEMY-BASE').position.x);assert.ok(Math.abs(terrainHeight(terrainWorld.site.x,terrainWorld.site.z)-180)<.1);
});
test('victory requires every enemy aircraft and the enemy base, but not the optional SAM, then safe landing',()=>{
 const x=setup();x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,false);for(const t of x.targets.filter(t=>t.team==='enemy'&&t.kind==='air'))t.alive=false;x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,false);x.by('ENEMY-BASE').alive=false;x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,true);assert.equal(x.m.complete,false);assert.equal(x.m.phaseId,'return');assert.equal(x.m.objectives.find(o=>o.id==='enemySam').optional,true);assert.equal(x.m.objectives.find(o=>o.id==='enemySam').done,false);land(x);assert.equal(x.m.complete,true);
});
test('own-base destruction fails irreversibly; incoming bombs must resolve before success',()=>{
 const x=setup();for(const t of x.targets.filter(t=>t.team==='enemy'&&t.type!=='sam-system'))t.alive=false;x.w.projectiles=[{owner:'enemy',targetEntityId:'BASE',type:'bomb'}];x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,false);x.by('BASE').alive=false;x.m.update(x.s,x.targets,x.w);assert.equal(x.m.failed,true);land(x);assert.equal(x.m.complete,false);
});
test('only other squad leaders report ready, while every allied member can report attack',()=>{
 const x=setup(),d=new RadioDirector();d.start(x.s,x.m,x.targets);const ready=d.queue.filter(c=>c.line.group==='wingmanReady');assert.equal(ready.length,2);assert.ok(ready.some(c=>c.line.callSign==='Ironfist One'));assert.ok(ready.some(c=>c.line.callSign==='Viper One'));assert.ok(!ready.some(c=>c.line.callSign.startsWith('Falcon')));assert.deepEqual(ready.map(c=>c.ready),[6,10]);for(const cue of ready)assert.ok((cue.line.clips||[cue.line.id]).every(id=>radioLines.some(line=>line.id===id)));
 const bomber=x.targets.find(t=>t.team==='ally'&&t.type==='bomber');d.event({type:'missile-launch',owner:'enemy',targetId:bomber.id},x.s,x.targets);assert.ok(d.queue.some(c=>c.line.group==='wingmanAttack'&&c.line.unitId===bomber.id));serviceAircraft(x.s);assert.deepEqual(x.s.radioCallSign,{flight:'Falcon',number:1});
});

test('the fourth enemy squad is active immediately and twelve kills no longer secure air superiority',()=>{
 const x=setup(),fourth=x.targets.filter(t=>t.team==='enemy'&&t.squad===4);assert.equal(fourth.length,4);assert.equal(fourth.filter(t=>t.type==='fighter').length,3);assert.equal(fourth.filter(t=>t.type==='bomber').length,1);assert.ok(fourth.every(t=>t.alive&&!t.pending&&t.radioCallSign.flight==='Spectre'));
 for(const t of x.targets.filter(t=>t.team==='enemy'&&t.kind==='air'&&t.squad<4))t.alive=false;x.by('ENEMY-BASE').alive=false;x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,false);assert.match(x.m.objectives.find(o=>o.id==='attackers').text,/12\/16/);
 for(const t of fourth)t.alive=false;x.m.update(x.s,x.targets,x.w);assert.equal(x.m.objectiveComplete,true);
});
