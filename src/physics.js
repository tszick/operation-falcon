import {Vec3,Quat,clamp,forward,up,attitude,DEG} from './math.js';
import {terrainHeight,onRunway} from './terrain.js';
import {loadout} from './aircraftSpec.js';
import {evaluateApproach,assessTouchdown,touchdownLimits} from './landing.js';
import {atmosphere,mass} from './performance.js';
import {createDamage,syncDamage,damageResponse,damageMotion,updateDamage,damageWarnings,applyDamage,recordImpact,actuatorFault} from './damage.js';
import {fuelFlow,consumeFuel} from './fuel.js';
import {createCountermeasures} from './countermeasures.js';
export {atmosphere,mass} from './performance.js';
export const STEP=1/120;
export function createAircraft(spec,{ammo=loadout(spec)}={}){return {spec,position:new Vec3(0,2,-1320),velocity:new Vec3(),orientation:new Quat(),fuel:spec.fuelCapacity,ammo:{...ammo},throttle:0,afterburner:false,gear:true,flaps:true,flapPosition:1,countermeasures:createCountermeasures(spec),airbrake:false,assist:true,damage:0,condition:createDamage(Math.floor(Math.random()*0x100000000)),dying:false,crashElapsed:0,onGround:true,airborne:false,g:1,speed:0,ias:0,mach:0,agl:2,alpha:0,warning:'',crashed:false,landing:null,landingMode:'auto',approach:null,elapsed:0};}
export function stepAircraft(s,input,dt=STEP){
 if(s.crashed)return;
 s.previousPosition=s.position.clone();
 const spec=s.spec;s.elapsed+=dt;syncDamage(s);const response=damageResponse(s);if(s.dying)input={};s.wheelBrakeActive=!!(s.onGround&&input.brake&&!actuatorFault(s,'wheelBrake'));s.throttle=clamp(s.throttle+(input.throttle||0)*.32*dt,0,1);
 const flapTarget=s.flaps?1:0;s.flapPosition??=flapTarget;if(!actuatorFault(s,'flaps'))s.flapPosition+=clamp(flapTarget-s.flapPosition,-dt*.6,dt*.6);
 const v=s.velocity.length(),m=mass(s),air=atmosphere(s.position.y),q=.5*air.density*v*v;
 let a=attitude(s.orientation),f=forward(s.orientation),u=up(s.orientation);
 const velDir=v>1?s.velocity.clone().scale(1/v):f.clone();
 const alpha=Math.atan2(-s.velocity.dot(u),Math.max(1,s.velocity.dot(f))),lowAuthority=clamp(q/2800,.06,1),stall=Math.abs(alpha)>spec.stallAlpha&&v>35;
 let pitchInput=input.pitch||0,rollInput=input.roll||0;
 // Released controls preserve pitch and bank. Assistance only limits commanded G.
 let pitchRate=pitchInput*spec.pitchRate*DEG*lowAuthority*(stall?.25:1)*response.pitchControl;
 if(s.assist){const maxRate=Math.max(0,(spec.maxG*(1-s.damage*.003)-1)*9.81/Math.max(v,30));pitchRate=clamp(pitchRate,-maxRate*.5,maxRate);}
 if(s.onGround){pitchRate*=clamp((v-45)/35,0,1);if(a.pitch>13*DEG&&pitchRate>0){applyDamage(s,dt*9,{source:'Farokrész leérése'});pitchRate=0;}if(a.pitch<0&&pitchRate<0)pitchRate=0;}
 // Ramp into a bank command, but stop rolling immediately when released.
 if(!rollInput)s.rollControl=0;else{s.rollControl=Math.sign(rollInput)*Math.min(1,(Math.sign(s.rollControl||0)===Math.sign(rollInput)?Math.abs(s.rollControl):0)+dt*5);}
 const rollRate=s.rollControl*spec.rollRate*DEG*lowAuthority*(s.onGround?0:1)*response.rollControl,coordinated=s.onGround||s.dying?0:clamp(9.81*Math.tan(clamp(a.bank,-1.25,1.25))/Math.max(v,45),-.6,.6)*response.wing,yawRate=(input.yaw||0)*(s.onGround?.2:.07)*clamp(v/15,0,1)*response.control+coordinated;
 const motion=damageMotion(s,q,m,clamp(.22+spec.clSlope*alpha,-spec.maxCL,spec.maxCL),spec.thrust*s.throttle*clamp(air.density/1.225,.23,1),dt),airborne=s.onGround?0:1;
 s.orientation=Quat.axis(new Vec3(0,1,0),(yawRate+motion.yaw*airborne)*dt).multiply(s.orientation).multiply(Quat.axis(new Vec3(1,0,0),-(pitchRate+motion.pitch*airborne)*dt)).multiply(Quat.axis(new Vec3(0,0,1),-(rollRate+motion.roll*airborne)*dt)).normalize();
 f=forward(s.orientation);u=up(s.orientation);
 let cl=clamp(.22+spec.clSlope*alpha+s.flapPosition*.45,-spec.maxCL,spec.maxCL+s.flapPosition*.35);if(stall)cl*=clamp(1-(Math.abs(alpha)-spec.stallAlpha)*3,.15,1);
 const stores=s.ammo.aam+s.ammo.agm+s.ammo.bomb,cd=spec.cd0+spec.inducedDrag*cl*cl+(s.gear?.024:0)+s.flapPosition*.035+(s.airbrake?.16:0)+stores*.0012+response.drag+(s.dying?.1:0),isAB=s.afterburner&&spec.hasAB&&s.throttle>.8&&s.fuel>0;
 const thrust=s.fuel>0?(isAB?spec.abThrust:spec.thrust)*s.throttle*clamp(air.density/1.225,.23,1)*clamp(1-v/(spec.maxMach*air.soundSpeed)*.22,.4,1)*response.engine:0;
 s.enginePower=s.fuel>0?response.engine:0;
 consumeFuel(s,fuelFlow(s,{thrust,afterburner:isAB,mach:v/air.soundSpeed,density:air.density,engine:response.engine}),dt);
 const liftDir=u.clone().sub(velDir.clone().scale(u.dot(velDir))).normalize(),lift=q*spec.wingArea*cl*response.lift,drag=q*spec.wingArea*cd;
 const acc=f.clone().scale(thrust/m).add(velDir.clone().scale(-drag/m)).add(liftDir.scale(lift/m)).add(new Vec3(0,-9.81,0));
 s.forces={massKg:m,dynamicPressurePa:q,liftN:lift,dragN:drag,thrustN:thrust};
 if(s.onGround){acc.add(velDir.clone().scale(-Math.min(input.brake&&!actuatorFault(s,'wheelBrake')?5.5:s.gear?.15:3.5,v/dt)));if(acc.y<0)acc.y=0;}
 s.velocity.add(acc.scale(dt));if(s.onGround&&s.velocity.y>.3){s.onGround=false;s.airborne=true;}s.position.add(s.velocity.clone().scale(dt));
 const floor=terrainHeight(s.position.x,s.position.z)+2;
 if(s.dying&&s.onGround){s.position.y=floor;recordImpact(s,['A sérült szerkezet a földön összeomlott.']);return;}
 if(s.position.y<=floor){if(!s.onGround){const descent=-s.velocity.y,touchSpeed=s.velocity.length(),contactResult=assessTouchdown(s,descent,touchSpeed),problems=contactResult.problems;const contact=attitude(s.orientation);s.lastTouchdown={time:s.elapsed,position:{...s.position},velocity:{...s.velocity},speedKmh:touchSpeed*3.6,iasKmh:touchSpeed*Math.sqrt(atmosphere(s.position.y).density/1.225)*3.6,sinkMps:descent,pitchDeg:contact.pitch/DEG,bankDeg:contact.bank/DEG,headingDeg:contact.heading/DEG,trackDeg:Math.atan2(s.velocity.x,s.velocity.z)/DEG,massKg:mass(s),fuelKg:s.fuel,damage:s.damage,parts:{...s.condition.parts},gear:s.gear,flapPosition:s.flapPosition,throttle:s.throttle,afterburner:isAB,airbrake:s.airbrake,approach:s.approach?{...s.approach}:null,limits:touchdownLimits(s),problems:[...problems],success:!contactResult.fatal,grade:contactResult.grade,impactDamage:contactResult.damage};if(contactResult.fatal){s.position.y=floor;recordImpact(s,problems);return;}if(contactResult.damage>0){applyDamage(s,contactResult.damage*.65,{part:'fuselage',source:'Kemény földetérés'});applyDamage(s,contactResult.damage*.35,{part:'hydraulics',source:'Futómű terhelése'});}if(s.dying){s.lastTouchdown.success=false;s.lastTouchdown.grade='crash';s.lastTouchdown.problems.push('A korábban sérült szerkezet nem bírta a földetérést.');s.position.y=floor;recordImpact(s,s.lastTouchdown.problems);return;}s.landing={success:true,descent,offset:Math.abs(s.position.x),speed:touchSpeed,grade:contactResult.grade,impactDamage:contactResult.damage,reasons:problems};s.onGround=true;}s.position.y=floor;s.velocity.y=0;if(!onRunway(s.position)&&v>35){recordImpact(s,['A gép a pályán kívüli terepnek ütközött.']);return;}}
 if(s.onGround&&v<.3&&s.throttle<.01)s.velocity=new Vec3();
 s.speed=s.velocity.length();s.ias=s.speed*Math.sqrt(air.density/1.225);s.mach=s.speed/air.soundSpeed;s.alpha=alpha;s.agl=s.position.y-terrainHeight(s.position.x,s.position.z);s.g=s.onGround?1:lift/m/9.81;
 updateDamage(s,dt);
 s.approach=evaluateApproach(s);
 const low=s.agl<Math.max(35,-s.velocity.y*5)&&!s.onGround&&!s.approach.protectedCorridor;
 s.warning=low&&!s.approach.runwayCorridor?'TALAJKÖZELSÉG — EMELKEDJ!':stall&&!s.onGround?'ÁTESÉS':s.approach.active&&s.approach.warning?s.approach.warning:s.g>spec.maxG?'TÚLTERHELÉS':s.damage>50?'SZERKEZETI KÁR':s.mach>spec.maxMach?'TÚL NAGY SEBESSÉG':s.position.y>spec.ceiling?'CSÚCSMAGASSÁG FELETT':s.fuel<=0?'HAJTÓMŰ LEÁLLT':s.fuel<spec.fuelCapacity*.1?'KRITIKUS ÜZEMANYAG':s.fuel<spec.fuelCapacity*.25?'BINGO FUEL':s.onGround&&!s.landing?.success&&v>spec.approachSpeed?'ROTATE — EMELD AZ ORROT':!s.onGround&&s.gear&&v>140?'HÚZD BE A FUTÓMŰVET':!s.onGround&&s.agl<200&&s.velocity.y<-4?'TÚL NAGY SÜLLYEDÉS':'';
 if(s.dying)s.warning='IRÁNYÍTÁS ELVESZETT — VÉGZETES SZERKEZETI KÁR';else if(!s.warning&&s.damage>=15)s.warning=damageWarnings(s)[0]||'SÉRÜLT SZERKEZET · FINOM MANŐVEREK';
}





