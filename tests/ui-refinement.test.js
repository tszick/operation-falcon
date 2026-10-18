import {stepAircraft} from '../src/physics.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft,missions} from '../src/aircraftSpec.js';
import {createMissionAircraft} from '../src/missionStart.js';
import {createTargets,Targeting} from '../src/targeting.js';
import {Vec3} from '../src/math.js';
import {Mission} from '../src/mission.js';
import {Weapons} from '../src/weapons.js';
import {applyDamage} from '../src/damage.js';
import {missionCardState,missionGoalsMarkup,configurationIndicators} from '../src/flightPanels.js';
import {evaluateApproach} from '../src/landing.js';
import {FlightRecorder} from '../src/flightRecorder.js';
import {evaluateFlight} from '../src/flightDebrief.js';
const spec=aircraft.find(a=>a.id==='f16');
function flight(id='defend-base'){
 const mission=missions.find(m=>m.id===id),s=createMissionAircraft(spec,mission),targets=createTargets(mission,spec,{rng:()=>.2}),m=new Mission(mission),w=new Weapons(),aim=new Targeting();s.onGround=false;s.airborne=true;s.position=new Vec3(0,1500,-8000);s.velocity=new Vec3(0,0,150);s.ias=150;s.speed=150;s.gear=false;s.flaps=false;s.flapPosition=0;s.elapsed=5;return {s,targets,m,w,aim};
}
test('damage requests return, then a safe landing services the aircraft and restores feasible objectives',()=>{
 const {s,targets,m,w,aim}=flight();applyDamage(s,45,{part:'weapons'});m.update(s,targets,w,aim);assert.equal(m.aborted,true);assert.equal(m.complete,false);let card=missionCardState(s,m,targets);assert.equal(card.rows[0].id,'return');assert.equal(card.rows.find(r=>r.id==='base').status,'done');
 s.elapsed=20;s.onGround=true;s.speed=0;s.landing={success:true,descent:1};m.update(s,targets,w,aim);assert.equal(m.aborted,false);assert.equal(m.recovered,false);assert.equal(m.complete,false);assert.equal(m.serviceCount,1);assert.equal(s.damage,0);assert.equal(s.fuel,s.spec.fuelCapacity);assert.equal(missionCardState(s,m,targets).rows.find(r=>r.id==='attackers').status,'pending');
});

test('a fatal crash after interruption does not award recovery; practice keeps its landing-only objective',()=>{
 const x=flight();x.s.damage=45;x.m.update(x.s,x.targets,x.w,x.aim);x.s.crashed=true;x.m.update(x.s,x.targets,x.w,x.aim);assert.equal(x.m.recovered,false);assert.equal(missionCardState(x.s,x.m,x.targets).rows[0].status,'failed');
 const y=flight('landing');y.s.damage=45;y.m.update(y.s,y.targets,y.w,y.aim);assert.equal(y.m.aborted,false);assert.equal(missionCardState(y.s,y.m,y.targets).rows.length,1);
});
test('fuel exhaustion creates a return objective but not an instant successful mission',()=>{
 const x=flight('escort-transport');x.s.fuel=0;x.m.update(x.s,x.targets,x.w,x.aim);assert.equal(x.m.aborted,true);assert.equal(x.m.recovered,false);assert.equal(x.m.complete,false);assert.equal(x.m.objectives[0].text,'Hazatérés');assert.ok(x.m.objectives.filter(r=>r.id!=='return').every(r=>r.done||r.status==='failed'));
});
test('configuration lights report inactive, active and unsafe states for every switch',()=>{
 const {s}=flight();s.ias=75;s.gear=false;s.flaps=false;s.afterburner=false;s.airbrake=false;s.assist=true;s.wheelBrakeActive=false;s.approach=evaluateApproach(s);let lights=configurationIndicators(s);assert.equal(lights.gear.state,'off');assert.equal(lights.flaps.state,'off');assert.equal(lights.assist.state,'active');assert.equal(lights.airbrake.state,'off');
 s.landingMode='on';s.approach=evaluateApproach(s);lights=configurationIndicators(s);assert.equal(lights.gear.state,'danger');assert.equal(lights.flaps.state,'danger');
 s.gear=true;s.flaps=true;s.flapPosition=1;s.afterburner=true;s.airbrake=true;s.wheelBrakeActive=true;lights=configurationIndicators(s);assert.equal(lights.gear.state,'active');assert.equal(lights.flaps.state,'active');assert.equal(lights.afterburner.state,'danger');assert.equal(lights.airbrake.state,'danger');assert.equal(lights.wheelBrake.state,'active');s.assist=false;s.g=9;assert.equal(configurationIndicators(s).assist.state,'danger');
});
test('compact goal list contains only icons and labels, with pending white-circle semantics',()=>{
 const {s,m}=flight('landing'),html=missionGoalsMarkup(missionCardState(s,m));assert.ok(html.includes('○'));assert.ok(!html.includes('<small>'));assert.ok(!html.includes('Folyamatban'));assert.ok(!html.includes('Teljesült'));
});
test('interruption and intermediate servicing are logged without finishing the mission or resetting its clock',()=>{
 const {s,targets,m,w,aim}=flight(),rec=new FlightRecorder();m.update(s,targets,w,aim);rec.start(s,m,targets,w,aim);s.damage=45;s.elapsed=6;m.update(s,targets,w,aim);rec.capture(s,m,targets,w,aim,{},true);s.onGround=true;s.speed=0;s.landing={success:true,descent:1};s.elapsed=7;m.update(s,targets,w,aim);rec.capture(s,m,targets,w,aim,{},true);const log=rec.export();assert.ok(log.entries.some(e=>e.kind==='mission-status'&&e.data.aborted));assert.ok(log.entries.some(e=>e.kind==='ground-service'&&e.data.count===1));assert.equal(s.elapsed,7);assert.equal(rec.ended,false);assert.equal(m.complete,false);assert.equal(m.aborted,false);
});

test('minor structural damage warns about gentle manoeuvres without requesting return or aborting the mission',()=>{
 for(const damage of [15,19,39]){
  const {s,targets,m,w,aim}=flight();applyDamage(s,damage);stepAircraft(s,{});m.update(s,targets,w,aim);
  assert.equal(s.warning,'SÉRÜLT SZERKEZET · FINOM MANŐVEREK');
  assert.equal(m.aborted,false);assert.notEqual(m.phaseId,'emergency');
  assert.ok(!missionCardState(s,m,targets).rows.some(r=>r.id==='return'));
 }
});
