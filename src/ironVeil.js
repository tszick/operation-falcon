import {radarContact} from './sensors.js';
import {Vec3} from './math.js';
import {terrainWorld,terrainHeight,pathPoint,pathHeading,convoyPose} from './terrain.js';

// Temporary ammunition trips must not award a permanent repulsion.
const counterRaidRepelled=targets=>{const raiders=targets.filter(t=>t.operationWave==='counterstrike');return raiders.length===2&&raiders.every(t=>!t.pending&&(!t.alive||!!t.retreat&&t.retreat.reason!=='resupply'));};

export const ironVeilStages={breach:['FOLYOSÓNYITÁS','Két SAM és az erősítés útja: híd VAGY konvoj.'],resupply:['KÖZTES HAZATÉRÉS / FELTÖLTÉS','Szállj le és állj meg. Nomad One csak a feltöltésed után indul.'],escort:['NOMAD ONE KÍSÉRÉSE','Viper One és Two segít. Óvd a szállítót, különösen az üteg környékén.'],counterstrike:['ELLENCSAPÁS VISSZAVERÉSE','Két bombázó oldalirányból a bázisra tart. Elfogás; szükség esetén köztes feltöltés.'],return:['HAZATÉRÉS','Az elsődleges feladatok kész; a végső sikerhez szállj le és állj meg.']};
export function spawnIronVeil(add,anchor,player,rng){
 const road=terrainWorld.road,normal=new Vec3(-Math.sin(road.angle),0,Math.cos(road.angle));
 const flakSite=pathPoint(road,4500).add(normal.clone().scale(4000)),commandSite=pathPoint(road,6000).add(normal.clone().scale(6500));
 for(const [site,height] of [[flakSite,850],[commandSite,1050]])terrainWorld.peaks.push({x:site.x,z:site.z,height,radius:1400,platform:120});
 const bridge=add('IV-BRIDGE','bridge','enemy',anchor);bridge.position.y=terrainWorld.river.level+14;bridge.heading=pathHeading(road,0);bridge.radius=terrainWorld.river.width*.55;
 const convoy=add('IV-CONVOY','convoy','enemy',anchor,{routeMode:'bridge',routeDistance:-11000,routeDirection:1,bridgeId:bridge.id});Object.assign(convoy,convoyPose(convoy));
 add('IV-SAM1','sam-system','enemy',anchor.clone().add(new Vec3(-2600,0,-2500)));
 add('IV-SAM2','sam-system','enemy',anchor.clone().add(new Vec3(2800,0,4000)));
 add('IV-JAMMER','jammer','enemy',anchor.clone().add(new Vec3(500,0,500)),{jamRadius:7000,radius:35});
 add('IV-FLAK','sam','enemy',flakSite,{aiTargetId:'IV-TRANSPORT'});
 add('IV-COMMAND','bunker','enemy',commandSite);
 add('IV-HOME-SAM','sam-system','ally',new Vec3(700,0,-350),{defendId:'BASE'});add('IV-HOME-BUNKER','bunker','ally',new Vec3(-700,0,400));
 // Nomad skirts the flak envelope instead of spending a minute over the battery.
 const routeX=flakSite.x+(Math.sign(flakSite.x-anchor.x)||1)*6200;
 const friendly=player.faction==='west'?'f15':player.faction==='china'?'j10':'su27';
 for(let i=0;i<2;i++){
  const t=add(`IV-VIPER${i+1}`,'fighter','ally',new Vec3(routeX+(i?1200:-1200),2400,-11000-i*700),{pending:true,alive:false,aiRole:'interceptor',defendId:'IV-TRANSPORT',radioCallSign:{flight:'Viper',number:i+1},operationWave:'escort'});
  t.aircraftId=friendly;t.name={f15:'F-15 Eagle',j10:'Chengdu J-10C',su27:'Su-27 Flanker'}[friendly];t.heading=0;t.cruiseSpeed=165;t.velocity=new Vec3(0,0,165);
 }
 const transport=add('IV-TRANSPORT','transport','ally',new Vec3(routeX,2200,-12000),{pending:true,alive:false,aiRole:'escortee',exitZ:46000,routeAltitude:2200,displayCallSign:'Nomad One',operationWave:'escort'});transport.heading=0;transport.velocity=new Vec3(0,0,125);
 const air=(id,type,position,extra={})=>{
  const t=add(id,type,'enemy',position,extra),goal=extra.aiTargetId==='IV-TRANSPORT'?new Vec3(routeX,2200,16000):new Vec3();
  t.heading=Math.atan2(goal.x-position.x,goal.z-position.z);t.velocity=new Vec3(Math.sin(t.heading)*t.cruiseSpeed,0,Math.cos(t.heading)*t.cruiseSpeed);return t;
 };
 for(let i=0;i<2;i++)air(`IV-GUARD${i+1}`,'fighter',new Vec3(anchor.x+(i?6500:-6500),2600,36500+i*1600),{aiRole:'interceptor'});
 for(let i=0;i<2;i++)air(`IV-INTERCEPT${i+1}`,'fighter',new Vec3(anchor.x+(i?7500:-7500),2800,41000+i*2000),{pending:true,alive:false,aiRole:'interceptor',aiTargetId:transport.id,operationWave:'intercept'});
 const flank=rng()<.5?-1:1;
 for(let i=0;i<2;i++)air(`IV-RAIDER${i+1}`,'bomber',new Vec3(flank*(42500+i*4000),2100+i*150,-15000+i*2500),{pending:true,alive:false,aiTargetId:'BASE',operationWave:'counterstrike'});
 for(let i=0;i<2;i++)air(`IV-COVER${i+1}`,'fighter',new Vec3(flank*(45000+i*2500),2800,-17000+i*3000),{pending:true,alive:false,aiRole:'interceptor',operationWave:'counter-cover'});
}
const byId=(targets,id)=>targets.find(t=>t.id===id),destroyed=t=>!!t&&!t.alive&&!t.pending&&!t.cancelled;
const emit=(w,data)=>w.emit?.(data);
function assignVipers(targets,ids){let i=0;for(const t of targets)if(t.id.startsWith('IV-VIPER')&&t.alive&&!t.retreat&&!t.flight?.dying){t.aiTargetId=ids[i++%ids.length];}}
function transition(s,m,w,stage){m.ironVeil.stage=stage;m.ironVeil.stageAt=s.elapsed;const [title,message]=ironVeilStages[stage];emit(w,{type:'operation-stage',stage,title,message,time:s.elapsed});}
function activate(targets,w,wave){const ids=[];for(const t of targets)if(t.operationWave===wave&&t.pending&&!t.cancelled){t.pending=false;t.alive=true;ids.push(t.id);}return ids;}
export function updateIronVeil(s,m,targets,w){
 const p=m.ironVeil??={stage:'breach',stageAt:s.elapsed,roadSecured:false,corridor:false,transportLaunched:false,interceptorsLaunched:false,counterStarted:false,rearmed:false,escortSuppressed:false,escortLost:false,failure:''};
 const by=id=>byId(targets,id),convoy=by('IV-CONVOY'),transport=by('IV-TRANSPORT');
 if(!p.failure){
  if(by('BASE')?.alive===false)p.failure='A saját repülőtér megsemmisült. A művelet nem folytatható.';
  else if(transport&&!transport.pending&&!transport.alive&&!transport.exited)p.failure='Nomad One megsemmisült. Az értékes adatok elvesztek.';
  else if(convoy?.crossedBridge&&!p.roadSecured)p.failure='Az erősítés átjutott a hídon. A műveleti folyosót elvesztettük.';
 }
 if(p.failure)return;
 if(!convoy?.crossedBridge&&(destroyed(by('IV-BRIDGE'))||destroyed(convoy)))p.roadSecured=true;
 p.corridor=destroyed(by('IV-SAM1'))&&destroyed(by('IV-SAM2'));
 if(p.stage==='breach'&&p.roadSecured&&p.corridor){p.rearmAfter=(m.serviceCount||0)+1;transition(s,m,w,'resupply');}
 if(p.stage==='resupply'&&(m.serviceCount||0)>=p.rearmAfter){
  p.rearmed=true;p.transportLaunched=true;p.transportLaunchedAt=s.elapsed;activate(targets,w,'escort');transition(s,m,w,'escort');
 }
 if(p.transportLaunched&&!p.interceptorsLaunched&&transport.position.z>=10000){p.interceptorsLaunched=true;const ids=activate(targets,w,'intercept');assignVipers(targets,ids);emit(w,{type:'operation-wave',stage:'escort',units:ids,message:'KÉT ELFOGÓ KÖZELEDIK NOMAD ONE FELÉ',time:s.elapsed});}
 if(p.transportLaunched&&transport.exited&&!p.counterStarted){
  p.counterStarted=true;p.counterStartedAt=s.elapsed;p.escortSuppressed=destroyed(by('IV-COMMAND'));
  const ids=activate(targets,w,'counterstrike');assignVipers(targets,ids);
  if(p.escortSuppressed){for(const t of targets)if(t.operationWave==='counter-cover'){t.pending=false;t.alive=false;t.cancelled=true;}}
  else ids.push(...activate(targets,w,'counter-cover'));
  transition(s,m,w,'counterstrike');emit(w,{type:'operation-wave',stage:'counterstrike',units:ids,message:p.escortSuppressed?'KÉT BOMBÁZÓ A BÁZIS FELÉ · A VADÁSZKÍSÉRETET MEGELŐZTED':'KÉT BOMBÁZÓ ÉS KÉT VADÁSZ A BÁZIS FELÉ · VIPER: BOMBÁZÓELFOGÁS',time:s.elapsed});
 }
 if(p.transportLaunched&&targets.some(t=>t.id.startsWith('IV-VIPER')&&!t.alive&&!t.pending&&!t.retired))p.escortLost=true;
 const raidRepelled=p.counterStarted&&counterRaidRepelled(targets);
 const incoming=w.projectiles?.some(shot=>shot.owner==='enemy'&&shot.targetEntityId==='BASE');
 if(p.stage==='counterstrike'&&raidRepelled&&!incoming)transition(s,m,w,'return');
}
export function ironVeilObjectives(m,s,targets,w){
 const p=m.ironVeil||{},by=id=>byId(targets,id),transport=by('IV-TRANSPORT'),convoy=by('IV-CONVOY'),base=by('BASE'),left=convoy?.alive&&!p.roadSecured?Math.max(0,Math.ceil(((by('IV-BRIDGE')?.radius||100)+120-convoy.routeDistance)/14)):0;
 const clock=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`,row=(id,text,done,optional=false,status=null)=>({id,text,done:!!done,optional,...(status?{status}:{})});
 const raidDone=p.counterStarted&&counterRaidRepelled(targets),incoming=w.projectiles?.some(shot=>shot.owner==='enemy'&&shot.targetEntityId==='BASE');
 const complete=!!(p.corridor&&p.roadSecured&&p.rearmed&&transport?.exited&&raidDone&&!incoming&&base?.alive&&!p.failure);
 const viper=targets.filter(t=>t.id.startsWith('IV-VIPER')),survivors=viper.filter(t=>t.alive&&!t.falling&&!t.flight?.dying&&!t.flight?.crashed||t.retired).length;
 return {complete,failure:p.failure||'',rows:[
  row('iv-corridor',`Rakétafolyosó: ${['IV-SAM1','IV-SAM2'].filter(id=>destroyed(by(id))).length}/2 SAM`,p.corridor),
  row('iv-road',p.roadSecured?'Erősítés útja lezárva':`Híd VAGY konvoj · átkelésig ${clock}`,p.roadSecured),
  row('iv-rearm','Köztes leszállás és feltöltés',p.rearmed),
  row('iv-transport',transport?.pending?'Nomad One: indulásra vár':transport?.exited?'Nomad One: biztonságban kijutott':`Nomad One: ${Math.round(100-(transport?.damage||0))}% · kijárat ${Math.max(0,((transport?.exitZ||46000)-(transport?.position.z||0))/1000).toFixed(1)} km`,transport?.exited),
  row('iv-counter',incoming?'Beérkező fegyverek a bázis felé':p.counterStarted?'Ellencsapás visszaverése':'Ellencsapás: még nem indult',raidDone&&!incoming),
  row('base',`Saját reptér: ${Math.round((base?.health||0)/(base?.maxHealth||1)*100)}%`,base?.alive),
  row('iv-jammer','Jelzavaró kiiktatása',destroyed(by('IV-JAMMER')),true),
  row('iv-flak','Kísérési útvonal ütegének kiiktatása',destroyed(by('IV-FLAK')),true),
  row('iv-command',p.escortSuppressed?'Vadászkíséret indulása megelőzve':'Parancsnoki bunker megsemmisítése',destroyed(by('IV-COMMAND')),true),
  row('iv-convoy','Konvoj megsemmisítése',destroyed(convoy),true),
  row('iv-wingmen',`Viper gépek túlélése: ${survivors}/2`,p.transportLaunched&&!p.escortLost&&survivors===2,true,p.escortLost?'failed':null)
 ]};
}
export function ironVeilVisibleRows(m,rows){
 if(m.aborted)return rows.filter(r=>r.id==='return'||r.status==='failed').slice(0,3);
 const stage=m.ironVeil?.stage||'breach',primary={breach:['iv-corridor','iv-road'],resupply:['iv-rearm'],escort:['iv-transport'],counterstrike:['iv-counter','base'],return:['base','landing']}[stage];
 const optional={breach:['iv-jammer'],resupply:['iv-flak','iv-command'],escort:['iv-flak','iv-wingmen'],counterstrike:['iv-command'],return:['iv-wingmen']}[stage];
 return rows.filter(row=>(row.optional?optional:primary).includes(row.id));
}
export function ironVeilGuide(m,s,targets=[]){
 const transport=targets.find(t=>t.id==='IV-TRANSPORT'),contact=transport?.alive&&radarContact(s,transport),bearing=contact?(Math.round(Math.atan2(transport.position.x-s.position.x,transport.position.z-s.position.z)*180/Math.PI)+360)%360:0,joining=s.elapsed-(m.ironVeil?.transportLaunchedAt||0)<100;
 const escortLocation=contact?`Nomad ${String(bearing).padStart(3,'0')}° · ${(s.position.distance(transport.position)/1000).toFixed(1)} km`:joining?'Nomad délről érkezik · zárkózz fel':'O térkép · a radarhoz fordulj rá';
 const stage=m.ironVeil?.stage||'breach',steps={
  breach:[['T / TAB','Két SAM, majd híd vagy konvoj'],['3 / 4','Földi rakéta vagy bombavetés'],['—','Zavaró és bunker: taktikai mellékcél']],
  resupply:[['N','BASE: leszállási segéd'],['F / CTRL','Szállj le és állj meg: feltöltés'],['—','Nomad One addig biztonságban vár']],
  escort:[['A / D',escortLocation],[m.ironVeil?.interceptorsLaunched?'2 / T':'R / F',m.ironVeil?.interceptorsLaunched?'Két elfogó · Viper mellett te is fedezz':'Igazítsd a tempót · ne hagyd le Nomadot'],['3 / 4','Üteg: hasznos mellékcél a kíséréshez']],
  counterstrike:[['A / D','Fordulj a BASE és a bombázók felé'],['2 / T','A két bombázó az elsődleges veszély'],['N','Szükség esetén újabb feltöltés']],
  return:[['N','Szállj le és állj meg a sikerhez']]
 }[stage];
 return steps.map(([key,text],i)=>({key,text,done:false,active:i===0}));
}
