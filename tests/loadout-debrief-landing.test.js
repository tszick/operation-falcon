import {advisedTarget} from '../src/targetAdvice.js';
import {phaseGuide} from '../src/phaseGuide.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft,missions} from '../src/aircraftSpec.js';
import {armament,loadedStations} from '../src/armament.js';
import {defaultLoadout,configureAircraft,validateLoadout,initialWeapon} from '../src/loadoutPlanner.js';
import {createAircraft,stepAircraft} from '../src/physics.js';
import {createMissionAircraft} from '../src/missionStart.js';
import {mass} from '../src/performance.js';
import {Vec3,Quat,DEG} from '../src/math.js';
import {assessTouchdown,evaluateApproach} from '../src/landing.js';
import {Mission} from '../src/mission.js';
import {Weapons} from '../src/weapons.js';
import {evaluateFlight,debriefMarkup} from '../src/flightDebrief.js';
const spec=aircraft.find(a=>a.id==='f16');
function contact(sink=1,gear=true){const s=createAircraft(spec);s.position=new Vec3(0,2.001,-1000);s.velocity=new Vec3(0,-sink,71);s.orientation=Quat.euler(0,3*DEG,0);s.onGround=false;s.airborne=true;s.gear=gear;return s;}
test('every aircraft default loadout stays unchanged and configurations do not mutate global presets',()=>{
 for(const a of aircraft){const choice=defaultLoadout(a),c=configureAircraft(a,choice);assert.deepEqual(armament(c),armament(a));assert.ok(validateLoadout(a,choice).valid);choice.stations.fill('');choice.gun=false;const empty=createAircraft(configureAircraft(a,choice));assert.deepEqual(empty.ammo,{gun:0,aam:0,agm:0,bomb:0});assert.ok(Object.keys(armament(a).weapons).length);assert.equal(mass(empty),a.emptyMass+a.fuelCapacity);}
});
test('foreign stores, invented cannons, extra stations and overweight configurations are rejected',()=>{
 const j20=aircraft.find(a=>a.id==='j20');let c=defaultLoadout(j20);c.stations[0]='agm';assert.throws(()=>configureAircraft(j20,c));c=defaultLoadout(j20);c.gun=true;assert.throws(()=>configureAircraft(j20,c));c=defaultLoadout(spec);c.stations.push('aam');assert.throws(()=>configureAircraft(spec,c));c=defaultLoadout(spec);c.stations=c.stations.map((v,i)=>i<2?v:'bomb');assert.equal(validateLoadout(spec,c).valid,true);assert.equal(validateLoadout({...spec,maxWeaponPayloadKg:1000},c).valid,false);
});
test('chosen station counts affect aircraft mass and the displayed/fired stations',()=>{
 const c=defaultLoadout(spec);c.stations=c.stations.map(()=> 'aam');const configured=configureAircraft(spec,c),s=createAircraft(configured);assert.equal(s.ammo.aam,6);assert.equal(s.ammo.agm,0);assert.equal(s.ammo.bomb,0);assert.equal(loadedStations(s).filter(x=>x.loaded).length,6);s.ammo.aam--;assert.equal(loadedStations(s).filter(x=>x.loaded).length,5);assert.equal(armament(spec).weapons.aam.quantity,2);
});
test('J20 escort starts with its PL15, not a nonexistent cannon; unarmed configuration selects none',()=>{
 const a=aircraft.find(a=>a.id==='j20'),m=missions.find(m=>m.objective==='escort-transport'),s=createMissionAircraft(configureAircraft(a,defaultLoadout(a)),m);assert.equal(s.ammo.aam,4);assert.equal(initialWeapon(s,m),'aam');assert.equal(armament(s.spec).weapons.aam.name,'PL-15');s.ammo.aam=0;assert.equal(initialWeapon(s,m),'none');
});
test('logged 3.68m/s contact survives with localized damage and can complete rollout',()=>{
 const s=contact(3.68);stepAircraft(s,{});assert.equal(s.crashed,false);assert.equal(s.lastTouchdown.success,true);assert.equal(s.lastTouchdown.grade,'hard');assert.ok(s.damage>0&&s.damage<15);assert.ok(s.condition.parts.fuselage<1);assert.equal(s.lastTouchdown.damage,0);s.velocity=new Vec3();s.speed=0;const m=new Mission(missions.find(m=>m.objective==='landing'));m.update(s,[],new Weapons());assert.equal(m.complete,true);
});
test('sink severity is progressive and catastrophic contact still crashes',()=>{
 const smooth=contact(1),hard=contact(3.7),severe=contact(6),fatal=contact(10),belly=contact(1,false);for(const s of [smooth,hard,severe,fatal,belly])stepAircraft(s,{});assert.equal(smooth.damage,0);assert.ok(hard.damage<severe.damage);assert.equal(severe.lastTouchdown.grade,'severe');assert.equal(severe.crashed,false);assert.equal(fatal.crashed,true);assert.equal(fatal.ias,0);assert.equal(fatal.mach,0);assert.ok(fatal.lastTouchdown.iasKmh>200);assert.equal(belly.crashed,false);assert.ok(belly.damage>=25);
});
test('wingstrike, sideways runway contact and steep nose-first contact remain catastrophic',()=>{
 for(const q of [Quat.euler(0,0,30*DEG),Quat.euler(Math.PI/2,0,0),Quat.euler(0,-15*DEG,0)]){const s=contact();s.orientation=q;assert.equal(assessTouchdown(s,1,72).fatal,true);}
});
test('flare no longer instructs a descent to the runway-threshold glide plane',()=>{
 const s=contact();s.position=new Vec3(0,20,500);s.landingMode='on';s.velocity.y=-1;s.ias=72;const a=evaluateApproach(s);assert.equal(a.stage,'SZINTBE VÉTEL');assert.doesNotMatch(a.warning,/SIKLÓPÁLYA FELETT/);assert.equal(a.items.find(x=>x.label==='SIKLÓPÁLYA').value,'SZINTBE VÉTEL');
});
function sample(t,phase,extra={}){return {t,kind:'sample',data:{phase,player:{iasKmh:255,aglM:10,position:{x:0},verticalSpeedMps:-1,gear:true,flapPosition:1,approach:{active:true,minSpeed:234,maxSpeed:289,targetSpeed:259,headingError:0},...extra}}};}
test('debrief separates measured approach issues from touchdown and mission outcomes',()=>{
 const entries=[{t:0,kind:'phase',data:{id:'landing',label:'Megközelítés'}},...Array.from({length:20},(_,i)=>sample(i*.1,'landing',{iasKmh:320})),{t:2,kind:'phase',data:{id:'flare',label:'Szintbe vétel'}},sample(2.1,'flare'),{t:3,kind:'touchdown',data:{success:true,grade:'hard',impactDamage:7,iasKmh:255,sinkMps:3.68,pitchDeg:0,bankDeg:0,problems:['Kemény földetérés']}},{t:3,kind:'phase',data:{id:'rollout',label:'Kifutás'}},sample(3.1,'rollout'),{t:4,kind:'mission-end',data:{result:'success'}}];const a=evaluateFlight({entries});assert.equal(a.phases[0].status,'attention');assert.match(a.phases[0].findings.join(' '),/fölött/);assert.equal(a.phases[1].status,'attention');assert.equal(a.phases[2].status,'good');assert.equal(a.phases.length,3);assert.match(debriefMarkup({entries}),/7.0%/);
});
test('failed and incomplete flights use recorded reason, escape text, and never invent unflown phases',()=>{
 const log={entries:[{t:0,kind:'phase',data:{id:'intercept',label:'<img>'}},sample(.1,'intercept'),{t:1,kind:'mission-end',data:{result:'failure',reason:'A szállító elveszett.'}}]};const a=evaluateFlight(log);assert.equal(a.phases.length,1);assert.equal(a.phases[0].status,'failed');assert.match(a.phases[0].findings.join(''),/szállító/);assert.ok(debriefMarkup(log).includes('&lt;img&gt;'));assert.equal(evaluateFlight({entries:[]}).phases.length,0);
});

test('escort advice prefers airborne attackers without overriding a selected ground target',()=>{
 const a=aircraft.find(a=>a.id==='j20'),s=createAircraft(a);s.onGround=false;s.airborne=true;s.position=new Vec3(0,1700,0);
 const units=[{id:'FLAK',team:'enemy',alive:true,kind:'ground',position:new Vec3(0,0,500),velocity:new Vec3()},{id:'FIGHTER',team:'enemy',alive:true,kind:'air',position:new Vec3(0,1700,10000),velocity:new Vec3()}],spec=missions.find(m=>m.objective==='escort-transport');
 assert.equal(advisedTarget(s,units,{id:null},spec).id,'FIGHTER');assert.equal(advisedTarget(s,units,{id:'FLAK'},spec).id,'FLAK');
 const m=new Mission(spec),w=new Weapons();m.departed=true;m.update(s,units,w,{id:null,locked:false});assert.equal(m.phaseId,'escort-cover');const steps=phaseGuide(s,m,{id:null,locked:false},w,units);assert.ok(steps.some(x=>x.text==='PL-15'));assert.ok(!steps.some(x=>x.text.includes('térj haza')));
});
test('sideways contact records its real reason and shared phase boundary records touchdown only once',()=>{
 const s=contact();s.velocity.x=60;const c=assessTouchdown(s,1,s.velocity.length());assert.equal(c.fatal,true);assert.match(c.problems.join(' '),/Oldalazó/);
 const log={entries:[{t:0,kind:'phase',data:{id:'flare',label:'Szintbe vétel'}},sample(.1,'flare'),{t:1,kind:'touchdown',data:{success:true,grade:'hard',iasKmh:255,sinkMps:3.68,pitchDeg:0,bankDeg:0,impactDamage:7,problems:[]}},{t:1,kind:'phase',data:{id:'rollout',label:'Kifutás'}},sample(1.1,'rollout'),{t:2,kind:'mission-end',data:{result:'success'}}]};const a=evaluateFlight(log);assert.equal(a.phases.filter(p=>p.facts.some(f=>f.startsWith('Földetérés:'))).length,1);
});
