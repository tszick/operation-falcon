import {Vec3,clamp,DEG} from './math.js';
import {terrainHeight,runway} from './terrain.js';
export const landingRouteColor='#a497ff';
const TAU=Math.PI*2,wrap=a=>(a%TAU+TAU)%TAU,cache=new WeakMap();
// Dubins paths: straight and constant-radius turns, tangent at every join.
// Standard plane coordinates are x=east, y=north (the world's z).
export function dubinsPath(start,heading,end,endHeading,radius){
 const dx=end.x-start.x,dy=end.z-start.z,theta=Math.atan2(dy,dx),a=wrap(Math.PI/2-heading-theta),b=wrap(Math.PI/2-endHeading-theta),d=Math.hypot(dx,dy)/radius,sa=Math.sin(a),sb=Math.sin(b),ca=Math.cos(a),cb=Math.cos(b),cab=Math.cos(a-b),candidates=[];
 const add=(type,t,p,q)=>{if([t,p,q].every(Number.isFinite))candidates.push({type,lengths:[wrap(t),p,wrap(q)],total:(wrap(t)+p+wrap(q))*radius});};let p2,tmp,p;
 p2=2+d*d-2*cab+2*d*(sa-sb);if(p2>=-1e-9){tmp=Math.atan2(cb-ca,d+sa-sb);add('LSL',-a+tmp,Math.sqrt(Math.max(0,p2)),b-tmp);}
 p2=2+d*d-2*cab+2*d*(-sa+sb);if(p2>=-1e-9){tmp=Math.atan2(ca-cb,d-sa+sb);add('RSR',a-tmp,Math.sqrt(Math.max(0,p2)),-b+tmp);}
 p2=-2+d*d+2*cab+2*d*(sa+sb);if(p2>=-1e-9){p=Math.sqrt(Math.max(0,p2));tmp=Math.atan2(-ca-cb,d+sa+sb)-Math.atan2(-2,p);add('LSR',-a+tmp,p,-b+tmp);}
 p2=d*d-2+2*cab-2*d*(sa+sb);if(p2>=-1e-9){p=Math.sqrt(Math.max(0,p2));tmp=Math.atan2(ca+cb,d-sa-sb)-Math.atan2(2,p);add('RSL',a-tmp,p,b-tmp);}
 tmp=(6-d*d+2*cab+2*d*(sa-sb))/8;if(Math.abs(tmp)<=1){p=wrap(TAU-Math.acos(tmp));const t=wrap(a-Math.atan2(ca-cb,d-sa+sb)+p/2);add('RLR',t,p,a-b-t+p);}
 tmp=(6-d*d+2*cab+2*d*(-sa+sb))/8;if(Math.abs(tmp)<=1){p=wrap(TAU-Math.acos(tmp));const t=wrap(-a-Math.atan2(ca-cb,d+sa-sb)+p/2);add('LRL',t,p,b-a-t+p);}
 const best=candidates.sort((a,b)=>a.total-b.total)[0];if(!best)return null;
 const points=[new Vec3(start.x,0,start.z)];let x=start.x,y=start.z,angle=Math.PI/2-heading;const spacing=Math.max(100,best.total/1000);
 for(let i=0;i<3;i++){const turn=best.type[i],length=best.lengths[i],count=Math.max(1,Math.ceil(length*radius/spacing)),step=length/count;for(let j=0;j<count;j++){if(turn==='S'){x+=radius*step*Math.cos(angle);y+=radius*step*Math.sin(angle);}else{const sign=turn==='L'?1:-1,next=angle+sign*step;x+=radius/sign*(Math.sin(next)-Math.sin(angle));y+=radius/sign*(-Math.cos(next)+Math.cos(angle));angle=next;}points.push(new Vec3(x,0,y));}}
 return {...best,radius,points,endHeading:Math.PI/2-angle};
}
function verticalClearance(point,desired,final=false,distance=0){const clearance=final?clamp((distance-500)/2500,0,1)*120:120;return Math.max(desired,terrainHeight(point.x,point.z)+clearance);}
export function planLandingRoute(s,direction=s.approach?.direction||1){
 const speed=Math.max(60,Math.hypot(s.velocity.x,s.velocity.z)),radius=clamp(speed*speed/(9.81*Math.tan(30*DEG)),700,12000),heading=Math.hypot(s.velocity.x,s.velocity.z)>3?Math.atan2(s.velocity.x,s.velocity.z):0,endHeading=direction>0?0:Math.PI,along=-direction*s.position.z-runway.halfLength,error=Math.abs(Math.atan2(Math.sin(heading-endHeading),Math.cos(heading-endHeading))),slope=Math.tan(3*DEG),aligned=along>0&&Math.abs(s.position.x)<200&&error<12*DEG&&Math.abs(s.position.y-(2+along*slope))<Math.max(80,along*.025);
 let join=null,entryDistance,points=[],advisory='';
 if(aligned){entryDistance=Math.max(600,along);}
 else{const options=[6500,10000,15000,22000,30000].map(distance=>{const path=dubinsPath(s.position,heading,new Vec3(0,0,-direction*(runway.halfLength+distance)),endHeading,radius);return {path,distance,descent:Math.max(0,s.position.y-(2+distance*slope))/Math.max(1,path?.total||1)};}).filter(x=>x.path);const acceptable=options.filter(x=>x.descent<=slope).sort((a,b)=>(a.path.total+a.distance)-(b.path.total+b.distance));const selected=acceptable[0]||options.sort((a,b)=>a.descent-b.descent)[0];join=selected.path;entryDistance=selected.distance;if(selected.descent>slope)advisory='Magasan érkezel: több hely és kisebb sebesség kell.';
  let travelled=0;for(let i=0;i<join.points.length;i++){if(i)travelled+=join.points[i].distance(join.points[i-1]);const point=join.points[i].clone(),fraction=clamp(travelled/Math.max(1,join.total),0,1),height=s.position.y+(2+entryDistance*slope-s.position.y)*fraction;point.y=verticalClearance(point,height);points.push(point);}
 }
 const finalStart=points.length;for(let distance=entryDistance;distance>0;distance-=Math.max(100,entryDistance/300)){const point=new Vec3(0,0,-direction*(runway.halfLength+distance));point.y=verticalClearance(point,2+distance*slope,true,distance);points.push(point);}points.push(new Vec3(0,2,-direction*runway.halfLength));
 return {points,finalStart,direction,radius,entryDistance,plannedAt:s.elapsed||0,advisory,joinType:join?.type||'FINAL',color:landingRouteColor};
}
export function clearLandingRoute(s){if(s)cache.delete(s);}
function distanceToRoute(position,points){let best=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((position.x-a.x)*dx+(position.z-a.z)*dz)/Math.max(1e-9,dx*dx+dz*dz),0,1);best=Math.min(best,Math.hypot(position.x-a.x-t*dx,position.z-a.z-t*dz));}return best;}
export function getLandingRoute(s,{jammed=false}={}){if(!s.approach?.active||s.onGround||s.crashed||s.dying||s.landingRouteEnabled===false){clearLandingRoute(s);return null;}if(jammed)return null;let route=cache.get(s);if(!route||(s.elapsed||0)-route.plannedAt>5&&distanceToRoute(s.position,route.points)>2000){route=planLandingRoute(s,route?.direction||s.approach.direction);cache.set(s,route);}return route;}
export function renderLandingRoute(renderer,route){if(!route)return;const c=renderer.ctx;c.save();c.strokeStyle=route.color;c.lineWidth=2;c.setLineDash([9,6]);c.beginPath();for(let i=1;i<route.points.length;i++)renderer.line(route.points[i-1],route.points[i]);c.stroke();c.setLineDash([]);c.lineWidth=1;const interval=Math.max(1,Math.floor((route.points.length-route.finalStart)/10));c.beginPath();for(let i=route.finalStart;i<route.points.length-1;i+=interval){const p=route.points[i];if(p.distance(renderer.camera)<100)continue;renderer.line(p.clone().add(new Vec3(-40,-7,0)),p.clone().add(new Vec3(-40,7,0)));renderer.line(p.clone().add(new Vec3(-40,7,0)),p.clone().add(new Vec3(40,7,0)));renderer.line(p.clone().add(new Vec3(40,7,0)),p.clone().add(new Vec3(40,-7,0)));}c.stroke();c.restore();}
