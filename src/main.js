import {HeadLookInput} from './headLookInput.js';
import {postRadioMessage,postFlightMessage,resetFlightMessages} from './flightMessages.js';
import {mountCockpit} from './cockpit.js';
import {debriefMarkup} from './flightDebrief.js';
import {defaultLoadout,stationOptions,validateLoadout,configureAircraft,initialWeapon,plannedDeparture} from './loadoutPlanner.js';
import {HeadLook} from './headLook.js';
import {clearLandingRoute} from './landingRoute.js';
import {FlightRecorder} from './flightRecorder.js';
import {FlightLogStorage,downloadFlightLog} from './flightLogStorage.js';
import {unitDefinition} from './unitTypes.js';
import {navigationJammed} from './electronicWarfare.js';
import {aircraft,missions,suitability,hangarGroups} from './aircraftSpec.js';
import {stepAircraft,STEP} from './physics.js';
import {createMissionAircraft,defaultMissionFuel} from './missionStart.js';
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
mountCockpit();
const $=id=>document.getElementById(id),renderer=new Renderer($('world')),audio=new AudioSystem(),keys=new Set();
audio.radio.onLine=(line,now)=>postRadioMessage(line,now);
let pointerWheelBrake=false,pointerEscapeAt=-Infinity;
const headLook=new HeadLook();renderer.headLook=headLook;
let landingRouteEnabled=true;try{landingRouteEnabled=localStorage.getItem('falcon-landing-route')!=='off';}catch{}
let guideVisible=true;
try{guideVisible=localStorage.getItem('vector-flight-guide')!=='closed';}catch{}
let selected=aircraft.find(a=>a.id==='f16'),selectedMission=missions[0],hangarGroup='nato-classic',state=null,targets=[],weapons=null,aim=null,mission=null,playing=false,paused=false,accumulator=0,last=performance.now(),uiElapsed=0,reported=false,best=0;
const headInput=new HeadLookInput($('world'),headLook,document,{canLook:()=>playing&&!paused&&!state?.dying&&!state?.crashed&&!renderer.thirdPerson,onEscape:()=>{pointerEscapeAt=performance.now();if(playing&&!paused&&!state?.dying&&!state?.crashed)showOverlay('pause');},onChange:locked=>document.body.classList.toggle('mouse-look-locked',locked)});
try{best=Number(localStorage.getItem('vector-flight-best'))||0;}catch{}
const logStorage=new FlightLogStorage(error=>{$('log-storage-status').textContent='Csak memóriában: '+error.message;});
const recorder=new FlightRecorder({onReset:metadata=>{logStorage.reset(metadata);$('log-storage-status').textContent='Csak az aktuális küldetés';},onBatch:(metadata,entries)=>logStorage.append(metadata,entries)});
function exportFlight(){if(!recorder.metadata)return;recorder.flush();downloadFlightLog(recorder.export());}
$('export-flight-log').onclick=exportFlight;
const ratingLabels={good:'AJÁNLOTT',ok:'HASZNÁLHATÓ',bad:'NEM AJÁNLOTT'};
const loadoutChoices=new Map(),fuelChoices=new Map();
const fuelKey=()=>`${selected.id}:${selectedMission.objective==='landing'?'landing':'standard'}`;
function selectedFuel(){return fuelChoices.get(fuelKey())??defaultMissionFuel(selectedMission);}
const kg=value=>value.toLocaleString('hu-HU',{maximumFractionDigits:1});
function updateDeparture(){
 const training=selectedMission.objective==='landing',fraction=selectedFuel(),plan=plannedDeparture(selected,selectedLoadout(),{fuelFraction:fraction,unarmed:training}),full=plannedDeparture(selected,defaultLoadout(selected),{unarmed:training});
 $('start-fuel').value=Math.round(fraction*100);$('start-fuel-value').textContent=`${Math.round(fraction*100)}% · ${kg(plan.fuelKg)} / ${kg(selected.fuelCapacity)} kg`;
 $('departure-mass').innerHTML=[['Üres gép',plan.emptyKg],['Üzemanyag',plan.fuelKg],['Rakéták',plan.missilesKg],['Bombák',plan.bombsKg],['Gépágyúlőszer (becsült)',plan.gunAmmoKg]].map(([label,value])=>`<div><dt>${label}</dt><dd>${kg(value)} kg</dd></div>`).join('');
 $('departure-total').textContent=`${kg(plan.totalKg)} kg`;
 const difference=plan.totalKg-full.totalKg;
 $('departure-delta').textContent=Math.abs(difference)<.05?'Teljes tank és alapfeltöltés.':`${kg(Math.abs(difference))} kg-mal ${difference<0?'könnyebb':'nehezebb'} a teljes tankkal${training?'':' és alapfegyverzettel'} induló gépnél.`;
 $('departure-warning').textContent=fraction===0?'Üres tank: a hajtómű nem ad tolóerőt.':fraction<.1?'Kevés üzemanyag: a hazatéréshez is hagyj tartalékot.':'';
 if(training)$('planner-stores').textContent=`FEGYVERZET NÉLKÜL · ${Math.round(fraction*100)}% ÜZEMANYAG`;
}
$('start-fuel').addEventListener('input',()=>{fuelChoices.set(fuelKey(),Number($('start-fuel').value)/100);updateDeparture();});
function selectedLoadout(){if(!loadoutChoices.has(selected.id))loadoutChoices.set(selected.id,defaultLoadout(selected));return loadoutChoices.get(selected.id);}
function updateLoadout(){
 const choice=selectedLoadout(),preset=armament(selected),training=selectedMission.objective==='landing',check=validateLoadout(selected,choice);
 $('loadout-editor').hidden=training;updateDeparture();
 $('loadout-gun').innerHTML=preset.weapons.gun?`<label><input id="loadout-cannon" type="checkbox" ${choice.gun?'checked':''}> Gépágyúlőszer: ${preset.weapons.gun.name} · ${preset.weapons.gun.quantity} db</label>`:'Ehhez a gépváltozathoz nincs gépágyú.';
 $('loadout-stations').innerHTML=preset.stations.map((station,i)=>`<label>${station.internal?'Belső':'Függesztési'} hely ${i+1}<select data-station="${i}" aria-label="Fegyver a(z) ${i+1}. helyen"><option value="">Üres</option>${stationOptions(selected,i).map(type=>`<option value="${type}" ${choice.stations[i]===type?'selected':''}>${preset.weapons[type].name} · ${type==='aam'?'légi cél':type==='agm'?'földi cél':'bomba'}</option>`).join('')}</select></label>`).join('');
 $('loadout-capacity').textContent=`${check.count} / ${check.limits.maxStores} függesztmény · ${Math.round(check.payloadKg)} / ${check.limits.maxPayloadKg} kg engedélyezett játékbeli fegyverterhelés`;
 $('loadout-errors').textContent=check.errors.join(' ');$('launch').disabled=!training&&!check.valid;
 const configured=check.valid?configureAircraft(selected,choice):selected;
 const selectedRating=$('aircraft-list').querySelector(`[data-aircraft="${selected.id}"] .rating`);if(selectedRating){const rating=suitability(configured,selectedMission);selectedRating.className='rating '+rating;selectedRating.textContent=ratingLabels[rating];}
 $('planner-stores').textContent=training?`FEGYVERZET NÉLKÜL · ${Math.round(selectedFuel()*100)}% ÜZEMANYAG`:!check.valid?'HIBÁS FEGYVERZET — JAVÍTSD A KIOSZTÁST':Object.values(armament(configured).weapons).map(w=>`${w.name} × ${w.quantity}`).join(' · ')||'FEGYVERZET NÉLKÜL';
 if(!training&&['escort-transport','defend-base'].includes(selectedMission.objective)&&!armament(configured).weapons.aam)$('loadout-errors').textContent+=' Légi ellenfelek várhatók: légiharc-rakéta ajánlott.';
}
$('loadout-editor').addEventListener('change',e=>{const choice=selectedLoadout();if(e.target.id==='loadout-cannon')choice.gun=e.target.checked;if(e.target.matches('[data-station]'))choice.stations[Number(e.target.dataset.station)]=e.target.value;updateLoadout();});
$('loadout-reset').onclick=()=>{loadoutChoices.set(selected.id,defaultLoadout(selected));updateLoadout();};
function updatePlanner(){
 $('missions').innerHTML=missions.map(m=>`<button class="mission-card ${m===selectedMission?'selected':''}" data-mission="${m.id}" aria-pressed="${m===selectedMission}">${threatMarkup(m)}<small>${m.difficulty}</small><span class="icon" aria-hidden="true">${m.icon}</span><strong>${m.name}</strong></button>`).join('');$('mission-count').textContent=missions.length;
 $('mission-code').textContent=selectedMission.code;$('mission-name').textContent=selectedMission.name;$('mission-description').textContent=selectedMission.description;$('mission-threats').textContent=missionThreatsFor(selectedMission).map(type=>threatTypes[type].name).join(' · ')||'NINCS FEGYVERES ELLENFÉL';
 $('mission-goals').innerHTML=`<h4>ELSŐDLEGES CÉLOK</h4><ol>${selectedMission.primary.map(text=>`<li>${text}</li>`).join('')}</ol>${selectedMission.optional.length?`<h4>OPCIONÁLIS</h4><ul>${selectedMission.optional.map(text=>`<li>${text}</li>`).join('')}</ul>`:''}`;
 const opponents=selectedMission.roster.filter(r=>r.team!=='ally'),allies=selectedMission.roster.filter(r=>r.team==='ally');
 $('mission-gallery').innerHTML=opponents.map(r=>`<figure class="unit-preview"><canvas data-preview-unit="${r.type}" aria-label="${unitDefinition(r.type).name} forgó térbeli előnézete"></canvas><figcaption><strong>${r.count} × ${unitDefinition(r.type).name}</strong><small>${unitDefinition(r.type).category}</small></figcaption></figure>`).join('')||'<p class="empty-recon">Nincs ellenség. Csak te és a leszállópálya.</p>';
 $('mission-allies').innerHTML=allies.length?`<h4>SZÖVETSÉGES TÁMOGATÁS / VÉDENDŐ EGYSÉGEK</h4><p>${allies.map(r=>`${r.count} × ${unitDefinition(r.type).name}`).join(' · ')}</p><small>A gép vezeti őket; te a saját repülődet irányítod.</small>`:'';
 $('aircraft-list').innerHTML=aircraft.filter(a=>a.group===hangarGroup).map(a=>{const rating=suitability(a,selectedMission);return `<button class="aircraft-row ${a===selected?'selected':''}" data-aircraft="${a.id}" aria-pressed="${a===selected}"><span class="radio" aria-hidden="true"></span><span><strong>${a.name}</strong><small>${a.role.toUpperCase()} · MACH ${a.maxMach.toFixed(2)}</small></span><span class="rating ${rating}">${ratingLabels[rating]}</span></button>`;}).join('');
 $('launch').innerHTML=selectedMission.objective==='landing'?'GYAKORLÁS INDÍTÁSA ↘':selectedMission.airStart?'KÍSÉRÉS INDÍTÁSA ↗':'FELSZÁLLÁS ↗';$('planner-stores').textContent=selectedMission.objective==='landing'?`FEGYVERZET NÉLKÜL · ${Math.round(selectedFuel()*100)}% ÜZEMANYAG`:Object.entries(armament(selected).weapons).map(([type,w])=>`${w.name} × ${w.quantity}`).join(' · ');$('planner-variant').textContent=armament(selected).variant;
 $('selected-name').textContent=selected.name;$('preview-role').textContent=selected.role.toUpperCase();$('preview-designation').textContent=selected.name.toUpperCase();
 const stats=[['MAX. SEBESSÉG',selected.maxMach.toFixed(2),'MACH'],['TOLÓERŐ',Math.round(selected.abThrust/1000),'KN'],['MAX. TERHELÉS',selected.maxG,'G'],['ÜZEMANYAG',selected.fuelCapacity.toLocaleString('hu'),'KG'],['RADAR',Math.round(selected.radarRange/1000),'KM'],['CSÚCSMAGASSÁG',(selected.ceiling/1000).toFixed(1),'KM']];$('specs').innerHTML=stats.map(([l,v,u])=>`<div><small>${l}</small><b>${v}<span>${u}</span></b></div>`).join('');updateLoadout();$('aircraft-count').textContent=aircraft.length;for(const group of hangarGroups){const button=$(group.id);button.classList.toggle('active',group.id===hangarGroup);button.setAttribute('aria-selected',String(group.id===hangarGroup));button.tabIndex=group.id===hangarGroup?0:-1;}
}
$('missions').addEventListener('click',e=>{const b=e.target.closest('[data-mission]');if(b){selectedMission=missions.find(m=>m.id===b.dataset.mission);updatePlanner();}});
$('aircraft-list').addEventListener('click',e=>{const b=e.target.closest('[data-aircraft]');if(b){selected=aircraft.find(a=>a.id===b.dataset.aircraft);updatePlanner();}});
const groupSelections=new Map([[hangarGroup,selected.id]]);
for(const group of hangarGroups){const button=document.createElement('button');button.id=group.id;button.type='button';button.setAttribute('role','tab');button.innerHTML=`${group.name}<span>${aircraft.filter(a=>a.group===group.id).length}</span>`;button.onclick=()=>{groupSelections.set(hangarGroup,selected.id);hangarGroup=group.id;selected=aircraft.find(a=>a.id===groupSelections.get(group.id))||aircraft.find(a=>a.group===group.id);updatePlanner();};$('hangar-tabs').append(button);}
$('hangar-tabs').addEventListener('keydown',e=>{const index=hangarGroups.findIndex(g=>g.id===e.target.id);if(index<0)return;const next=e.key==='ArrowRight'?(index+1)%hangarGroups.length:e.key==='ArrowLeft'?(index+hangarGroups.length-1)%hangarGroups.length:e.key==='Home'?0:e.key==='End'?hangarGroups.length-1:-1;if(next<0)return;e.preventDefault();const button=$(hangarGroups[next].id);button.click();button.focus();});
function setGuideVisible(visible){guideVisible=visible;$('phase-guide').hidden=!visible;$('open-guide').hidden=visible;document.body.classList.toggle('guide-open',playing&&visible);try{localStorage.setItem('vector-flight-guide',visible?'open':'closed');}catch{}}
function toggleLandingRoute(){if(!playing||paused||state.crashed||state.dying)return;landingRouteEnabled=state.landingRouteEnabled===false;state.landingRouteEnabled=landingRouteEnabled;clearLandingRoute(state);try{localStorage.setItem('falcon-landing-route',landingRouteEnabled?'on':'off');}catch{}recorder.event('landing-route',{enabled:landingRouteEnabled});toast(`LESZÁLLÁSI SEGÉDÍV ${landingRouteEnabled?'BE':'KI'} — I`);}
function toggleApproach(){if(!state||paused||state.onGround)return;state.landingMode=state.approach?.active||state.landingMode==='on'?'off':'on';state.approach=evaluateApproach(state);clearLandingRoute(state);toast(state.landingMode==='on'?'LESZÁLLÁSI MÓD BE — G: FUTÓMŰ, X: FÉKSZÁRNY':'LESZÁLLÁSI MÓD KI');}
function selectWeapon(type){if(!playing||paused)return;if(state.training){toast('LESZÁLLÁSI GYAKORLAT — FEGYVERZET NÉLKÜL');return;}if(weapons.select(state,type))toast(`FEGYVER: ${weaponLabel(state,type)}`);else toast(state.ammo[type]===0&&armament(state.spec).weapons[type]?'ELFOGYOTT A LŐSZER':'EZ A FEGYVER NINCS FELSZERELVE');}
$('stores-display').addEventListener('click',e=>{const b=e.target.closest('[data-weapon]');if(b)selectWeapon(b.dataset.weapon);});
function toggleFlaps(){if(!playing||paused||state.dying||state.crashed)return;const fault=toggleActuator(state,'flaps');toast(fault||`FÉKSZÁRNY ${state.flaps?'KIENGEDÉS':'BEHÚZÁS'} — X`);}
function releaseDecoys(kind='mixed'){if(!playing||paused||state.dying||state.crashed)return;const result=deployCountermeasures(state,kind);toast(result.message);if(result.released)weapons.emit({type:'countermeasure-release',position:state.position.clone()});}
function toggleGear(){if(!playing||paused||state.dying||state.crashed)return;if(state.onGround){toast('FUTÓMŰ A FÖLDÖN NEM HÚZHATÓ BE');return;}const fault=toggleActuator(state,'gear');if(fault)toast(fault);}
function toggleAirbrake(){if(!playing||paused||state.dying||state.crashed)return;const fault=toggleActuator(state,'airbrake');if(fault)toast(fault);}
function toggleAfterburner(){if(!playing||paused||state.dying||state.crashed)return;state.afterburner=state.spec.hasAB?!state.afterburner:false;toast(state.spec.hasAB?`UTÁNÉGETŐ ${state.afterburner?'BE':'KI'}`:'EHHEZ A GÉPHEZ NINCS UTÁNÉGETŐ');}
function toggleAssist(){if(!playing||paused||state.dying||state.crashed)return;state.assist=!state.assist;toast(`G-KORLÁTOZÁS ${state.assist?'BE':'KI'}`);}
$('config-afterburner').onclick=toggleAfterburner;$('config-assist').onclick=toggleAssist;$('config-gear').onclick=toggleGear;$('config-airbrake').onclick=toggleAirbrake;
const wheelBrakeButton=$('config-wheel-brake');wheelBrakeButton.addEventListener('pointerdown',e=>{if(!playing||paused||!state?.onGround)return;e.preventDefault();wheelBrakeButton.setPointerCapture(e.pointerId);pointerWheelBrake=true;});for(const event of ['pointerup','pointercancel','lostpointercapture'])wheelBrakeButton.addEventListener(event,()=>{pointerWheelBrake=false;});
$('config-flaps').onclick=toggleFlaps;$('config-countermeasures').onclick=()=>releaseDecoys();
function selectTarget(){if(!playing||paused)return;toast(aim.cycle(state,targets)?'CÉL KIVÁLASZTVA — TARTSD A GÉP ELŐTT':navigationJammed(state,targets)?'JELZAVARÁS — SZEMMEL KERESD A ZAVARÓT':'NINCS CÉL A RADARKÚPBAN — KÖVESD AZ IRÁNYJELZÉST');}
function toast(text,duration=4){recorder.change('message',text,'message');postFlightMessage(text,state?.elapsed||0,duration);}
function launch(){resetFlightMessages();pointerWheelBrake=false;document.body.classList.toggle('external-view',renderer.thirdPerson);audio.clearEffects();targets=createTargets(selectedMission,selected);state=createMissionAircraft(configureAircraft(selected,selectedMission.objective==='landing'?defaultLoadout(selected):selectedLoadout()),selectedMission,{fuelFraction:selectedFuel()});headLook.reset();state.headLook={yawDeg:0,pitchDeg:0};state.landingRouteEnabled=landingRouteEnabled;document.body.classList.toggle('landing-practice',!!state.training);weapons=new Weapons({enemyFire:!state.training});weapons.selected=initialWeapon(state,selectedMission);aim=new Targeting();mission=new Mission(selectedMission);mission.update(state,targets,weapons,aim);recorder.start(state,mission,targets,weapons,aim);$('export-flight-log').disabled=false;updateHUD(state,targets,weapons,aim,mission,audio.muted);$('fuel-status').hidden=false;playing=true;paused=false;reported=false;accumulator=0;keys.clear();$('hangar').hidden=true;$('hangar-footer').hidden=true;$('flight-ui').hidden=false;$('overlay').hidden=true;$('help').hidden=true;document.body.classList.add('flying');setGuideVisible(guideVisible);$('system-state').textContent='REPÜLÉS AKTÍV';audio.start();audio.radio.startMission(state,mission,targets);$('launch').blur();headInput.capture();}
function showOverlay(kind){headInput.release();headLook.reset();recorder.capture(state,mission,targets,weapons,aim,logControls(),true);recorder.event('pause',{reason:kind});if(kind!=='pause')recorder.finish({result:kind,reason:mission.failureReason||(state.landing?.reasons?.length?state.landing.reasons:null)||mission.abortReason||'',recovered:!!mission.recovered,score:mission.score,touchdown:state.lastTouchdown||null});recorder.flush();paused=true;keys.clear();audio.suspend({radio:kind==='success'||kind==='aborted'});$('overlay').hidden=false;$('resume').hidden=kind!=='pause';$('overlay-label').textContent=kind==='pause'?'REPÜLÉS FELFÜGGESZTVE':'REPÜLÉSI JELENTÉS';$('overlay-title').textContent=kind==='pause'?'Tarts egy szünetet.':kind==='success'?'Küldetés teljesítve.':kind==='failure'?'Küldetés sikertelen.':kind==='aborted'?'Sikeres hazatérés.':'A gép elveszett.';$('overlay-text').textContent=kind==='pause'?'A repülés és a küldetés ideje megállt.':kind==='success'?(mission.spec.objective==='landing'?'Biztonságosan leszálltál és megálltál. A leszállási gyakorlat sikeres.':mission.spec.objective==='escort'?'A civil gép sértetlenül elhagyta a légteret. Sikeresen hazahoztad a gépedet.':'Az elsődleges feladatokat teljesítetted és sikeresen leszálltál.'):kind==='failure'?mission.failureReason:kind==='aborted'?'A küldetés megszakadt, de biztonságosan hazahoztad a gépet.':(state.landing?.reasons?.join(' ')||'Indítsd újra a feladatot, vagy válassz másik gépet a hangárban.');$('overlay-stats').textContent=kind==='success'?`${mission.score} PONT · REKORD ${best} · FÖLDETÉRÉS ${state.landing.descent.toFixed(1)} M/S`:kind==='crash'?`REPÜLT IDŐ ${Math.round(state.elapsed)} S · ${state.training?'LESZÁLLÁSI GYAKORLAT':mission.destroyed?'CÉL MEGSEMMISÍTVE':'CÉL AKTÍV'}`:'';if(kind==='success'&&state.landing?.grade&&state.landing.grade!=='smooth')$('overlay-text').textContent='A feladatokat teljesítetted és megálltál. A földetérés sérüléssel járt; a részleteket a kiértékelés mutatja.';$('mission-debrief').hidden=kind==='pause';$('mission-debrief').innerHTML=kind==='pause'?'':debriefMarkup(recorder.export());if(kind==='pause')$('resume').focus();else{$('overlay-title').focus({preventScroll:true});$('overlay').querySelector('.modal').scrollTop=0;}}
function resume(){if(!playing||(state.crashed&&reported)||mission.complete||mission.failed||mission.recovered)return;recorder.event('resume');paused=false;keys.clear();accumulator=0;$('overlay').hidden=true;$('help').hidden=true;audio.start();headInput.capture();}
function togglePause(){if(!playing||state.crashed||mission.complete||mission.recovered)return;if(paused)resume();else showOverlay('pause');}
function hangar(){headInput.release();if(playing&&!recorder.ended){recorder.capture(state,mission,targets,weapons,aim,logControls(),true);recorder.finish({result:'abandoned',reason:'Visszalépés a hangárba'});}$('fuel-status').hidden=true;playing=false;paused=false;keys.clear();audio.clearEffects();audio.suspend();pointerWheelBrake=false;$('hangar').hidden=false;$('hangar-footer').hidden=false;$('flight-ui').hidden=true;$('overlay').hidden=true;$('help').hidden=true;document.body.classList.remove('flying','approaching','guide-open','wreck-view','landing-practice','navigation-jammed','external-view');$('system-state').textContent='RENDSZER KÉSZ';updatePlanner();}
function help(){if(playing&&!paused)showOverlay('pause');$('help').hidden=!$('help').hidden;}
$('flight-help').onclick=help;$('launch').onclick=launch;$('restart').onclick=launch;$('resume').onclick=resume;$('back').onclick=hangar;$('pause-button').onclick=togglePause;$('approach-button').onclick=toggleApproach;$('landing-route-button').onclick=toggleLandingRoute;$('lock-button').onclick=selectTarget;$('close-guide').onclick=()=>setGuideVisible(false);$('open-guide').onclick=()=>setGuideVisible(true);$('manual').onclick=help;$('close-help').onclick=()=>{$('help').hidden=true;};
addEventListener('resize',()=>renderer.resize());
document.addEventListener('pointerlockchange',()=>headInput.changed());
document.addEventListener('pointerlockerror',()=>headInput.failed());
$('world').addEventListener('click',()=>headInput.capture());
addEventListener('mousemove',e=>headInput.move(e,performance.now()/1000));
addEventListener('mouseout',e=>{if(!e.relatedTarget&&!headInput.locked)headLook.reset();});
addEventListener('keydown',e=>{const k=e.code;if(!playing)return;if(k==='Escape'&&performance.now()-pointerEscapeAt<250)return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(k))e.preventDefault();if(e.repeat)return;if((k==='AltLeft'||k==='AltRight')&&playing&&!paused){e.preventDefault();headInput.release();toast('KURZOR SZABAD · KATTINTS A TÁJRA A NÉZELŐDÉSHEZ');return;}if(k==='KeyP'||k==='Escape'){if(!$('help').hidden){$('help').hidden=true;return;}togglePause();return;}if(k==='KeyH'){help();return;}if(k==='KeyM'){audio.mute();return;}if(paused||state.dying||state.crashed||mission.failed)return;keys.add(k);recorder.event('key',{code:k,pressed:true});if(k==='KeyG')toggleGear();if(k==='KeyX')toggleFlaps();if(k==='KeyC')releaseDecoys();if(k==='Digit5')releaseDecoys('flare');if(k==='Digit6')releaseDecoys('chaff');if(k==='KeyB')toggleAirbrake();if(k==='ShiftLeft'||k==='ShiftRight')toggleAfterburner();if(k==='KeyN')toggleApproach();if(k==='KeyI')toggleLandingRoute();if(k==='KeyV'){headInput.release();renderer.thirdPerson=!renderer.thirdPerson;document.body.classList.toggle('external-view',renderer.thirdPerson);if(!renderer.thirdPerson)headInput.capture();}if(k==='KeyL')toggleAssist();if(k==='Tab'||k==='KeyT')selectTarget();const map={Digit1:'gun',Digit2:'aam',Digit3:'agm',Digit4:'bomb'};if(map[k])selectWeapon(map[k]);});
addEventListener('keyup',e=>{if(keys.has(e.code))recorder.event('key',{code:e.code,pressed:false});keys.delete(e.code);});
addEventListener('blur',()=>{headInput.release();keys.clear();pointerWheelBrake=false;if(playing&&!paused&&!state.crashed&&!mission.complete)showOverlay('pause');});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&!paused)showOverlay('pause');});
function input(){const pressed=(...codes)=>codes.some(k=>keys.has(k))?1:0;return {pitch:pressed('KeyS','ArrowDown')-pressed('KeyW','ArrowUp'),roll:pressed('KeyD','ArrowRight')-pressed('KeyA','ArrowLeft'),yaw:pressed('KeyE')-pressed('KeyQ'),throttle:pressed('KeyR')-pressed('KeyF'),brake:pointerWheelBrake||!!pressed('ControlLeft','ControlRight')};}
function logControls(){return {...input(),fire:keys.has('Space'),keys:[...keys].sort()};}
addEventListener('pagehide',()=>recorder.flush());
function tick(dt){
 stepAircraft(state,input(),dt);recorder.time=state.elapsed;updateTargets(targets,dt);aim.update(state,targets,dt);
 if(keys.has('Space')&&!state.dying&&!state.crashed){const message=weapons.fire(state,targets,aim);if(message)toast(message);}
 const hits=weapons.hits,damageHits=weapons.damageHits||0;weapons.update(state,targets,dt);
 for(const event of weapons.drainEvents()){recorder.event('combat',event);audio.playEvent(event,state,targets);}
 if(weapons.hits>hits)toast(mission.spec.objective==='escort'?'CIVIL GÉP TALÁLATOT KAPOTT — KÜLDETÉS SIKERTELEN':targets.some(t=>t.alive&&t.team!=='ally')?'CÉL MEGSEMMISÍTVE — A TÖBBI CÉLPONT MÉG AKTÍV':'MINDEN CÉL HARCKÉPTELEN — TÉRJ VISSZA A BÁZISRA',8);
 else if((weapons.damageHits||0)>damageHits)toast('TALÁLAT — A CÉL SÉRÜLT');
 mission.update(state,targets,weapons,aim);recorder.capture(state,mission,targets,weapons,aim,logControls());
 const crashReportReady=advanceCrashSequence(state,dt);
 document.body.classList.toggle('wreck-view',state.dying||state.crashed);if((state.dying||state.crashed)&&headInput.wanted)headInput.release();
 if((crashReportReady||mission.complete||mission.failed||mission.recovered)&&!reported){
  reported=true;if(mission.complete){best=Math.max(best,mission.score);try{localStorage.setItem('vector-flight-best',String(best));}catch{}}
  showOverlay(state.crashed?'crash':mission.failed?'failure':mission.recovered?'aborted':'success');
 }
}
function frame(time){const delta=Math.min((time-last)/1000,.1);last=time;if(playing){if(!paused&&!state.dying&&!state.crashed&&!renderer.thirdPerson)headLook.update(delta,time/1000);else headLook.reset();state.headLook={yawDeg:headLook.yaw*180/Math.PI,pitchDeg:headLook.pitch*180/Math.PI};if(!paused){accumulator+=delta;while(accumulator>=STEP&&!paused){tick(STEP);accumulator-=STEP;}}renderer.render(state,targets,weapons,aim);uiElapsed+=delta;if(uiElapsed>.1){uiElapsed=0;updateHUD(state,targets,weapons,aim,mission,audio.muted);}audio.update(state,aim,!paused,mission,targets);}else{renderer.idle(time/1000);renderAircraftPreview($('aircraft-art'),selected,matchMedia('(prefers-reduced-motion: reduce)').matches?0:time/1000);for(const canvas of $('mission-gallery').querySelectorAll('canvas')){const id=canvas.dataset.previewUnit;renderTargetPreview(canvas,{id,kind:unitDefinition(id).kind},selected,matchMedia('(prefers-reduced-motion: reduce)').matches?0:time/1000);}}requestAnimationFrame(frame);}
updatePlanner();requestAnimationFrame(frame);







