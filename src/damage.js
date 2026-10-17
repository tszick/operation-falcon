import {Vec3,clamp} from './math.js';

// Integrity is 0..1. A random fault pattern is chosen once per aircraft;
// fixed-step integration never rolls a new failure on every frame.
export function createDamage(seed=1){return {seed:seed>>>0,side:(seed>>>0)%2?'left':'right',actuator:['gear','flaps','airbrake'][(seed>>>1)%3],applied:0,parts:{leftWing:1,rightWing:1,tail:1,fuselage:1,engineLeft:1,engineRight:1,hydraulics:1,weapons:1},rates:{roll:0,pitch:0,yaw:0},smoke:[],smokeClock:0,source:''};}
export function ensureDamage(s){return s.condition||(s.condition=createDamage());}
function distribute(s,amount,part,source){
 const d=ensureDamage(s),left=d.side==='left',weights={leftWing:left?.75:.25,rightWing:left?.25:.75,tail:.55,fuselage:.5,engineLeft:left?.85:.2,engineRight:left?.2:.85,hydraulics:.75,weapons:.9};
 if(s.spec.engineCount===1){weights.engineLeft=.85;weights.engineRight=0;}
 for(const key of Object.keys(d.parts))d.parts[key]=clamp(d.parts[key]-amount/100*(part?(key===part?1.65:.12):weights[key]),0,1);
 d.source=source||d.source;
}
export function syncDamage(s){const d=ensureDamage(s);if(s.damage>d.applied){distribute(s,s.damage-d.applied,null,'Szerkezeti túlterhelés');d.applied=s.damage;}checkFailure(s);return d;}
export function applyDamage(s,amount,{part=null,source='Találat'}={}){
 if(s.crashed||s.dying||!Number.isFinite(amount)||amount<=0)return;
 const d=ensureDamage(s);if(s.damage>d.applied)syncDamage(s);
 const added=Math.min(amount,100-s.damage);s.damage=clamp(s.damage+added,0,100);distribute(s,added,part,source);d.applied=s.damage;checkFailure(s);
}
function checkFailure(s){const d=ensureDamage(s);if(!s.dying&&(s.damage>=100||Math.min(d.parts.leftWing,d.parts.rightWing)<.09||d.parts.tail<.08||d.parts.fuselage<.08)){
 s.dying=true;s.damage=100;d.applied=100;s.deathStarted=s.elapsed||0;
 d.parts[`${d.side}Wing`]=Math.min(.08,d.parts[`${d.side}Wing`]);d.parts.tail=Math.min(.12,d.parts.tail);d.parts.engineLeft=0;d.parts.engineRight=0;
 s.afterburner=false;s.warning='IRÁNYÍTÁS ELVESZETT — VÉGZETES SZERKEZETI KÁR';
}}
export function damageStage(s){if(s.crashed)return {id:'impact',label:'BECSAPÓDÁS'};if(s.dying)return {id:'fatal',label:'IRÁNYÍTÁS ELVESZETT'};const n=s.damage||0;return n>=85?{id:'critical',label:'KRITIKUS SÉRÜLÉS'}:n>=65?{id:'severe',label:'SÚLYOS SÉRÜLÉS'}:n>=40?{id:'moderate',label:'RENDSZERHIBÁK'}:n>=15?{id:'light',label:'ENYHE SZERKEZETI KÁR'}:{id:'intact',label:'RENDSZEREK ÜZEMKÉSZEK'};}
export function damageResponse(s){
 const p=ensureDamage(s).parts,wing=(p.leftWing+p.rightWing)/2,hydraulic=.15+.85*p.hydraulics;
 const engines=s.spec.engineCount===1?p.engineLeft:(p.engineLeft+p.engineRight)/2;
 return {wing,lift:wing,drag:(1-wing)*.14+(1-p.tail)*.035+(1-(p.fuselage??1))*.05,control:s.dying?0:hydraulic,rollControl:s.dying?0:hydraulic*(.2+.8*wing),pitchControl:s.dying?0:hydraulic*p.tail,engine:s.dying?0:engines**1.5,shake:clamp(((s.damage||0)-15)/85,0,1),weapons:!s.dying&&p.weapons>.35};
}
export function actuatorFault(s,name){const d=ensureDamage(s);if(s.dying||s.crashed)return 'IRÁNYÍTÁS ELVESZETT';if(d.parts.hydraulics<.2||(d.parts.hydraulics<.55&&d.actuator===name))return 'HIDRAULIKAHIBA — A MECHANIKA BESZORULT';return '';}
export function toggleActuator(s,name){const error=actuatorFault(s,name);if(error)return error;s[name]=!s[name];return '';}
export function damageWarnings(s){const d=ensureDamage(s),p=d.parts,w=[];
 if(s.dying)return ['IRÁNYÍTÁS ELVESZETT — VÉGZETES SZERKEZETI KÁR'];
 if(p.leftWing<.65||p.rightWing<.65)w.push(`${p.leftWing<p.rightWing?'BAL':'JOBB'} SZÁRNY SÉRÜLT · ELLENKORMÁNYOZZ`);
 if(p.engineLeft<.5||p.engineRight<.5)w.push('HAJTÓMŰ SÉRÜLT · CSÖKKENT TOLÓERŐ');
 if(p.hydraulics<.55)w.push(`HIDRAULIKAHIBA · ${p.hydraulics<.2?'TÖBB RENDSZER':({gear:'FUTÓMŰ',flaps:'FÉKSZÁRNY',airbrake:'LÉGFÉK'})[d.actuator]} BESZORULT`);
 if(p.weapons<=.35)w.push('FEGYVERRENDSZER HIBA · RAKÉTAINDÍTÁS TILTVA');
 if(p.tail<.5)w.push('VEZÉRSÍK SÉRÜLT · GYENGE MAGASSÁGI KORMÁNY');
 return w;
}
export function damageMotion(s,q,m,cl,engineDemand,dt){
 const d=ensureDamage(s),p=d.parts,r=d.rates,v=Math.max(0,s.velocity.length()),span=Math.sqrt(s.spec.wingArea*3.5),length=span*1.45;
 const response=damageResponse(s),flow=clamp(q/6000,0,2),phase=(d.seed%1000)*.01,t=s.elapsed;
 const rollMoment=q*s.spec.wingArea*.5*cl*(p.leftWing-p.rightWing)*span*.22;
 const engineMoment=s.spec.engineCount===1?0:engineDemand*.5*(p.engineLeft-p.engineRight)*span*.065;
 const buffet=response.shake*flow,damagedTail=1-p.tail;
 const pitchAcceleration=-damagedTail*.12*flow + Math.sin(t*17+phase)*buffet*.09;
 const rollAcceleration=clamp(rollMoment/(m*(span*.27)**2),-3,3)+Math.sin(t*23+phase)*buffet*.12;
 const yawAcceleration=clamp(engineMoment/(m*(length*.28)**2),-.7,.7)+Math.sin(t*11+phase)*buffet*.025;
 const damp=.25+flow*1.7;
 r.roll=clamp((r.roll+rollAcceleration*dt)/(1+damp*dt),-2.5,2.5);
 r.pitch=clamp((r.pitch+pitchAcceleration*dt)/(1+(.2+flow*.8)*dt),-1,1);
 r.yaw=clamp((r.yaw+yawAcceleration*dt)/(1+damp*dt),-.8,.8);
 // At zero airspeed a damaged surface does not generate aerodynamic torque.
 if(v<1&&!s.dying){r.roll*=.98;r.pitch*=.98;r.yaw*=.98;}
 return r;
}
export function structuralLoadLimits(s){
 const p=s.condition?.parts,wing=Math.min(p?.leftWing??1,p?.rightWing??1);
 return {positive:s.spec.maxG*(.65+.35*wing),negative:-s.spec.maxG*.4};
}
export function updateDamage(s,dt){
 const d=syncDamage(s),p=d.parts,response=damageResponse(s);
 if(!s.dying){
  const limits=structuralLoadLimits(s);
  const overload=Math.max(0,s.g-limits.positive,limits.negative-s.g);
  const maxIAS=Math.min(440,s.spec.maxMach*340*.85);
  const overspeed=Math.max(0,s.mach-s.spec.maxMach)*7+Math.max(0,s.ias/maxIAS-1)*4;
  const fire=(Math.min(p.engineLeft,p.engineRight)<.25&&s.fuel>0)?(.35+s.throttle*.6):0;
  applyDamage(s,(overload*1.5+overspeed+fire)*dt,{source:fire?'Hajtóműtűz':overload?'Túlterhelés':'Túl nagy sebesség'});
 }
 for(const puff of d.smoke){puff.age+=dt;puff.position.y+=dt*2;}
 d.smoke=d.smoke.filter(p=>p.age<5);d.smokeClock+=dt;
 if((s.damage>35||s.dying)&&!s.crashed&&d.smokeClock>.09){d.smokeClock=0;d.smoke.push({position:s.position.clone(),age:0,hot:Math.min(p.engineLeft,p.engineRight)<.3});if(d.smoke.length>65)d.smoke.shift();}
 return response;
}
export function recordImpact(s,reasons=[]){
 if(s.crashed)return;s.crashed=true;s.dying=false;s.damage=100;s.crashElapsed=0;s.impactPending=true;s.afterburner=false;
 s.landing={success:false,descent:Math.max(0,-s.velocity.y),reasons:reasons.length?reasons:[ensureDamage(s).source||'A sérült repülőgép a földnek csapódott.']};
 s.position.y=Math.max(0,s.position.y);s.velocity=new Vec3();s.speed=0;s.ias=0;s.mach=0;s.enginePower=0;s.onGround=true;s.warning='BECSAPÓDÁS';
}
export function advanceCrashSequence(s,dt){if(!s.crashed)return false;s.crashElapsed=(s.crashElapsed||0)+dt;return s.crashElapsed>=5;}
