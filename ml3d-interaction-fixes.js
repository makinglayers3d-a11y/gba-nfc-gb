(()=>{
'use strict';
const panel=()=>document.getElementById('dev-panel'),canvas=()=>document.getElementById('screen');
const style=document.createElement('style');style.textContent=`
.dev-hitbox,.dev-hitbox *{user-select:none!important;-webkit-user-select:none!important;-webkit-touch-callout:none!important;-webkit-user-drag:none!important;touch-action:none!important}
body.ml3d-dev-open #controls,body.ml3d-dev-open #controls *,body.ml3d-dev-open #menu-button{pointer-events:none!important}
body.ml3d-dev-open #dev-panel{pointer-events:auto!important}
.ml3d-save-capture{padding:0!important;border:0!important;border-radius:0!important;background:#000!important;box-shadow:0 0 0 2px #fff8,0 0 22px #8cf8!important;overflow:hidden!important}
.ml3d-save-capture-screen{width:100%!important;height:100%!important;aspect-ratio:auto!important;border-radius:0!important}
.ml3d-save-capture>strong,.ml3d-save-capture>span,.ml3d-save-capture>small{display:none!important}
.ml3d-save-capture.fly{animation:ml3dCaptureScreenHold 1500ms ease forwards!important}
@keyframes ml3dCaptureScreenHold{0%,72%{opacity:1;transform:none}100%{opacity:0;transform:none}}
`;document.head.appendChild(style);
function fitCapture(){const c=canvas(),cap=document.querySelector('.ml3d-save-capture');if(!c||!cap)return;const r=c.getBoundingClientRect();Object.assign(cap.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',transform:'none',animation:'none',opacity:'1'});requestAnimationFrame(()=>{cap.classList.add('fly')});setTimeout(()=>cap.remove(),1600)}
new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1&&(n.matches?.('.ml3d-save-capture')||n.querySelector?.('.ml3d-save-capture')))setTimeout(fitCapture,0)}).observe(document.body,{childList:true,subtree:true});
function blockGame(e){const p=panel();if(!p||p.hidden)return;if(e.target.closest?.('#dev-panel'))return;e.preventDefault();e.stopImmediatePropagation()}
['pointerdown','pointerup','pointermove','touchstart','touchmove','touchend','click'].forEach(t=>document.addEventListener(t,blockGame,{capture:true,passive:false}));
function protectBoxes(){document.querySelectorAll('.dev-hitbox').forEach(b=>{if(b.dataset.ml3dProtected)return;b.dataset.ml3dProtected='1';['selectstart','contextmenu','dragstart'].forEach(t=>b.addEventListener(t,e=>{e.preventDefault();e.stopPropagation()}));b.querySelectorAll('*').forEach(x=>x.draggable=false)})}
new MutationObserver(protectBoxes).observe(document.body,{childList:true,subtree:true});protectBoxes();
})();