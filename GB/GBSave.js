(() => {
  "use strict";
  const SAVE_PREFIX="gba-gb-save:";let currentKey=null,currentEmulator=null,saveTimer=null;const saveKey=r=>SAVE_PREFIX+r;
  function saveCurrent(){if(!currentEmulator||!currentKey)return;try{if(typeof currentEmulator.getExtRam!=="function")return;const x=currentEmulator.getExtRam();if(!x||!x.byteLength)return;localStorage.setItem(currentKey,JSON.stringify(Array.from(x)))}catch(e){console.error("No se pudo guardar la partida GB/GBC:",e)}}
  function loadFor(r,g){const x=localStorage.getItem(saveKey(r));if(!x||!g)return;try{const b=new Uint8Array(JSON.parse(x));if(typeof g.loadExtRam==="function")g.loadExtRam(b)}catch(e){console.error("No se pudo restaurar la partida GB/GBC:",e)}}
  const api=window.gbaGB;const originalStart=api&&api.start;const originalStartBuffer=api&&api.startBuffer;
  function attachSaveIdentity(identity,g){currentKey=saveKey(identity);currentEmulator=g;loadFor(identity,g);saveTimer=setInterval(saveCurrent,5000);return g}
  function prepareStart(){if(saveTimer){clearInterval(saveTimer);saveTimer=null}saveCurrent()}
  if(originalStart&&originalStartBuffer){
    api.start=async function(r){prepareStart();const g=await originalStart.call(this,r);if(saveTimer)clearInterval(saveTimer);return attachSaveIdentity(r,g)};
    api.startBuffer=async function(buffer,filename,identity,useLegacySave){prepareStart();const g=await originalStartBuffer.call(this,buffer,filename,identity,useLegacySave);return attachSaveIdentity(identity||filename,g)};
    api.save=saveCurrent;
    const originalStop=api.stop;api.stop=function(){saveCurrent();if(saveTimer){clearInterval(saveTimer);saveTimer=null}currentEmulator=null;currentKey=null;return originalStop.call(this)};
    addEventListener('pagehide',saveCurrent);addEventListener('beforeunload',saveCurrent)
  }
  if(!document.querySelector('script[data-ml3d-developer-tools]')){const p=document.createElement('script');p.src='developer-tools-panels.js?v=3';p.onload=()=>{const s=document.createElement('script');s.src='developer-tools.js?v=8';s.dataset.ml3dDeveloperTools='true';s.onload=()=>{const r=document.createElement('script');r.src='ml3d-feature-repair.js?v=1';r.onload=()=>{const f=document.createElement('script');f.src='ml3d-interaction-fixes.js?v=5';f.onload=()=>{const a=document.createElement('script');a.src='appearance-selector.js?v=3';document.head.appendChild(a)};document.head.appendChild(f)};document.head.appendChild(r)};document.head.appendChild(s)};document.head.appendChild(p)}
  if(!document.querySelector('script[data-ml3d-sp-swipe-fix]')){const w=document.createElement('script');w.src='sp-selector-swipe-fix.js?v=1';w.dataset.ml3dSpSwipeFix='true';document.head.appendChild(w)}

  /* ML3D Link: se carga antes de app.js para poder reutilizar los controles físicos sin duplicarlos. */
  if(!document.getElementById('ml3d-link-emulator-style')){const l=document.createElement('link');l.id='ml3d-link-emulator-style';l.rel='stylesheet';l.href='ml3d-link-emulator.css?v=1';document.head.appendChild(l)}
  if(!document.querySelector('script[data-ml3d-link-avatar]')){const a=document.createElement('script');a.src='ml3d-avatar.js?v=1';a.dataset.ml3dLinkAvatar='true';a.onload=()=>{if(document.querySelector('script[data-ml3d-link-loader]'))return;const s=document.createElement('script');s.src='ml3d-link-emulator-loader.js?v=1';s.dataset.ml3dLinkLoader='true';document.head.appendChild(s)};document.head.appendChild(a)}

  const linkKeyboardMap={KeyX:'A',KeyZ:'B',Enter:'START',ShiftLeft:'SELECT',ShiftRight:'SELECT',ArrowRight:'RIGHT',ArrowLeft:'LEFT',ArrowUp:'UP',ArrowDown:'DOWN',KeyS:'R',KeyA:'L'};
  const linkPressed=new Set();
  const linkActive=()=>Boolean(window.ml3dLink&&window.ml3dLink.active);
  const linkDown=(key)=>{if(!key||linkPressed.has(key))return;linkPressed.add(key);window.ml3dLink?.handleKeyDown?.(key)};
  const linkUp=(key)=>{if(!key||!linkPressed.has(key))return;linkPressed.delete(key);window.ml3dLink?.handleKeyUp?.(key)};
  const keyFromTarget=(target)=>target?.closest?.('[data-key]')?.dataset?.key||null;

  document.addEventListener('mousedown',(event)=>{if(!linkActive())return;const key=keyFromTarget(event.target);if(!key)return;event.preventDefault();event.stopImmediatePropagation();linkDown(key)},true);
  document.addEventListener('mouseup',(event)=>{if(!linkActive())return;const key=keyFromTarget(event.target);event.preventDefault();event.stopImmediatePropagation();if(key)linkUp(key);else [...linkPressed].forEach(linkUp)},true);
  document.addEventListener('touchstart',(event)=>{if(!linkActive())return;const key=keyFromTarget(event.target);if(!key)return;event.preventDefault();event.stopImmediatePropagation();linkDown(key)},{capture:true,passive:false});
  document.addEventListener('touchend',(event)=>{if(!linkActive())return;const key=keyFromTarget(event.target);event.preventDefault();event.stopImmediatePropagation();if(key)linkUp(key);else [...linkPressed].forEach(linkUp)},{capture:true,passive:false});
  document.addEventListener('touchcancel',(event)=>{if(!linkActive())return;event.preventDefault();event.stopImmediatePropagation();[...linkPressed].forEach(linkUp)},{capture:true,passive:false});
  window.addEventListener('keydown',(event)=>{if(!linkActive())return;const key=linkKeyboardMap[event.code];if(!key)return;event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)linkDown(key)},true);
  window.addEventListener('keyup',(event)=>{if(!linkActive())return;const key=linkKeyboardMap[event.code];if(!key)return;event.preventDefault();event.stopImmediatePropagation();linkUp(key)},true);
  window.addEventListener('blur',()=>{if(!linkActive())return;[...linkPressed].forEach(linkUp)});
})();
