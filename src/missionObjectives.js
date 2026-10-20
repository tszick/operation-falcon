import {recoveryComplete} from './navalOps.js';
import {ironVeilObjectives} from './ironVeil.js';
import {isHostile} from './unitTypes.js';
const row=(id,text,done,optional=false)=>({id,text,done:!!done,optional});
export function battleObjectives(m,s,targets,w){
 const by=id=>targets.find(t=>t.id===id),base=by('BASE'),enemies=targets.filter(t=>isHostile(t,s)),dead=t=>!!t&&!t.alive;
 let rows=[],complete=false,failure='';
 if(m.spec.naval){
  const air=enemies.filter(t=>t.kind==='air'),allDead=air.length===8&&air.every(t=>!t.alive&&!t.pending),ship=by('ENEMY-DESTROYER'),incoming=w.projectiles?.some(p=>p.owner==='enemy'&&p.targetEntityId==='BASE');if(dead(base))failure='Az anyahajó megsemmisült.';complete=allDead&&dead(ship)&&base?.alive&&!incoming;
  const first=air.filter(t=>t.wave===1),refitting=first.filter(t=>t.alive&&(t.service||t.retreat?.reason==='resupply')),withdrawing=first.filter(t=>t.alive&&t.retreat&&t.retreat.reason!=='resupply'),active=first.filter(t=>t.alive&&!t.exited&&!t.service&&!t.retreat&&!t.falling),waiting=air.some(t=>t.pending),count=air.filter(t=>!t.alive&&!t.pending).length;
  const waveText=waiting&&m.navalNextWaveAt!==undefined?`2. hullám: ${Math.max(0,Math.ceil(m.navalNextWaveAt-s.elapsed))} mp`:waiting&&!active.length&&refitting.length?`Hullám 1/2 · ${refitting.length} gép újratölt`:waiting&&!active.length&&withdrawing.length?`Hullám 1/2 · ${withdrawing.length} gép kivonul`:`Hullám ${m.wave||1}/2 · támadók ${count}/8`;
  rows=[row('carrier',`Anyahajó: ${Math.round((base?.health||0)/(base?.maxHealth||1)*100)}%`,base?.alive),row('waves',waveText,allDead),row('destroyer','Ellenséges romboló megsemmisítve',dead(ship)),row('wingman','Falcon Two túlélte',by('ALLY-FIGHTER1')?.alive,true),row('wingman-three','Falcon Three túlélte',by('ALLY-FIGHTER2')?.alive,true),row('wingman-four','Falcon Four túlélte',by('ALLY-FIGHTER3')?.alive,true),...(incoming?[row('incoming','Beérkező fegyverek elhárítása',false)]:[])];
 }else if(m.spec.objective==='iron-veil'){const report=ironVeilObjectives(m,s,targets,w);rows=report.rows;complete=report.complete;failure=report.failure;
 }else if(m.spec.objective==='bridge-block'){
  const bridge=by('BRIDGE'),convoy=by('CONVOY');
  if(convoy?.crossedBridge&&!m.bridgeSecured)failure='A konvoj átjutott a hídon. Az átkelőt előbb kellett volna lerombolni.';
  if(dead(bridge)&&!convoy?.crossedBridge)m.bridgeSecured=true;
  complete=!!m.bridgeSecured;rows=[row('bridge','Híd lezárva az átkelés előtt',complete),row('convoy','Konvoj megsemmisítve',dead(convoy),true)];
 }else if(m.spec.objective==='defend-base'){
  if(dead(base))failure='A saját repülőtér megsemmisült.';
  const allDead=enemies.length>0&&enemies.every(t=>!t.alive),pending=w.projectiles?.some(p=>p.owner==='enemy'&&p.targetEntityId==='BASE');complete=allDead&&!pending;
  rows=[row('base',`Saját reptér: ${Math.round((base?.health||0)/(base?.maxHealth||1)*100)}%`,base?.alive),row('attackers',`Támadók leküzdve: ${enemies.filter(t=>!t.alive).length} / ${enemies.length}`,allDead),...(pending?[row('incoming','Beérkező fegyverek elhárítása',false)]:[])];
 }else if(m.spec.objective==='escort-transport'){
  const transport=by('TRANSPORT');if(dead(transport)&&!transport.exited)failure='A védendő szállítógép megsemmisült.';
  complete=!!transport?.exited;rows=[row('transport',complete?'Szállítógép kijutott':`Szállító: ${Math.max(0,Math.round(100-(transport?.damage||0)))}% · kijárat ${Math.max(0,(transport?.exitZ-transport?.position.z)/1000).toFixed(1)} km`,complete),row('enemies',`Ellenfelek leküzdve: ${enemies.filter(t=>!t.alive).length} / ${enemies.length}`,enemies.every(t=>!t.alive),true)];
 }else if(m.spec.objective==='defend-city'){
  const city=targets.filter(t=>t.city),intact=city.filter(t=>t.alive).length,required=Math.ceil(city.length*.8),allDead=enemies.length>0&&enemies.every(t=>!t.alive&&!t.pending),pending=w.projectiles?.some(p=>p.owner==='enemy'&&targets.some(t=>t.city&&t.id===p.targetEntityId));
  if(intact<required)failure='A város több mint 20%-a megsemmisült.';
  complete=allDead&&!pending&&!failure;rows=[row('city',`Város: ${Math.round(intact/city.length*100)}% · minimum 80%`,intact>=required),row('waves',`Hullám: ${m.wave||1}/2 · támadók ${enemies.filter(t=>!t.alive&&!t.pending).length}/${enemies.length}`,allDead),...(pending?[row('incoming','Beérkező bombák elhárítása',false)]:[])];
 }else if(m.spec.objective==='air-superiority'){
  const air=enemies.filter(t=>t.kind==='air'),expected=m.spec.roster.filter(r=>r.team==='enemy'&&['fighter','bomber'].includes(r.type)).reduce((sum,r)=>sum+r.count,0),allDead=air.length===expected&&air.every(t=>!t.alive),enemyBase=by('ENEMY-BASE'),sam=by('ENEMY-SAM'),pending=w.projectiles?.some(p=>p.owner==='enemy'&&p.targetEntityId==='BASE');
  if(dead(base))failure='A saját repülőtér megsemmisült.';
  complete=allDead&&dead(enemyBase)&&!pending;
  rows=[row('attackers',`Támadók leküzdve: ${air.filter(t=>!t.alive).length}/${expected}`,allDead),row('enemyBase','Ellenséges reptér megsemmisítve',dead(enemyBase)),row('base',`Saját reptér: ${Math.round((base?.health||0)/(base?.maxHealth||1)*100)}%`,base?.alive),row('enemySam','Rakétavédelem megsemmisítve',dead(sam),true),...(pending?[row('incoming','Beérkező fegyverek elhárítása',false)]:[])];
 }else if(m.spec.objective==='ballistic-strike'){
  const silo=by('SILO'),missile=by('BALLISTIC');if(dead(base))failure='A interkontinentális csapás megsemmisítette a saját repteret.';
  complete=(!silo?.launched&&dead(silo)||!!missile&&!missile.alive)&&base?.alive;
  const left=Math.max(0,Math.ceil((silo?.launchAt||300)-s.elapsed)),clock=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;
  rows=[row('ballistic',complete?'Interkontinentális fenyegetés elhárítva':silo?.launched?'Rakéta a levegőben · elfogás szükséges':`Indítósiló · kilövésig ${clock}`,complete),row('base',`Saját reptér: ${Math.round((base?.health||0)/(base?.maxHealth||1)*100)}%`,base?.alive)];
 }else if(m.spec.objective==='airbase-strike'){
  if(dead(base))failure='A támadó konvoj megsemmisítette a saját repülőteret.';
  const convoy=by('ATTACK-CONVOY'),enemyBase=by('ENEMY-BASE');complete=dead(convoy)&&dead(enemyBase);rows=[row('convoy','Támadó konvoj megsemmisítve',dead(convoy)),row('enemyBase','Ellenséges reptér megsemmisítve',dead(enemyBase)),row('base',`Saját reptér: ${Math.round((base?.health||0)/(base?.maxHealth||1)*100)}%`,base?.alive)];
 }
 if(rows.length)rows.push(row('landing','Sikeres leszállás és megállás',complete&&recoveryComplete(s)));
 return {rows,complete,failure};
}
