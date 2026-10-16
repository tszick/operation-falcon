import {mass,atmosphere} from './performance.js';
import {Vec3,clamp,attitude} from './math.js';
import {convoyPose} from './terrain.js';
export function moveConvoy(t,targets,dt){
 const direction=t.routeDirection||1,previous=t.position.clone();
 if(t.routeMode==='bridge'){
  const bridge=targets.find(u=>u.id===t.bridgeId),stop=-(bridge?.radius||100)-100;
  if(bridge&&!bridge.alive&&t.routeDistance>=stop)t.stopped=true;
  if(!t.stopped)t.routeDistance+=14*dt;
  if(bridge&&!bridge.alive&&t.routeDistance>stop){t.routeDistance=stop;t.stopped=true;}
  if(bridge?.alive&&t.routeDistance>(bridge.radius||100)+120)t.crossedBridge=true;
 }else if(t.routeMode==='base-attack'){t.routeDistance=Math.max(1200,t.routeDistance-14*dt);t.stopped=t.routeDistance<=1200;}
 else{t.routeDistance=(t.routeDistance||0)+14*dt*direction;if(Math.abs(t.routeDistance)>2200){t.routeDistance=clamp(t.routeDistance,-2200,2200);t.routeDirection=-direction;}}
 Object.assign(t,convoyPose(t));t.velocity=t.position.clone().sub(previous).scale(1/Math.max(dt,1e-6));
}
export function moveEscort(t,dt){t.position.add(t.velocity.clone().scale(dt));if(t.position.z>=t.exitZ){t.exited=true;t.alive=false;t.velocity=new Vec3();}}

export function escortFlightInput(t){const s=t.flight,a=attitude(s.orientation),speed=s.velocity.length(),q=.5*atmosphere(s.position.y).density*speed*speed,alpha=clamp((mass(s)*9.81/Math.max(1,q*s.spec.wingArea)-.22)/s.spec.clSlope,0,s.spec.stallAlpha*.8),pitch=alpha+Math.atan2(clamp((1700-s.position.y)*.025,-10,10),Math.max(50,speed)),headingError=Math.atan2(Math.sin(-a.heading),Math.cos(-a.heading));return {pitch:clamp((pitch-a.pitch)*2,-.4,.4),roll:clamp(-a.bank*3-headingError,-.4,.4),yaw:clamp(headingError,-.3,.3),throttle:clamp((t.cruiseSpeed-speed)*.008,-.12,.12)};}
