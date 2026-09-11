(() => {
  'use strict';
  const KEY_VISIBLE='ml3d-dev-touch-visible';
  const KEY_POS='ml3d-dev-touch-positions';
  const controls=[...document.querySelectorAll('#controls [data-key]')];
  const menuButton=document.getElementById('menu-button');
  const brand=document.querySelector('.sp-code-brand');
  if(!controls.length||!brand) return;

  const style=document.createElement('style');
  style.textContent=`
  .dev-hitbox{position:fixed;z-index:9990;border:2px solid #27a7ff;background:#27a7ff33;border-radius:10px;pointer-events:none;box-sizing:border-box;color:#fff;font:700 11px/1.1 system-ui;text-shadow:0 1px 2px #000;display:flex;align-items:flex-start;justify-content:center;padding:3px;transition:filter .08s,background .08s}.dev-hitbox[data-key="A"]{border-color:#19df72;background:#19df7233}.dev-hitbox[data-key="B"]{border-color:#ff4040;background:#ff404033}.dev-hitbox[data-key="DOWN"]{border-color:#ffc21a;background:#ffc21a33}.dev-hitbox[data-key="L"],.dev-hitbox[data-key="R"],.dev-hitbox[data-key="START"],.dev-hitbox[data-key="SELECT"],.dev-hitbox[data-key="MENU"]{border-color:#875cff;background:#875cff33}.dev-hitbox.hit{filter:brightness(2);background:#ffffff66}.dev-hitbox.moving{pointer-events:auto;animation:devBlink .5s steps(2,end) infinite;touch-action:none}.dev-hitbox.hidden{display:none}@keyframes devBlink{50%{opacity:.28}}
  #dev-panel{position:fixed;z-index:10020;inset:8% 5% auto;background:#101820f5;color:#fff;border:1px solid #52606d;border-radius:14px;padding:14px;font:14px system-ui;box-shadow:0 12px 40px #000b;max-height:78vh;overflow:auto}#dev-panel[hidden]{display:none}#dev-panel h2{margin:0 0 12px;font-size:20px}#dev-panel .row{display:flex;gap:8px;flex-wrap:wrap;margin:9px 0}#dev-panel button{border:1px solid #657485;border-radius:9px;background:#263442;color:#fff;padding:10px 12px;font-weight:700}#dev-panel button.on{background:#126ee8}#dev-panel .close{float:right}#dev-panel small{opacity:.72}
  `;
  document.head.appendChild(style);

  const panel=document.createElement('section'); panel.id='dev-panel'; panel.hidden=true;
  panel.innerHTML='<button class="close" type="button">×</button><h2>Menú de desarrollador</h2><div class="row"><button id="dev-visible" type="button">Sensores táctiles</button><button id="dev-move" type="button">Mover zonas</button><button id="dev-fix" type="button">Fijar cambios</button><button id="dev-reset" type="button">Restablecer</button></div><small>Para mover una zona: activa “Mover zonas”, mantén pulsada la zona 3 segundos y arrástrala. Al desbloquear hará 3 vibraciones rápidas y parpadeará hasta pulsar “Fijar cambios”.</small>';
  document.body.appendChild(panel);
  panel.querySelector('.close').onclick=()=>panel.hidden=true;

  const boxes=new Map(); let visible=localStorage.getItem(KEY_VISIBLE)==='true'; let movingMode=false; let saved={};
  try{saved=JSON.parse(localStorage.getItem(KEY_POS)||'{}')||{}}catch(_){saved={}}
  function addBox(key,target){const b=document.createElement('div');b.className='dev-hitbox';b.dataset.key=key;b.textContent=key==='MENU'?'MENÚ':key;document.body.appendChild(b);boxes.set(key,{b,target});return b}
  controls.forEach(el=>addBox(el.dataset.key,el)); if(menuButton)addBox('MENU',menuButton);
  function rectFor(key,target){const r=target.getBoundingClientRect(),p=saved[key];return p?{left:p.x*innerWidth,top:p.y*innerHeight,width:p.w*innerWidth,height:p.h*innerHeight}:r}
  function layout(){boxes.forEach(({b,target},key)=>{const r=rectFor(key,target);Object.assign(b.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});b.classList.toggle('hidden',!visible)})}
  function setVisible(v){visible=v;localStorage.setItem(KEY_VISIBLE,String(v));panel.querySelector('#dev-visible').classList.toggle('on',v);layout()}
  setVisible(visible); addEventListener('resize',layout); addEventListener('scroll',layout,{passive:true});
  panel.querySelector('#dev-visible').onclick=()=>setVisible(!visible);
  panel.querySelector('#dev-move').onclick=()=>{movingMode=!movingMode;panel.querySelector('#dev-move').classList.toggle('on',movingMode);setVisible(true)};
  panel.querySelector('#dev-fix').onclick=()=>{movingMode=false;panel.querySelector('#dev-move').classList.remove('on');boxes.forEach(({b})=>b.classList.remove('moving'));localStorage.setItem(KEY_POS,JSON.stringify(saved));layout()};
  panel.querySelector('#dev-reset').onclick=()=>{saved={};localStorage.removeItem(KEY_POS);boxes.forEach(({b})=>b.classList.remove('moving'));layout()};

  boxes.forEach(({b},key)=>{let timer=null,drag=false,dx=0,dy=0;
    b.addEventListener('pointerdown',e=>{if(!movingMode)return;const r=b.getBoundingClientRect();dx=e.clientX-r.left;dy=e.clientY-r.top;timer=setTimeout(()=>{drag=true;b.classList.add('moving');b.setPointerCapture(e.pointerId);if(navigator.vibrate)navigator.vibrate([45,45,45,45,45]);},3000)});
    b.addEventListener('pointermove',e=>{if(!drag)return;const x=Math.max(0,Math.min(innerWidth-b.offsetWidth,e.clientX-dx)),y=Math.max(0,Math.min(innerHeight-b.offsetHeight,e.clientY-dy));b.style.left=x+'px';b.style.top=y+'px';saved[key]={x:x/innerWidth,y:y/innerHeight,w:b.offsetWidth/innerWidth,h:b.offsetHeight/innerHeight}});
    const end=()=>{clearTimeout(timer);timer=null;drag=false};b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);
  });

  controls.forEach(el=>{const key=el.dataset.key;const flash=()=>{const x=boxes.get(key);if(!x||!visible)return;x.b.classList.add('hit');setTimeout(()=>x.b.classList.remove('hit'),130)};el.addEventListener('pointerdown',flash,{passive:true});el.addEventListener('touchstart',flash,{passive:true})});
  if(menuButton){const flash=()=>{const x=boxes.get('MENU');if(x&&visible){x.b.classList.add('hit');setTimeout(()=>x.b.classList.remove('hit'),130)}};menuButton.addEventListener('pointerdown',flash,{passive:true})}

  let hold=null;const start=e=>{if(e.cancelable)e.preventDefault();clearTimeout(hold);hold=setTimeout(()=>{panel.hidden=false;if(navigator.vibrate)navigator.vibrate(35)},4000)},stop=()=>{clearTimeout(hold);hold=null};
  ['pointerdown','touchstart'].forEach(t=>brand.addEventListener(t,start,{passive:false}));['pointerup','pointercancel','pointerleave','touchend','touchcancel'].forEach(t=>brand.addEventListener(t,stop,{passive:true}));
})();