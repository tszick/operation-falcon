import test from 'node:test';
import assert from 'node:assert/strict';
import {aircraft} from '../src/aircraftSpec.js';
import {createAircraft} from '../src/physics.js';
import {Vec3,Quat,DEG} from '../src/math.js';
import {evaluateApproach} from '../src/landing.js';
import {landingAttitude,landingAttitudeMarkup} from '../src/landingAttitude.js';
function approach(north=false){const s=createAircraft(aircraft[0]);s.onGround=false;s.airborne=true;s.landingMode='on';s.position=new Vec3(0,107,north?3600:-3600);s.orientation=Quat.euler(north?Math.PI:0,3*DEG,0);s.velocity=new Vec3(0,-4,north?-75:75);s.approach=evaluateApproach(s);return s;}
test('landing instrument aligns at either runway end and distinguishes descent from nose attitude',()=>{for(const north of[false,true]){const s=approach(north),a=landingAttitude(s);assert.ok(Math.abs(a.heading)<1e-9);assert.ok(Math.abs(a.track)<1e-9);assert.ok(Math.abs(a.pitch-3)<1e-9);assert.equal(a.noseOK,true);assert.ok(a.descent>0);assert.equal(a.runway,north?'180':'000');assert.match(landingAttitudeMarkup(s),/ORRHELYZET RENDBEN/);}});
test('ground track and heading remain separate, with signed bank and pitch warnings',()=>{const s=approach();s.orientation=Quat.euler(10*DEG,-5*DEG,-12*DEG);s.velocity.x=-15;const a=landingAttitude(s);assert.ok(a.heading>9.9&&a.track<0);assert.ok(a.bank<-11.9);assert.equal(a.bankOK,false);assert.equal(a.nose,'ORR TÚL LENT');assert.equal(a.noseOK,false);s.orientation=Quat.euler(0,17*DEG,0);assert.equal(landingAttitude(s).nose,'ORR TÚL MAGASAN');});
test('no landing helper outside airborne approach or during terminal crash',()=>{for(const key of['onGround','dying','crashed']){const s=approach();s[key]=true;assert.equal(landingAttitude(s),null);assert.equal(landingAttitudeMarkup(s),'');}const s=approach();s.approach.active=false;assert.equal(landingAttitude(s),null);});
