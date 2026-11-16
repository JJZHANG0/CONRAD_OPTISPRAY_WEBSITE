import { DEFAULTS, simulate } from './physics.js';
import { paintCharts } from './science-view.js';
const PART_COPY={
 sensor:['BUILT / WIND SENSING','Ultrasonic wind sensing feeds an ESP32 over RS485. Sensor placement and aircraft-motion calibration remain to be tested.'],
 control:['BUILT / BENCH CONTROL','The bench pump stops after a three-second communication interruption. Integrated airborne spray guidance is not yet validated.'],
 boom:['PLANNED / GUIDANCE LAYER','A quick-release mount and flow-conditioning layer are planned. The displayed boom is an illustrative assembly, not a tested specification.'],
 nozzle:['TESTED / STATIONARY NOZZLE','Five KZ80-06 nozzle conditions were measured using water-sensitive paper. The seven-station 3D array is illustrative.'],
 tank:['INTEGRATION / EXISTING AIRCRAFT','The retrofit concept retains the operator’s aircraft. Flow, pressure, height, position and ground speed are planned aircraft inputs.'],
 interface:['BUILT / DESKTOP CONSOLE','The prototype includes wind readings, pump controls, drift simulation and landing animations. Aircraft-specific recommendations require field validation.'],
};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function createInterface(callbacks) {
 const state={...DEFAULTS,optimized:false,part:'sensor'};let result,baseline,activeChapter=0,toastTimer,scheduled=false,lastProgress=-1;
 const chapters=[...document.querySelectorAll('.chapter')];
 const notify=message=>{clearTimeout(toastTimer);const el=document.getElementById('toast');el.textContent=message;el.classList.add('visible');toastTimer=setTimeout(()=>el.classList.remove('visible'),3600);};
 function syncUI(recompute=true) {
  if(recompute || !result){baseline=simulate({...state,offset:0});state.offset=state.optimized?Math.max(0,baseline.drift):0;result=state.optimized?simulate(state):baseline;}
  document.querySelectorAll('[data-value]').forEach(el=>el.textContent=Number(state[el.dataset.value]).toFixed(['size','direction'].includes(el.dataset.value)?0:1));
  document.querySelectorAll('input[data-param]').forEach(el=>{el.value=state[el.dataset.param];el.style.setProperty('--fill',`${(el.value-el.min)/(el.max-el.min)*100}%`);});
  document.querySelectorAll('[data-metric]').forEach(el=>{const n=result[el.dataset.metric];el.textContent=Number.isFinite(n)?n.toFixed(1):'—';});
  document.getElementById('drift-bar').style.width=`${clamp(result.drift/25,0,1)*100}%`;
  for(const [attr,check] of [['direction',v=>Number(v)===state.direction],['mode',v=>(v==='optimized')===state.optimized],['path',v=>v===state.path],['part',v=>v===state.part]])document.querySelectorAll(`[data-${attr}]`).forEach(el=>{const selected=check(el.dataset[attr]);el.classList.toggle('selected',selected);el.setAttribute('aria-pressed',String(selected));});
  document.getElementById('path-label').textContent=state.path.toUpperCase();
  const [code,description]=PART_COPY[state.part];document.getElementById('part-code').textContent=code;document.getElementById('part-description').textContent=description;
  const button=document.getElementById('optimize-button');button.innerHTML=state.optimized?'VIEW BASELINE <span>↺</span>':'COMPARE UPWIND SHIFT <span>↗</span>';
  document.getElementById('comparison-result').textContent=state.optimized?`Route shifted ${state.offset.toFixed(1)} m upwind. In-field mass: ${baseline.inside.toFixed(1)}% → ${result.inside.toFixed(1)}%. CV: ${baseline.cv?.toFixed(1)??'—'}% → ${result.cv?.toFixed(1)??'—'}%.`:`Off-field: ${result.outside.toFixed(1)}% by mass / ${result.outsideCount.toFixed(1)}% by count.`;
  paintCharts(result);callbacks.onChange?.(state,result);
 }
 const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;syncUI();});};
 document.querySelectorAll('input[data-param]').forEach(input=>input.addEventListener('input',()=>{state[input.dataset.param]=Number(input.value);state.optimized=false;schedule();}));
 document.querySelectorAll('[data-direction]').forEach(b=>b.addEventListener('click',()=>{state.direction=Number(b.dataset.direction);state.optimized=false;syncUI();}));
 document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.optimized=b.dataset.mode==='optimized';syncUI();}));
 document.querySelectorAll('[data-path]').forEach(b=>b.addEventListener('click',()=>{state.path=b.dataset.path;syncUI();}));
 function selectPart(id){if(!PART_COPY[id])return;state.part=id;callbacks.onPart?.(id);syncUI(false);}
 document.querySelectorAll('[data-part]').forEach(b=>b.addEventListener('click',()=>selectPart(b.dataset.part)));
 document.getElementById('optimize-button').addEventListener('click',()=>{state.optimized=!state.optimized;syncUI();notify(state.optimized?'Mean-drift route shift applied. Compare retention and CV.':'Baseline route restored.');});
 document.getElementById('reset-button').addEventListener('click',()=>{Object.assign(state,DEFAULTS,{optimized:false,part:'sensor'});callbacks.onPart?.('sensor');syncUI();notify('Default demonstration restored.');});
 document.getElementById('motion-toggle').addEventListener('click',e=>{const b=e.currentTarget,pause=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(pause));b.textContent=pause?'MOTION OFF':'MOTION ON';callbacks.onMotion?.(!pause);});
 document.querySelectorAll('[data-scroll-to]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();callbacks.onScrollTo?.(Number(b.dataset.scrollTo));}));
 document.getElementById('export-button').addEventListener('click',()=>{
  const payload={model:'OptiSpray browser teaching model v1 — not calibrated research or flight advice',parameters:{...state},assumptions:'Spherical water droplets; constant wind; stationary-release kernels; no downwash/evaporation; 3 equal-count size classes; 160 route releases; 3 m/s route speed; 1 m grid',units:{height:'m',wind:'m/s',size:'micrometers (reference D)',direction:'degrees TOWARD clockwise from north',flow:'L/min',offset:'m'},results:{inFieldMassPercent:result.inside,offFieldMassPercent:result.outside,offFieldCountPercent:result.outsideCount,coefficientOfVariationPercent:result.cv,meanDriftMeters:result.drift,meanFlightTimeSeconds:result.flightTime,waterDoseKg:result.doseKg,massBalance:result.balance},field:{width:36,depth:28,cell:1,minX:-18,minZ:-16},gridMassFractions:Array.from(result.grid)};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='OptiSpray-demo-run.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Demonstration parameters, assumptions and mass grid exported.');
 });
 function setProgress(progress){
  if(Math.abs(progress-lastProgress)<0.0001)return;lastProgress=progress;activeChapter=clamp(Math.round(progress),0,5);
  chapters.forEach((chapter,index)=>{const opacity=clamp(1-Math.abs(progress-index)*1.8,0,1);chapter.style.opacity=opacity;chapter.style.visibility=opacity>0.015?'visible':'hidden';chapter.classList.toggle('active',index===activeChapter);chapter.inert=index!==activeChapter;});
  document.querySelectorAll('.nav-link,.chapter-rail button').forEach(b=>{const active=Number(b.dataset.scrollTo)===activeChapter;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  document.getElementById('chapter-counter').textContent=String(activeChapter+1).padStart(2,'0');document.getElementById('scroll-progress-bar').style.transform=`scaleX(${progress/5})`;document.querySelector('.scroll-cue').style.opacity=progress<0.18?'1':'0';
 }
 addEventListener('resize',()=>paintCharts(result));
 return {state,syncUI,setProgress,notify,selectPart,get result(){return result;},get activeChapter(){return activeChapter;}};
}
