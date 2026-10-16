import {teamOf} from './unitTypes.js';
import {firingStatus} from './firingStatus.js';
import {groundHit} from './groundModels.js';
import {Vec3,forward,right,up,clamp} from './math.js';
import {terrainHeight} from './terrain.js';
import {explosionEffect,impactEffect} from './effects.js';
import {weaponAvailable,nextStation} from './armament.js';
import {applyDamage} from './damage.js';
import {applyTargetHit} from './targeting.js';
import {navigationJammed} from './electronicWarfare.js';
import {EnemyCombat} from './enemyCombat.js';
import {aircraftHit,closestAircraftSurface} from './hitGeometry.js';
import {Quat} from './math.js';
import {weaponProfile,spreadDirection,gunDispersion,stepBallistic,stepMissile} from './weaponDynamics.js';
import {updateCountermeasures,countermeasureTarget,decoyIntercept} from './countermeasures.js';
export const weaponNames={gun:'GÉPÁGYÚ',aam:'LEVEGŐ–LEVEGŐ',agm:'LEVEGŐ–FÖLD',bomb:'BOMBA / CCIP'};
export class Weapons {
 constructor({enemyFire=false,random=Math.random}={}){this.selected='aam';this.projectiles=[];this.cooldown=0;this.gunHeat=0;this.random=random;this.used=0;this.hits=0;this.misses=0;this.effects=[];this.trails=[];this.events=[];this.sequence=0;this.enemyCombat=enemyFire?new EnemyCombat():null;}
 emit(event){this.events.push(event);if(this.events.length>128)this.events.shift();}
 drainEvents(){const events=this.events;this.events=[];return events;}
 select(s,type){if(!weaponAvailable(s,type))return false;this.selected=type;this.solution=null;return true;}
 fire(s,targets,aim){
  if(this.cooldown>0)return null;
  const status=firingStatus(s,targets,aim,this);
  if(!status.canFire){if(status.status==='empty'){this.cooldown=.25;this.emit({type:'dry-fire',position:s.position.clone()});}return status.label;}
  const w=this.selected,target=status.target;
  const station=nextStation(s,w);
  s.ammo[w]--;this.used++;this.cooldown=w==='gun'?.085:w==='bomb'?.5:1;
  const position=s.position.clone().add(forward(s.orientation).scale(w==='gun'?15:station?.z||0)).add(right(s.orientation).scale(station?.x||0)).add(up(s.orientation).scale(w==='gun'?0:-.9));
  const profile=weaponProfile(s.spec,w),direction=w==='gun'?spreadDirection(forward(s.orientation),gunDispersion(s,profile,this.gunHeat),this.random):forward(s.orientation);
  if(w==='gun')this.gunHeat=Math.min(5,this.gunHeat+.12);
  this.projectiles.push({id:++this.sequence,type:w,profile,position,velocity:s.velocity.clone().add(direction.scale(w==='gun'?profile.muzzleSpeed:w==='bomb'?0:35)),targetId:target?.id,age:0,travelled:0,trailTimer:0,trailAnchor:position.clone(),previous:position.clone(),damage:w==='gun'?18:50});
  this.emit({type:w==='gun'?'gun':w==='bomb'?'bomb-release':'missile-launch',position:position.clone(),weapon:w});
  if(w==='gun')this.effects.push({kind:'muzzle',position:s.position.clone(),age:0,life:.055,maxLife:.055});
  return w==='gun'?'ÁGYÚTŰZ':w==='bomb'?'BOMBA KIOLDVA':'RAKÉTA INDÍTVA';
 }
 explode(position,weapon,{ground=false,target=null}={}){
  const heavy=weapon==='bomb';
  if(weapon==='gun'&&!target){this.effects.push(impactEffect(position));return;}
  const effect=explosionEffect(position,{heavy,ground,velocity:target?.velocity||new Vec3(),seed:++this.sequence});
  if(weapon==='flak'){effect.scale=.35;effect.life=effect.maxLife=1.8;for(const particle of effect.particles){particle.velocity.scale(.4);particle.hot=false;particle.size*=.5;}}
  this.effects.push(effect);
  this.emit({type:'explosion',weapon,ground,position:position.clone(),heavy});
 }
 update(s,targets,dt){
  updateCountermeasures(s,dt);
  this.enemyCombat?.update(s,targets,this,dt);
  if(s.impactPending){s.impactPending=false;this.explode(s.position,'bomb',{ground:true});}
  for(const t of targets)if(t.impactReady){t.impactReady=false;this.explode(t.position,'bomb',{ground:true});}
  this.cooldown=Math.max(0,this.cooldown-dt);
  this.gunHeat=Math.max(0,this.gunHeat-dt*.5);
  for(const e of this.effects){e.age+=dt;e.life-=dt;}
  this.effects=this.effects.filter(e=>e.life>0);
  for(const trail of this.trails)trail.life-=dt;
  this.trails=this.trails.filter(t=>t.life>0);
  const remaining=[];
  for(const p of this.projectiles){
   p.previous=p.position.clone();p.age+=dt;
   const hostile=p.owner==='enemy',ai=!!p.sourceId,entityShot=ai&&!!p.targetEntityId,missile=p.type==='aam'||p.type==='agm',target=entityShot?targets.find(t=>t.id===p.targetEntityId&&t.alive):hostile?(!s.crashed?s:null):targets.find(t=>t.id===p.targetId&&t.alive);
   if(missile){const source=ai?targets.find(t=>t.id===p.sourceId):s,launcher=ai&&source?{...source,orientation:source.kind==='ground'?null:source.flight?.orientation||Quat.euler(source.heading||0,source.pitch||0,source.bank||0)}:source,guidanceTarget=hostile&&!entityShot&&target?countermeasureTarget(p,s,dt,this.random):target;stepMissile(p,guidanceTarget,!ai&&navigationJammed(s,targets)&&['sarh','active'].includes(p.profile.guidance)?null:launcher,dt);}
   if(p.type==='bomb'||p.type==='gun')stepBallistic(p,dt);else if(p.type==='flak')p.velocity.y-=9.81*dt;
   p.position.add(p.velocity.clone().scale(dt));
   if(missile&&p.age<p.profile.burn){
    p.trailTimer+=dt;
    if(p.trailTimer>=.045){this.trails.push({from:p.trailAnchor.clone(),to:p.position.clone(),velocity:p.velocity.clone().normalize(),life:3.5,maxLife:3.5});p.trailAnchor=p.position.clone();p.trailTimer%=.045;}
   }
   if(hostile&&!entityShot){
    let consumed=false;
    if(p.type==='flak'&&p.age>=p.fuse){this.explode(p.position,'flak');consumed=true;if(!s.crashed&&!s.dying&&p.position.distance(s.position)<85){const hit=closestAircraftSurface(s,p.position);if(hit&&hit.distance<65){const amount=p.damage*(1-hit.distance/65);applyDamage(s,amount,{part:hit.part,source:'Légvédelmi gránát repesztalálata'});s.lastHit={part:hit.part,weapon:'flak',time:s.elapsed};this.emit({type:'damage-hit',position:hit.point});}}}
    else if(p.type!=='flak'&&!s.crashed&&!s.dying){const hit=aircraftHit(s,p.previous,p.position,{radius:missile&&p.armed?p.profile.fuseRadius:.15});if(hit){if(!missile||p.armed){applyDamage(s,impactDamage(p,s.velocity),{part:hit.part,source:missile?'Ellenséges rakétatalálat':'Ellenséges gépágyútalálat'});s.lastHit={part:hit.part,weapon:p.type,time:s.elapsed};if(missile)this.explode(hit.point,'aam');else this.effects.push(impactEffect(hit.point));this.emit({type:'damage-hit',position:hit.point});}consumed=true;}}
    if(missile&&!consumed&&p.decoyId!==undefined){const point=decoyIntercept(p,s);if(point){this.explode(point,'aam');consumed=true;const hit=closestAircraftSurface(s,point);if(!s.crashed&&!s.dying&&hit.distance<35){applyDamage(s,p.damage*(1-hit.distance/35),{part:hit.part,source:'Elterelt rakéta közeli robbanása'});s.lastHit={part:hit.part,weapon:'aam',time:s.elapsed};this.emit({type:'damage-hit',position:hit.point});}}}
    const terrain=p.position.y<=terrainHeight(p.position.x,p.position.z);if(terrain&&!consumed){this.explode(p.position,p.type,{ground:true});consumed=true;}
    if(!consumed&&p.age<(p.profile?.life||(p.type==='gun'?5:p.type==='flak'?15:70)))remaining.push(p);continue;
   }
   const canHit=t=>!ai||teamOf(t,s)!==p.owner&&teamOf(t,s)!=='neutral';
   const recordHit=(t,p,info=null)=>{const amount=p.type==='gun'?impactDamage(p,t.velocity):(p.type==='aam'||p.type==='agm')&&t.kind==='ground'?100:p.damage??100,destroyed=applyTargetHit(t,p.type,{part:info?.part,amount});if(!ai){this.damageHits=(this.damageHits||0)+1;if(destroyed)this.hits++;}else if(p.owner==='ally'&&destroyed)this.alliedKills=(this.alliedKills||0)+1;return destroyed;};
   if(entityShot&&p.type==='flak'){
    if(p.age>=p.fuse){this.explode(p.position,'flak');for(const t of targets)if(t.alive&&canHit(t)&&t.kind==='air'&&t.position.distance(p.position)<65){recordHit(t,{...p,damage:p.damage*(1-t.position.distance(p.position)/65)});}}
    else if(p.position.y>terrainHeight(p.position.x,p.position.z)&&p.age<15)remaining.push(p);continue;
   }
   let hitTarget=null,hitInfo=null;
   for(const t of targets){
    if(!t.alive||!canHit(t))continue;
    const segment=p.position.clone().sub(p.previous),length2=segment.dot(segment),fraction=clamp(t.position.clone().sub(p.previous).dot(segment)/Math.max(1,length2),0,1),nearest=p.previous.clone().add(segment.scale(fraction));
    if(t.kind==='ground'?groundHit(t,p.previous,p.position,p.type==='bomb'?38:p.type==='gun'?.2:12):nearest.distance(t.position)<t.radius+(p.type==='bomb'?38:p.type==='gun'?2:12)){
     if(t.kind==='air'){hitInfo=aircraftHit({spec:{id:t.aircraftId||'mig29'},position:t.position,previousPosition:t.previousPosition||t.position,orientation:t.flight?.orientation||Quat.euler(t.heading||0,t.pitch||0,t.bank||0),mach:0},p.previous,p.position,{radius:missile&&p.armed?p.profile.fuseRadius:p.type==='gun'?.15:1});if(!hitInfo)continue;}
     hitTarget=t;break;
    }
   }
   const ground=p.position.y<=terrainHeight(p.position.x,p.position.z);
   if(ground&&!hitTarget){
    for(const t of targets)if(t.alive&&canHit(t)&&t.kind==='ground'&&groundHit(t,p.position,p.position,p.type==='bomb'?100:20)){hitTarget=t;break;}
   }
   if(hitTarget&&(!missile||p.armed)){const destroyed=recordHit(hitTarget,p,hitInfo),point=hitInfo?.point||hitTarget.position;if(p.type==='gun'&&!destroyed)this.effects.push(impactEffect(point));else this.explode(point,p.type,{ground:hitTarget.kind==='ground',target:hitTarget});}
   else if(ground){this.explode(p.position,p.type,{ground:true});}
   if(hitTarget||ground||p.age>(p.profile?.life||(p.type==='gun'?5:150))){if(!hitTarget&&!ai)this.misses++;}else remaining.push(p);
  }
  this.projectiles=remaining;
  s.incomingMissiles=remaining.filter(p=>p.owner==='enemy'&&!p.targetEntityId&&p.type==='aam'&&!p.seekerLost&&p.decoyId===undefined).length;s.threatWarning=s.incomingMissiles?`RAKÉTA KÖZELEDIK · ${s.incomingMissiles} · C: ELTERELŐ`:'';
  if(this.trails.length>500)this.trails.splice(0,this.trails.length-500);
 }
}
export function impactDamage(p,targetVelocity=new Vec3()){return (p.damage??(p.type==='gun'?18:50))*(p.type==='gun'&&p.profile?clamp((p.velocity.clone().sub(targetVelocity).length()/p.profile.muzzleSpeed)**2,.08,1):1);}

