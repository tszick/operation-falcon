import {clamp} from './math.js';
const project=(r,p)=>r.projectWorld?r.projectWorld(p):r.project(p);
export function renderDamageSmoke(r,s){
 if(s.crashed)return;const d=s.condition;if(!d)return;const c=r.ctx;
 for(const puff of d.smoke){const p=project(r,puff.position);if(!p)continue;const fade=clamp((1-puff.age/5)*.65,0,1),radius=clamp((1.5+puff.age*4.5)*r.focal/p.depth,1,42);
  c.beginPath();c.arc(p.x,p.y,radius,0,Math.PI*2);c.fillStyle=`rgba(24,28,23,${fade*.35})`;c.strokeStyle=`rgba(150,146,116,${fade*.45})`;c.lineWidth=.8;c.fill();c.stroke();
  if(puff.hot&&puff.age<.3){c.beginPath();c.arc(p.x,p.y,Math.max(1,radius*.5),0,Math.PI*2);c.fillStyle=`rgba(255,157,64,${(1-puff.age/.3)*.85})`;c.fill();}
 }
}
