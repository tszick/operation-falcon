import {Vec3} from './math.js';
export const playerStrikeRole=spec=>/bombáz|csapásmérő|közvetlen támogató/i.test(spec.role||'');
export function superiorityRoster(m,player){
 if(m.objective!=='air-superiority')return m.roster;
 const bomber=playerStrikeRole(player);return m.roster.map(r=>r.team==='ally'&&r.type==='fighter'?{...r,count:bomber?9:8}:r.team==='ally'&&r.type==='bomber'?{...r,count:bomber?2:3}:r);
}
export function superiorityPlan(player,rng=Math.random){
 const squad=Math.min(2,Math.floor(rng()*3)),heading=(rng()-.5)*Math.PI*.7,distance=52000+rng()*6000,axis=new Vec3(Math.sin(heading),0,Math.cos(heading)),side=new Vec3(axis.z,0,-axis.x),enemyBase=axis.clone().scale(distance),slot=playerStrikeRole(player)?0:1;
 const position=(team,group,member)=>{const friendly=team==='ally',center=(friendly?axis.clone().scale(7500):enemyBase.clone().sub(axis.clone().scale(7500))).add(side.clone().scale((group-1)*3200)),lateral=[0,-450,450,900][member],trail=member===0?-550:0;return center.add(side.clone().scale(lateral)).add(axis.clone().scale(trail*(friendly?1:-1))).add(new Vec3(0,2400+group*180+(member===0?0:100),0));};
 const playerStart={position:position('ally',squad,slot),heading,speed:165,squad: squad+1,slot,role:slot===0?'bomber':'fighter',radioCallSign:{flight:'Falcon',number:1}};
 const ownNames=Array.from({length:3},(_,i)=>i===squad?'Falcon':null);let k=0;for(let i=0;i<3;i++)if(!ownNames[i])ownNames[i]=['Ironfist','Viper'][k++];
 const units=[];
 for(const team of ['ally','enemy'])for(let group=0;group<(team==='enemy'?4:3);group++){let number=group===squad&&team==='ally'?2:1;for(let member=0;member<4;member++){
  if(team==='ally'&&group===squad&&member===slot)continue;
  units.push({id:`${team.toUpperCase()}-S${group+1}-${member+1}`,type:member===0?'bomber':'fighter',team,position:position(team,group,member),heading:team==='ally'?heading:heading+Math.PI,speed:165,squad:group+1,slot:member,radioCallSign:{flight:team==='ally'?ownNames[group]:['Raven','Wolf','Cobra','Spectre'][group],number:number++}});
 }}
 return {playerStart,enemyBase,units};
}
export const formatCallSign=call=>call.flight+' '+['','One','Two','Three','Four'][call.number];
