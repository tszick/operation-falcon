import {wingmanLine,numberWords} from '../src/wingmanRadio.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {RadioDirector} from '../src/radioDirector.js';import {RadioComms} from '../src/radioComms.js';import {radioLines} from '../src/radioLines.js';import {AudioSystem} from '../src/audio.js';import {Vec3} from '../src/math.js';
function scene(){return {s:{elapsed:0,onGround:true,airborne:false,speed:0,damage:0,condition:{parts:{weapons:1}},position:new Vec3(),velocity:new Vec3(),spec:{faction:'nato'}},m:{spec:{objective:'battle'},phaseId:'preflight',objectiveComplete:false},targets:[]};}
const has=(d,group)=>d.queue.some(c=>c.line.group===group);
test('takeoff and military departure lines are one-shot; civil intercept never receives good hunting',()=>{
 const {s,m,targets}=scene(),d=new RadioDirector();d.start(s,m,targets);assert.ok(has(d,'clearance'));s.airborne=true;s.onGround=false;m.departed=true;s.elapsed=2;d.observe(s,m,targets);s.elapsed=3;d.observe(s,m,targets);assert.equal(d.queue.filter(c=>c.line.group==='hunt').length,1);
 m.spec.objective='escort';d.start(s,m,targets);assert.ok(has(d,'civil'));assert.ok(!has(d,'hunt'));m.civilIntercepted=true;s.elapsed=4;d.observe(s,m,targets);s.elapsed=5;d.observe(s,m,targets);assert.equal(d.queue.filter(c=>c.line.group==='civilPilot').length,1);
});
test('SAM warning identifies an actual hostile missile aimed at the player; allied or other-target launches do not warn',()=>{
 const {s,m,targets}=scene(),d=new RadioDirector();targets.push({id:'SAM',kind:'ground',alive:true});const event={type:'missile-launch',owner:'enemy',sourceId:'SAM',targetId:'ALLY'};d.event(event,s,targets);assert.ok(!has(d,'sam'));event.targetId='PLAYER';event.owner='ally';d.event(event,s,targets);assert.ok(!has(d,'sam'));event.owner='enemy';d.event(event,s,targets);assert.ok(has(d,'sam'));for(let i=0;i<100;i++)d.event(event,s,targets);assert.equal(d.queue.filter(c=>c.key==='incoming-missile').length,1);
});
test('player weapon calls are throttled independently and enemy gunfire never triggers player speech',()=>{
 const {s,targets}=scene(),d=new RadioDirector();d.event({type:'gun',owner:'enemy',sourceId:'ENEMY',targetId:'PLAYER'},s,targets);assert.equal(d.queue.length,0);const e={type:'gun',sourceId:'PLAYER'};for(let i=0;i<100;i++)d.event(e,s,targets);assert.equal(d.queue.length,1);const first=d.take(0);d.completed(first,0);s.elapsed=29;d.event(e,s,targets);assert.equal(d.queue.length,0);s.elapsed=31;d.event(e,s,targets);assert.ok(has(d,'gun'));d.event({type:'missile-launch',sourceId:'PLAYER'},s,targets);assert.ok(has(d,'launch'));d.event({type:'bomb-release',sourceId:'PLAYER'},s,targets);assert.ok(has(d,'bomb'));
});
test('minor damage and empty ammunition do not request RTB, but structural or actual weapon-system failure does',()=>{
 const {s,m,targets}=scene(),d=new RadioDirector();s.airborne=true;s.onGround=false;s.damage=19;s.ammo={gun:0,aam:0};d.observe(s,m,targets);assert.ok(!has(d,'damage')&&!has(d,'weaponsFailed'));s.damage=40;s.elapsed=1;d.observe(s,m,targets);assert.ok(has(d,'damage'));d.reset();s.damage=10;s.condition.parts.weapons=.35;d.observe(s,m,targets);assert.ok(has(d,'weaponsFailed'));
});
test('primary objectives generate congratulations once while airborne, then Mayday preempts all routine traffic',()=>{
 const {s,m,targets}=scene(),d=new RadioDirector();s.airborne=true;s.onGround=false;m.objectiveComplete=true;m.phaseId='return';d.observe(s,m,targets);assert.ok(has(d,'success'));assert.ok(!has(d,'return'));s.elapsed=1;d.observe(s,m,targets);assert.equal(d.queue.filter(c=>c.line.group==='success').length,1);s.dying=true;s.elapsed=2;d.observe(s,m,targets);assert.equal(d.queue.length,1);assert.ok(has(d,'mayday'));s.crashed=true;s.elapsed=3;d.observe(s,m,targets);assert.equal(d.queue.length,0);assert.equal(d.stopRequested,true);
});
test('Falcon Two speaks only for an allied fighter and reports its own incoming fire and loss once',()=>{
 const {s,m,targets}=scene(),d=new RadioDirector();d.start(s,m,targets);assert.ok(!has(d,'wingmanReady'));const ally={id:'TWO',type:'fighter',kind:'air',team:'ally',alive:true,position:new Vec3(1000,500,0),flight:{damage:0}};targets.push(ally);d.start(s,m,targets);assert.ok(has(d,'wingmanReady'));d.event({type:'missile-launch',owner:'enemy',targetId:'TWO'},s,targets);assert.ok(has(d,'wingmanAttack'));assert.ok(!has(d,'missile'));ally.flight.dying=true;s.elapsed=1;d.observe(s,m,targets);s.elapsed=2;d.observe(s,m,targets);assert.equal(d.queue.filter(c=>c.line.group==='wingmanDown').length,1);assert.ok(!has(d,'wingmanAttack'));
});
test('welcome requires a successful landing and full stop, never approach, takeoff, rolling or a crash',()=>{
 const {s,m,targets}=scene(),d=new RadioDirector();m.spec.objective='landing';d.observe(s,m,targets);assert.ok(!has(d,'welcome'));s.airborne=true;s.onGround=false;s.elapsed=1;s.landing={success:true};d.observe(s,m,targets);assert.ok(!has(d,'welcome'));s.onGround=true;s.speed=20;s.elapsed=2;d.observe(s,m,targets);assert.ok(!has(d,'welcome'));s.speed=0;s.elapsed=2.01;d.observe(s,m,targets);assert.ok(has(d,'welcome'));s.elapsed=3;d.observe(s,m,targets);assert.equal(d.queue.filter(c=>c.line.group==='welcome').length,1);d.reset();s.crashed=true;d.observe(s,m,targets);assert.ok(!has(d,'welcome'));
});
test('radio uses one voice at a time, urgent traffic preempts, and captions happen only when audio starts',()=>{
 const {s,m,targets}=scene(),radio=new RadioComms(),sources=[],captions=[];radio.ctx={currentTime:0,createBufferSource(){const node={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(node);return node;}};radio.output={gain:{setTargetAtTime(){}}};for(const line of radioLines)radio.buffers.set(line.id,{});radio.onLine=line=>captions.push(line.id);radio.director.issue('gun',0,{priority:35});assert.equal(captions.length,0);radio.update(s,m,targets);assert.equal(sources.length,1);radio.update(s,m,targets);assert.equal(sources.length,1);radio.director.issue('sam',0,{priority:100});radio.update(s,m,targets);assert.equal(sources[0].stopped,true);assert.equal(sources.length,2);assert.equal(captions.length,2);radio.setMuted(true);assert.equal(sources[1].stopped,true);assert.equal(radio.director.queue.length,0);
});
test('successful debrief keeps the radio active while a manual pause does not',()=>{
 const audio=new AudioSystem(),{s,m,targets}=scene();let options;audio.radio={update(a,b,c,o){options=o;}};s.airborne=true;s.onGround=true;s.landing={success:true};m.complete=true;audio.update(s,{},false,m,targets);assert.equal(options.active,true);m.complete=false;audio.update(s,{},false,m,targets);assert.equal(options.active,false);
});
test('every radio line has a real, non-silent, unclipped mono PCM asset with matching duration',async()=>{
 assert.ok(radioLines.length>=36);const speakers=new Set();for(const line of radioLines){speakers.add(line.speaker);const bytes=await readFile(new URL('..'+line.url,import.meta.url));assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');assert.equal(bytes.readUInt16LE(22),1);const rate=bytes.readUInt32LE(24),frames=(bytes.length-44)/2;assert.ok(Math.abs(frames/rate-line.duration)<.002);let peak=0,energy=0;for(let i=44;i<bytes.length;i+=2){const v=bytes.readInt16LE(i)/32768;peak=Math.max(peak,Math.abs(v));energy+=v*v;}assert.ok(peak>.1&&peak<.96);assert.ok(Math.sqrt(energy/frames)>.04);}assert.equal(speakers.size,4);
});

test('navigation-loss call follows actual hostile jamming entry, with boundary cooldown and no friendly/dead alerts',()=>{
 const {s,m,targets}=scene(),d=new RadioDirector(),jammer={id:'JAM',type:'jammer',team:'enemy',alive:true,jamRadius:7000,position:new Vec3(8000,0,0)};targets.push(jammer);
 d.observe(s,m,targets);assert.ok(!has(d,'jammed'));
 jammer.position.x=6000;s.elapsed=1;d.observe(s,m,targets);assert.ok(has(d,'jammed'));const first=d.take(1);assert.equal(first.line.speaker,'pilot');d.completed(first,1);
 s.elapsed=2;d.observe(s,m,targets);assert.ok(!has(d,'jammed'));
 jammer.position.x=8000;s.elapsed=3;d.observe(s,m,targets);jammer.position.x=6000;s.elapsed=4;d.observe(s,m,targets);assert.ok(!has(d,'jammed'));
 s.elapsed=50;d.observe(s,m,targets);assert.ok(!has(d,'jammed'));
 jammer.position.x=8000;s.elapsed=51;d.observe(s,m,targets);jammer.position.x=6000;s.elapsed=52;d.observe(s,m,targets);assert.ok(has(d,'jammed'));
 d.reset();jammer.team='ally';d.observe(s,m,targets);assert.ok(!has(d,'jammed'));jammer.team='enemy';jammer.alive=false;s.elapsed=53;d.observe(s,m,targets);assert.ok(!has(d,'jammed'));
 d.reset();jammer.alive=true;d.observe(s,m,targets);assert.ok(has(d,'jammed'));
});

test('sustained descending stall calls for recovery before fatal damage, but brief stalls and ground roll do not',()=>{
 const {s,m,targets}=scene(),d=new RadioDirector();s.spec.stallAlpha=.3;s.alpha=.5;s.speed=90;s.velocity.y=-15;
 d.observe(s,m,targets);assert.ok(!has(d,'stall'));s.airborne=true;s.onGround=false;s.elapsed=1;d.observe(s,m,targets);s.alpha=0;s.elapsed=2;d.observe(s,m,targets);assert.ok(!has(d,'stall'));
 s.alpha=.5;s.elapsed=3;d.observe(s,m,targets);s.elapsed=4.5;d.observe(s,m,targets);assert.ok(has(d,'stall'));assert.equal(s.dying,undefined);assert.equal(d.peek(4.5).priority,110);
 s.alpha=0;s.elapsed=5;d.observe(s,m,targets);assert.ok(!has(d,'stall'));
 d.reset();s.alpha=.5;s.velocity.y=2;d.observe(s,m,targets);s.elapsed=10;d.observe(s,m,targets);assert.ok(!has(d,'stall'));
});
test('severe control failure announces loss before descent or fatal state, with cooldown and recovery cancellation',()=>{
 const {s,m,targets}=scene(),d=new RadioDirector();s.airborne=true;s.onGround=false;s.velocity.y=0;s.condition.parts={leftWing:1,rightWing:1,tail:1,fuselage:1,hydraulics:0,engineLeft:1,engineRight:1,weapons:1};
 d.observe(s,m,targets);s.elapsed=1;d.observe(s,m,targets);assert.ok(has(d,'controlLost'));const cue=d.take(1);d.completed(cue,1);s.elapsed=2;d.observe(s,m,targets);assert.ok(!has(d,'controlLost'));
 s.condition.parts.hydraulics=1;s.elapsed=3;d.observe(s,m,targets);s.condition.parts.hydraulics=0;s.elapsed=4;d.observe(s,m,targets);s.elapsed=5;d.observe(s,m,targets);assert.ok(!has(d,'controlLost'));
 s.elapsed=47;d.observe(s,m,targets);assert.ok(has(d,'controlLost'));s.onGround=true;s.elapsed=48;d.observe(s,m,targets);assert.ok(!has(d,'controlLost'));
});

test('intermediate servicing welcomes and clears for another sortie, resetting damage-return announcements',()=>{
 const {s,m,targets}=scene(),d=new RadioDirector();s.airborne=true;s.onGround=false;s.damage=45;d.observe(s,m,targets);assert.ok(has(d,'damage'));m.serviceCount=1;s.onGround=true;s.airborne=false;s.damage=0;s.elapsed=10;d.observe(s,m,targets);assert.ok(!has(d,'damage'));assert.ok(has(d,'welcome'));assert.ok(has(d,'clearance'));assert.ok(!d.seen.has('damaged-return'));s.elapsed=11;d.observe(s,m,targets);assert.equal(d.queue.filter(c=>c.line.group==='welcome').length,1);s.onGround=false;s.airborne=true;s.damage=45;s.elapsed=12;d.observe(s,m,targets);assert.ok(has(d,'damage'));
});

function friendly(id){return {id,type:'fighter',kind:'air',team:'ally',alive:true,position:new Vec3(1000,500,0),velocity:new Vec3(),flight:{damage:0}};}
test('all wingmen get stable sequential callsigns and individual ready messages, including late arrivals',()=>{
 const {s,m,targets}=scene(),d=new RadioDirector();targets.push(friendly('A'),friendly('B'),friendly('C'));d.start(s,m,targets);
 const ready=d.queue.filter(c=>c.line.group==='wingmanReady');assert.deepEqual(ready.map(c=>c.line.callSign),['Falcon Two','Falcon Three','Falcon Four']);assert.equal(new Set(ready.map(c=>c.key)).size,3);assert.ok(ready.every(c=>c.line.text.includes(c.line.callSign)));assert.deepEqual(ready.map(c=>c.ready),[6,10,14]);
 targets.reverse();s.elapsed=2;d.observe(s,m,targets);assert.equal(d.wingmen.get('A').number,2);assert.equal(d.wingmen.get('C').number,4);
 targets.push(friendly('D'));s.elapsed=3;d.observe(s,m,targets);assert.equal(d.wingmen.get('D').number,5);assert.ok(d.queue.some(c=>c.line.callSign==='Falcon Five'&&c.line.group==='wingmanReady'));
});
test('attack cooldowns and down messages are per aircraft; one loss preserves another pilot traffic',()=>{
 const {s,m,targets}=scene(),d=new RadioDirector();targets.push(friendly('A'),friendly('B'));d.start(s,m,targets);
 for(const id of ['A','B'])d.event({type:'missile-launch',owner:'enemy',targetId:id},s,targets);
 assert.equal(d.queue.filter(c=>c.line.group==='wingmanAttack').length,2);targets[0].flight.dying=true;s.elapsed=1;d.observe(s,m,targets);
 assert.ok(d.queue.some(c=>c.line.group==='wingmanAttack'&&c.line.unitId==='B'));assert.ok(d.queue.some(c=>c.line.group==='wingmanReady'&&c.line.unitId==='B'));assert.ok(!d.queue.some(c=>c.line.unitId==='A'&&c.line.group!=='wingmanDown'));
 targets[1].flight.dying=true;s.elapsed=2;d.observe(s,m,targets);s.elapsed=3;d.observe(s,m,targets);
 const losses=d.queue.filter(c=>c.line.group==='wingmanDown');assert.equal(losses.length,2);assert.deepEqual(losses.map(c=>c.line.callSign),['Falcon Two','Falcon Three']);
});
test('generated callsign audio covers additional wingmen without a fixed small squadron limit',()=>{
 for(const n of [3,4,9,10,12,21,104,1000,12003,1000000]){const line=wingmanLine('wingmanAttack',n,'ALLY-'+n);assert.ok(line.text.startsWith(line.callSign));assert.ok(line.duration>0);assert.ok(line.clips.every(id=>radioLines.some(c=>c.id===id)));}
 assert.deepEqual(numberWords(23),['twenty','three']);assert.equal(wingmanLine('wingmanReady',2,'A').url,'/assets/radio/wingman-ready-1.wav');
});
test('numbered wingman speech joins real PCM clips and caches the matching audible line',async()=>{
 const radio=new RadioComms(),line=wingmanLine('wingmanDown',3,'ALLY3');let created=0,total=0;
 for(const id of line.clips){const part=radioLines.find(l=>l.id===id),bytes=await readFile(new URL('..'+part.url,import.meta.url)),rate=bytes.readUInt32LE(24),length=(bytes.length-44)/2,data=new Float32Array(length);for(let i=0;i<length;i++)data[i]=bytes.readInt16LE(44+i*2)/32768;radio.buffers.set(id,{sampleRate:rate,length,getChannelData:()=>data});total+=length;}
 radio.ctx={createBuffer(ch,length,rate){created++;const data=new Float32Array(length);return {sampleRate:rate,length,getChannelData:()=>data};}};
 const buffer=radio.lineBuffer(line);assert.ok(buffer.length>total);assert.ok(Math.abs(buffer.length/buffer.sampleRate-line.duration)<.01);assert.ok(buffer.getChannelData(0).some(v=>Math.abs(v)>.1));assert.equal(radio.lineBuffer(line),buffer);assert.equal(created,1);assert.equal(line.callSign,'Falcon Three');assert.match(line.text,/Mayday/);
});
