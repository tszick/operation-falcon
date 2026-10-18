import {radioLines} from './radioLines.js';
import {RadioDirector} from './radioDirector.js';
export class RadioComms {
 constructor(){this.director=new RadioDirector();this.buffers=new Map();this.failed=new Set();this.current=null;this.generation=0;this.enabled=true;this.now=0;}
 attach(ctx){if(this.ctx===ctx)return;this.ctx=ctx;this.output=ctx.createGain();this.output.gain.value=.68;this.output.connect(ctx.destination);this.loading=Promise.allSettled(radioLines.map(async line=>{try{const response=await fetch(line.url);if(!response.ok)throw new Error('Radio clip '+response.status);const buffer=await ctx.decodeAudioData(await response.arrayBuffer());this.buffers.set(line.id,buffer);}catch{this.failed.add(line.id);}}));}
 stop(){const current=this.current;this.current=null;if(current){current.source.onended=null;try{current.source.stop();}catch{}current.source.disconnect();}}
 reset(){this.stop();this.generation++;this.director.reset();}
 startMission(s,mission,targets){this.reset();this.now=s.elapsed||0;this.director.start(s,mission,targets);}
 event(event,s,targets,muted=false){if(!muted)this.director.event(event,s,targets);}
 setMuted(muted){this.enabled=!muted;if(muted){this.stop();this.director.queue=[];this.director.current=null;}if(this.ctx)this.output.gain.setTargetAtTime(muted?0:.68,this.ctx.currentTime,.02);}
 update(s,mission,targets,{muted=false,active=true}={}){
  this.now=s.elapsed||0;if(active)this.director.observe(s,mission,targets);
  if(muted){this.setMuted(true);return;}this.enabled=true;if(!this.ctx||!active)return;this.output.gain.setTargetAtTime(.68,this.ctx.currentTime,.025);
  if(this.director.stopRequested){this.stop();return;}
  let next=this.director.peek(this.now);if(this.current){if(!next||next.priority<90||next.priority<=this.current.cue.priority)return;this.stop();this.director.current=null;}
  if(!next)return;if(this.failed.has(next.line.id)){this.director.take(this.now);this.director.current=null;return;}const buffer=this.buffers.get(next.line.id);if(!buffer)return;
  const cue=this.director.take(this.now),source=this.ctx.createBufferSource(),record={source,cue,generation:this.generation};source.buffer=buffer;source.connect(this.output);this.current=record;
  source.onended=()=>{source.disconnect();if(this.current!==record||record.generation!==this.generation)return;this.current=null;this.director.completed(cue,this.now);};source.start();this.onLine?.(cue.line,this.now);
 }
}
