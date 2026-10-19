import test from 'node:test';import assert from 'node:assert/strict';
import {aircraft} from '../src/aircraftSpec.js';import {createAircraft} from '../src/physics.js';import {Vec3,Quat} from '../src/math.js';import {EnemyCombat} from '../src/enemyCombat.js';import {Weapons} from '../src/weapons.js';import {combatSource,groundCombatRows} from '../src/unitCombat.js';import {unitTypes} from '../src/unitTypes.js';import {guidedLaunchStatus,fireSolution,weaponProfiles,gunEffectiveRange,enemyProfile} from '../src/weaponDynamics.js';import {radarContact} from '../src/sensors.js';
const spec=aircraft.find(a=>a.id==='f16');
function player(){const s=createAircraft(spec);Object.assign(s,{position:new Vec3(0,2000,4000),velocity:new Vec3(),onGround:false,airborne:true,agl:2000});return s;}
function fighter(team='enemy',range=spec.radarRange){return {id:'F',type:'fighter',kind:'air',team,faction:team==='ally'?'west':'east',aircraftId:'f16',alive:true,position:new Vec3(0,2000,0),velocity:new Vec3(),heading:0,threats:['missile','gun'],flight:{spec:{...spec,radarRange:range,faction:team==='ally'?'west':'east'},orientation:new Quat(),condition:{parts:{weapons:1}}},combatSeed:1234};}
function step(ai,s,units,w,seconds){for(let i=0;i<seconds*60;i++)ai.update(s,units,w,1/60);}
test('the same missile and radar produce identical player, enemy and friendly launch decisions',()=>{
 const target={kind:'air',position:new Vec3(0,2000,4000),velocity:new Vec3(0,0,-100)};
 for(const team of ['enemy','ally']){const t=fighter(team),source=combatSource(t,player());const own={...createAircraft(source.spec),position:source.position,velocity:source.velocity,orientation:source.orientation};for(const z of [100,2000,8000,20000,100000]){target.position.z=z;assert.equal(guidedLaunchStatus(source,target,enemyProfile(t,'aam')).canLaunch,fireSolution(own,target,'aam').canLaunch,team+'/'+z);}}
});
test('AI cannot acquire or launch outside its own radar range or behind its radar cone',()=>{
 const s=player(),t=fighter('enemy',3000),w=new Weapons(),ai=new EnemyCombat();ai.activeTime=10;step(ai,s,[t],w,6);assert.equal(w.projectiles.filter(p=>p.type==='aam').length,0);s.position.z=-2000;step(ai,s,[t],w,6);assert.equal(w.projectiles.filter(p=>p.type==='aam').length,0);s.position.z=2000;step(ai,s,[t],w,3);assert.ok(w.projectiles.some(p=>p.type==='aam'));
});
test('player stale lock cannot bypass radar range, matching the AI restriction',()=>{
 const s=player();s.spec={...spec,radarRange:3000};s.position=new Vec3(0,2000,0);s.orientation=new Quat();const target={id:'T',kind:'air',position:new Vec3(0,2000,4000),velocity:new Vec3()};assert.equal(fireSolution(s,target,'aam').status,'radar');assert.equal(radarContact(s,target),false);
});
test('friendly and hostile SAMs use the same published radar and missile range',()=>{
 const counts=[];for(const team of ['enemy','ally']){const s=player(),sam={id:'SAM',kind:'ground',type:'sam-system',team,faction:team==='ally'?'west':'east',alive:true,position:new Vec3(0,3,0),velocity:new Vec3(),threats:['missile']},target=team==='enemy'?s:{...fighter('enemy'),id:'TARGET',position:s.position.clone()};const units=team==='enemy'?[sam]:[sam,target],w=new Weapons(),ai=new EnemyCombat();ai.activeTime=10;if(team==='ally'){s.onGround=true;s.airborne=false;}target.position.z=26000;step(ai,s,units,w,6);assert.equal(w.projectiles.length,0);target.position.z=4000;step(ai,s,units,w,3);counts.push(w.projectiles.length);assert.equal(combatSource(sam,s).spec.radarRange,unitTypes['sam-system'].radarRange);assert.ok(groundCombatRows('sam-system').some(([key,value])=>key==='Radar'&&value.includes('24')));}
 assert.ok(counts[0]>0);assert.equal(counts[0],counts[1]);
});
test('AI cannons have the same altitude-dependent effective range and no extra twenty-percent bonus',()=>{
 for(const team of ['enemy','ally']){const s=player(),t=fighter(team),w=new Weapons(),ai=new EnemyCombat();t.threats=['gun'];t.position.y=300;t.flight.spec.radarRange=0;const target=team==='enemy'?s:{...fighter('enemy'),id:'TARGET'};target.position=new Vec3(0,300,1600);const units=team==='enemy'?[t]:[t,target];if(team==='ally'){s.onGround=true;s.airborne=false;}ai.activeTime=10;assert.equal(gunEffectiveRange(t,enemyProfile(t,'gun')),gunEffectiveRange({position:t.position},weaponProfiles.m61));step(ai,s,units,w,5);assert.equal(w.projectiles.length,0);target.position.z=1000;step(ai,s,units,w,1);assert.ok(w.projectiles.some(p=>p.type==='gun'));}
});
test('jamming and an exactly failed weapon system also block AI missile launches',()=>{
 for(const failure of ['jam','weapons']){const s=player(),t=fighter(),w=new Weapons(),ai=new EnemyCombat();ai.activeTime=10;const units=[t];if(failure==='jam')units.push({id:'J',type:'jammer',kind:'ground',team:'ally',faction:'west',alive:true,jamRadius:7000,position:t.position.clone()});else t.flight.condition.parts.weapons=.35;step(ai,s,units,w,8);assert.equal(w.projectiles.length,0,failure);}
});

test('the superiority loadout advantage follows the missile, not whether the F15 is friendly or hostile',()=>{
 for(const team of ['ally','enemy']){
  const source=combatSource({...fighter(team),aircraftId:'f15',flight:null,position:new Vec3(0,2500,0),heading:0,velocity:new Vec3(0,0,165)},player()),target={position:new Vec3(0,2500,38000),velocity:new Vec3(0,0,-165),kind:'air'};
  const long=guidedLaunchStatus(source,target,weaponProfiles.aim7m),short=guidedLaunchStatus(source,target,weaponProfiles.r73);assert.equal(long.canLaunch,true);assert.equal(short.canLaunch,false);assert.ok(long.maxRange>38000);assert.ok(short.maxRange<38000);
 }
});


test('an AI cannot fire using a cached envelope that the current flight conditions no longer support',()=>{
 const s=player(),t=fighter(),w=new Weapons(),ai=new EnemyCombat();s.position.z=10000;ai.activeTime=10;
 const u=ai.unit(t);Object.assign(u,{choiceId:'@PLAYER',choiceUntil:20,targetId:'player',envelopeTarget:'player',envelopeAt:10,envelope:{maxRange:18000,effectiveRange:18000},lock:10,missile:0});
 const source=combatSource(t,s),profile=enemyProfile(t,'aam');assert.equal(guidedLaunchStatus(source,s,profile,{envelope:u.envelope}).canLaunch,true);assert.equal(guidedLaunchStatus(source,s,profile).canLaunch,false);
 ai.update(s,[t],w,1/60);assert.equal(w.projectiles.length,0);assert.ok(u.missiles>0);
 s.position.z=2000;ai.update(s,[t],w,1/60);assert.ok(w.projectiles.some(p=>p.type==='aam'));const event=w.drainEvents().find(e=>e.type==='missile-launch');assert.equal(event.distanceM,2000);assert.ok(event.distanceM<=event.launchRangeM);assert.ok(event.launchRangeM<=event.nominalRangeM);assert.ok(event.radarRangeM>=event.distanceM);
});

test('unassigned hostile fighters prefer a closer friendly aircraft over the unidentified player',()=>{
 const s=player(),enemy=fighter(),ally={...fighter('ally'),id:'ALLY',position:new Vec3(0,2000,2000)},ai=new EnemyCombat();
 for(const assignment of [undefined,null]){enemy.aiTargetId=assignment;assert.equal(ai.chooseTarget(enemy,s,[enemy,ally]),ally);}
 s.position.z=1000;assert.equal(ai.chooseTarget(enemy,s,[enemy,ally]),s);
 enemy.aiTargetId=ally.id;assert.equal(ai.chooseTarget(enemy,s,[enemy,ally]),ally);
 ally.alive=false;assert.equal(ai.chooseTarget(enemy,s,[enemy,ally]),s);
});
test('default bomber targeting selects ground objectives, not an undefined player assignment',()=>{
 const s=player(),bomber={...fighter(),type:'bomber'},base={id:'BASE',kind:'ground',team:'ally',alive:true,position:new Vec3(0,0,8000)},ai=new EnemyCombat();
 assert.equal(ai.chooseTarget(bomber,s,[bomber,base]),base);
});
test('enemy missile launch locks onto the nearer allied AI without a scripted assignment',()=>{
 const s=player(),enemy=fighter(),ally={...fighter('ally'),id:'ALLY',position:new Vec3(0,2000,2000),threats:[]},w=new Weapons(),ai=new EnemyCombat();ai.activeTime=10;
 step(ai,s,[enemy,ally],w,4);const launches=w.drainEvents().filter(e=>e.type==='missile-launch');assert.ok(launches.length>0);assert.ok(launches.every(e=>e.targetId==='ALLY'));
});
