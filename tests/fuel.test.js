import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft} from '../src/aircraftSpec.js';
import {createAircraft,stepAircraft,STEP} from '../src/physics.js';
import {Vec3} from '../src/math.js';
import {fuelFlow,consumeFuel} from '../src/fuel.js';
import {fuelStatus} from '../src/instruments.js';
import {mass,atmosphere} from '../src/performance.js';
function plane(id='f16'){return createAircraft(aircraft.find(a=>a.id===id));}
test('every engine family consumes a finite positive flow; dry thrust, afterburner and idle differ',()=>{
 for(const a of aircraft){const s=plane(a.id),idle=fuelFlow(s),dry=fuelFlow(s,{thrust:a.thrust}),wet=fuelFlow(s,{thrust:a.abThrust,afterburner:true});assert.ok(idle>0&&Number.isFinite(wet));assert.ok(dry>idle,a.id);if(a.hasAB)assert.ok(wet>dry*2,a.id);else assert.equal(wet,dry);}
});
test('aircraft size, engine generation, throttle and high Mach operation affect flow',()=>{
 const small=plane(),large=plane('f22');assert.ok(fuelFlow(large,{thrust:large.spec.thrust})>fuelFlow(small,{thrust:small.spec.thrust}));assert.ok(fuelFlow(small,{thrust:small.spec.thrust})>fuelFlow(small,{thrust:small.spec.thrust*.4}));assert.ok(fuelFlow(small,{thrust:50000,mach:1.5})>fuelFlow(small,{thrust:50000,mach:.5}));
});
test('added mass and stores increase level-flight fuel demand through required lift/drag',()=>{
 const s=plane(),q=.5*atmosphere(1500).density*180**2,area=s.spec.wingArea;
 function trimmedFlow(state){const cl=mass(state)*9.81/(q*area),stores=state.ammo.aam+state.ammo.agm+state.ammo.bomb,drag=q*area*(state.spec.cd0+state.spec.inducedDrag*cl*cl+stores*.0012);return fuelFlow(state,{thrust:drag,mach:.55});}
 const heavy=trimmedFlow(s);s.fuel=500;s.ammo.bomb=s.ammo.agm=s.ammo.aam=0;assert.ok(heavy>trimmedFlow(s));
});
test('fuel is consumed in kilograms, decreases displayed mass/arc, and has no hidden refill',()=>{
 const s=plane(),before=s.fuel,flow=fuelFlow(s,{thrust:s.spec.thrust});for(let i=0;i<120*60;i++)consumeFuel(s,flow,STEP);assert.ok(Math.abs(s.fuel-(before-flow*60))<1e-6);const info=fuelStatus(s);assert.equal(info.kg,Math.round(s.fuel));assert.equal(info.percent,Math.round(s.fuel/s.spec.fuelCapacity*100));assert.ok(info.percent<100);assert.equal(Math.round(info.flowKgMin),Math.round(flow*60));assert.ok(info.minutesRemaining>0);
});
test('F-16 fuel use is visibly higher than the old common .65 kg/s model, especially afterburning',()=>{
 const s=plane(),dry=fuelFlow(s,{thrust:s.spec.thrust}),wet=fuelFlow(s,{thrust:s.spec.abThrust,afterburner:true});assert.ok(dry>1.5&&dry<3);assert.ok(wet>6&&wet<10);
});
test('actual fixed-step flight consumes fuel, clamps empty, stops thrust and disables afterburner',()=>{
 const s=plane();s.fuel=.05;s.throttle=1;s.afterburner=true;s.position=new Vec3(0,1500,0);s.velocity=new Vec3(0,0,180);s.onGround=false;s.airborne=true;for(let i=0;i<120;i++)stepAircraft(s,{});assert.equal(s.fuel,0);assert.equal(s.enginePower,0);assert.equal(s.afterburner,false);assert.equal(s.fuelFlow,0);assert.equal(fuelStatus(s).level,'empty');assert.match(s.warning,/HAJTÓMŰ LEÁLLT/);assert.equal(s.crashed,false);
});
test('consumption is independent of frame subdivision and damaged engines do not consume full healthy flow',()=>{
 const a=plane(),b=plane(),flow=fuelFlow(a,{thrust:60000});for(let i=0;i<60;i++)consumeFuel(a,flow,1);for(let i=0;i<7200;i++)consumeFuel(b,flow,STEP);assert.ok(Math.abs(a.fuel-b.fuel)<1e-6);assert.ok(fuelFlow(a,{thrust:30000,engine:.5})<flow);assert.equal(fuelFlow(a,{thrust:0,engine:0}),0);
});
test('fuel gauge rounds consistently, preserves low-level alerts, and empty flow cannot turn negative',()=>{
 const s=plane();s.fuel=s.spec.fuelCapacity*.995;assert.equal(fuelStatus(s).percent,100);s.fuel=s.spec.fuelCapacity*.249;assert.equal(fuelStatus(s).level,'low');s.fuel=s.spec.fuelCapacity*.099;assert.equal(fuelStatus(s).level,'critical');s.fuel=.01;consumeFuel(s,100,1);assert.equal(s.fuel,0);assert.equal(fuelStatus(s).percent,0);consumeFuel(s,100,1);assert.equal(s.fuelFlow,0);assert.equal(fuelFlow(s,{thrust:100000}),0);
});
