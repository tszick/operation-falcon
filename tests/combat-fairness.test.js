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
