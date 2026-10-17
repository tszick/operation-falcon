const terminal=new Set(['complete','failed','recovered']);
const statusLabels={good:'ADATOK SZERINT RENDBEN',attention:'JAVÍTANDÓ',failed:'SIKERTELEN',incomplete:'FÉLBEMARADT',unknown:'NINCS ELÉG ADAT'};
const one=n=>Number(n).toFixed(1),clock=t=>`${Math.floor(t/60)}:${Math.floor(t%60).toString().padStart(2,'0')}`;
export function evaluateFlight(log){
 const entries=log?.entries||[],result=entries.findLast(e=>e.kind==='mission-end')?.data||log?.metadata?.result;
 const end=entries.at(-1)?.t||0,phaseEvents=entries.filter(e=>e.kind==='phase'),allSamples=entries.filter(e=>e.kind==='sample');
 const phases=phaseEvents.map((event,i)=>{
  const start=event.t,finish=phaseEvents[i+1]?.t??end,id=event.data.id;
  const events=entries.filter(e=>!['sample','world'].includes(e.kind)&&((e.t>=start&&e.t<finish&&!(e.kind==='touchdown'&&i>0&&e.t===start))||(e.kind==='touchdown'&&e.t===finish)));
  const samples=allSamples.filter(e=>e.t>=start&&e.t<finish&&e.data.player&&!e.data.player.crashed);
  const findings=[],facts=[];let status=samples.length?'good':'unknown';
  const durationWhere=predicate=>samples.reduce((total,e,j)=>total+(predicate(e.data.player)?Math.min(.2,Math.max(0,(samples[j+1]?.t??finish)-e.t)):0),0);
  const issue=(text,seconds)=>{if(seconds>=1){findings.push(`${text} (${one(seconds)} s).`);status='attention';}};
  issue('Átesésjelzés; kisebb állásszög és megfelelő sebesség szükséges',durationWhere(p=>p.warning==='ÁTESÉS'));
  issue('A megengedett terhelés túllépése; enyhíts a manőveren',durationWhere(p=>p.g>(log?.metadata?.aircraft?.maxG??Infinity)));
  if(['landing','flare'].includes(id)){
   issue('A célsebesség-tartomány alatt repültél; finom gázadás szükséges',durationWhere(p=>p.approach?.active&&p.iasKmh<p.approach.minSpeed));
   issue('A célsebesség-tartomány fölött repültél; időben lassíts',durationWhere(p=>p.approach?.active&&p.iasKmh>p.approach.maxSpeed));
   issue('Alacsonyan túl nagy volt a süllyedés; finoman vedd szintbe a gépet',durationWhere(p=>p.aglM<35&&p.verticalSpeedMps<=-3));
   issue('Célsebességnél nyitva maradt a légfék; B-vel zárd vissza',durationWhere(p=>p.airbrake&&p.iasKmh<=p.approach?.targetSpeed+15));
   issue('A végső megközelítésben nem volt kint a futómű',durationWhere(p=>p.aglM<100&&!p.gear));
   issue('A végső megközelítésben nem nyílt ki teljesen a fékszárny',durationWhere(p=>p.aglM<100&&p.flapPosition<.95));
   issue('A kifutó irányától vagy tengelyétől eltértél',durationWhere(p=>p.approach?.active&&(Math.abs(p.approach.headingError)>8||Math.abs(p.position.x)>45)));
  }
  const hits=events.filter(e=>e.kind==='combat'&&e.data.type==='target-hit'&&e.data.sourceId==='PLAYER');
  const launches=events.filter(e=>e.kind==='combat'&&['missile-launch','bomb-release','gun'].includes(e.data.type)&&e.data.sourceId==='PLAYER');
  if(launches.length)facts.push(`${launches.length} rögzített fegyverhasználat; ${hits.length} közvetlen találati esemény. Az ágyúsorozat több eseményből állhat.`);
  const denied=[...new Set(events.filter(e=>e.kind==='message'&&typeof e.data==='string'&&/ELŐBB FOGD BE|NEM EHHEZ A CÉLHOZ|LŐTÁVON KÍVÜL|NINCS FELSZERELVE|RAKÉTAINDÍTÁS TILTVA/.test(e.data)).map(e=>e.data))];
  if(denied.length){findings.push(...denied.map(x=>`Rögzített tüzelési akadály: ${x}`));status='attention';}
  const playerHits=events.filter(e=>e.kind==='combat'&&e.data.type==='damage-hit'&&e.data.targetId==='PLAYER');if(playerHits.length)facts.push(`${playerHits.length} ellenséges találati esemény érte a gépet.`);
  if(events.some(e=>e.kind==='target-lock'&&e.data.locked))facts.push('Sikeres célbefogás rögzítve.');
  const touchdown=events.findLast(e=>e.kind==='touchdown')?.data;
  if(touchdown){
   facts.push(`Földetérés: ${one(touchdown.iasKmh)} km/h IAS, ${one(touchdown.sinkMps)} m/s süllyedés; orr ${one(touchdown.pitchDeg)}°, bedöntés ${one(touchdown.bankDeg)}°.`);
   if(touchdown.success===false){status='failed';findings.push(...(touchdown.problems||[]));}
   else if(touchdown.grade&&touchdown.grade!=='smooth'){status='attention';findings.push(`Túlélt ${touchdown.grade==='severe'?'súlyos':'kemény'} földetérés; ${one(touchdown.impactDamage||0)}% új sérülés.`,...(touchdown.problems||[]));}
   else facts.push('Sikeres földetérés.');
  }
  const damage=events.filter(e=>e.kind==='damage'&&e.data.damage<100),priorDamage=entries.findLast(e=>e.kind==='damage'&&e.t<start)?.data.damage||0;
  const damageDelta=damage.reduce((max,e)=>Math.max(max,e.data.damage-priorDamage),0);
  if(damageDelta>0)facts.push(`Rögzített sérülésnövekedés: ${one(damageDelta)} százalékpont. Utolsó ok: ${damage.at(-1).data.source||'nincs megadva'}.`);
  if(!findings.length&&samples.length)facts.push('A vizsgált biztonsági feltételeknél nem találtunk tartós eltérést. Ez önmagában nem igazolja a harcászati cél teljesítését.');
  if(samples.length){const speeds=samples.map(e=>e.data.player.iasKmh).filter(Number.isFinite);if(speeds.length)facts.push(`IAS: ${Math.round(speeds.reduce((a,b)=>Math.min(a,b),Infinity))}–${Math.round(speeds.reduce((a,b)=>Math.max(a,b),0))} km/h.`);}
  return {id,label:event.data.label,start,end:finish,duration:finish-start,status,statusLabel:statusLabels[status],findings:[...new Set(findings)],facts};
 }).filter(p=>!terminal.has(p.id));
 const last=phases.at(-1);
 if(last&&result&&result.result!=='success'&&!(result.result==='aborted'&&result.recovered)){
  last.status=result.result==='abandoned'?'incomplete':'failed';last.statusLabel=statusLabels[last.status];
  const reasons=Array.isArray(result.reason)?result.reason:[result.reason];
  for(const reason of reasons)if(reason&&!last.findings.includes(reason))last.findings.push(reason);
 }
 const objectives=entries.findLast(e=>e.kind==='objectives')?.data;
 const summary=result?.result==='success'?'Az elsődleges feladatok és a leszállás teljesültek.':result?.result==='aborted'?'A küldetés megszakadt, de a gép sikeresen hazatért.':result?.result==='crash'?'A küldetés a gép elvesztésével zárult.':result?.result==='failure'?'A küldetés egyik kötelező feltétele nem teljesült.':result?.result==='abandoned'?'A küldetést befejezés előtt megszakítottad.':'A küldetés még nincs lezárva.';
 return {summary,phases,objectives,result};
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function debriefMarkup(log){
 const a=evaluateFlight(log);
 return `<h3>NAPLÓ ALAPÚ KIÉRTÉKELÉS</h3><p>${escape(a.summary)}</p>${Array.isArray(a.objectives)?`<ul>${a.objectives.map(o=>`<li>${escape(o.label||o.text||o.id)}: ${o.done?'teljesült':o.status==='failed'?'elbukott':o.optional?'opcionális, nem teljesült':'nem teljesült'}</li>`).join('')}</ul>`:''}${a.phases.map(p=>`<details ${p.status==='failed'?'open':''}><summary>${clock(p.start)}–${clock(p.end)} · ${escape(p.label)}<br><span class="debrief-status ${p.status}">${p.statusLabel}</span></summary><ul>${[...p.findings,...p.facts].map(x=>`<li>${escape(x)}</li>`).join('')||'<li>Nincs elég rögzített adat az értékeléshez.</li>'}</ul></details>`).join('')}<p>Az értékelés kizárólag az aktuális napló méréseiből és eseményeiből készül; a nem repült fázisokat nem pontozza.</p>`;
}
