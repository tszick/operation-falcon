import {Vec3,Quat} from './math.js';
import {aircraftFlightSpec,aiAircraft} from './aiAircraftSpec.js';
import {teamOf} from './unitTypes.js';
import {weaponProfiles,gunEffectiveRange,gunLead,clearWeaponLine} from './weaponDynamics.js';

// Defensive fire has its own target and cannot redirect the bombing/navigation task.
export function defensiveFireSolution(t,player,targets){
 const spec=aircraftFlightSpec(t.aircraftId||'tu95'),mount=spec.defensiveGun,profile=weaponProfiles[mount?.profile];if(!mount||!profile)return null;
 const orientation=t.flight?.orientation||Quat.euler(t.heading||0,t.pitch||0,t.bank||0),origin=t.position.clone().add(orientation.rotate(new Vec3(...mount.offset))),axis=orientation.rotate(new Vec3(0,0,-1)),cone=Math.cos(mount.aftHalfAngle),range=gunEffectiveRange(t,profile),side=teamOf(t,player);
 const candidates=[];
 for(const target of [...targets,player]){
  if(target===t||target.alive===false||target.pending||target.exited||target.falling||target.crashed||target.dying||target.flight?.dying||target.flight?.crashed||teamOf(target,player)===side||teamOf(target,player)==='neutral')continue;
  if(target===player?(!player.airborne||player.onGround||player.agl<25):target.kind!=='air')continue;
  const vector=target.position.clone().sub(origin),distance=vector.length();if(distance<25||distance>range||axis.dot(vector.scale(1/distance))<cone)continue;
  candidates.push({target,distance});
 }
 candidates.sort((a,b)=>a.distance-b.distance);
 for(const {target,distance} of candidates){
  if(!clearWeaponLine(origin,target.position))continue;
  const lead=gunLead({position:t.position,muzzlePosition:origin,velocity:t.velocity,orientation},target,profile);
  // The predicted interception point must also remain inside the turret sector.
  if(lead.reachable&&axis.dot(lead.direction)>=cone)return {target,origin,direction:lead.direction,profile,distance,effectiveRange:range};
 }
 return null;
}

export function defensiveGunRows(id){
 const spec=aiAircraft.find(s=>s.id===id),mount=spec?.defensiveGun,profile=weaponProfiles[mount?.profile];if(!profile)return [];
 return [['Farokgépágyú',`${id==='tu95'?'GSh-23 · 23 mm':'M61 · 20 mm'} · külön önvédelmi célválasztás`],['Tüzelési szektor',`Hátrafelé, ${Math.round(mount.aftHalfAngle*180/Math.PI)}° félkúp (játékbeli közelítés). Földi célra nem tüzel.`],['Hatásos távolság',`${(profile.effectiveRange/1000).toFixed(1)} km alapérték; ugyanaz a magassági és ballisztikai korrekció, mint más gépágyúknál.`],['Lőszer',`${mount.rounds} db véges játékbeli készlet; rövid sorozatok és szünetek.`],...(id==='b52'?[['Konfiguráció','Klasszikus, farokgépágyús kivitel. A mai B–52 már nem rendelkezik ilyen fegyverrel.']]:[])];
}
