import {battleObjectives} from './missionObjectives.js';
import {isHostile} from './unitTypes.js';
import {terrainHeight} from './terrain.js';
import {activeJammers,navigationJammed,sensorTargets} from './electronicWarfare.js';
import {beginCivilDeparture} from './civilFlight.js';

export class Mission {
  constructor(spec){
    this.spec=spec;
    this.destroyed=false;
    this.complete=false;
    this.failed=false;this.failureReason='';this.objectiveComplete=false;this.civilIntercepted=false;
    this.departed=false;
    this.score=0;
    this.setPhase('preflight','FELSZÁLLÁSI ELŐKÉSZÜLET','Teljes gáz, majd felszállási sebességnél orr fel.');
  }

  setPhase(id,label,hint){this.phaseId=id;this.phase=label;this.phaseHint=hint;}

  update(s,targets,w,aim=null){
    if(this.complete||this.failed)return;
    const practice=this.spec.objective==='landing',civil=this.spec.objective==='escort'?targets.find(t=>t.civilian):null;
    if(civil&&(civil.damage>0||civil.flight?.damage>0||(!civil.alive&&!civil.departedAirspace))){this.failed=true;this.failureReason='A civil repülőgép megsérült. Ebben a küldetésben tilos tüzelni rá.';this.setPhase('failed','KÜLDETÉS SIKERTELEN · CIVIL GÉP',this.failureReason);return;}
    if(s.crashed){this.setPhase('failed','KÜLDETÉS SIKERTELEN','A repülési jelentésben találod a részleteket.');return;}
    if(s.dying){this.setPhase('dying','IRÁNYÍTÁS ELVESZETT','Végzetes szerkezeti kár. A gép zuhanását külső nézetből követjük.');return;}
    if(!civil&&targets.filter(t=>isHostile(t,s)).length&&targets.filter(t=>isHostile(t,s)).every(t=>!t.alive))this.destroyed=true;
    const agl=s.position.y-terrainHeight(s.position.x,s.position.z);
    if(s.airborne&&(agl>=150||Math.hypot(s.position.x,s.position.z)>2300))this.departed=true;
    if(civil&&this.departed&&aim?.locked&&aim.id===civil.id&&civil.alive){if(beginCivilDeparture(civil))this.civilIntercepted=true;}
    this.objectiveComplete=practice?!!(s.onGround&&s.landing?.success):civil?!!civil.departedAirspace:this.destroyed;
    if(this.spec.composition&&!practice&&!civil){const report=battleObjectives(this,s,targets,w);this.objectives=report.rows;this.objectiveComplete=report.complete;this.destroyed=report.complete;if(report.failure){this.failed=true;this.failureReason=report.failure;this.setPhase('failed','KÜLDETÉS SIKERTELEN',report.failure);return;}}


    if(this.objectiveComplete&&s.airborne&&s.landing?.success&&s.onGround&&s.speed<5){
      this.complete=true;
      this.setPhase('complete','KÜLDETÉS TELJESÍTVE',practice?'Biztonságos földetérés és megállás. Sikeres leszállási gyakorlat.':civil?'A civil gép biztonságban elhagyta a légteret; sikeres hazatérés.':'Cél megsemmisítve, biztonságos hazatérés.');
      this.score=Math.max(0,Math.round(1000+s.fuel/s.spec.fuelCapacity*500+(100-s.damage)*5+Math.max(0,3-s.landing.descent)*100+Math.max(0,45-s.landing.offset)*3-w.used*5-w.misses*20-s.elapsed*.2+(this.objectives?.filter(o=>o.optional&&o.done).length||0)*300));
      return;
    }
    if(s.onGround&&s.landing?.success){
      this.setPhase('rollout','KIFUTÁS','Gáz le, Ctrl: kerékfék.');
      return;
    }
    if(navigationJammed(s,targets)){this.setPhase('jammer-attack','ELEKTRONIKAI ZAVARÁS','Navigáció és radar kiesett. Keresd szemmel a zavaróállomást, vagy repülj ki a köréből.');return;}
    if(s.approach?.active){
      this.setPhase(s.approach.stage==='SZINTBE VÉTEL'?'flare':'landing',`LESZÁLLÁS · ${s.approach.stage}`,s.approach.instruction||'Kövesd a leszállási segéd jelzéseit.');
      return;
    }
    if(s.damage>=40){this.setPhase('emergency','SÉRÜLT GÉP · KÉNYSZERHELYZET','Enyhíts a manővereken, ellenkormányozz és térj vissza a bázisra.');return;}
    if(practice){this.setPhase('landing-setup','LESZÁLLÁSI GYAKORLAT','N: kapcsold be a leszállási segédet. G: futómű, X: fékszárny.');return;}
    if(this.objectiveComplete){
      this.setPhase('return','HAZATÉRÉS','Kövesd a BASE jelzést; készülj a leszállásra.');
      return;
    }
    if(!s.airborne){
      if(s.speed>1||s.throttle>.05)this.setPhase('takeoff','FELSZÁLLÁS','Gyorsíts a pályán, majd finoman emeld az orrot.');
      else this.setPhase('preflight','FELSZÁLLÁSI ELŐKÉSZÜLET','R: gáz növelése · Shift: utánégető.');
      return;
    }
    if(!this.departed){
      this.setPhase('climb','FELSZÁLLÁS · EMELKEDÉS','Emelkedj 150 m fölé; húzd be a futóművet.');
      return;
    }
    if(civil){this.setPhase(this.civilIntercepted?'civil-departure':'civil-intercept',this.civilIntercepted?'CIVIL GÉP · VISSZAFORDULÁS / TÁVOZÁS':'CIVIL GÉP · BÉKÉS ELFOGÁS',this.civilIntercepted?'A befogás sikerült. A gép elhagyja a légteret; közben elindulhatsz haza.':'T: célbefogás. Tűzszünet, a civil gépet meg kell óvni.');return;}
    if(activeJammers(targets).some(t=>isHostile(t,s))&&targets.find(t=>t.id===aim?.id)?.type==='jammer'){this.setPhase('jammer-attack','JELZAVARÓ KIIKTATÁSA','Tab-bal bármely ellenséges célra válthatsz. A zavarási körön belül nincs befogás.');return;}
    const alive=sensorTargets(s,targets).filter(t=>t.alive&&t.position).sort((a,b)=>a.position.distance(s.position)-b.position.distance(s.position));
    const distance=Math.min(...alive.map(t=>t.position.distance(s.position)));
    const locked=aim?.locked&&alive.some(t=>t.id===aim.id);
    const firing=w.projectiles?.some(p=>p.age<8);
    if((alive.find(t=>t.id===aim?.id)||alive[0])?.kind==='air'||!alive.length&&this.spec.kind==='air'){
      const close=distance<(this.phaseId==='air-combat'?7000:5000);
      if(close||locked||firing)this.setPhase('air-combat','LÉGIHARC','Célbefogás: Tab · Fegyverhasználat: Szóköz.');
      else this.setPhase(this.spec.objective==='escort-transport'?'escort-cover':'intercept',this.spec.objective==='escort-transport'?'SZÁLLÍTÓ KÍSÉRÉSE':'ELFOGÁS / CÉL MEGKÖZELÍTÉSE','Kövesd a céljelzést; a védendő szállítót kék jel mutatja.');
    }else{
      const close=distance<(this.phaseId==='ground-attack'?5000:3500);
      if(close||locked||firing)this.setPhase('ground-attack','SZÁRAZFÖLDI CÉL TÁMADÁSA','Földi rakéta: 3 · Bomba és CCIP: 4.');
      else this.setPhase('target-approach','FÖLDI CÉL MEGKÖZELÍTÉSE','Közelíts a kijelölt földi célhoz.');
    }
  }
}
