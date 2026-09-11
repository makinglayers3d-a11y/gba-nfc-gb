(()=>{
'use strict';
function init(){
 const panel=document.getElementById('dev-panel');
 if(!panel)return;
 const edit=panel.querySelector('#dev-edit'),fix=panel.querySelector('#dev-fix'),cancel=panel.querySelector('#dev-cancel');
 const status=panel.querySelector('#dev-status');
 document.documentElement.classList.add('ml3d-dev-ready');
 const css=document.createElement('style');
 css.textContent=`
 #dev-panel{inset:0!important;left:0!important;top:0!important;width:100vw!important;height:100dvh!important;max-height:none!important;transform:none!important;border:0!important;border-radius:0!important;padding:0 16px 22px!important;background:linear-gradient(145deg,#07111bf9,#102334fd 52%,#071019fd)!important;overscroll-behavior:contain}
 #dev-panel .dev-head{padding-top:max(14px,env(safe-area-inset-top))!important}
 #dev-panel .dev-section{max-width:760px;margin:12px auto!important}
 #dev-panel .dev-head>div{max-width:760px}
 body.ml3d-dev-open #controls,body.ml3d-dev-open #menu-button{pointer-events:none!important}
 #ml3d-dev-editbar{position:fixed;z-index:10030;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);display:flex;align-items:center;gap:7px;width:min(94vw,560px);padding:8px;border:1px solid #70bfff66;border-radius:14px;background:#081522ed;color:#fff;box-shadow:0 8px 30px #000b;font:700 11px system-ui;backdrop-filter:blur(10px)}
 #ml3d-dev-editbar[hidden]{display:none}#ml3d-dev-editbar span{flex:1}#ml3d-dev-editbar button{border:1px solid #65839c;border-radius:9px;background:#20374a;color:#fff;padding:9px 10px;font-weight:800}#ml3d-dev-editbar .save{background:#087944;border-color:#21d980}
 `;document.head.appendChild(css);
 const bar=document.createElement('div');bar.id='ml3d-dev-editbar';bar.hidden=true;bar.innerHTML='<span>Edición táctil · mantén 3 s y arrastra</span><button class="back">Panel</button><button class="save">Fijar</button>';document.body.appendChild(bar);
 function setOpen(open){document.body.classList.toggle('ml3d-dev-open',open);}
 const observer=new MutationObserver(()=>setOpen(!panel.hidden));observer.observe(panel,{attributes:true,attributeFilter:['hidden']});
 panel.addEventListener('pointerdown',e=>e.stopPropagation());panel.addEventListener('pointerup',e=>e.stopPropagation());panel.addEventListener('click',e=>e.stopPropagation());
 // Block game keyboard/touch input while the full developer panel is visible.
 ['touchstart','touchmove','touchend','pointerdown','pointerup'].forEach(type=>document.addEventListener(type,e=>{if(!panel.hidden&&panel.contains(e.target))e.stopPropagation()},true));
 // The previous editor was hidden under the panel (panel z-index > hitboxes). When editing,
 // hide the panel so the actual hitboxes receive pointer events, and expose a small save bar.
 edit.addEventListener('click',()=>{setTimeout(()=>{if(edit.classList.contains('on')){panel.hidden=true;bar.hidden=false;setOpen(false)}},0)});
 bar.querySelector('.back').onclick=()=>{bar.hidden=true;panel.hidden=false;setOpen(true)};
 bar.querySelector('.save').onclick=()=>{fix.click();bar.hidden=true;panel.hidden=false;setOpen(true)};
 cancel.addEventListener('click',()=>{bar.hidden=true});
 const close=panel.querySelector('.dev-close');if(close)close.addEventListener('click',()=>setOpen(false));
 // Add useful diagnostics matching the reference layout.
 const tools=[...panel.querySelectorAll('.dev-section')];
 const info=document.createElement('section');info.className='dev-section';info.innerHTML='<h3>Información del sistema</h3><div class="dev-status" id="dev-runtime"></div><div class="dev-row" style="margin-top:8px"><button class="dev-btn" id="dev-grid">Cuadrícula</button><button class="dev-btn" id="dev-test">Prueba controles</button></div>';
 panel.insertBefore(info,tools[tools.length-1]||null);
 const runtime=info.querySelector('#dev-runtime');function refresh(){runtime.textContent=`Pantalla ${innerWidth}×${innerHeight} · DPR ${devicePixelRatio||1} · ${screen.orientation?.type||'orientación desconocida'}`};refresh();addEventListener('resize',refresh);
 const grid=document.createElement('div');grid.id='ml3d-dev-grid';Object.assign(grid.style,{position:'fixed',inset:'0',zIndex:'9980',pointerEvents:'none',display:'none',backgroundImage:'linear-gradient(#48aaff33 1px,transparent 1px),linear-gradient(90deg,#48aaff33 1px,transparent 1px)',backgroundSize:'5vw 5vw'});document.body.appendChild(grid);
 info.querySelector('#dev-grid').onclick=e=>{const on=grid.style.display==='none';grid.style.display=on?'block':'none';e.currentTarget.classList.toggle('on',on)};
 info.querySelector('#dev-test').onclick=()=>{panel.hidden=true;setOpen(false);status.textContent='Modo prueba: toca los controles para ver qué sensores responden';setTimeout(()=>{panel.hidden=false;setOpen(true)},5000)};
 setOpen(!panel.hidden);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0);
})();