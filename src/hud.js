import {updateFlightMessages} from './flightMessages.js';
import {mountCockpit,updateCockpit} from './cockpit.js';
import {compactObjective} from './cockpitGeometry.js';
import {missionCardState,missionGoalsMarkup,configurationIndicators} from './flightPanels.js';
import {navigationJammed} from './electronicWarfare.js';
import {radarContacts,targetingStatus} from './targeting.js';
import {fuelStatus,engineInstruments} from './instruments.js';
import {phaseGuide} from './phaseGuide.js';
import {updateStores} from './storesDisplay.js';
import {damageStage,damageWarnings} from './damage.js';
import {renderTacticalMap} from './tacticalMap.js';
import {landingAttitudeMarkup} from './landingAttitude.js';
import {flapStatus} from './flaps.js';
const $=id=>document.getElementById(id);
export function updateHUD(s,targets,weapons,aim,mission,muted){
 mountCockpit();
 const jammed=navigationJammed(s,targets);document.body.classList.toggle('navigation-jammed',jammed);updateCockpit(s);
 updateStores(s,weapons,{compact:true});
 const flap=flapStatus(s),cm=s.countermeasures;
 const indicators=configurationIndicators(s),labels={gear:'G · FUTÓMŰ',flaps:'X · FÉKSZÁRNY',airbrake:'B · LÉGFÉK',engine:`GÁZ ${Math.round(s.throttle*100)}%`,afterburner:'SHIFT · AB',assist:'L · G-LIMIT',wheelBrake:'CTRL · KERÉKFÉK'},ids={gear:'config-gear',flaps:'config-flaps',airbrake:'config-airbrake',engine:'config-engine',afterburner:'config-afterburner',assist:'config-assist',wheelBrake:'config-wheel-brake'};
 const shortLabels={gear:'FUTÓ',flaps:'FÉKSZ.',airbrake:'LÉGFÉK',afterburner:'UTÁNÉG.',assist:'G-LIM',wheelBrake:'KERÉKFÉK'};
 for(const [key,indicator] of Object.entries(indicators)){const element=$(ids[key]);element.textContent=shortLabels[key]||labels[key];if(element.tagName==='BUTTON'&&element.clientWidth>0)element.style.fontSize=`${Math.max(7,Math.min(innerWidth<=1050?9:10,(element.clientWidth-2)/(element.textContent.length*.62)))}px`;element.dataset.state=indicator.state;element.setAttribute('aria-label',`${labels[key]} · ${indicator.active?'aktív':'inaktív'}${indicator.state==='danger'?' · veszélyes állás':''}`);if(element.tagName==='BUTTON')element.setAttribute('aria-pressed',String(indicator.active));}
 $('config-afterburner').hidden=!s.spec.hasAB;$('config-flaps').dataset.moving=String(flap.moving);$('config-flaps').title=flap.label;
 $('config-countermeasures').textContent=`C · IR ${cm?.flare||0} / R ${cm?.chaff||0}`;
 const damaged=s.damage>=15,damagePanel=$('damage-status'),stage=damageStage(s);damagePanel.hidden=!damaged||s.dying||s.crashed;
 if(damaged){damagePanel.dataset.stage=stage.id;$('damage-title').textContent=stage.label;$('damage-integrity').textContent=`SZERKEZET ${Math.max(0,Math.round(100-s.damage))}%`;$('damage-bar').style.width=`${Math.max(0,100-s.damage)}%`;const faults=damageWarnings(s);$('damage-faults').textContent=faults.slice(0,2).join(' · ')||'SÉRÜLT SZERKEZET · FINOM MANŐVEREK';damagePanel.title=faults.join('\n');}
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
 $('guide-title').textContent=mission.phase;
 const card=missionCardState(s,mission,targets);$('mission-card-name').textContent=card.name;$('mission-time').textContent=card.elapsed;$('mission-time').title='Eltelt küldetésidő';$('mission-card-phase').textContent=card.phase;
 $('mission-priority').hidden=true;$('mission-priority').textContent=card.priority;$('mission-objectives').innerHTML=missionGoalsMarkup({...card,rows:card.rows.map(row=>({...row,text:compactObjective(row),fullText:row.text}))});$('mission-card').title=card.name+' · '+card.phase;
 const guideSteps=phaseGuide(s,mission,aim,weapons,targets);
 fitPhaseGuide(guideSteps);
 const engine=engineInstruments(s),gauge=$('g-load');
 $('throttle-value').textContent=`${engine.throttle}%`;$('throttle-fill').style.height=`${engine.throttle}%`;$('throttle-status').setAttribute('aria-valuenow',String(engine.throttle));
 $('g-value').textContent=`${engine.g>=0?'+':''}${engine.g.toFixed(1)}`;gauge.dataset.level=engine.level;
 gauge.setAttribute('aria-valuemin',String(engine.limits.negative));gauge.setAttribute('aria-valuemax',String(engine.limits.positive));gauge.setAttribute('aria-valuenow',String(engine.g));
 gauge.setAttribute('aria-valuetext',`${engine.g.toFixed(1)} G · ${{normal:'rendben',warning:'figyelmeztetés',danger:'veszélyes terhelés'}[engine.level]}`);
 gauge.title=`G-terhelés · szerkezeti határok: ${engine.limits.negative.toFixed(1)} / +${engine.limits.positive.toFixed(1)} G · sárga a határ 80%-ától`;
 const fuelInfo=fuelStatus(s);
 $('fuel-status').dataset.level=fuelInfo.level;
 $('fuel-status').title=`Fogyasztás: ${Math.round(fuelInfo.flowKgMin)} kg/perc${fuelInfo.minutesRemaining!==null?` · ezen a gázálláson kb. ${fuelInfo.minutesRemaining.toFixed(1)} perc marad`:''}`;
 $('fuel-label').textContent=({normal:'FUEL TOT',low:'BINGO',critical:'FUEL LOW',empty:'FUEL OUT'})[fuelInfo.level];
 $('fuel-quantity').textContent=`${fuelInfo.kg.toLocaleString('hu-HU')} KG`;$('fuel-quantity').title=`${fuelInfo.kg} kg üzemanyag`;$('fuel-range').textContent=fuelInfo.rangeKm===null?'— KM':`~${Math.round(fuelInfo.rangeKm)} KM`;$('fuel-range').title='Becslés a pillanatnyi vízszintes sebességgel és fogyasztással, tartalék nélkül. Nem optimális elméleti hatótáv; a szél és a siklás nincs benne.';
 $('fuel-value').textContent=`${fuelInfo.percent}%`;
 $('fuel-fill').style.width=String(fuelInfo.percent)+'%';$('fuel-gauge').setAttribute('aria-label',`${fuelInfo.percent}% üzemanyag, ${fuelInfo.kg} kg; ${fuelInfo.rangeKm===null?'hatótáv még nem becsülhető':`becsült hatótáv ${Math.round(fuelInfo.rangeKm)} km`}`);
 $('fuel-meter').setAttribute('aria-valuenow',String(fuelInfo.percent));
 $('fuel-meter').setAttribute('aria-valuetext',`${fuelInfo.percent} százalék, ${fuelInfo.kg} kilogramm. ${fuelInfo.label}`);$('warning').textContent=s.dying||s.crashed?s.warning:s.threatWarning||s.warning;
 $('flight-status').textContent=`${s.assist?'G-LIMITER BE':'G-LIMITER KI'} · ${s.onGround?'FÖLDÖN':'REPÜLÉS'} · ${Math.floor(s.elapsed/60).toString().padStart(2,'0')}:${Math.floor(s.elapsed%60).toString().padStart(2,'0')} · ${muted?'NÉMÍTVA':'HANG BE'}`;
 const contacts=radarContacts(s,targets),selected=contacts.find(x=>x.target.id===aim.id);$('target-data').textContent=jammed?'JELZAVARÁS · NAVIGÁCIÓ NEM ELÉRHETŐ':s.training?'LESZÁLLÁSI GYAKORLAT · BASE':selected?.visible?`${selected.target.name.toUpperCase()} · ${(selected.distance/1000).toFixed(1)} KM · ${aim.locked?'BEFOGVA':lock.state==='acquiring'?'BEFOGÁS':'KIJELÖLVE'}`:mission.spec.objective==='escort'&&mission.objectiveComplete?'CIVIL TÁVOZOTT · RTB':mission.civilIntercepted?'CIVIL VISSZAFORDUL · TŰZTILALOM':mission.destroyed?'CÉL MEGSEMMISÍTVE · RTB':`${contacts.filter(c=>c.visible&&c.selectable).length} CÉL · ${contacts.filter(c=>c.visible&&c.target.team==='ally'&&!c.target.home&&!c.target.city).length} SZÖVETSÉGES · TAB: VÁLTÁS`;
 $('target-data').dataset.lock=jammed||!selected?.visible?'idle':aim.locked?'locked':lock.state==='acquiring'?'acquiring':'idle';
 $('target-data').title=$('target-data').textContent;if(!selected?.visible)$('target-data').textContent=jammed?'JELZAVARÁS':s.training?'BASE / N':`${contacts.filter(c=>c.visible&&c.selectable).length} CÉL · ${contacts.filter(c=>c.visible&&c.target.team==='ally'&&!c.target.home&&!c.target.city).length} BARÁT`;
 const map=renderTacticalMap($('radar'),s,targets,aim);$('map-range').textContent=jammed?'NINCS JEL':`${map.halfExtent*2/1000} KM`;
 const approach=s.approach,landing=!!approach?.active&&!s.onGround&&!s.crashed&&!jammed;
 const wasLanding=document.body.classList.contains('approaching');document.body.classList.toggle('approaching',landing);if(landing!==wasLanding)$('weapon-bay').open=!landing;
 $('landing-guidance').hidden=!landing;
 $('landing-attitude').hidden=!landing;
 if(landing)$('landing-attitude').innerHTML=landingAttitudeMarkup(s);
 $('approach-button').setAttribute('aria-pressed',String(landing));const routeButton=$('landing-route-button');if(routeButton){routeButton.hidden=!landing;routeButton.setAttribute('aria-pressed',String(s.landingRouteEnabled!==false));routeButton.textContent=`I SEGÉDÍV ${s.landingRouteEnabled===false?'KI':'BE'}`;}const head=$('head-view-status');if(head){const yaw=s.headLook?.yawDeg||0,pitch=s.headLook?.pitchDeg||0;head.hidden=Math.abs(yaw)+Math.abs(pitch)<2;head.textContent=`NÉZET ${yaw<0?'BAL':'JOBB'} ${Math.abs(yaw).toFixed(0)}° · ${pitch<0?'LE':'FEL'} ${Math.abs(pitch).toFixed(0)}°`;}
 if(landing){
   $('approach-stage').textContent=`${approach.stage} · ${(approach.distance/1000).toFixed(1)} KM`;
   $('approach-checks').innerHTML=approach.items.filter(item=>!['FUTÓMŰ','FÉKSZÁRNY','LÉGFÉK','BEDÖNTÉS','ORRHELYZET','PÁLYAIRÁNY'].includes(item.label)).map(item=>`<div class="${item.ok?'check-ok':'check-warn'}" title="${item.label}"><span>${item.ok?'✓':'!'} ${{'SEBESSÉG':'IAS','SÜLLYEDÉS':'V/S','SIKLÓPÁLYA':'SIKLÁS','BEÉRKEZÉS':'SZÖG'}[item.label]||item.label}</span><b>${item.value}</b></div>`).join('');
   $('approach-instruction').textContent=approach.instruction+(map.landingRoute?.advisory?' '+map.landingRoute.advisory:'');
 }
 updateCockpit(s);updateFlightMessages(s,lock,aim,weapons);
}






// Measure the untransformed screen: completed steps no longer consume glass space.
const guideLayout=new WeakMap();
function fitPhaseGuide(steps){
 const list=$('guide-steps'),pending=steps.filter(item=>!item.done);
 const html=pending.map(item=>`<li class="${item.active?'current':''}"><kbd>${item.key}</kbd><span>${item.text}</span></li>`).join('');
 const width=list.clientWidth,height=list.clientHeight,key=html+':'+width+':'+height;
 if(guideLayout.get(list)===key)return;
 guideLayout.set(list,key);list.innerHTML=html;
 list.style.setProperty('--guide-lines',height>=24?2:1);
 let full=false;
 for(const row of list.children){
  full=full||row.offsetTop+row.offsetHeight>height;
  row.hidden=full;
 }
}
