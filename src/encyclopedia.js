import {unitTypes} from './unitTypes.js';
import {aircraft} from './aircraftSpec.js';
import {renderAircraftPreview,renderTargetPreview} from './renderer.js';
import {armament} from './armament.js';
import {threatTypes} from './threats.js';
const $=id=>document.getElementById(id),player=aircraft.find(a=>a.id==='f16'),entries=[...Object.entries(unitTypes).map(([id,unit])=>({id,unit,kind:unit.kind,name:unit.name,category:unit.category})),...[['b52','B-52 Stratofortress','bomber'],['tu95','Tu-95 Bear','bomber'],['c130','C-130 Hercules','transport'],['il76','Il-76 Candid','transport']].map(([id,name,type])=>({id,name,modelId:id,unit:unitTypes[type],kind:'air',category:unitTypes[type].category})),...aircraft.map(spec=>({id:spec.id,spec,kind:'air',name:spec.name,category:'Választható repülőgép'}))];
let selected=entries[0];
function list(){const filter=$('library-filter').value;$('library-list').innerHTML=entries.filter(e=>filter==='all'||e.kind===filter).map(e=>`<button data-unit="${e.id}" aria-pressed="${e===selected}">${e.name}<small>${e.category}</small></button>`).join('');}
function detail(){
 $('unit-category').textContent=selected.category;$('unit-name').textContent=selected.name;$('unit-art').setAttribute('aria-label',selected.name+' forgó térbeli előnézete');let rows;
 if(selected.spec){const a=selected.spec,preset=armament(a);$('unit-description').textContent=`${a.role}. ${preset.variant}. Ugyanaz a térbeli modell és fegyverkészlet szerepel az adatlapon és a repülésben.`;rows=[['Szerep',a.role],['Maximális sebesség',`Mach ${a.maxMach.toFixed(2)}`],['Terhelési határ',`${a.maxG} G`],['Üres tömeg',`${a.emptyMass.toLocaleString('hu')} kg`],['Üzemanyag',`${a.fuelCapacity.toLocaleString('hu')} kg`],['Radar',`${a.radarRange/1000} km · ${a.radarCone}° félkúp`],['Csúcsmagasság',`${a.ceiling/1000} km`],['Fegyverzet',Object.values(preset.weapons).map(w=>`${w.name} × ${w.quantity}`).join(' · ')]];}
 else{const u=selected.unit;$('unit-description').textContent=u.description;rows=[['Osztály',u.category],['Feladat',u.role],['Fegyverek',u.weapons.map(w=>threatTypes[w].name).join(' · ')||'Nem tüzel'],...(u.health?[['Szerkezeti pont',u.health]]:[]),...(u.speed?[['Haladási sebesség',`${Math.round(u.speed*3.6)} km/h`]]:[]),...(u.range?[['Zavarási sugár',`${u.range/1000} km`]]:[]),...(u.size?[['Kiterjedés',u.size]]:[]),['Irányítás','Gépi vezérlés, a küldetésben kiosztott oldalon']];}
 $('unit-data').innerHTML=rows.map(([key,value])=>`<tr><th scope="row">${key}</th><td>${value}</td></tr>`).join('');list();
}
function choose(id){selected=entries.find(e=>e.id===id)||entries[0];detail();}
$('library-list').onclick=e=>{const button=e.target.closest('[data-unit]');if(button)choose(button.dataset.unit);};$('library-filter').onchange=list;
function frame(time){const t=matchMedia('(prefers-reduced-motion: reduce)').matches?0:time/1000;if(selected.modelId)renderAircraftPreview($('unit-art'),{id:selected.modelId},t);else if(selected.spec)renderAircraftPreview($('unit-art'),selected.spec,t);else renderTargetPreview($('unit-art'),{id:selected.id,kind:selected.kind},player,t);requestAnimationFrame(frame);}detail();requestAnimationFrame(frame);
