import {FRAME,screenWells,cockpitHeight,wellQuad,homography,matrix3d} from './cockpitGeometry.js';
let layoutKey='';
export function mountCockpit(){
 if(document.getElementById('cockpit'))return;
 const ui=document.getElementById('flight-ui');if(!ui)return;
 const root=document.createElement('section');root.id='cockpit';root.setAttribute('aria-label','Fedélzeti műszerfal');
 root.innerHTML='<div id="cockpit-frame" aria-hidden="true"></div>'+Object.keys(screenWells).map(name=>`<section id="cockpit-${name}" class="cockpit-screen" data-well="${name}"></section>`).join('')+'<div id="cockpit-annunciator"></div>';
 ui.append(root);const move=(id,to)=>{const node=document.getElementById(id);if(node)document.getElementById(to).append(node);};
 move('stores-display','cockpit-weapons');move('landing-guidance','cockpit-weapons');
 move('map-heading','cockpit-radar');move('radar','cockpit-radar');move('landing-attitude','cockpit-radar');move('target-data','cockpit-radar');move('config-countermeasures','cockpit-radar');move('landing-route-button','cockpit-radar');
 move('mission-card','cockpit-mission');document.querySelector('.mission-card-heading').prepend(document.getElementById('mission-card-name'));move('flight-config','cockpit-controls');move('phase-guide','cockpit-guide');move('open-guide','cockpit-guide');move('damage-status','cockpit-annunciator');
 const old=document.getElementById('fuel-status');old.remove();
 document.getElementById('cockpit-engine').innerHTML=`<section id="fuel-status" aria-label="Üzemanyag, gázkar és G-terhelés"><div id="fuel-gauge" role="group" aria-label="Üzemanyagszint"><span id="fuel-label">FUEL</span><strong id="fuel-value">100%</strong><div id="fuel-meter" role="meter" aria-label="Üzemanyag" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span id="fuel-fill"></span></div></div><div class="cockpit-range"><span id="fuel-range">— KM</span><span id="fuel-quantity"></span></div><div id="g-load" role="meter" aria-label="G-terhelés" aria-valuemin="-4" aria-valuemax="9" aria-valuenow="1" data-level="normal"><span>G</span><strong id="g-value">+1.0</strong></div><div id="throttle-status" role="meter" aria-label="Gázkar állása" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span>GÁZ</span><b id="throttle-value">0%</b><div class="throttle-track"><span id="throttle-fill"></span></div></div></section>`;
 const oldBrake=document.getElementById('config-wheel-brake'),brake=document.createElement('button');brake.id=oldBrake.id;brake.type='button';brake.title='Ctrl: tartsd nyomva a kerékfékhez';oldBrake.replaceWith(brake);
 document.getElementById('phase-guide').setAttribute('aria-label','Mission Control');
 layoutKey='';layoutCockpit();window.addEventListener('resize',layoutCockpit);
}
export function layoutCockpit(){
 const root=document.getElementById('cockpit');if(!root)return;
 const w=window.innerWidth,h=window.innerHeight,deck=cockpitHeight(w,h),key=`${w}:${h}`;if(key===layoutKey)return;layoutKey=key;
 root.style.height=`${deck}px`;document.body.style.setProperty('--cockpit-height',`${deck}px`);
 root.style.setProperty('--frame-scale',`${FRAME.height/(FRAME.height-FRAME.top)*100}%`);
 root.classList.toggle('compact-cockpit',w<1450||deck<200);
 for(const name of Object.keys(screenWells)){
  const q=wellQuad(name,w,deck),length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const width=(length(q[0],q[1])+length(q[3],q[2]))/2,height=(length(q[0],q[3])+length(q[1],q[2]))/2,element=document.getElementById(`cockpit-${name}`);
  element.style.width=`${width}px`;element.style.height=`${height}px`;element.style.transform=`matrix3d(${matrix3d(homography(width,height,q)).join(',')})`;
  if(name==='radar'){const radar=document.getElementById('radar');radar.width=Math.max(80,Math.round(width));radar.height=Math.max(60,Math.round(height-25));}
 }
}
export function updateCockpit(s){
 const root=document.getElementById('cockpit');if(!root)return;
 const landing=!!s.approach?.active&&!s.onGround&&!s.crashed;
 root.classList.toggle('cockpit-landing',landing&&!document.body.classList.contains('navigation-jammed'));
 document.getElementById('fuel-fill').style.width=`${Math.max(0,Math.min(100,s.fuel/s.spec.fuelCapacity*100))}%`;
 document.getElementById('throttle-fill').style.width=`${Math.max(0,Math.min(100,s.throttle*100))}%`;
 const radar=document.getElementById('radar'),rw=Math.round(radar.clientWidth),rh=Math.round(radar.clientHeight);if(rw>0&&rh>0&&(radar.width!==rw||radar.height!==rh)){radar.width=rw;radar.height=rh;}
 root.querySelector('#phase-guide').title=document.getElementById('guide-title').textContent;
}
