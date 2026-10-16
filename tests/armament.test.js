import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft,loadout} from '../src/aircraftSpec.js';
import {armament,loadedStations,nextStation} from '../src/armament.js';
import {createAircraft} from '../src/physics.js';
import {Weapons} from '../src/weapons.js';
import {Targeting} from '../src/targeting.js';
import {storesMarkup} from '../src/storesDisplay.js';
import {phaseGuide} from '../src/phaseGuide.js';
const plane=id=>createAircraft(aircraft.find(s=>s.id===id));
test('every aircraft has a named variant and one physical station per carried missile/bomb',()=>{
 for(const spec of aircraft){const p=armament(spec),ammo=loadout(spec);assert.ok(p.variant);for(const type of ['aam','agm','bomb'])assert.equal(ammo[type],p.stations.filter(s=>s.type===type).length,spec.id);assert.ok(Object.values(p.weapons).every(w=>w.name&&w.quantity>0));assert.ok(p.stations.every(s=>Number.isFinite(s.x)&&Number.isFinite(s.z)));}
});
test('MiG-25PD has missiles but no gun; incompatible selection and direct fire are blocked',()=>{
 const s=plane('mig25'),w=new Weapons();assert.equal(s.ammo.gun,0);assert.equal(w.select(s,'gun'),false);s.ammo.gun=100;w.selected='gun';assert.match(w.fire(s,[],new Targeting()),/NINCS FELSZERELVE/);assert.equal(w.projectiles.length,0);assert.equal(s.ammo.gun,100);
});
test('fighter and strike variants do not inherit generic incompatible weapons',()=>{
 assert.equal(plane('f15').ammo.bomb,0);assert.equal(plane('tornado').ammo.agm,0);assert.equal(plane('mig29').ammo.agm,0);assert.equal(plane('rafale').ammo.agm,0);assert.ok(plane('a10').ammo.aam>0);assert.ok(plane('su25').ammo.aam>0);
});
test('a shot leaves its own station empty and the next shot uses the opposite side',()=>{
 const s=plane('f16'),w=new Weapons(),aim=new Targeting();w.selected='bomb';const first=nextStation(s,'bomb');assert.equal(first.x<0,true);w.fire(s,[],aim);assert.equal(w.projectiles[0].position.x,first.x);assert.equal(loadedStations(s).find(t=>t.index===first.index).loaded,false);assert.ok(nextStation(s,'bomb').x>0);w.cooldown=0;w.fire(s,[],aim);assert.equal(nextStation(s,'bomb'),undefined);assert.equal(w.select(s,'bomb'),false);assert.equal(w.projectiles.length,2);
});
test('stores display lists only carried weapons, highlights selection and marks empty stations',()=>{
 const s=plane('mig25'),html=storesMarkup(s,'aam');assert.match(html,/R-40/);assert.doesNotMatch(html,/data-weapon="gun"/);assert.match(html,/aria-pressed="true"/);s.ammo.aam=0;assert.match(storesMarkup(s,'aam'),/store empty/);assert.match(storesMarkup(s,'aam'),/disabled/);
});
test('phase help suggests an available weapon rather than an absent generic ground missile',()=>{
 const s=plane('tornado'),w=new Weapons();w.selected='aam';const steps=phaseGuide(s,{phaseId:'ground-attack',spec:{kind:'ground'}},new Targeting(),w,[]);assert.equal(steps[0].key,'4');assert.equal(steps[0].text,'Mk 82');
});
