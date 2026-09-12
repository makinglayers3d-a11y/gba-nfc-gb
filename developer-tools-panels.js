(()=>{
'use strict';

const CUSTOM_DEFAULT={
  L:{x:0.046875,y:0.4838864985654536,w:0.3125,h:0.06060606060606061},
  R:{x:0.640625,y:0.4838864985654536,w:0.3125,h:0.06060606060606061},
  UP:{x:0.17447916666666666,y:0.5798460945250496,w:0.13541666666666666,h:0.07503607503607504},
  LEFT:{x:0.046875,y:0.6505531652321203,w:0.13541666666666666,h:0.07503607503607504},
  RIGHT:{x:0.3020833333333333,y:0.6505531652321203,w:0.13541666666666666,h:0.07503607503607504},
  DOWN:{x:0.17447916666666666,y:0.721260235939191,w:0.13541666666666666,h:0.07503607503607504},
  B:{x:0.5625,y:0.6981722128511679,w:0.17708333333333334,h:0.09812409812409813},
  A:{x:0.7760416666666666,y:0.5798460945250496,w:0.17708333333333334,h:0.09812409812409813},
  SELECT:{x:0.24479166666666666,y:0.8345358932517135,w:0.23958333333333334,h:0.05483405483405483},
  START:{x:0.515625,y:0.8345358932517135,w:0.23958333333333334,h:0.05483405483405483},
  MENU:{x:0.84375,y:0.024531024531024532,w:0.11979166666666667,h:0.06637806637806638}
};
const CUSTOM_KEY='ml3d-dev-touch-positions:custom';
if(!localStorage.getItem(CUSTOM_KEY))localStorage.setItem(CUSTOM_KEY,JSON.stringify(CUSTOM_DEFAULT));

const family=()=>document.body.classList.contains('ml3d-custom-skin')?'custom':'sp';
const prefsKey=()=>`ml3d-dev-bottom-panels:${family()}`;
const defaults=()=>({visible:true,info:true,legend:true,infoPos:null,legendPos:null});
function loadPrefs(){try{return Object.assign(defaults(),JSON.parse(localStorage.getItem(prefsKey())||'{}'))}catch(_){return defaults()}}
function savePrefs(p){localStorage.setItem(prefsKey(),JSON.stringify(p))}

const style=document.createElement('style');
style.textContent=`
.dev-zone-info,.dev-legend{pointer-events:auto!important}
.dev-zone-info h4,.dev-legend h4{display:flex;align-items:center;gap:5px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
.dev-zone-info h4:active,.dev-legend h4:active{cursor:grabbing}
.ml3d-panel-drag-mark{margin-left:auto;color:#7fa8c3;font-size:10px;font-weight:600}
.ml3d-panel-close{width:19px;height:19px;padding:0;border:1px solid #496579;border-radius:5px;background:#142a39;color:#fff;font:800 12px/1 system-ui;touch-action:manipulation}
.ml3d-user-panel-hidden{display:none!important}
#ml3d-panel-toggle{flex:0 0 auto!important;border:1px solid #527084;border-radius:5px;background:#173044;color:#fff;padding:4px 7px;font:800 9px system-ui;touch-action:manipulation}
#ml3d-panel-toggle.on{background:#075fc8;border-color:#1597ff}
`;
document.head.appendChild(style);

function install(){
  const info=document.querySelector('.dev-zone-info');
  const legend=document.querySelector('.dev-legend');
  const bar=document.querySelector('.dev-editbar');
  if(!info||!legend||!bar||bar.dataset.ml3dPanelsInstalled)return false;
  bar.dataset.ml3dPanelsInstalled='true';

  let prefs=loadPrefs();
  const toggle=document.createElement('button');
  toggle.id='ml3d-panel-toggle';
  toggle.type='button';
  bar.appendChild(toggle);

  function applyPosition(el,pos){
    if(!pos)return;
    const r=el.getBoundingClientRect();
    const x=Math.max(4,Math.min(innerWidth-r.width-4,pos.x*innerWidth));
    const y=Math.max(4,Math.min(innerHeight-r.height-4,pos.y*innerHeight));
    Object.assign(el.style,{left:x+'px',top:y+'px',right:'auto',bottom:'auto'});
  }
  function apply(){
    prefs=loadPrefs();
    info.classList.toggle('ml3d-user-panel-hidden',!prefs.visible||!prefs.info);
    legend.classList.toggle('ml3d-user-panel-hidden',!prefs.visible||!prefs.legend);
    toggle.classList.toggle('on',prefs.visible&&(prefs.info||prefs.legend));
    toggle.textContent=prefs.visible&&(prefs.info||prefs.legend)?'Paneles ON':'Paneles OFF';
    applyPosition(info,prefs.infoPos);
    applyPosition(legend,prefs.legendPos);
  }
  function setBoth(v){prefs.visible=v;if(v){prefs.info=true;prefs.legend=true}savePrefs(prefs);apply()}
  toggle.onclick=e=>{e.stopPropagation();setBoth(!(prefs.visible&&(prefs.info||prefs.legend)))};

  function decorate(el,kind){
    const h=el.querySelector('h4');
    if(!h)return;
    const mark=document.createElement('span');mark.className='ml3d-panel-drag-mark';mark.textContent='↕ mover';
    const close=document.createElement('button');close.className='ml3d-panel-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','Ocultar panel');
    h.append(mark,close);
    close.addEventListener('pointerdown',e=>e.stopPropagation());
    close.onclick=e=>{e.stopPropagation();prefs[kind]=false;savePrefs(prefs);apply()};

    let pid=null,dx=0,dy=0;
    h.addEventListener('pointerdown',e=>{
      if(e.target.closest('.ml3d-panel-close'))return;
      e.preventDefault();e.stopPropagation();
      const r=el.getBoundingClientRect();pid=e.pointerId;dx=e.clientX-r.left;dy=e.clientY-r.top;
      Object.assign(el.style,{left:r.left+'px',top:r.top+'px',right:'auto',bottom:'auto'});
      try{h.setPointerCapture(pid)}catch(_){}
    },{passive:false});
    h.addEventListener('pointermove',e=>{
      if(pid===null||e.pointerId!==pid)return;
      e.preventDefault();e.stopPropagation();
      const r=el.getBoundingClientRect();
      const x=Math.max(4,Math.min(innerWidth-r.width-4,e.clientX-dx));
      const y=Math.max(4,Math.min(innerHeight-r.height-4,e.clientY-dy));
      el.style.left=x+'px';el.style.top=y+'px';
    },{passive:false});
    const end=e=>{
      if(pid===null||(e&&e.pointerId!==pid))return;
      const r=el.getBoundingClientRect();pid=null;
      prefs[kind+'Pos']={x:r.left/innerWidth,y:r.top/innerHeight};savePrefs(prefs);
    };
    h.addEventListener('pointerup',end);h.addEventListener('pointercancel',end);h.addEventListener('lostpointercapture',end);
  }
  decorate(info,'info');decorate(legend,'legend');

  const observer=new MutationObserver(()=>{
    if(!info.classList.contains('dev-hidden')||!legend.classList.contains('dev-hidden'))apply();
  });
  observer.observe(info,{attributes:true,attributeFilter:['class']});
  observer.observe(legend,{attributes:true,attributeFilter:['class']});
  addEventListener('resize',apply);
  addEventListener('orientationchange',()=>setTimeout(apply,180));
  apply();

  // Keep the repository custom defaults available after a reset.
  ['#dev-reset','#extra-reset'].forEach(sel=>{
    const btn=document.querySelector(sel);if(!btn)return;
    btn.addEventListener('click',()=>{
      if(family()!=='custom')return;
      setTimeout(()=>localStorage.setItem(CUSTOM_KEY,JSON.stringify(CUSTOM_DEFAULT)),0);
    });
  });
  return true;
}

if(!install()){
  const mo=new MutationObserver(()=>{if(install())mo.disconnect()});
  mo.observe(document.documentElement,{childList:true,subtree:true});
}
})();