import {isHostile} from './unitTypes.js';
const row=(id,text,done,optional=false)=>({id,text,done:!!done,optional});
export function battleObjectives(m,s,targets,w){
 const by=id=>targets.find(t=>t.id===id),base=by('BASE'),enemies=targets.filter(t=>isHostile(t,s)),dead=t=>!!t&&!t.alive;
 let rows=[],complete=false,failure='';
 if(m.spec.objective==='bridge-block'){
  const bridge=by('BRIDGE'),convoy=by('CONVOY');
  if(convoy?.crossedBridge&&!m.bridgeSecured)failure='A konvoj átjutott a hídon. Az átkelőt előbb kellett volna lerombolni.';
  if(dead(bridge)&&!convoy?.crossedBridge)m.bridgeSecured=true;
  complete=!!m.bridgeSecured;rows=[row('bridge','Híd lezárva az átkelés előtt',complete),row('convoy','Konvoj megsemmisítve',dead(convoy),true)];
 }else if(m.spec.objective==='defend-base'){
  if(dead(base))failure='A saját repülőtér megsemmisült.';
  const allDead=enemies.length>0&&enemies.every(t=>!t.alive),pending=w.projectiles?.some(p=>p.owner==='enemy'&&p.targetEntityId==='BASE');complete=allDead&&!pending;
  rows=[row('base',`Saját reptér: ${Math.round((base?.health||0)/(base?.maxHealth||1)*100)}%`,base?.alive),row('attackers',`Támadók: ${enemies.filter(t=>!t.alive).length} / ${enemies.length}`,allDead),...(pending?[row('incoming','Beérkező fegyverek elhárítása',false)]:[])];
 }else if(m.spec.objective==='escort-transport'){
  const transport=by('TRANSPORT');if(dead(transport)&&!transport.exited)failure='A védendő szállítógép megsemmisült.';
  complete=!!transport?.exited;rows=[row('transport',complete?'Szállítógép kijutott':`Szállító: ${Math.max(0,Math.round(100-(transport?.damage||0)))}% · kijárat ${Math.max(0,(transport?.exitZ-transport?.position.z)/1000).toFixed(1)} km`,complete),row('enemies',`Összes ellenfél: ${enemies.filter(t=>!t.alive).length} / ${enemies.length}`,enemies.every(t=>!t.alive),true)];
 }else if(m.spec.objective==='airbase-strike'){
  if(dead(base))failure='A támadó konvoj megsemmisítette a saját repülőteret.';
  const convoy=by('ATTACK-CONVOY'),enemyBase=by('ENEMY-BASE');complete=dead(convoy)&&dead(enemyBase);rows=[row('convoy','Támadó konvoj megsemmisítve',dead(convoy)),row('enemyBase','Ellenséges reptér megsemmisítve',dead(enemyBase)),row('base',`Saját reptér: ${Math.round((base?.health||0)/(base?.maxHealth||1)*100)}%`,base?.alive)];
 }
 if(rows.length)rows.push(row('landing','Sikeres leszállás és megállás',complete&&s.onGround&&s.landing?.success&&s.speed<5));
 return {rows,complete,failure};
}
