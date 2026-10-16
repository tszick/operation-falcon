import {unitDefinition} from './unitTypes.js';
import {navigationJammed} from './electronicWarfare.js';
import {aircraft,missions,suitability,hangarGroups} from './aircraftSpec.js';
import {stepAircraft,STEP} from './physics.js';
import {createMissionAircraft} from './missionStart.js';
import {createTargets,updateTargets,Targeting} from './targeting.js';
import {Weapons} from './weapons.js';
import {Mission} from './mission.js';
import {AudioSystem} from './audio.js';
import {Renderer,renderAircraftPreview,renderTargetPreview} from './renderer.js';
import {updateHUD} from './hud.js';
import {evaluateApproach} from './landing.js';
import {armament,weaponLabel} from './armament.js';
import {toggleActuator,advanceCrashSequence} from './damage.js';
import {threatMarkup,missionThreatsFor,threatTypes} from './threats.js';
import {deployCountermeasures} from './countermeasures.js';
const $=id=>document.getElementById(id),renderer=new Renderer($('world')),audio=new AudioSystem(),keys=new Set();
let guideVisible=true;
try{guideVisible=localStorage.getItem('vector-flight-guide')!=='closed';}catch{}
let selected=aircraft.find(a=>a.id==='f16'),selectedMission=missions[0],hangarGroup='nato-classic',state=null,targets=[],weapons=null,aim=null,mission=null,playing=false,paused=false,accumulator=0,last=performance.now(),uiElapsed=0,toastTime=0,reported=false,best=0;
try{best=Number(localStorage.getItem('vector-flight-best'))||0;}catch{}
const ratingLabels={good:'AJÁNLOTT',ok:'HASZNÁLHATÓ',bad:'NEM AJÁNLOTT'};
function updatePlanner(){
 $('missions').innerHTML=missions.map(m=>`<button class="mission-card ${m===selectedMission?'selected':''}" data-mission="${m.id}" aria-pressed="${m===selectedMission}">${threatMarkup(m)}<small>${m.difficulty}</small><span class="icon" aria-hidden="true">${m.icon}</span><strong>${m.name}</strong></button>`).join('');$('mission-count').textContent=missions.length;
 $('mission-code').textContent=selectedMission.code;$('mission-name').textContent=selectedMission.name;$('mission-description').textContent=selectedMission.description;$('mission-threats').textContent=missionThreatsFor(selectedMission).map(type=>threatTypes[type].name).join(' · ')||'NINCS FEGYVERES ELLENFÉL';
 $('mission-goals').innerHTML=`<h4>ELSŐDLEGES CÉLOK</h4><ol>${selectedMission.primary.map(text=>`<li>${text}</li>`).join('')}</ol>${selectedMission.optional.length?`<h4>OPCIONÁLIS</h4><ul>${selectedMission.optional.map(text=>`<li>${text}</li>`).join('')}</ul>`:''}`;
 const opponents=selectedMission.roster.filter(r=>r.team!=='ally'),allies=selectedMission.roster.filter(r=>r.team==='ally');
 $('mission-gallery').innerHTML=opponents.map(r=>`<figure class="unit-preview"><canvas data-preview-unit="${r.type}" aria-label="${unitDefinition(r.type).name} forgó térbeli előnézete"></canvas><figcaption><strong>${r.count} × ${unitDefinition(r.type).name}</strong><small>${unitDefinition(r.type).category}</small></figcaption></figure>`).join('')||'<p class="empty-recon">Nincs ellenség. Csak te és a leszállópálya.</p>';
 $('mission-allies').innerHTML=allies.length?`<h4>SZÖVETSÉGES TÁMOGATÁS / VÉDENDŐ EGYSÉGEK</h4><p>${allies.map(r=>`${r.count} × ${unitDefinition(r.type).name}`).join(' · ')}</p><small>A gép vezeti őket; te a saját repülődet irányítod.</small>`:'';
 $('aircraft-list').innerHTML=aircraft.filter(a=>a.group===hangarGroup).map(a=>{const rating=suitability(a,selectedMission);return `<button class="aircraft-row ${a===selected?'selected':''}" data-aircraft="${a.id}" aria-pressed="${a===selected}"><span class="radio" aria-hidden="true"></span><span><strong>${a.name}</strong><small>${a.role.toUpperCase()} · MACH ${a.maxMach.toFixed(2)}</small></span><span class="rating ${rating}">${ratingLabels[rating]}</span></button>`;}).join('');
 $('launch').innerHTML=selectedMission.objective==='landing'?'GYAKORLÁS INDÍTÁSA ↘':selectedMission.airStart?'KÍSÉRÉS INDÍTÁSA ↗':'FELSZÁLLÁS ↗';$('planner-stores').textContent=selectedMission.objective==='landing'?'FEGYVERZET NÉLKÜL · 15% ÜZEMANYAG':Object.entries(armament(selected).weapons).map(([type,w])=>`${w.name} × ${w.quantity}`).join(' · ');$('planner-variant').textContent=armament(selected).variant;
 $('selected-name').textContent=selected.name;$('preview-role').textContent=selected.role.toUpperCase();$('preview-designation').textContent=selected.name.toUpperCase();
 const stats=[['MAX. SEBESSÉG',selected.maxMach.toFixed(2),'MACH'],['TOLÓERŐ',Math.round(selected.abThrust/1000),'KN'],['MAX. TERHELÉS',selected.maxG,'G'],['ÜZEMANYAG',selected.fuelCapacity.toLocaleString('hu'),'KG'],['RADAR',Math.round(selected.radarRange/1000),'KM'],['CSÚCSMAGASSÁG',(selected.ceiling/1000).toFixed(1),'KM']];$('specs').innerHTML=stats.map(([l,v,u])=>`<div><small>${l}</small><b>${v}<span>${u}</span></b></div>`).join('');$('aircraft-count').textContent=aircraft.length;for(const group of hangarGroups){const button=$(group.id);button.classList.toggle('active',group.id===hangarGroup);button.setAttribute('aria-selected',String(group.id===hangarGroup));button.tabIndex=group.id===hangarGroup?0:-1;}
}
$('missions').addEventListener('click',e=>{const b=e.target.closest('[data-mission]');if(b){selectedMission=missions.find(m=>m.id===b.dataset.mission);updatePlanner();}});
$('aircraft-list').addEventListener('click',e=>{const b=e.target.closest('[data-aircraft]');if(b){selected=aircraft.find(a=>a.id===b.dataset.aircraft);updatePlanner();}});
const groupSelections=new Map([[hangarGroup,selected.id]]);
for(const group of hangarGroups){const button=document.createElement('button');button.id=group.id;button.type='button';button.setAttribute('role','tab');button.innerHTML=`${group.name}<span>${aircraft.filter(a=>a.group===group.id).length}</span>`;button.onclick=()=>{groupSelections.set(hangarGroup,selected.id);hangarGroup=group.id;selected=aircraft.find(a=>a.id===groupSelections.get(group.id))||aircraft.find(a=>a.group===group.id);updatePlanner();};$('hangar-tabs').append(button);}
$('hangar-tabs').addEventListener('keydown',e=>{const index=hangarGroups.findIndex(g=>g.id===e.target.id);if(index<0)return;const next=e.key==='ArrowRight'?(index+1)%hangarGroups.length:e.key==='ArrowLeft'?(index+hangarGroups.length-1)%hangarGroups.length:e.key==='Home'?0:e.key==='End'?hangarGroups.length-1:-1;if(next<0)return;e.preventDefault();const button=$(hangarGroups[next].id);button.click();button.focus();});
function setGuideVisible(visible){guideVisible=visible;$('phase-guide').hidden=!visible;$('open-guide').hidden=visible;document.body.classList.toggle('guide-open',playing&&visible);try{localStorage.setItem('vector-flight-guide',visible?'open':'closed');}catch{}}
function toggleApproach(){if(!state||paused||state.onGround)return;state.landingMode=state.approach?.active||state.landingMode==='on'?'off':'on';state.approach=evaluateApproach(state);toast(state.landingMode==='on'?'LESZÁLLÁSI MÓD BE — G: FUTÓMŰ, X: FÉKSZÁRNY':'LESZÁLLÁSI MÓD KI');}
function selectWeapon(type){if(!playing||paused)return;if(state.training){toast('LESZÁLLÁSI GYAKORLAT — FEGYVERZET NÉLKÜL');return;}if(weapons.select(state,type))toast(`FEGYVER: ${weaponLabel(state,type)}`);else toast(state.ammo[type]===0&&armament(state.spec).weapons[type]?'ELFOGYOTT A LŐSZER':'EZ A FEGYVER NINCS FELSZERELVE');}
$('stores-display').addEventListener('click',e=>{const b=e.target.closest('[data-weapon]');if(b)selectWeapon(b.dataset.weapon);});
function toggleFlaps(){if(!playing||paused||state.dying||state.crashed)return;const fault=toggleActuator(state,'flaps');toast(fault||`FÉKSZÁRNY ${state.flaps?'KIENGEDÉS':'BEHÚZÁS'} — X`);}
function releaseDecoys(kind='mixed'){if(!playing||paused||state.dying||state.crashed)return;const result=deployCountermeasures(state,kind);toast(result.message);if(result.released)weapons.emit({type:'countermeasure-release',position:state.position.clone()});}
$('config-flaps').onclick=toggleFlaps;$('config-countermeasures').onclick=()=>releaseDecoys();
function selectTarget(){if(!playing||paused)return;toast(aim.cycle(state,targets)?'CÉL KIVÁLASZTVA — TARTSD A GÉP ELŐTT':navigationJammed(state,targets)?'JELZAVARÁS — SZEMMEL KERESD A ZAVARÓT':'NINCS CÉL A RADARKÚPBAN — KÖVESD AZ IRÁNYJELZÉST');}
function toast(text,duration=4){$('flight-toast').textContent=text;toastTime=duration;}
function launch(){audio.clearEffects();targets=createTargets(selectedMission,selected);state=createMissionAircraft(selected,selectedMission);document.body.classList.toggle('landing-practice',!!state.training);weapons=new Weapons({enemyFire:!state.training});weapons.selected=state.training?'none':selectedMission.kind==='air'&&state.ammo.aam?'aam':state.ammo.agm?'agm':state.ammo.bomb?'bomb':'gun';aim=new Targeting();mission=new Mission(selectedMission);mission.update(state,targets,weapons,aim);updateHUD(state,targets,weapons,aim,mission,audio.muted);$('fuel-status').hidden=false;playing=true;paused=false;reported=false;accumulator=0;keys.clear();$('hangar').hidden=true;$('hangar-footer').hidden=true;$('flight-ui').hidden=false;$('overlay').hidden=true;$('help').hidden=true;document.body.classList.add('flying');setGuideVisible(guideVisible);$('system-state').textContent='REPÜLÉS AKTÍV';audio.start();$('launch').blur();}
function showOverlay(kind){paused=true;keys.clear();audio.suspend();$('overlay').hidden=false;$('resume').hidden=kind!=='pause';$('overlay-label').textContent=kind==='pause'?'REPÜLÉS FELFÜGGESZTVE':'REPÜLÉSI JELENTÉS';$('overlay-title').textContent=kind==='pause'?'Tarts egy szünetet.':kind==='success'?'Küldetés teljesítve.':kind==='failure'?'Küldetés sikertelen.':'A gép elveszett.';$('overlay-text').textContent=kind==='pause'?'A repülés és a küldetés ideje megállt.':kind==='success'?(mission.spec.objective==='landing'?'Biztonságosan leszálltál és megálltál. A leszállási gyakorlat sikeres.':mission.spec.objective==='escort'?'A civil gép sértetlenül elhagyta a légteret. Sikeresen hazahoztad a gépedet.':'Az elsődleges feladatokat teljesítetted és sikeresen leszálltál.'):kind==='failure'?mission.failureReason:(state.landing?.reasons?.join(' ')||'Indítsd újra a feladatot, vagy válassz másik gépet a hangárban.');$('overlay-stats').textContent=kind==='success'?`${mission.score} PONT · REKORD ${best} · FÖLDETÉRÉS ${state.landing.descent.toFixed(1)} M/S`:kind==='crash'?`REPÜLT IDŐ ${Math.round(state.elapsed)} S · ${state.training?'LESZÁLLÁSI GYAKORLAT':mission.destroyed?'CÉL MEGSEMMISÍTVE':'CÉL AKTÍV'}`:'';$('resume').focus();}
function resume(){if(!playing||(state.crashed&&reported)||mission.complete||mission.failed)return;paused=false;keys.clear();accumulator=0;$('overlay').hidden=true;$('help').hidden=true;audio.start();}
function togglePause(){if(!playing||state.crashed||mission.complete)return;if(paused)resume();else showOverlay('pause');}
function hangar(){$('fuel-status').hidden=true;playing=false;paused=false;keys.clear();audio.clearEffects();audio.suspend();$('hangar').hidden=false;$('hangar-footer').hidden=false;$('flight-ui').hidden=true;$('overlay').hidden=true;$('help').hidden=true;document.body.classList.remove('flying','approaching','guide-open','wreck-view','landing-practice','navigation-jammed');$('system-state').textContent='RENDSZER KÉSZ';updatePlanner();}
function help(){if(playing&&!paused)showOverlay('pause');$('help').hidden=!$('help').hidden;}
$('launch').onclick=launch;$('restart').onclick=launch;$('resume').onclick=resume;$('back').onclick=hangar;$('pause-button').onclick=togglePause;$('approach-button').onclick=toggleApproach;$('lock-button').onclick=selectTarget;$('close-guide').onclick=()=>setGuideVisible(false);$('open-guide').onclick=()=>setGuideVisible(true);$('manual').onclick=help;$('close-help').onclick=()=>{$('help').hidden=true;};
addEventListener('resize',()=>renderer.resize());
addEventListener('keydown',e=>{const k=e.code;if(!playing)return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(k))e.preventDefault();if(e.repeat)return;if(k==='KeyP'||k==='Escape'){if(!$('help').hidden){$('help').hidden=true;return;}togglePause();return;}if(k==='KeyH'){help();return;}if(k==='KeyM'){audio.mute();return;}if(paused||state.dying||state.crashed||mission.failed)return;keys.add(k);if(k==='KeyG'){if(state.onGround)toast('FUTÓMŰ A FÖLDÖN NEM HÚZHATÓ BE');else {const fault=toggleActuator(state,'gear');if(fault)toast(fault);}}if(k==='KeyX')toggleFlaps();if(k==='KeyC')releaseDecoys();if(k==='Digit5')releaseDecoys('flare');if(k==='Digit6')releaseDecoys('chaff');if(k==='KeyB'){const fault=toggleActuator(state,'airbrake');if(fault)toast(fault);}if(k==='ShiftLeft'||k==='ShiftRight'){state.afterburner=state.spec.hasAB?!state.afterburner:false;toast(state.spec.hasAB?`UTÁNÉGETŐ ${state.afterburner?'BE':'KI'}`:'EHHEZ A GÉPHEZ NINCS UTÁNÉGETŐ');}if(k==='KeyN')toggleApproach();if(k==='KeyV')renderer.thirdPerson=!renderer.thirdPerson;if(k==='KeyL'){state.assist=!state.assist;toast(`G-KORLÁTOZÁS ${state.assist?'BE':'KI'}`);}if(k==='Tab'||k==='KeyT')selectTarget();const map={Digit1:'gun',Digit2:'aam',Digit3:'agm',Digit4:'bomb'};if(map[k])selectWeapon(map[k]);});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{keys.clear();if(playing&&!paused&&!state.crashed&&!mission.complete)showOverlay('pause');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&!paused)showOverlay('pause');});
function input(){const pressed=(...codes)=>codes.some(k=>keys.has(k))?1:0;return {pitch:pressed('KeyS','ArrowDown')-pressed('KeyW','ArrowUp'),roll:pressed('KeyD','ArrowRight')-pressed('KeyA','ArrowLeft'),yaw:pressed('KeyE')-pressed('KeyQ'),throttle:pressed('KeyR')-pressed('KeyF'),brake:!!pressed('ControlLeft','ControlRight')};}
function tick(dt){
 stepAircraft(state,input(),dt);updateTargets(targets,dt);aim.update(state,targets,dt);
 if(keys.has('Space')&&!state.dying&&!state.crashed){const message=weapons.fire(state,targets,aim);if(message)toast(message);}
 const hits=weapons.hits,damageHits=weapons.damageHits||0;weapons.update(state,targets,dt);
 for(const event of weapons.drainEvents())audio.playEvent(event,state);
 if(weapons.hits>hits)toast(mission.spec.objective==='escort'?'CIVIL GÉP TALÁLATOT KAPOTT — KÜLDETÉS SIKERTELEN':targets.some(t=>t.alive&&t.team!=='ally')?'CÉL MEGSEMMISÍTVE — A TÖBBI CÉLPONT MÉG AKTÍV':'MINDEN CÉL HARCKÉPTELEN — TÉRJ VISSZA A BÁZISRA',8);
 else if((weapons.damageHits||0)>damageHits)toast('TALÁLAT — A CÉL SÉRÜLT');
 mission.update(state,targets,weapons,aim);
 const crashReportReady=advanceCrashSequence(state,dt);
 document.body.classList.toggle('wreck-view',state.dying||state.crashed);
 if((crashReportReady||mission.complete||mission.failed)&&!reported){
  reported=true;if(mission.complete){best=Math.max(best,mission.score);try{localStorage.setItem('vector-flight-best',String(best));}catch{}}
  showOverlay(state.crashed?'crash':mission.failed?'failure':'success');
 }
}
function frame(time){const delta=Math.min((time-last)/1000,.1);last=time;if(playing){if(!paused){accumulator+=delta;while(accumulator>=STEP&&!paused){tick(STEP);accumulator-=STEP;}if(toastTime>0){toastTime-=delta;if(toastTime<=0)$('flight-toast').textContent='';}}renderer.render(state,targets,weapons,aim);uiElapsed+=delta;if(uiElapsed>.1){uiElapsed=0;updateHUD(state,targets,weapons,aim,mission,audio.muted);}audio.update(state,aim,!paused);}else{renderer.idle(time/1000);renderAircraftPreview($('aircraft-art'),selected,matchMedia('(prefers-reduced-motion: reduce)').matches?0:time/1000);for(const canvas of $('mission-gallery').querySelectorAll('canvas')){const id=canvas.dataset.previewUnit;renderTargetPreview(canvas,{id,kind:unitDefinition(id).kind},selected,matchMedia('(prefers-reduced-motion: reduce)').matches?0:time/1000);}}requestAnimationFrame(frame);}
updatePlanner();requestAnimationFrame(frame);







