import {missionForAircraft} from '../src/transportRole.js';
// Full-sortie diagnostic pilot. Uses ordinary controls, sensing, finite stores and
// mission outcomes; never teleports, damages targets directly or skips objectives.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {aircraft,missions,transportAircraft} from '../src/aircraftSpec.js';
import {createMissionAircraft} from '../src/missionStart.js';
import {createTargets,updateTargets,Targeting,radarContacts} from '../src/targeting.js';
import {Mission} from '../src/mission.js';
import {Weapons} from '../src/weapons.js';
import {stepAircraft,STEP} from '../src/physics.js';
import {Vec3,attitude,DEG,clamp} from '../src/math.js';
import {mass,atmosphere,approachSpeeds} from '../src/performance.js';
import {damageResponse} from '../src/damage.js';
import {terrainHeight} from '../src/terrain.js';
import {canyonPoint} from '../src/canyonTraining.js';
import {weaponProfile,predictBombImpact} from '../src/weaponDynamics.js';
import {defaultLoadout,configureAircraft} from '../src/loadoutPlanner.js';
import {decoyKind,deployCountermeasures} from '../src/countermeasures.js';
import {FlightRecorder} from '../src/flightRecorder.js';
import {firingStatus} from '../src/firingStatus.js';
import {navigationJammed} from '../src/electronicWarfare.js';
import {evaluateFlight} from '../src/flightDebrief.js';
const args=process.argv.slice(2),opt=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const id=opt('--mission','landing'),seed=Number(opt('--seed','71')),limit=Number(opt('--seconds','1600')),out=path.resolve(opt('--out','./playtest-output'));
let randomSeed=seed>>>0;const random=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;};Math.random=random;
let scenario=missions.find(m=>m.id===id);if(!scenario)throw new Error(id);
let spec=[...aircraft,...transportAircraft].find(a=>a.id===opt('--aircraft','f16'));
scenario=missionForAircraft(scenario,spec);const choice=defaultLoadout(spec);if(id==='convoy')choice.stations=choice.stations.map(type=>type==='bomb'?'agm':type);if(['defend-base','escort-transport','defend-city','air-superiority'].includes(id))choice.stations=choice.stations.map(()=> 'aam');spec=configureAircraft(spec,choice);
const targets=createTargets(scenario,spec,{rng:random}),s=createMissionAircraft(spec,scenario),m=new Mission(scenario),w=new Weapons({enemyFire:true,random}),aim=new Targeting(),by=id=>targets.find(t=>t.id===id);
m.update(s,targets,w,aim);const recorder=new FlightRecorder();recorder.start(s,m,targets,w,aim);recorder.metadata.playtest={method:'full sortie scripted pilot, actual 120 Hz controls and finite weapons, no checkpoints',seed};recorder.metadata.playerHz=1;recorder.metadata.worldHz=1;
const phases=[],shots=[],warnings=new Map(),pilot={nav:'mission',bombPass:'line',lastShot:-100,landingGate:false},lastLaunch=new Map();let nextFire=0,nextSample=0,nextSummary=0,cmAt=0,lastPhase='',controls={};
function controlsTo(goal,{speed=180,bankLimit=35,vy=null,altitude=goal.y}={}){
 const a=attitude(s.orientation),v=Math.max(40,s.velocity.length()),q=.5*atmosphere(s.position.y).density*v*v,r=damageResponse(s),cl=mass(s)*9.81/Math.max(1,q*s.spec.wingArea*r.lift*Math.max(.6,Math.cos(a.bank))),alpha=clamp((cl-.22-(s.flapPosition||0)*.45)/s.spec.clSlope,-.1,s.spec.stallAlpha*.8),heading=Math.atan2(goal.x-s.position.x,goal.z-s.position.z),error=Math.atan2(Math.sin(heading-a.heading),Math.cos(heading-a.heading)),bank=clamp(error*.9,-bankLimit*DEG,bankLimit*DEG),vertical=vy??clamp((altitude-s.position.y)*.06,-15,20),pitch=alpha+Math.atan2(vertical,v),rates=s.condition.rates,authority=clamp(q/2800,.06,1);
 const available=s.spec.thrust*clamp(atmosphere(s.position.y).density/1.225,.23,1)*r.engine*.9,drag=s.forces?.dragN||q*s.spec.wingArea*(s.spec.cd0+s.spec.inducedDrag*cl*cl+(s.gear?.024:0)+(s.flapPosition||0)*.035),desired=clamp((drag+mass(s)*9.81*vertical/v)/Math.max(1,available)+(speed-v)*.035,0,1);
 return {pitch:clamp((pitch-a.pitch)*2.7-(rates.pitch||0)/Math.max(.01,s.spec.pitchRate*DEG*authority*r.pitchControl),-.6,.6),roll:clamp((bank-a.bank)*2.5-(rates.roll||0)/Math.max(.01,s.spec.rollRate*DEG*authority*r.rollControl),-.65,.65),yaw:clamp(-(rates.yaw||0)/Math.max(.005,.07*r.control),-1,1),throttle:clamp((desired-s.throttle)*4,-1,1)};
}
function approach(){
 s.afterburner=false;s.landingMode='on';const distance=Math.hypot(s.position.x,s.position.z+13000);
 if(id==='landing')pilot.landingGate=true;
 if(!pilot.landingGate){s.gear=false;s.flaps=false;s.airbrake=s.speed>190;if(distance<900)pilot.landingGate=true;return controlsTo(new Vec3(0,750,-13000),{speed:160,altitude:750});}
 s.gear=true;s.flaps=true;const speed=approachSpeeds(s).target/3.6,vTarget=speed/Math.sqrt(atmosphere(s.position.y).density/1.225),d=-1100-s.position.z,desired=Math.max(0,d*Math.tan(3*DEG)),vertical=s.position.y<15?-1+clamp((2-s.position.y)*.03,-.5,.1):clamp(-s.velocity.length()*.052+(desired-s.position.y)*.3,-10,4);
 s.airbrake=s.ias>speed+14;return controlsTo(new Vec3(0,desired,s.position.z+Math.max(700,Math.min(2000,d+500))),{speed:vTarget,bankLimit:s.position.y<80?8:20,vy:vertical});
}
function chooseTarget(){
 const enemies=targets.filter(t=>t.team==='enemy'&&t.alive&&!t.pending&&!t.retreat),air=enemies.filter(t=>t.kind==='air');
 const nearest=rows=>rows.sort((a,b)=>a.position.distance(s.position)-b.position.distance(s.position))[0];
 if(id==='civil')return targets.find(t=>t.civilian&&t.alive);
 if(id==='convoy')return by('BRIDGE')?.alive?by('BRIDGE'):null;
 if(id==='airbase')return ['ATTACK-CONVOY','JAMMER','ENEMY-SAM','ENEMY-BASE'].map(by).find(t=>t?.alive);
 if(id==='ballistic')return ['JAMMER','SILO','BALLISTIC'].map(by).find(t=>t?.alive)||nearest(air);
 if(id==='iron-veil'){if(m.ironVeil?.stage==='breach')return ['IV-JAMMER','IV-SAM1','IV-SAM2','IV-BRIDGE'].map(by).find(t=>t?.alive);return nearest(air.filter(t=>t.type==='bomber'))||nearest(air);}
 return nearest(air.filter(t=>t.type==='bomber'))||nearest(air)||nearest(enemies.filter(t=>t.kind==='ground'));
}
for(let step=0;step<limit/STEP&&!s.crashed&&!m.failed&&!m.complete&&!m.recovered;step++){
 let target=chooseTarget(),goal=new Vec3(0,1800,12000);const now=s.elapsed;
 if(s.onGround&&s.landing?.success)controls={throttle:-1,brake:true,pitch:clamp(-attitude(s.orientation).pitch*2,-.2,.2),yaw:clamp(-s.position.x*.03,-1,1)};
 else if(s.onGround&&!s.airborne){s.afterburner=!!s.spec.hasAB;controls={throttle:1,pitch:s.speed>(s.spec.trainingOnly?60:78)&&attitude(s.orientation).pitch<.16?.14:0};}
 else if(id==='landing'||m.objectiveComplete||m.aborted||m.ironVeil?.stage==='resupply'||(!s.spec.transport&&!s.training&&!s.bombingPractice&&target?.kind==='ground'&&!s.ammo.agm&&!s.ammo.bomb)||(!s.spec.transport&&!s.training&&!s.ammo.aam&&!s.ammo.agm&&!s.ammo.bomb&&s.ammo.gun<30)){pilot.nav='landing';controls=approach();}
 else{
  s.afterburner=false;if(s.agl>70){s.gear=false;s.flaps=false;}s.airbrake=false;
  if(id==='canyon'){const along=s.position.z+12000,gate=s.canyonTraining.gates[s.canyonTraining.index],ahead=Math.min(along+500,18000),point=canyonPoint(ahead),next=s.canyonTraining.gates.find(g=>g.along>=ahead)||s.canyonTraining.gates.at(-1),previous=s.canyonTraining.gates[Math.max(0,s.canyonTraining.gates.indexOf(next)-1)],f=clamp((ahead-previous.along)/Math.max(1,next.along-previous.along),0,1),alt=previous.position.y+(next.position.y-previous.position.y)*f;point.y=Math.max(terrainHeight(point.x,point.z)+150,alt);goal=point;const slope=(next.position.y-previous.position.y)/Math.max(1,next.along-previous.along);controls=controlsTo(goal,{speed:145,bankLimit:40,vy:clamp(slope*145+(point.y-s.position.y)*.18,-20,45)});}
  else if(id==='practice-bombing'){
   target=targets.find(t=>t.practiceTarget);const x=target.position.x,z=target.position.z,alt=terrainHeight(x,z)+500;
   if(pilot.bombPass==='line'){goal=new Vec3(x,alt,z-10000);if(s.position.distance(goal)<1000)pilot.bombPass='run';}
   if(pilot.bombPass==='run'){if(now>=(pilot.nextBombAim||0)){pilot.bombAim=predictBombImpact(s);pilot.nextBombAim=now+.15;}goal=new Vec3(x-(pilot.bombAim.x-x)*2,alt,s.position.z+1200);if(s.position.z>z+1800)pilot.bombPass='out';}
   if(pilot.bombPass==='out'){goal=new Vec3(x+6000,alt,z+4000);if(s.position.distance(goal)<1000)pilot.bombPass='back';}
   if(pilot.bombPass==='back'){goal=new Vec3(x+6000,alt,z-10000);if(s.position.distance(goal)<1000)pilot.bombPass='line';}
   controls=controlsTo(goal,{speed:135,bankLimit:30});
  }else if(s.spec.transport){const transport=by('TRANSPORT');goal=new Vec3(transport.routeX,1700,transport.exitZ+1000);controls=controlsTo(goal,{speed:160,bankLimit:20});
  }else{
   target=chooseTarget();if(target){goal=target.position.clone();goal.y=target.kind==='air'?target.position.y:Math.max(1000,terrainHeight(target.position.x,target.position.z)+500);}
   else if(id==='escort-transport'){const t=by('TRANSPORT');goal=t.position.clone().add(new Vec3(0,300,-2000));}
   else if(id==='iron-veil'&&m.ironVeil?.stage==='escort'){const t=by('IV-TRANSPORT');goal=t.position.clone().add(new Vec3(0,200,2000));}
   if(target?.kind==='ground'&&s.ammo.bomb&&(!s.ammo.agm||navigationJammed(s,targets))){
    if(pilot.strikeId!==target.id){pilot.strikeId=target.id;pilot.strikePass='line';}
    const x=target.position.x,z=target.position.z,alt=terrainHeight(x,z)+550;
    if(pilot.strikePass==='line'){goal=new Vec3(x,alt,z-10000);if(s.position.distance(goal)<1000)pilot.strikePass='run';}
    if(pilot.strikePass==='run'){if(now>=(pilot.nextBombAim||0)){pilot.bombAim=predictBombImpact(s);pilot.nextBombAim=now+.15;}goal=new Vec3(x-(pilot.bombAim.x-x)*2,alt,s.position.z+1200);if(s.position.z>z+1800)pilot.strikePass='out';}
    if(pilot.strikePass==='out'){goal=new Vec3(x+6000,alt,z+4000);if(s.position.distance(goal)<1000)pilot.strikePass='back';}
    if(pilot.strikePass==='back'){goal=new Vec3(x+6000,alt,z-10000);if(s.position.distance(goal)<1000)pilot.strikePass='line';}
    controls=controlsTo(goal,{speed:160,bankLimit:30});
   }else controls=controlsTo(goal,{speed:target?.kind==='air'?220:185,altitude:goal.y});
  }
 }
 if(s.spec.transport&&!s.dying&&!s.onGround&&!m.aborted&&!m.objectiveComplete){const incoming=w.projectiles.find(p=>p.owner==='enemy'&&!p.targetEntityId&&['aam','agm'].includes(p.type)&&!p.seekerLost&&p.position.distance(s.position)<4500);if(incoming){pilot.evadeUntil=now+4;if(pilot.evadeHeading===undefined){const h=Math.atan2(incoming.velocity.x,incoming.velocity.z),a=attitude(s.orientation).heading;pilot.evadeHeading=[h-Math.PI/2,h+Math.PI/2].sort((x,y)=>Math.abs(Math.atan2(Math.sin(x-a),Math.cos(x-a)))-Math.abs(Math.atan2(Math.sin(y-a),Math.cos(y-a))))[0];}}if(now<(pilot.evadeUntil||0)){const h=pilot.evadeHeading;controls=controlsTo(s.position.clone().add(new Vec3(Math.sin(h)*6000,0,Math.cos(h)*6000)),{speed:170,bankLimit:25,altitude:1700});}else delete pilot.evadeHeading;}
 stepAircraft(s,controls,STEP);recorder.time=s.elapsed;updateTargets(targets,STEP);
 if(target&&!s.dying&&!s.onGround){const contact=radarContacts(s,targets).find(c=>c.target===target&&c.visible&&c.selectable);if(contact&&aim.id!==target.id){aim.id=target.id;aim.progress=0;aim.locked=false;}}
 aim.update(s,targets,STEP);
 if(now>=nextFire&&!s.onGround&&!s.dying&&!s.training&&target){nextFire=now+.1;
  w.selected=id==='practice-bombing'?'bomb':target.kind==='air'?(s.ammo.aam?'aam':'gun'):s.ammo.agm&&!navigationJammed(s,targets)?'agm':s.ammo.bomb?'bomb':'gun';
  const status=firingStatus(s,targets,aim,w),last=lastLaunch.get(target.id)??-1000,range=s.position.distance(target.position);
  let fire=status.canFire&&(w.selected==='gun'?range<1200&&status.solution?.status!=='range':w.selected==='bomb'?Math.hypot(predictBombImpact(s).x-target.position.x,predictBombImpact(s).z-target.position.z)<(id==='practice-bombing'?40:70)&&Math.abs(attitude(s.orientation).bank)<8*DEG:now-last>15);
  if(w.selected==='bomb'&&id!=='practice-bombing')fire=fire&&pilot.strikePass==='run'&&now-pilot.lastShot>5;
  if(id==='practice-bombing')fire=fire&&pilot.bombPass==='run'&&now-pilot.lastShot>35;
  if(fire){w.fire(s,targets,aim);lastLaunch.set(target.id,now);pilot.lastShot=now;}
 }
 if(now>=cmAt){const threat=w.projectiles.find(p=>p.owner==='enemy'&&!p.targetEntityId&&['aam','agm'].includes(p.type)&&p.position.distance(s.position)<4000);if(threat){deployCountermeasures(s,decoyKind(threat.profile));cmAt=now+1.5;}}
 w.update(s,targets,STEP);for(const e of w.drainEvents()){recorder.event('combat',e);if(['missile-launch','bomb-release','practice-bomb-impact','ai-retreat'].includes(e.type))shots.push({t:now,...e});}
 const service=m.serviceCount||0;m.update(s,targets,w,aim);if((m.serviceCount||0)>service){pilot.nav='mission';pilot.landingGate=false;aim.id=null;aim.locked=false;}
 if(m.phaseId!==lastPhase){phases.push({t:+s.elapsed.toFixed(2),phase:m.phaseId,damage:+s.damage.toFixed(2)});lastPhase=m.phaseId;}
 if(s.warning)warnings.set(s.warning,(warnings.get(s.warning)||0)+STEP);
 if(s.elapsed>=nextSample){recorder.capture(s,m,targets,w,aim,controls);nextSample=s.elapsed+1;}
}
recorder.capture(s,m,targets,w,aim,controls,true);const result=m.complete?'success':m.failed?'failure':m.recovered?'aborted':s.crashed?'crash':'time-limit';recorder.finish({result,reason:m.failureReason||s.landing?.reasons,score:m.score});
const summary={mission:id,aircraft:s.spec.id,seed,result,duration:s.elapsed,reason:m.failureReason||s.landing?.reasons,phase:m.phaseId,damage:s.damage,fuel:s.fuel,position:s.position,ammo:s.ammo,services:m.serviceCount||0,bombing:s.bombingPractice,canyon:s.canyonTraining?.index,objectives:m.objectives,phases,shots:shots.map(e=>({t:e.t,type:e.type,target:e.targetId,hit:e.hit,distanceM:e.distanceM,hits:e.hits})),warnings:[...warnings].map(([text,seconds])=>({text,seconds})),units:targets.map(t=>({id:t.id,alive:t.alive,exited:t.exited,damage:t.damage,health:t.health}))};
await mkdir(out,{recursive:true});await writeFile(path.join(out,id+'-'+seed+'.json'),JSON.stringify(recorder.export()));await writeFile(path.join(out,id+'-'+seed+'-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
