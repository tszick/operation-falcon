import {aircraftFlightSpec} from './aiAircraftSpec.js';
import {unitDefinition} from './unitTypes.js';
import {Quat} from './math.js';
import {weaponProfiles} from './weaponDynamics.js';
export function combatSource(t,player){
 const spec=t.flight?.spec||(t.kind==='air'?aircraftFlightSpec(t.aircraftId||'mig29'):{...unitDefinition(t.type),radarCone:180,radarRange:unitDefinition(t.type).radarRange||0,faction:t.faction||(t.team==='ally'?player?.spec.faction:player?.spec.faction==='west'?'east':'west')});
 return {id:t.id,team:t.team,position:t.position,velocity:t.velocity,spec,orientation:t.kind==='ground'?null:t.flight?.orientation||Quat.euler(t.heading||0,t.pitch||0,t.bank||0),ground:t.kind==='ground',alive:t.alive,crashed:!!t.flight?.crashed,dying:!!t.flight?.dying,condition:t.flight?.condition};
}
export function groundCombatRows(type){const def=unitDefinition(type),rows=[];if(def.kind!=='ground')return rows;if(def.radarRange)rows.push(['Radar',`${def.radarRange/1000} km · körkörös`]);if(def.weapons.includes('missile'))rows.push(['Rakéta lőtáv',`${weaponProfiles.sam.minRange/1000}–${weaponProfiles.sam.maxRange/1000} km névleges; a tényleges indítást a radar, a mozgás és a terep is korlátozza.`]);if(def.weapons.includes('gun'))rows.push(['Gépágyú hatásos táv',`${weaponProfiles.groundGun.effectiveRange/1000} km alapérték, azonos magassági korrekcióval mindkét oldalon.`]);if(def.weapons.includes('flak'))rows.push(['Légvédelmi gránát lőtáv',`${(def.flakRange||6500)/1000} km`]);return rows;}
