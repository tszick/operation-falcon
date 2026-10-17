import {evaluateFlight} from './flightDebrief.js';
export function analyzeFlight(log){
 const entries=log?.entries||[],samples=entries.filter(e=>e.kind==='sample'),end=entries.at(-1)?.t||0,phases=entries.filter(e=>e.kind==='phase').map((e,i,all)=>({label:e.data.label,start:e.t,end:all[i+1]?.t??end,duration:(all[i+1]?.t??end)-e.t})),touchdown=entries.filter(e=>e.kind==='touchdown').at(-1)?.data,last=samples.at(-1)?.data.player;
 const observations=[];
 if(log?.metadata?.mission?.objective!=='landing')observations.push('A gyakorlathoz képest több üzemanyag, megmaradt fegyverzet és sérülés is módosíthatja a tömeget, a célsebességet és az irányíthatóságot.');
 if(touchdown){if(touchdown.problems?.length)observations.push(...touchdown.problems);else observations.push('A földetérés a rögzített ellenőrzések szerint sikeres volt.');if(touchdown.damage>0)observations.push(`Sérülés földetéréskor: ${touchdown.damage.toFixed(1)}%.`);if(touchdown.afterburner)observations.push('Földetéréskor az utánégető aktív volt.');if(touchdown.flapPosition<.95)observations.push('A fékszárny nem volt teljesen kiengedve.');}
 else observations.push('Még nincs rögzített földetérési kísérlet.');
 return {samples,end,phases,touchdown,last,observations,debrief:evaluateFlight(log),events:entries.filter(e=>!['sample','world'].includes(e.kind)),result:entries.filter(e=>e.kind==='mission-end').at(-1)?.data};
}
