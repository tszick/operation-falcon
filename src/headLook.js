import {Quat,clamp,DEG} from './math.js';
// Comfortable cockpit/game limits, not a medical range-of-motion specification.
export const headLookLimits={yaw:100*DEG,pitchUp:65*DEG,pitchDown:45*DEG,sensitivity:.22*DEG,idleSeconds:.18};
export class HeadLook{
 constructor(){this.reset();}
 reset(){this.yaw=0;this.pitch=0;this.targetYaw=0;this.targetPitch=0;this.lastMove=-Infinity;}
 move(dx,dy,now){if(!Number.isFinite(dx)||!Number.isFinite(dy)||!Number.isFinite(now)||dx===0&&dy===0)return;if(now-this.lastMove>headLookLimits.idleSeconds){this.targetYaw=this.yaw;this.targetPitch=this.pitch;}this.targetYaw=clamp(this.targetYaw+clamp(dx,-200,200)*headLookLimits.sensitivity,-headLookLimits.yaw,headLookLimits.yaw);this.targetPitch=clamp(this.targetPitch-clamp(dy,-200,200)*headLookLimits.sensitivity,-headLookLimits.pitchDown,headLookLimits.pitchUp);this.lastMove=now;}
 update(dt,now){if(!Number.isFinite(dt)||dt<=0)return;const returning=now-this.lastMove>=headLookLimits.idleSeconds;if(returning){this.targetYaw=0;this.targetPitch=0;}const blend=1-Math.exp(-dt/(returning?.22:.07)),limit=200*DEG*dt;this.yaw+=clamp((this.targetYaw-this.yaw)*blend,-limit,limit);this.pitch+=clamp((this.targetPitch-this.pitch)*blend,-limit,limit);if(returning&&Math.abs(this.yaw)<.00001)this.yaw=0;if(returning&&Math.abs(this.pitch)<.00001)this.pitch=0;}
 orientation(aircraftOrientation){return aircraftOrientation.clone().multiply(Quat.euler(this.yaw,this.pitch,0)).normalize();}
 get active(){return Math.abs(this.yaw)+Math.abs(this.pitch)>.5*DEG;}
}
