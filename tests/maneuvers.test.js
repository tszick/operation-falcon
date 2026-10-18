import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft} from '../src/aircraftSpec.js';
import {createAircraft,stepAircraft,STEP,mass} from '../src/physics.js';
import {airflow,departureMotion} from '../src/maneuverDynamics.js';
import {Vec3,Quat,DEG,forward,up} from '../src/math.js';
function flight(id='f16'){
 const s=createAircraft(aircraft.find(a=>a.id===id));Object.assign(s,{position:new Vec3(0,6000,0),velocity:new Vec3(0,0,250),orientation:Quat.euler(0,.03,0),onGround:false,airborne:true,gear:false,flaps:false,flapPosition:0,throttle:1,afterburner:true,fuel:s.spec.fuelCapacity*.4});s.ammo={gun:0,aam:0,agm:0,bomb:0};return s;
}
test('F16 and MiG29 can complete a continuous full loop with lift and energy limits enabled',()=>{
 for(const id of ['f16','mig29']){const s=flight(id);let angle=0,previous=.03,minSpeed=Infinity;
 for(let i=0;i<120*45&&angle<2*Math.PI-.1&&!s.crashed;i++){stepAircraft(s,{pitch:.65});const f=forward(s.orientation),a=Math.atan2(f.y,f.z);angle+=Math.atan2(Math.sin(a-previous),Math.cos(a-previous));previous=a;minSpeed=Math.min(minSpeed,s.speed);}
 assert.ok(angle>2*Math.PI-.1,id);assert.ok(forward(s.orientation).z>.9,id);assert.ok(up(s.orientation).y>.9,id);assert.ok(minSpeed<250&&minSpeed>100,id);assert.equal(s.damage,0,id);assert.equal(s.spin.active,false,id);
 }
});
test('a complete aileron roll remains controllable and does not invent a spin',()=>{
 const s=flight();for(let i=0;i<120*4.4;i++)stepAircraft(s,{roll:1});assert.ok(up(s.orientation).y>.95);assert.ok(forward(s.orientation).z>.9);assert.equal(s.spin.active,false);assert.equal(s.dying,false);
});
test('a half roll followed by a positive pull reverses heading and returns upright (Split-S)',()=>{
 const s=flight();for(let i=0;i<120*2.22;i++)stepAircraft(s,{roll:1});assert.ok(up(s.orientation).y<-.95);const initialAltitude=s.position.y;
 let reversed=false;for(let i=0;i<120*25&&!s.crashed;i++){stepAircraft(s,{pitch:.5});if(forward(s.orientation).z<-.95&&up(s.orientation).y>.9){reversed=true;break;}}
 assert.ok(reversed);assert.ok(s.position.y<initialAltitude);assert.equal(s.crashed,false);
});
test('inverted symmetric flight has no phantom coordinated yaw and backward flow retains its true AOA',()=>{
 const s=flight();s.orientation=Quat.euler(0,0,Math.PI);stepAircraft(s,{});assert.ok(Math.abs(forward(s.orientation).x)<1e-9);
 s.orientation=new Quat();s.velocity=new Vec3(0,-1,-100);const flow=airflow(s,forward(s.orientation),up(s.orientation),s.velocity.length());assert.ok(flow.alpha>170*DEG);
});
test('spin requires asymmetric stalled flow, and unloading plus opposing rudder dissipates rotation',()=>{
 const symmetric=flight();for(let i=0;i<120*3;i++)departureMotion(symmetric,{}, {alpha:.6,beta:0,stalled:true},STEP);assert.equal(symmetric.spin.active,false);
 const s=flight();s.assist=false;s.throttle=.1;s.afterburner=false;s.velocity=new Vec3(0,-45,90);s.orientation=Quat.euler(0,.15,0);
 for(let i=0;i<360;i++)stepAircraft(s,{pitch:.6,yaw:1});assert.ok(s.spin.active);const rate=Math.abs(s.spin.rate),direction=Math.sign(s.spin.rate),height=s.position.y;
 for(let i=0;i<120*12&&!s.crashed;i++)stepAircraft(s,{pitch:s.alpha>.15?-.6:0,yaw:Math.abs(s.spin.rate)>.04?-direction:0});
 assert.ok(Math.abs(s.spin.rate)<rate*.1);assert.equal(s.spin.active,false);assert.equal(s.dying,false);assert.ok(s.position.y<height);
});
test('equal speed and AOA provide less G at greater actual departure mass',()=>{
 const light=flight(),heavy=flight();heavy.fuel=heavy.spec.fuelCapacity;heavy.ammo={gun:511,aam:2,agm:2,bomb:2};assert.ok(mass(heavy)>mass(light));for(const s of [light,heavy]){s.orientation=Quat.euler(0,.15,0);stepAircraft(s,{});}assert.ok(heavy.g<light.g);
});

test('an ascending half loop and half roll completes an Immelmann without a forced heading shortcut',()=>{
 const s=flight();let angle=0,previous=.03;
 for(let i=0;i<120*30&&angle<Math.PI-.03;i++){stepAircraft(s,{pitch:.65});const f=forward(s.orientation),a=Math.atan2(f.y,f.z);angle+=Math.atan2(Math.sin(a-previous),Math.cos(a-previous));previous=a;}
 assert.ok(forward(s.orientation).z<-.9);assert.ok(up(s.orientation).y<-.9);
 for(let i=0;i<120*2.22;i++)stepAircraft(s,{roll:1});assert.ok(forward(s.orientation).z<-.85);assert.ok(up(s.orientation).y>.9);assert.ok(s.position.y>6000);assert.equal(s.dying,false);
});
