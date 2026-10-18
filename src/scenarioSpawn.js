import {Vec3} from './math.js';
import {configureTerrain,terrainWorld,terrainHeight,pathHeading,convoyPose} from './terrain.js';
import {unitDefinition} from './unitTypes.js';
import {enemyAircraft} from './enemies.js';
export function createBattleTargets(m,player,{rng=Math.random}={}){
 const bearing=rng()*Math.PI*2,radius=22000+rng()*6000,anchor=new Vec3(Math.sin(bearing)*radius,0,Math.cos(bearing)*radius),enemies=player.faction==='west'?'east':'west';
 configureTerrain({id:m.objective==='bridge-block'?'bridge':m.id},anchor,rng);
 const units=[];
 function add(id,type,team,position,extra={}){
  const def=unitDefinition(type),opponent=enemyAircraft({id:type},team==='ally'?{...player,faction:enemies}:player),air=def.kind==='air';position=position.clone();if(!air)position.y=terrainHeight(position.x,position.z)+3;
  const t={id,type,team,name:def.name,role:def.role,kind:def.kind,threats:def.weapons.filter(w=>w!=='jammer'),faction:team==='neutral'?'neutral':team==='ally'?player.faction:enemies,alive:true,position,previousPosition:position.clone(),velocity:new Vec3(),heading:0,radius:air?28:60,health:def.health||100,maxHealth:def.health||100,combatSeed:Math.floor(rng()*0xffffffff),...extra};
  if(air){t.aircraftId=type==='civil'?'airliner':opponent.id;t.cruiseSpeed=def.speed||145;t.heading=Math.atan2(-position.x,-position.z);t.velocity=new Vec3(Math.sin(t.heading)*t.cruiseSpeed,0,Math.cos(t.heading)*t.cruiseSpeed);if(type==='fighter'||type==='bomber'||type==='transport')t.name=opponent.name;}
  units.push(t);return t;
 }
 if(['landing','canyon'].includes(m.objective))return [];
 const home=add('BASE','airbase','ally',new Vec3(),{home:true,health:320,maxHealth:320});
 if(m.objective==='escort'){
  const t=add('CIVIL','civil','neutral',new Vec3(anchor.x,2400,anchor.z),{civilian:true,airspaceRadius:radius+4000});return [t,home];
 }
 if(m.objective==='bridge-block'){
  const bridge=add('BRIDGE','bridge','enemy',anchor);bridge.position.y=terrainWorld.river.level+14;bridge.heading=pathHeading(terrainWorld.road,0);bridge.radius=terrainWorld.river.width*.55;
  const convoy=add('CONVOY','convoy','enemy',anchor,{routeMode:'bridge',routeDistance:-6000,routeDirection:1,bridgeId:bridge.id});Object.assign(convoy,convoyPose(convoy));return [bridge,convoy,home];
 }
 if(m.objective==='defend-base'){
  const a=anchor.clone().normalize(),side=new Vec3(a.z,0,-a.x);
  add('BOMBER','bomber','enemy',a.clone().scale(29000).add(new Vec3(0,1800,0)),{aiTargetId:home.id});
  for(let i=0;i<2;i++)add(`FIGHTER${i+1}`,'fighter','enemy',a.clone().scale(27500).add(side.clone().scale(i?2200:-2200)).add(new Vec3(0,2300+i*200,0)),{aiRole:'interceptor'});
  add('ALLY-BUNKER','bunker','ally',new Vec3(-650,0,250));
  add('ALLY-SAM','sam-system','ally',new Vec3(650,0,-250));
  add('ALLY-SAM2','sam-system','ally',new Vec3(-650,0,-250));
  const wingman=add('ALLY-FIGHTER','fighter','ally',a.clone().scale(6500).add(side.clone().scale(900)).add(new Vec3(0,2400,0)),{aiRole:'interceptor'});
  const friendly=player.faction==='west'?['f15','F-15 Eagle']:player.faction==='china'?['j10','Chengdu J-10C']:['su27','Su-27 Flanker'];
  wingman.aircraftId=friendly[0];wingman.name=friendly[1];wingman.cruiseSpeed=210;wingman.heading=Math.atan2(a.x,a.z);wingman.velocity=new Vec3(a.x*210,0,a.z*210);
  return units;
 }
 if(m.objective==='escort-transport'){
  for(const [x,z]of [[-2300,6000]])terrainWorld.peaks.push({x,z,height:850+rng()*350,radius:1500,platform:100});
  const transport=add('TRANSPORT','transport','ally',new Vec3(-700,1700,-22000),{aiRole:'escortee',exitZ:24000,heading:0});transport.heading=0;transport.velocity=new Vec3(0,0,transport.cruiseSpeed);
  add('FIGHTER1','fighter','enemy',new Vec3(-6500,2200,16500),{aiTargetId:transport.id});
  for(const [i,x,z]of [[1,-2300,6000]])add(`FLAK${i}`,'sam','enemy',new Vec3(x,0,z),{aiTargetId:transport.id});return units;
 }
 if(m.objective==='defend-city'){
  const city=new Vec3(0,0,16000),direction=new Vec3(Math.sin(bearing)*.45,0,1).normalize(),side=new Vec3(direction.z,0,-direction.x);
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){const height=14+(3-Math.max(Math.abs(x),Math.abs(z)))**2*12+rng()*12;add(`CITY-${x+2}-${z+2}`,'city-building','ally',city.clone().add(new Vec3(x*120,0,z*120)),{buildingHeight:height,buildingWidth:22+rng()*12,buildingDepth:22+rng()*12,city:true});}
  const friendly=player.faction==='west'?['f15','F-15 Eagle']:player.faction==='china'?['j10','Chengdu J-10C']:['su27','Su-27 Flanker'];
  for(let i=0;i<2;i++){const t=add(`ALLY-FIGHTER${i+1}`,'fighter','ally',new Vec3(i?8:-8,2,-300+i*200),{aiRole:'takeoff',takeoffClock:-i*6,heading:0,cruiseSpeed:220});t.aircraftId=friendly[0];t.name=friendly[1];t.velocity=new Vec3(0,0,25);}
  for(let wave=1;wave<=2;wave++)for(let i=0;i<(wave===1?4:3);i++){const fighter=i<(wave===1?2:1),t=add(`W${wave}-${fighter?'F':'B'}${i}` ,fighter?'fighter':'bomber','enemy',city.clone().add(direction.clone().scale(27000+(wave-1)*5000)).add(side.clone().scale((i-1.5)*1800)).add(new Vec3(0,fighter?2500:1900,0)),{wave,pending:wave===2,alive:wave===1,aiRole:fighter?'interceptor':undefined,preferCity:!fighter});const d=city.clone().sub(t.position);t.heading=Math.atan2(d.x,d.z);t.velocity=new Vec3(Math.sin(t.heading)*t.cruiseSpeed,0,Math.cos(t.heading)*t.cruiseSpeed);}
  return units;
 }
 if(m.objective==='ballistic-strike'){
  add('SILO','ballistic-silo','enemy',anchor,{launchAt:m.launchDelay||300});
  add('JAMMER','jammer','enemy',anchor.clone().add(new Vec3(1600,0,-500)),{jamRadius:7000,radius:35});
  add('SILO-GUARD','fighter','enemy',anchor.clone().add(new Vec3(-3000,2500,-6000)),{aiRole:'interceptor'});return units;
 }
 if(m.objective==='airbase-strike'){
  const base=add('ENEMY-BASE','airbase','enemy',anchor),sam=add('ENEMY-SAM','sam-system','enemy',anchor.clone().add(new Vec3(280,0,220)));
  add('JAMMER','jammer','enemy',anchor.clone().add(new Vec3(1800,0,-500)),{jamRadius:7000,radius:35});
  // A separate road leads the attacking convoy toward our base, not in circles.
  const angle=bearing+Math.PI*.55;terrainWorld.road={x:0,z:0,angle:Math.atan2(Math.cos(angle),Math.sin(angle)),bend:0,phase:0,width:14,min:1000,max:50000};
  if(terrainWorld.river){for(let t=1000;t<20000;t+=200){const p=new Vec3(Math.sin(angle)*t,0,Math.cos(angle)*t),r=terrainWorld.river,dx=p.x-r.x,dz=p.z-r.z;if(Math.abs(-dx*Math.sin(r.angle)+dz*Math.cos(r.angle))<r.width+1200){terrainWorld.river=null;break;}}}
  const convoy=add('ATTACK-CONVOY','convoy','enemy',new Vec3(),{routeMode:'base-attack',routeDistance:8000,routeDirection:-1,aiTargetId:home.id});Object.assign(convoy,convoyPose(convoy));return units;
 }
 return units;
}
