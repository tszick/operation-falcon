import {navigationJammed} from './electronicWarfare.js';
import {attitude,DEG} from './math.js';
import {terrainHeight} from './terrain.js';
import {radarContacts,targetingStatus} from './targeting.js';
import {weaponNames} from './weapons.js';
import {fuelStatus} from './instruments.js';
import {phaseGuide} from './phaseGuide.js';
import {updateStores} from './storesDisplay.js';
import {weaponLabel} from './armament.js';
import {damageStage,damageWarnings} from './damage.js';
import {renderTacticalMap} from './tacticalMap.js';
import {landingAttitudeMarkup} from './landingAttitude.js';
import {flapStatus} from './flaps.js';
const $=id=>document.getElementById(id);
export function updateHUD(s,targets,weapons,aim,mission,muted){
 const jammed=navigationJammed(s,targets);document.body.classList.toggle('navigation-jammed',jammed);
 updateStores(s,weapons);
 const flap=flapStatus(s),cm=s.countermeasures;
 $('config-gear').textContent=`FUTÓ ${s.gear?'KINN':'BENN'}`;
 $('config-flaps').textContent=`X FÉKSZÁRNY ${flap.label}`;
 $('config-flaps').dataset.moving=String(flap.moving);
 $('config-flaps').setAttribute('aria-pressed',String(s.flaps));
 $('config-countermeasures').textContent=`C ELTERELŐ · IR ${cm?.flare||0} / R ${cm?.chaff||0}`;
 const damaged=s.damage>=15,damagePanel=$('damage-status'),stage=damageStage(s);damagePanel.hidden=!damaged||s.dying||s.crashed;
 if(damaged){damagePanel.dataset.stage=stage.id;$('damage-title').textContent=stage.label;$('damage-integrity').textContent=`SZERKEZET ${Math.max(0,Math.round(100-s.damage))}%`;$('damage-bar').style.width=`${Math.max(0,100-s.damage)}%`;const faults=damageWarnings(s);$('damage-faults').textContent=faults.slice(0,2).join(' · ')||'REZGÉS · GYENGÜLŐ KORMÁNYOK';damagePanel.title=faults.join('\n');}
 const lock=targetingStatus(s,targets,aim,weapons);
 $('targeting-panel').dataset.state=lock.state;
 $('lock-label').textContent=lock.label;
 $('lock-hint').textContent=lock.hint;
 weapons.solution=lock.solution||null;
 $('weapon-solution').textContent=lock.solution?.detail||'';
 $('weapon-solution').hidden=!lock.solution;
 $('targeting-panel').dataset.solution=lock.solution?.status||'';
 $('lock-fill').style.width=`${lock.progress}%`;
 $('lock-progress').setAttribute('aria-valuenow',String(lock.progress));
 $('flight-name').textContent=s.spec.name.toUpperCase();$('mission-phase').textContent=mission.phase;
 $('phase-hint').textContent=mission.phaseHint;
 $('guide-title').textContent=mission.phase;const objectivePanel=$('mission-objectives');if(objectivePanel)objectivePanel.innerHTML=mission.objectives?.map(o=>`<p class="${o.done?'done':''}">${o.done?'✓':'○'} ${o.optional?'OPC. · ':''}${o.text}</p>`).join('')||'';
 const guideSteps=phaseGuide(s,mission,aim,weapons,targets);
 const guideHTML=guideSteps.map(item=>`<li class="${item.done?'done':item.active?'current':''}"><kbd>${item.key}</kbd><span>${item.text}</span>${item.done?'<i>✓</i>':''}</li>`).join('');
 if($('guide-steps').innerHTML!==guideHTML)$('guide-steps').innerHTML=guideHTML;
 const fuelInfo=fuelStatus(s);
 $('fuel-status').dataset.level=fuelInfo.level;
 $('fuel-status').title=`Fogyasztás: ${Math.round(fuelInfo.flowKgMin)} kg/perc${fuelInfo.minutesRemaining!==null?` · ezen a gázálláson kb. ${fuelInfo.minutesRemaining.toFixed(1)} perc marad`:''}`;
 $('fuel-label').textContent=({normal:'FUEL TOT',low:'BINGO',critical:'FUEL LOW',empty:'FUEL OUT'})[fuelInfo.level];
 $('fuel-value').textContent=`${(fuelInfo.kg/1000).toFixed(2)}`;
 $('fuel-fill').setAttribute('stroke-dashoffset',String(100-fuelInfo.percent));
 $('fuel-meter').setAttribute('aria-valuenow',String(fuelInfo.percent));
 $('fuel-meter').setAttribute('aria-valuetext',`${fuelInfo.percent} százalék, ${fuelInfo.kg} kilogramm. ${fuelInfo.label}`);$('warning').textContent=s.dying||s.crashed?s.warning:s.threatWarning||s.warning;
 $('flight-status').textContent=`${s.assist?'G-LIMITER BE':'G-LIMITER KI'} · ${s.onGround?'FÖLDÖN':'REPÜLÉS'} · ${Math.floor(s.elapsed/60).toString().padStart(2,'0')}:${Math.floor(s.elapsed%60).toString().padStart(2,'0')} · ${muted?'NÉMÍTVA':'HANG BE'}`;
 const fuel=fuelInfo.percent,rows=[['ÜZEMANYAG',`${fuel}% / ${fuelInfo.kg} KG`],['SZERKEZET',`${Math.round(100-s.damage)}%`],['FUTÓMŰ',s.gear?'KINN':'BENN'],['FÉKSZÁRNY',flap.label],['LÉGFÉK',s.airbrake?'NYITVA':'ZÁRVA'],['FEGYVER',s.training?'NINCS FEGYVERZET':weaponLabel(s,weapons.selected)],['LŐSZER',s.ammo[weapons.selected]??0]];$('systems').innerHTML=rows.map(([label,value])=>`<div><span>${label}</span><b>${value}</b></div>`).join('');
 const contacts=radarContacts(s,targets),selected=contacts.find(x=>x.target.id===aim.id);$('target-data').textContent=jammed?'JELZAVARÁS · NAVIGÁCIÓ NEM ELÉRHETŐ':s.training?'LESZÁLLÁSI GYAKORLAT · BASE':selected?.visible?`${selected.target.name.toUpperCase()} · ${(selected.distance/1000).toFixed(1)} KM · ${aim.locked?'BEFOGVA':Math.round(aim.progress/s.spec.lockTime*100)+'%'}`:mission.spec.objective==='escort'&&mission.objectiveComplete?'CIVIL TÁVOZOTT · RTB':mission.civilIntercepted?'CIVIL VISSZAFORDUL · TŰZTILALOM':mission.destroyed?'CÉL MEGSEMMISÍTVE · RTB':`${contacts.filter(c=>c.visible&&c.selectable).length} CÉL · ${contacts.filter(c=>c.visible&&c.target.team==='ally'&&!c.target.home).length} SZÖVETSÉGES · TAB: VÁLTÁS`;
 const map=renderTacticalMap($('radar'),s,targets,aim);$('map-range').textContent=jammed?'NINCS JEL':`${map.halfExtent*2/1000} KM`;
 const approach=s.approach,landing=!!approach?.active&&!s.onGround&&!s.crashed&&!jammed;
 document.body.classList.toggle('approaching',landing);
 $('landing-guidance').hidden=!landing;
 $('landing-attitude').hidden=!landing;
 if(landing)$('landing-attitude').innerHTML=landingAttitudeMarkup(s);
 $('approach-button').setAttribute('aria-pressed',String(landing));
 if(landing){
   $('approach-stage').textContent=`${approach.stage} · ${(approach.distance/1000).toFixed(1)} KM`;
   $('approach-checks').innerHTML=approach.items.map(item=>`<div class="${item.ok?'check-ok':'check-warn'}"><span>${item.ok?'✓':'!'} ${item.label}</span><b>${item.value}</b></div>`).join('');
   $('approach-instruction').textContent=approach.instruction;
 }
}





