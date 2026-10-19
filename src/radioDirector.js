import {wingmanLine} from './wingmanRadio.js';
import {radioLines} from './radioLines.js';
import {isHostile} from './unitTypes.js';
import {navigationJammed} from './electronicWarfare.js';
import {damageResponse} from './damage.js';
const isWingman=t=>t.team==='ally'&&(t.type==='fighter'||t.radioCallSign&&t.kind==='air');
const groups=new Map();for(const line of radioLines){if(!groups.has(line.group))groups.set(line.group,[]);groups.get(line.group).push(line);}
export class RadioDirector {
 constructor({random=Math.random}={}){this.random=random;this.reset();}
 reset(){this.queue=[];this.seen=new Set();this.cooldowns=new Map();this.variants=new Map();this.current=null;this.stopRequested=false;this.halted=false;this.nextScan=0;this.jammed=false;this.flightEmergency=null;this.flightEmergencySince=0;this.services=0;this.wingmen=new Map();}
 issue(group,now,{priority=30,delay=0,cooldown=0,key=group,ttl=18,response=null,lineOverride=null}={}){
  if(this.halted||now<(this.cooldowns.get(key)??-Infinity)||this.queue.some(c=>c.key===key))return null;
  const choices=groups.get(group);if(!choices?.length)return null;const n=this.variants.get(group)||0;this.variants.set(group,n+1);const line=lineOverride||choices[n%choices.length];
  const cue={line,key,priority,ready:now+delay,expires:now+delay+ttl,response};this.cooldowns.set(key,now+cooldown);this.queue.push(cue);this.queue.sort((a,b)=>b.priority-a.priority||a.ready-b.ready);
  if(this.queue.length>32)this.queue.length=32;return cue;
 }
 once(key,group,now,options={}){if(this.seen.has(key))return;this.seen.add(key);return this.issue(group,now,{...options,key});}
 start(s,mission,targets){this.reset();const now=s.elapsed||0,practice=mission.spec.objective==='landing',civil=mission.spec.objective==='escort';
  if(mission.spec.objective!=='canyon')this.issue(practice?'approach':s.onGround?'clearance':civil?'civil':'hunt',now,{priority:35,ttl:35,response:practice||s.onGround?'ackGeneral':null});if(!s.onGround)this.seen.add('departure');
  let readyIndex=0;for(const t of targets.filter(t=>isWingman(t)&&t.alive)){this.registerWingman(t);if(this.wingmanReady(t,now,{delay:6+readyIndex*4}))readyIndex++;}
 }
 registerWingman(t){let state=this.wingmen.get(t.id);if(!state){state={number:t.radioCallSign?.number??this.wingmen.size+2,flight:t.radioCallSign?.flight||'Falcon',ordinal:this.wingmen.size,damage:t.flight?.damage||t.damage||0,down:false};this.wingmen.set(t.id,state);}return state;}
 wingmanCue(group,t,now,options={}){const state=this.registerWingman(t);return this.issue(group,now,{...options,lineOverride:wingmanLine(group,state.number,t.id,state.flight)});}
 wingmanReady(t,now,options={}){
  const state=this.registerWingman(t),key='wingman-ready-flight:'+state.flight;
  // Explicit formations report through One. Legacy ungrouped support gets one representative.
  if(t.radioCallSign&&state.number!==1||this.seen.has(key))return null;
  const cue=this.wingmanCue('wingmanReady',t,now,{priority:25,ttl:45,...options,key});if(cue)this.seen.add(key);return cue;
 }
 observe(s,mission,targets){const now=s.elapsed||0;if(s.crashed){this.queue=[];this.halted=true;this.stopRequested=true;return;}
  if(s.dying){if(!this.seen.has('mayday')){this.queue=[];this.once('mayday','mayday',now,{priority:120,ttl:12});}return;}
  if((mission.serviceCount||0)>this.services){this.services=mission.serviceCount;const sortieKeys=['damaged-return','mayday','return','departure','success','welcome'];for(const key of sortieKeys)this.seen.delete(key);this.queue=this.queue.filter(c=>!sortieKeys.includes(c.key)&&c.key!=='flight-emergency');this.flightEmergency=null;this.flightEmergencySince=now;this.issue('welcome',now,{priority:80,key:'service-welcome-'+this.services,ttl:20});this.issue('clearance',now,{priority:35,delay:6,key:'service-clearance-'+this.services,ttl:25});}
  if(s.airborne&&s.onGround&&s.landing?.success&&s.speed<5){if(!this.seen.has('welcome')){this.queue=[];this.once('welcome','welcome',now,{priority:80,ttl:25});}return;}
  if(this.halted||now<this.nextScan)return;this.nextScan=now+.25;
  // Use flight state rather than the HUD warning, which terrain alerts may override.
  const flying=s.airborne&&!s.onGround,parts=s.condition?.parts;
  const stalled=flying&&Math.abs(s.alpha||0)>s.spec.stallAlpha&&s.speed>35&&s.velocity.y<-5;
  const response=parts&&flying?damageResponse(s):null;
  const controlsLost=flying&&response&&(response.pitchControl<.18||response.rollControl<.2);
  const emergency=controlsLost?'controlLost':stalled?'stall':null;
  if(emergency!==this.flightEmergency){this.flightEmergency=emergency;this.flightEmergencySince=now;this.queue=this.queue.filter(c=>c.key!=='flight-emergency');}
  if(emergency&&now-this.flightEmergencySince>=(controlsLost?1:1.5))this.issue(emergency,now,{priority:110,key:'flight-emergency',cooldown:45,ttl:5});
  const jammed=navigationJammed(s,targets);
  if(jammed&&!this.jammed)this.issue('jammed',now,{priority:85,key:'nav-jammed',cooldown:45,ttl:15});
  this.jammed=jammed;
  const airborne=s.airborne&&!s.onGround,damaged=airborne&&s.damage>=40,weaponsFailed=airborne&&s.condition?.parts.weapons<=.35;
  if(damaged||weaponsFailed){this.once('damaged-return',damaged?'damage':'weaponsFailed',now,{priority:90,ttl:25,response:'ack'});this.seen.add('return');}
  else if(mission.aborted||mission.phaseId==='emergency')this.once('return','return',now,{priority:65,response:'ack'});
  if(mission.civilIntercepted&&mission.spec.objective==='escort')this.once('civil-pilot','civilPilot',now,{priority:65,ttl:25});
  if(!damaged&&!weaponsFailed&&airborne&&mission.objectiveComplete&&!mission.aborted&&!['landing','canyon'].includes(mission.spec.objective)){this.once('success','success',now,{priority:55,ttl:30,response:'ack'});this.seen.add('return');}
  if(mission.phaseId==='return')this.once('return','return',now,{priority:55,response:'ack'});
  if(airborne&&mission.departed&&!mission.aborted&&!mission.objectiveComplete&&!['landing','canyon'].includes(mission.spec.objective))this.once('departure',mission.spec.objective==='escort'?'civil':'hunt',now,{priority:30,ttl:25});
  const inbound=targets.some(t=>t.alive&&t.kind==='air'&&!t.civilian&&isHostile(t,s)&&(()=>{const dx=t.position.x-s.position.x,dy=t.position.y-s.position.y,dz=t.position.z-s.position.z,d=Math.hypot(dx,dy,dz);return d<20000&&dx*((t.velocity?.x||0)-s.velocity.x)+dy*((t.velocity?.y||0)-s.velocity.y)+dz*((t.velocity?.z||0)-s.velocity.z)<0;})());
  if(inbound)this.issue('bandits',now,{priority:60,cooldown:90,ttl:10});
  for(const t of targets.filter(t=>isWingman(t)&&!t.pending&&!t.cancelled)){
   let previous=this.wingmen.get(t.id);if(!previous){previous=this.registerWingman(t);if(t.alive)this.wingmanReady(t,now);}
   const down=!!(t.flight?.dying||t.flight?.crashed||t.falling||!t.alive&&!t.retired),damage=t.flight?.damage||t.damage||0;
   if(down&&!previous.down){this.queue=this.queue.filter(c=>c.line.unitId!==t.id);this.wingmanCue('wingmanDown',t,now,{priority:105,key:'wingman-down:'+t.id,cooldown:Infinity,ttl:25});}
   else if(!down&&damage>previous.damage+.1)this.wingmanCue('wingmanAttack',t,now,{priority:75,key:'wingman-attack:'+t.id,cooldown:35,ttl:18});
   previous.down=down;previous.damage=damage;
  }
 }
 event(event,s,targets){if(s.crashed||s.dying||this.halted)return;const now=s.elapsed||0;
  if(event.owner==='enemy'){
   const wingman=targets.find(t=>t.id===event.targetId&&isWingman(t)&&t.alive&&!t.flight?.dying);
   if(wingman&&['missile-launch','gun'].includes(event.type))this.wingmanCue('wingmanAttack',wingman,now,{priority:75,key:'wingman-attack:'+wingman.id,cooldown:35,ttl:18});
   if(event.type==='missile-launch'&&(event.targetId==='PLAYER'||s.id&&event.targetId===s.id)){const source=targets.find(t=>t.id===event.sourceId);this.issue(source?.kind==='ground'?'sam':'missile',now,{priority:100,key:'incoming-missile',cooldown:12,ttl:9});}return;
  }
  if(event.owner==='ally'||event.sourceId!=='PLAYER')return;
  if(event.type==='missile-launch')this.issue('launch',now,{priority:40,key:'pilot-launch',cooldown:22,ttl:7});
  if(event.type==='bomb-release')this.issue('bomb',now,{priority:40,key:'pilot-bomb',cooldown:25,ttl:8});
  if(event.type==='gun')this.issue('gun',now,{priority:35,key:'pilot-gun',cooldown:30,ttl:6});
 }
 peek(now){this.queue=this.queue.filter(c=>now<=c.expires);return this.queue.find(c=>c.ready<=now)||null;}
 take(now){const cue=this.peek(now);if(cue){this.queue.splice(this.queue.indexOf(cue),1);this.current=cue;}return cue;}
 completed(cue,now){if(this.current!==cue)return;this.current=null;if(cue.response&&this.random()<.6)this.issue(cue.response,now,{priority:15,delay:.45,key:'pilot-ack',cooldown:25,ttl:7});}
}
