import {Vec3,forward,right,up,clamp,DEG} from './math.js';
import {terrainHeight} from './terrain.js';
// Gameplay dispenser loads, not verified equipment for every historical variant.
export function createCountermeasures(spec){const modern=spec.group?.includes('modern'),heavy=spec.emptyMass>18000,n=modern?60:heavy?48:32;return {flare:n,chaff:n,capacity:n,cooldown:0,clock:0,sequence:0,decoys:[],used:0};}
export function deployCountermeasures(s,kind='mixed'){
 const cm=s.countermeasures||(s.countermeasures=createCountermeasures(s.spec));
 if(s.crashed||s.dying||s.onGround)return {message:'ELTERELŐ CSAK REPÜLÉS KÖZBEN',released:0};
 if(cm.cooldown>0)return {message:'ELTERELŐ: VÁRJ EGY PILLANATOT',released:0};
 if(!['mixed','flare','chaff'].includes(kind))return {message:'ISMERETLEN ELTERELŐ',released:0};
 const flares=kind!=='chaff'?Math.min(2,cm.flare):0,chaff=kind!=='flare'?Math.min(1,cm.chaff):0;
 if(!flares&&!chaff)return {message:'ELFOGYOTT AZ ELTERELŐ',released:0};
 cm.flare-=flares;cm.chaff-=chaff;cm.cooldown=.7;cm.used+=flares+chaff;
 for(const type of ['flare','chaff'])for(let i=0;i<(type==='flare'?flares:chaff);i++){
  const side=i%2?1:-1,position=s.position.clone().add(forward(s.orientation).scale(-5)).add(right(s.orientation).scale(side*1.5)).add(up(s.orientation).scale(-.7));
  cm.decoys.push({id:++cm.sequence,type,position,previous:position.clone(),velocity:s.velocity.clone().scale(.85).add(right(s.orientation).scale(side*(type==='flare'?18:7))).add(up(s.orientation).scale(-6)),age:0,life:type==='flare'?4.5:8});
 }
 if(cm.decoys.length>96)cm.decoys.splice(0,cm.decoys.length-96);
 return {message:`ELTERELŐ KI · INFRA ${cm.flare} · DIPÓL ${cm.chaff}`,released:flares+chaff};
}
export function updateCountermeasures(s,dt){const cm=s.countermeasures;if(!cm)return;cm.clock+=dt;cm.cooldown=Math.max(0,cm.cooldown-dt);for(const d of cm.decoys){d.previous=d.position.clone();d.age+=dt;d.velocity.scale(Math.exp(-(d.type==='flare'?.8:1.8)*dt));d.velocity.y-=(d.type==='flare'?9.81:1.5)*dt;d.position.add(d.velocity.clone().scale(dt));}cm.decoys=cm.decoys.filter(d=>d.age<d.life&&d.position.y>terrainHeight(d.position.x,d.position.z));}
export function decoyKind(profile){return ['ir','imaging'].includes(profile?.guidance)?'flare':['sarh','active'].includes(profile?.guidance)?'chaff':null;}
const susceptibility={aim9m:.65,aim9l:.75,magic2:.6,r60m:.9,r73:.5,mica:.3,aim7e:.8,aim7m:.6,aim120:.4,aim120c:.25,r40:.75,r33:.65,r771:.35,rvvsdm:.25,pl15:.23,sam:.4,defense:.75,maverick:.12};
export function countermeasureTarget(p,s,dt,random=Math.random){
 const decoys=s.countermeasures?.decoys||[];
 if(p.decoyId!==undefined){const decoy=decoys.find(d=>d.id===p.decoyId);if(decoy)return decoy;p.seekerLost=true;p.lossReason='CSALI ELHALVÁNYULT';return null;}
 const type=decoyKind(p.profile);if(!type||p.seekerLost||!decoys.length)return s;
 const los=s.position.clone().sub(p.position),distance=los.length();if(distance>4500||distance<30)return s;
 if(p.profile.guidance==='active'&&distance>(p.profile.activeRange||15000))return s;
 const unit=los.clone().normalize(),nose=p.velocity.clone().normalize(),ab=s.afterburner&&s.throttle>.8,aircraftSignal=type==='flare'?.6+s.throttle*.9+(ab?2.8:0)+(s.damage>50?.5:0):['f22','f35','su57','j20'].includes(s.spec.id)?.65:1;
 for(const d of decoys){
  if(d.type!==type||d.age<.04)continue;
  const decoyLOS=d.position.clone().sub(p.position),range=decoyLOS.length(),direction=decoyLOS.clone().normalize(),angle=Math.acos(clamp(direction.dot(unit),-1,1));
  if(angle>9*DEG||nose.dot(direction)<Math.cos(p.profile.seeker)||d.position.distance(s.position)<5)continue;
  const brightness=type==='flare'?8*Math.exp(-d.age*.8):5*Math.min(1,d.age/.3)*(1-d.age/d.life)**1.5;
  const radialDifference=Math.abs(s.velocity.clone().sub(d.velocity).dot(unit)),doppler=type==='chaff'?1/(1+(radialDifference/100)**2):1;
  const ratio=brightness/aircraftSignal*(distance/Math.max(10,range))**2*doppler,rate=3*(susceptibility[p.profile.id]??.4)*Math.min(4,ratio)*(1-angle/(9*DEG));
  p.decoyEvidence??=new Map();let evidence=p.decoyEvidence.get(d.id);if(!evidence){evidence={exposure:0,threshold:-Math.log(Math.max(1e-9,1-random()))};p.decoyEvidence.set(d.id,evidence);}
  evidence.exposure+=rate*dt;
  if(evidence.exposure>=evidence.threshold){p.decoyId=d.id;p.decoyType=d.type;return d;}
 }
 return s;
}
export function decoyIntercept(p,s){const d=s.countermeasures?.decoys.find(d=>d.id===p.decoyId);if(!d||!p.armed)return null;const start=p.previous.clone().sub(d.previous||d.position),end=p.position.clone().sub(d.position),delta=end.clone().sub(start),t=clamp(-start.dot(delta)/Math.max(1e-9,delta.dot(delta)),0,1);if(start.add(delta.scale(t)).length()>(p.profile.fuseRadius+(d.type==='chaff'?Math.min(8,d.age*2):0)))return null;return p.previous.clone().add(p.position.clone().sub(p.previous).scale(t));}
