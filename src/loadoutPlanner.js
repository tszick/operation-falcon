import {massBreakdown} from './performance.js';
import {clamp} from './math.js';
import {armament,armaments} from './armament.js';
import {weaponProfile} from './weaponDynamics.js';
const types=['aam','agm','bomb'];
// Conservative game clearance: supported named-variant weapons only. A station
// carries one store; no unverified racks, foreign weapons or new integrations.
export function loadoutLimits(spec){
 const preset=armaments[spec.id];
 const compatiblePayload=preset.stations.reduce((sum,station,i)=>sum+Math.max(0,...stationOptions(spec,i).map(type=>weaponProfile({id:spec.id},type).mass)),0);
 const limits={f14:6500,f15:7300,f16:7700,fa18:6200,mirage:6300,rafale:9500,euro:7500,gripen:5300,f4:7200,f15e:10400,tornado:9000,a10:7200,mig25:2000,mig31:9000,su27:6000,mig29:4000,su24:8000,mig27:4000,su25:4400,f22:2000,f35:8100,su35:8000,su57:2000,j10:6000,j20:1500};
 // Rounded gameplay clearances, with conservative internal-bay limits. The
 // available modelled stations can constrain stores before the airframe limit.
 return {stations:preset.stations.length,maxStores:preset.stations.length,maxPayloadKg:spec.maxWeaponPayloadKg??limits[spec.id]??compatiblePayload};
}
export function stationOptions(spec,index){
 const preset=armaments[spec.id],s=preset.stations[index];if(!s)return [];
 return types.filter(t=>preset.weapons[t]&&(t===s.type||!s.internal&&s.type!=='aam'&&(t==='aam'||['agm','bomb'].includes(t))));
}
export function defaultLoadout(spec){const p=armaments[spec.id];return {gun:!!p.weapons.gun,stations:p.stations.map(s=>s.type)};}
export function validateLoadout(spec,choice){
 const preset=armaments[spec.id],limits=loadoutLimits(spec),errors=[];
 if(!choice||!Array.isArray(choice.stations)||choice.stations.length!==limits.stations)return {valid:false,errors:['Hibás függesztési kiosztás.'],payloadKg:0,count:0,limits};
 if(choice.gun&&!preset.weapons.gun)errors.push('Ehhez a változathoz nincs gépágyú.');
 let payloadKg=0,count=0;
 choice.stations.forEach((type,index)=>{if(!type)return;count++;if(!stationOptions(spec,index).includes(type)){errors.push(`Nem kompatibilis fegyver a(z) ${index+1}. helyen.`);return;}payloadKg+=weaponProfile({id:spec.id},type).mass;});
 if(payloadKg>limits.maxPayloadKg)errors.push('A függesztmények meghaladják az engedélyezett fegyverterhelést.');
 return {valid:!errors.length,errors,payloadKg,count,limits};
}
export function configureAircraft(spec,choice){
 const check=validateLoadout(spec,choice);if(!check.valid)throw new Error(check.errors.join(' '));
 const preset=armaments[spec.id],weapons={},stations=[];
 if(choice.gun&&preset.weapons.gun)weapons.gun={...preset.weapons.gun};
 choice.stations.forEach((type,index)=>{if(!type)return;weapons[type]??={...preset.weapons[type],quantity:0};weapons[type].quantity++;stations.push({...preset.stations[index],type});});
 return {...spec,configuredArmament:{variant:preset.variant,weapons,stations},loadoutClearance:check};
}
export function initialWeapon(s,mission){
 if(s.training)return 'none';
 const air=['escort','escort-transport','defend-base'].includes(mission.objective)||mission.kind==='air';
 return (air?['aam','gun','agm','bomb']:['agm','bomb','aam','gun']).find(type=>s.ammo[type]>0)||'none';
}

export function plannedDeparture(spec,choice,{fuelFraction=1,unarmed=false}={}){
 const preset=armaments[spec.id],ammo={gun:!unarmed&&choice.gun?(preset.weapons.gun?.quantity||0):0,aam:0,agm:0,bomb:0};
 if(!unarmed)choice.stations.forEach((type,i)=>{if(type&&stationOptions(spec,i).includes(type))ammo[type]++;});
 const fraction=Number.isFinite(fuelFraction)?clamp(fuelFraction,0,1):1,fuel=spec.fuelCapacity*fraction;
 return {ammo,fuel,fuelFraction:fraction,...massBreakdown({spec,ammo,fuel})};
}
