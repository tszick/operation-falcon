import test from 'node:test';
import assert from 'node:assert/strict';
import {afterburnerActive,afterburnerStatus} from '../src/engineState.js';
import {aircraft} from '../src/aircraftSpec.js';
import {createAircraft,stepAircraft} from '../src/physics.js';
import {Vec3,Quat,DEG,attitude} from '../src/math.js';
const spec=aircraft.find(a=>a.id==='f16');
function flight(){const s=createAircraft(spec);Object.assign(s,{position:new Vec3(0,5000,0),velocity:new Vec3(0,0,160),orientation:Quat.euler(0,.07,0),onGround:false,airborne:true,gear:false,flaps:false,flapPosition:0,throttle:.1913});return s;}
test('afterburner reports armed at low throttle, active only above 80 percent with fuel and capability',()=>{
 const s=flight();s.afterburner=true;assert.equal(afterburnerActive(s),false);assert.equal(afterburnerStatus(s).label,'AB KÉSZ');
 s.throttle=.8;assert.equal(afterburnerActive(s),false);s.throttle=.81;assert.equal(afterburnerActive(s),true);
 s.fuel=0;assert.equal(afterburnerActive(s),false);s.fuel=100;s.spec={...spec,hasAB:false};assert.equal(afterburnerActive(s),false);
});
test('arming afterburner at the logged 19 percent throttle does not increase thrust or fuel consumption',()=>{
 const dry=flight(),armed=flight();armed.afterburner=true;stepAircraft(dry,{});stepAircraft(armed,{});
 assert.equal(armed.forces.thrustN,dry.forces.thrustN);assert.equal(armed.fuel,dry.fuel);
 dry.throttle=armed.throttle=1;stepAircraft(dry,{});stepAircraft(armed,{});assert.ok(armed.forces.thrustN>dry.forces.thrustN);assert.ok(armed.fuel<dry.fuel);
});
test('right bank with positive lift turns right, while negative lift reverses lateral acceleration',()=>{
 for(const sign of [1,-1]){const s=flight();s.orientation=Quat.euler(0,sign*.24,60*DEG);stepAircraft(s,{});
 assert.ok(sign*s.forces.liftN>0);assert.ok(sign*s.velocity.x>0);assert.ok(sign*attitude(s.orientation).heading>0);}
});
