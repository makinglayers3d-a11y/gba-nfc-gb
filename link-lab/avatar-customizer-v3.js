(() => {
'use strict';
if(window.__ml3dAvatarCustomizerV3Unified)return;window.__ml3dAvatarCustomizerV3Unified=true;
const C=()=>window.ML3DAvatarCompositor;
const COUNTS={hair:8,top:8,bottom:8,shoes:6};
const ACCESSORIES=['none','cap','glasses','headphones','scarf','shoulderbag','bow','beanie','backpack'];
const LABELS={none:'NINGUNO',cap:'GORRA',glasses:'GAFAS',headphones:'AURICULARES',scarf:'PAÑUELO',shoulderbag:'BOLSO',bow:'LAZO',beanie:'GORRO',backpack:'MOCHILA'};
const PALETTES={
skin:['#f6d6bc','#efc3a1','#d89c73','#b8754c','#8b5537','#5b3425'],
hairColor:['#2b211c','#4a3024','#7c4d31','#8b3441','#e4b842','#dfe4ea','#40558d','#c33d49'],
topColor:['#e7edf1','#63a9d7','#347bc5','#d34d52','#4e9255','#e0ac36','#835eb7','#202831'],
topAccent:['#ffffff','#202831','#e76b26','#f0c342','#55b9d8','#d96991','#7e72c7','#9aa7b1'],
bottomColor:['#202831','#3f78b8','#b98555','#4b5662','#557345','#eceff2','#2d3238','#3c86c8'],
bottomAccent:['#aab4bd','#76a5d4','#6a4637','#e9d2af','#b5c56a','#d96991','#d34d52','#8e70bf'],
shoesColor:['#2c74b8','#d84c43','#20262e','#81583a','#548b49','#ee7b27'],
shoesAccent:['#f5f7f8','#202831','#f2e5d2','#4a9bd0','#d34d52','#f0c342'],
accessoryColor:['#d9dde1','#202831','#6e4c3f','#d45052','#4a9bd0','#4f8a56','#d89ac2','#777f89'],
accessoryAccent:['#ffffff','#5d6872','#f0c342','#55b9d8','#e76b26','#d96991','#835eb7','#202831']};
let tab='hair',lastProfile='',readyOnce=false,lastPaint=0;
const profile=()=>C()?.profile?.()||{};
function apply(patch){C()?.setProfile?.(patch);lastProfile='';setTimeout(()=>{C()?.paintPreview?.();C()?.paintLobby?.();refresh(true)},0)}
function values(kind){if(kind==='accessory')return ACCESSORIES;return Array.from({length:COUNTS[kind]},(_,i)=>i+1)}
function current(kind,p){return kind==='accessory'?(p.customAccessory||'none'):p[kind]}
function ensureEditor(){const base=document.getElementById('avatarFinalBase');if(!base||!base.parentElement)return null;let panel=document.getElementById('avatarCustomizerV3');if(panel)return panel;panel=document.createElement('section');panel.id='avatarCustomizerV3';panel.innerHTML='<div class="avatar-v3-skin"></div><div class="avatar-v3-tabs"></div><div class="avatar-v3-options"></div><div class="avatar-v3-colors"></div><p class="avatar-v3-status"></p>';base.insertAdjacentElement('afterend',panel);const tabs=panel.querySelector('.avatar-v3-tabs');[['hair','PELO'],['top','TOP'],['bottom','BOTTOM'],['shoes','CALZADO'],['accessory','ACCESORIOS']].forEach(([k,l])=>{const b=document.createElement('button');b.type='button';b.dataset.kind=k;b.textContent=l;b.onclick=()=>{tab=k;refresh(true)};tabs.append(b)});return panel}
function colorControl(host,label,field,palette){const p=profile(),row=document.createElement('div');row.className='avatar-v3-color-control';const head=document.createElement('div');head.className='avatar-v3-color-head';head.innerHTML=`<b>${label}</b><span>${p[field]||palette[0]}</span>`;row.append(head);const sw=document.createElement('div');sw.className='avatar-v3-swatches';palette.forEach(v=>{const b=document.createElement('button');b.type='button';b.className='avatar-v3-swatch'+(String(p[field]).toLowerCase()===v.toLowerCase()?' selected':'');b.style.setProperty('--sw',v);b.title=v;b.onclick=()=>apply({[field]:v});sw.append(b)});const pick=document.createElement('input');pick.type='color';pick.className='avatar-v3-picker';pick.value=/^#[0-9a-f]{6}$/i.test(p[field]||'')?p[field]:palette[0];pick.oninput=e=>apply({[field]:e.target.value});sw.append(pick);row.append(sw);host.append(row)}
function renderOptions(host){host.textContent='';const p=profile();for(const v of values(tab)){const b=document.createElement('button');b.type='button';b.className='avatar-v3-option'+(String(current(tab,p))===String(v)?' selected':'');const thumb=C()?.thumbFor?.(tab,v);if(thumb){thumb.className='avatar-v3-thumb';b.append(thumb)}const s=document.createElement('small');s.textContent=tab==='accessory'?LABELS[v]:String(v);b.append(s);b.onclick=()=>apply(tab==='accessory'?{customAccessory:v}:{[tab]:v});host.append(b)}}
function renderColors(host){host.textContent='';if(tab==='hair')colorControl(host,'COLOR DE PELO','hairColor',PALETTES.hairColor);if(tab==='top'){colorControl(host,'COLOR PRINCIPAL','topColor',PALETTES.topColor);colorControl(host,'DETALLE','topAccent',PALETTES.topAccent)}if(tab==='bottom'){colorControl(host,'COLOR PRINCIPAL','bottomColor',PALETTES.bottomColor);colorControl(host,'DETALLE','bottomAccent',PALETTES.bottomAccent)}if(tab==='shoes'){colorControl(host,'COLOR PRINCIPAL','shoesColor',PALETTES.shoesColor);colorControl(host,'DETALLE','shoesAccent',PALETTES.shoesAccent)}if(tab==='accessory'){colorControl(host,'COLOR PRINCIPAL','accessoryColor',PALETTES.accessoryColor);colorControl(host,'DETALLE','accessoryAccent',PALETTES.accessoryAccent)}}
function refresh(rebuild=false){const panel=ensureEditor();if(!panel)return;const p=profile();panel.querySelectorAll('.avatar-v3-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.kind===tab));if(rebuild){const skin=panel.querySelector('.avatar-v3-skin');skin.textContent='';colorControl(skin,'TONO DE PIEL','skin',PALETTES.skin);renderOptions(panel.querySelector('.avatar-v3-options'));renderColors(panel.querySelector('.avatar-v3-colors'))}panel.querySelector('.avatar-v3-status').textContent=C()?.ready?.()?'Vista previa aplicada al personaje grande.':'Cargando atlas modular…';lastProfile=JSON.stringify(p)}
function wire(){document.addEventListener('click',e=>{if(e.target.closest('#avatarButton,#avatarFinalBase button,#saveAvatarFinal'))setTimeout(()=>{ensureEditor();C()?.paintPreview?.();refresh(true)},30)})}
function loop(ts){const comp=C();if(comp?.ready?.()){if(!readyOnce){readyOnce=true;refresh(true)}if(ts-lastPaint>42){lastPaint=ts;comp.paintLobby?.();comp.paintPreview?.()}const k=JSON.stringify(profile());if(k!==lastProfile)refresh(true)}else ensureEditor();requestAnimationFrame(loop)}
function boot(){ensureEditor();refresh(true);wire();requestAnimationFrame(loop)}
window.ML3DAvatarCustomizerV3={profile,setProfile:apply,refresh};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();