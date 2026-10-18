import {clamp,right} from './math.js';
// Reduced-order aerodynamic departure model; not type-certified spin data.
export function airflow(s,f,u,v){
 const along=s.velocity.dot(f),normal=-s.velocity.dot(u),lateral=s.velocity.dot(right(s.orientation));
 const alpha=Math.atan2(normal,along),beta=Math.atan2(lateral,Math.hypot(along,normal));
 const stalled=Math.abs(alpha)>s.spec.stallAlpha&&v>35;
 let cl=clamp(.22+s.spec.clSlope*alpha+s.flapPosition*.45,-s.spec.maxCL,s.spec.maxCL+s.flapPosition*.35);
 if(stalled)cl*=clamp(1-(Math.abs(alpha)-s.spec.stallAlpha)*3,.15,1);
 return {alpha,beta,cl,stalled};
}
export function departureMotion(s,input,flow,dt){
 const spin=s.spin||(s.spin={rate:0,severity:0,active:false});
 if(s.onGround||s.dying||s.crashed){spin.rate=0;spin.severity=0;spin.active=false;return {yaw:0,roll:0,pitch:0};}
 const severity=flow.stalled?clamp((Math.abs(flow.alpha)-s.spec.stallAlpha)/.3,0,1):0;
 const rudder=input.yaw||0,opposite=spin.rate*rudder<-.03,unloaded=(input.pitch||0)<-.1;
 const recovery=unloaded&&opposite;
 const asym=(s.condition.parts.rightWing-s.condition.parts.leftWing)*.3;
 const excitation=rudder*.8+flow.beta*.6+asym;
 const seed=Math.abs(excitation)>.12?excitation:0;
 const drive=(unloaded?0:severity)*(seed+(Math.abs(spin.rate)>.08?Math.sign(spin.rate)*.45:0));
 const damping=!flow.stalled?3.5:recovery?4.5:unloaded?1.5:.65;
 spin.rate=clamp((spin.rate+drive*dt)/(1+damping*dt),-1.15,1.15);
 spin.severity=severity;spin.active=Math.abs(spin.rate)>.12&&flow.stalled;
 // Yaw/roll are body-axis rates; an isolated symmetric stall is not a spin.
 return {yaw:spin.rate,roll:spin.rate*.5,pitch:-Math.sign(flow.alpha)*severity*.08};
}
