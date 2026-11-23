import './style.css';
import './skagit.css';
import { createInterface } from './ui.js';
import { initResearch } from './research.js';
import { initSkagit } from './skagit-ui.js';
let sceneApi, skagit;
const chapterIds=['home','physics','wind','mapping','engineering','lab'];
function go(index){history.replaceState(null,'',`#${chapterIds[index]}`);window.scrollTo({top:index/5*(document.documentElement.scrollHeight-innerHeight),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
const ui=createInterface({onChange:s=>sceneApi?.onChange(s),onLabResult:r=>sceneApi?.onLabResult(r),onPart:id=>sceneApi?.onPart(id),onMotion:enabled=>sceneApi?.onMotion(enabled),onScrollTo:go,onChapter:index=>skagit?.onChapter(index)});
initResearch();ui.syncUI();ui.setProgress(0);
skagit=initSkagit(ui);
const fallbackScroll=()=>{if(!sceneApi)ui.setProgress(Math.max(0,Math.min(5,scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight)*5)));};addEventListener('scroll',fallbackScroll,{passive:true});
function fallback(){document.body.classList.add('webgl-unavailable');document.querySelector('#fallback > span').textContent='3D UNAVAILABLE · THE MODEL AND RESEARCH REMAIN INTERACTIVE';document.getElementById('fallback').style.display='grid';fallbackScroll();}
try { const {initScene}=await import('./scene.js');sceneApi=initScene(ui,skagit);ui.syncUI(false);window.__OPTISPRAY__={getResult:()=>ui.result}; }
catch(error){console.error('3D initialization failed',error);fallback();}
addEventListener('optispray-context-lost',()=>{sceneApi=undefined;fallback();});
addEventListener('hashchange',()=>{const i=chapterIds.indexOf(location.hash.slice(1));if(i>=0)go(i);});
if(!sceneApi){const i=chapterIds.indexOf(location.hash.slice(1));if(i>=0)go(i);}
