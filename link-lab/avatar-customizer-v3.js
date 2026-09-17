(() => {
  'use strict';
  if (window.__ml3dAvatarCustomizerV3) return;
  window.__ml3dAvatarCustomizerV3 = true;

  const W = 64;
  const H = 96;
  const ATLAS_SRC = './assets/avatar-modular/avatar-modular-atlas-v1.png?v=2';
  const SECTION_Y = { hair:0, top:768, bottom:1536, shoes:2304, accessory:3072 };
  const VARIANT_COLS = { hair:4, top:4, bottom:4, shoes:3, accessory:4 };
  const DIR_ROW = { down:0, up:1, left:2, right:3 };
  const COUNTS = { hair:8, top:8, bottom:8, shoes:6, accessory:8 };
  const ACCESSORIES = ['none','cap','glasses','headphones','scarf','shoulderbag','bow','beanie','backpack'];
  const ACCESSORY_LABELS = ['NINGUNO','GORRA','GAFAS','AURICULARES','PAÑUELO','BOLSO','LAZO','GORRO','MOCHILA'];

  const DEFAULTS = {
    skin:'#efc3a1', hairColor:'#4a3024',
    topColor:'#4a9bd0', topAccent:'#efe7d8',
    bottomColor:'#33485f', bottomAccent:'#7ea8d4',
    shoesColor:'#20262e', shoesAccent:'#e8edf2',
    accessoryColor:'#4a9bd0', accessoryAccent:'#efe7d8',
    customAccessory:'none'
  };

  const PALETTES = {
    skin:['#f6d6bc','#efc3a1','#d89c73','#b8754c','#8b5537','#5b3425'],
    hairColor:['#2b211c','#4a3024','#7c4d31','#8b3441','#e4b842','#dfe4ea','#40558d','#c33d49'],
    topColor:['#e7edf1','#63a9d7','#347bc5','#d34d52','#4e9255','#e0ac36','#835eb7','#202831'],
    topAccent:['#ffffff','#202831','#e76b26','#f0c342','#55b9d8','#d96991','#7e72c7','#9aa7b1'],
    bottomColor:['#202831','#3f78b8','#b98555','#4b5662','#557345','#eceff2','#2d3238','#3c86c8'],
    bottomAccent:['#aab4bd','#76a5d4','#6a4637','#e9d2af','#b5c56a','#d96991','#d34d52','#8e70bf'],
    shoesColor:['#2c74b8','#d84c43','#20262e','#81583a','#548b49','#ee7b27'],
    shoesAccent:['#f5f7f8','#202831','#f2e5d2','#4a9bd0','#d34d52','#f0c342'],
    accessoryColor:['#d9dde1','#202831','#6e4c3f','#d45052','#4a9bd0','#4f8a56','#d89ac2','#777f89'],
    accessoryAccent:['#ffffff','#5d6872','#f0c342','#55b9d8','#e76b26','#d96991','#835eb7','#202831']
  };

  const api = () => window.ML3DAvatarFinal;
  const clamp = n => Math.max(0, Math.min(255, Math.round(n)));
  const hexToRgb = hex => {
    const clean = String(hex || '#ffffff').replace('#','');
    const n = Number.parseInt(clean,16) || 0xffffff;
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  };
  const mix = (a,b,t) => a + (b-a)*t;
  const smooth = (a,b,x) => {
    const t = Math.max(0, Math.min(1, (x-a)/Math.max(.0001,b-a)));
    return t*t*(3-2*t);
  };
  const lighten = (hex, amount=.28) => {
    const c = hexToRgb(hex);
    const r = clamp(c.r + (255-c.r)*amount);
    const g = clamp(c.g + (255-c.g)*amount);
    const b = clamp(c.b + (255-c.b)*amount);
    return `#${[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')}`;
  };

  function profile() {
    const p = { ...DEFAULTS, ...(api()?.getProfile?.() || {}) };
    if (!p.topColor) p.topColor = p.primary || DEFAULTS.topColor;
    if (!p.topAccent) p.topAccent = p.secondary || DEFAULTS.topAccent;
    if (!p.bottomColor) p.bottomColor = p.primary || DEFAULTS.bottomColor;
    if (!p.bottomAccent) p.bottomAccent = p.secondary || DEFAULTS.bottomAccent;
    if (!p.shoesColor) p.shoesColor = DEFAULTS.shoesColor;
    if (!p.shoesAccent) p.shoesAccent = DEFAULTS.shoesAccent;
    if (!p.accessoryColor) p.accessoryColor = p.primary || DEFAULTS.accessoryColor;
    if (!p.accessoryAccent) p.accessoryAccent = p.secondary || DEFAULTS.accessoryAccent;
    if (!p.customAccessory || p.customAccessory === 'none') {
      const legacy = {cap:'cap',glasses:'glasses',headphones:'headphones',scarf:'scarf',shoulderbag:'shoulderbag',backpack:'backpack',beret:'beanie'};
      p.customAccessory = legacy[p.accessory] || 'none';
    }
    return p;
  }

  let atlas = null;
  let atlasReady = false;
  let atlasError = false;
  let activeTab = 'hair';
  let lastProfileKey = '';
  let lastEnsureAt = 0;
  const frameCache = new Map();
  const boundsCache = new WeakMap();

  function setProfile(patch) {
    api()?.setProfile?.(patch);
    frameCache.clear();
    queueMicrotask(() => {
      ensureEditor();
      refreshEditor();
    });
  }

  function loadAtlas() {
    return new Promise(resolve => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        atlas = img;
        atlasReady = true;
        atlasError = false;
        frameCache.clear();
        resolve(true);
      };
      img.onerror = () => {
        atlasError = true;
        resolve(false);
      };
      img.src = ATLAS_SRC;
    });
  }

  function frameRect(kind, variant, dir, frame) {
    const cols = VARIANT_COLS[kind];
    const index = Math.max(0, Number(variant)-1);
    const blockCol = index % cols;
    const blockRow = Math.floor(index / cols);
    return {
      x: blockCol * 256 + Math.max(0, Math.min(3, Number(frame)||0)) * W,
      y: SECTION_Y[kind] + blockRow * 384 + (DIR_ROW[dir] ?? 0) * H
    };
  }

  function tintedFrame(kind, variant, dir, frame, primary, accent) {
    if (!atlasReady || !atlas || !variant) return null;
    const key = [kind,variant,dir,frame,primary,accent].join('|');
    if (frameCache.has(key)) return frameCache.get(key);

    const {x,y} = frameRect(kind, variant, dir, frame);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', {willReadFrequently:true});
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas,x,y,W,H,0,0,W,H);

    const image = ctx.getImageData(0,0,W,H);
    const d = image.data;
    const p = hexToRgb(primary);
    const a = hexToRgb(accent || lighten(primary,.3));
    for (let i=0;i<d.length;i+=4) {
      if (d[i+3] < 8) continue;
      const lum = d[i];
      if (lum < 34) {
        const v = clamp(8 + lum * .45);
        d[i]=v; d[i+1]=v; d[i+2]=v;
        continue;
      }
      const lightMix = smooth(150,235,lum);
      const baseR = mix(p.r,a.r,lightMix*.9);
      const baseG = mix(p.g,a.g,lightMix*.9);
      const baseB = mix(p.b,a.b,lightMix*.9);
      const shade = .42 + (lum/255)*.78;
      d[i]=clamp(baseR*shade);
      d[i+1]=clamp(baseG*shade);
      d[i+2]=clamp(baseB*shade);
    }
    ctx.putImageData(image,0,0);
    frameCache.set(key,c);
    return c;
  }

  function alphaBounds(canvas, threshold=12) {
    if (!canvas?.getContext) return null;
    const cached = boundsCache.get(canvas);
    if (cached && cached.width === canvas.width && cached.height === canvas.height) return cached.bounds;
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for (let y=0;y<canvas.height;y++) {
      for (let x=0;x<canvas.width;x++) {
        if (data[(y*canvas.width+x)*4+3] < threshold) continue;
        if (x<minX) minX=x;
        if (y<minY) minY=y;
        if (x>maxX) maxX=x;
        if (y>maxY) maxY=y;
      }
    }
    const bounds = maxX < minX ? null : {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
    boundsCache.set(canvas,{width:canvas.width,height:canvas.height,bounds});
    return bounds;
  }

  function bodyBox(baseCanvas) {
    const b = alphaBounds(baseCanvas) || {x:baseCanvas.width*.25,y:baseCanvas.height*.12,w:baseCanvas.width*.5,h:baseCanvas.height*.8};
    const cx = b.x + b.w/2;
    return { ...b, cx, bottom:b.y+b.h };
  }

  function targetBox(kind, baseCanvas, accessory='none') {
    const b = bodyBox(baseCanvas);
    const box = (cx,y,w,h) => ({x:cx-w/2,y,w,h});
    if (kind === 'hair') return box(b.cx, b.y-b.h*.035, b.w*1.16, b.h*.36);
    if (kind === 'top') return box(b.cx, b.y+b.h*.34, b.w*1.02, b.h*.31);
    if (kind === 'bottom') return box(b.cx, b.y+b.h*.62, b.w*.90, b.h*.24);
    if (kind === 'shoes') return box(b.cx, b.y+b.h*.84, b.w*.86, b.h*.16);
    if (kind === 'accessory') {
      if (accessory === 'cap' || accessory === 'beanie' || accessory === 'bow')
        return box(b.cx, b.y-b.h*.055, b.w*1.18, b.h*.27);
      if (accessory === 'glasses' || accessory === 'headphones')
        return box(b.cx, b.y+b.h*.08, b.w*1.08, b.h*.24);
      if (accessory === 'scarf')
        return box(b.cx, b.y+b.h*.29, b.w*.95, b.h*.22);
      if (accessory === 'backpack' || accessory === 'shoulderbag')
        return box(b.cx, b.y+b.h*.31, b.w*1.24, b.h*.48);
      return box(b.cx, b.y+b.h*.18, b.w*1.08, b.h*.34);
    }
    return box(b.cx,b.y,b.w,b.h);
  }

  function drawFitted(ctx, piece, target, anchor='center') {
    if (!piece) return;
    const s = alphaBounds(piece);
    if (!s) return;
    const scale = Math.min(target.w/s.w, target.h/s.h);
    const dw = Math.max(1,Math.round(s.w*scale));
    const dh = Math.max(1,Math.round(s.h*scale));
    const dx = Math.round(target.x + (target.w-dw)/2);
    let dy = Math.round(target.y + (target.h-dh)/2);
    if (anchor === 'bottom') dy = Math.round(target.y + target.h - dh);
    if (anchor === 'top') dy = Math.round(target.y);
    ctx.drawImage(piece,s.x,s.y,s.w,s.h,dx,dy,dw,dh);
  }

  function drawComposite(target, rawProfile, dir='down', frame=0, baseCanvas=null) {
    if (!target?.getContext) return;
    const ctx = target.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,target.width,target.height);
    if (!atlasReady) return;

    const p = { ...DEFAULTS, ...(rawProfile || profile()) };
    if (!baseCanvas) {
      const host = target.parentElement;
      baseCanvas = host?.querySelector(':scope > .avatar-idle-complete-canvas') || host?.querySelector(':scope > .avatar-v5-canvas') || null;
    }
    if (!baseCanvas) return;

    const accessory = p.customAccessory || 'none';
    const accIndex = ACCESSORIES.indexOf(accessory);
    const behind = accessory === 'backpack' || accessory === 'shoulderbag';

    if (behind && accIndex > 0) {
      const piece = tintedFrame('accessory',accIndex,dir,frame,p.accessoryColor,p.accessoryAccent);
      drawFitted(ctx,piece,targetBox('accessory',baseCanvas,accessory),'center');
    }

    const top = tintedFrame('top',p.top,dir,frame,p.topColor,p.topAccent);
    const bottom = tintedFrame('bottom',p.bottom,dir,frame,p.bottomColor,p.bottomAccent);
    const shoes = tintedFrame('shoes',p.shoes,dir,frame,p.shoesColor,p.shoesAccent);
    const hair = tintedFrame('hair',p.hair,dir,frame,p.hairColor,lighten(p.hairColor,.34));

    drawFitted(ctx,top,targetBox('top',baseCanvas),'center');
    drawFitted(ctx,bottom,targetBox('bottom',baseCanvas),'bottom');
    drawFitted(ctx,shoes,targetBox('shoes',baseCanvas),'bottom');
    drawFitted(ctx,hair,targetBox('hair',baseCanvas),'bottom');

    if (!behind && accIndex > 0) {
      const piece = tintedFrame('accessory',accIndex,dir,frame,p.accessoryColor,p.accessoryAccent);
      drawFitted(ctx,piece,targetBox('accessory',baseCanvas,accessory),'center');
    }
  }

  function skinMask(base, out, skin) {
    if (!base || !out) return;
    if (out.width !== base.width) out.width = base.width;
    if (out.height !== base.height) out.height = base.height;
    const bctx = base.getContext('2d',{willReadFrequently:true});
    const octx = out.getContext('2d',{willReadFrequently:true});
    const src = bctx.getImageData(0,0,base.width,base.height);
    const dst = octx.createImageData(base.width,base.height);
    const col = hexToRgb(skin);
    for (let i=0;i<src.data.length;i+=4) {
      const r=src.data[i],g=src.data[i+1],b=src.data[i+2],a=src.data[i+3];
      if (a < 15) continue;
      const warm = r > g*1.025 && g > b*.98 && r > 80 && (r-b) > 14;
      if (!warm) continue;
      const lum = (r*.299+g*.587+b*.114)/185;
      const shade = Math.max(.52,Math.min(1.34,lum));
      dst.data[i]=clamp(col.r*shade);
      dst.data[i+1]=clamp(col.g*shade);
      dst.data[i+2]=clamp(col.b*shade);
      dst.data[i+3]=a;
    }
    octx.clearRect(0,0,out.width,out.height);
    octx.putImageData(dst,0,0);
  }

  function ensureCanvas(host, cls, w, h) {
    let c = host.querySelector(`:scope > .${cls}`);
    if (!c) {
      c = document.createElement('canvas');
      c.className = cls;
      c.setAttribute('aria-hidden','true');
      host.append(c);
    }
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    return c;
  }

  function visiblePlayerBase(player,host) {
    const idle = host.querySelector(':scope > .avatar-idle-complete-canvas');
    const dir = player.dataset.ml3dDirection || 'down';
    const useIdle = idle && !player.classList.contains('ml3d-walking') && (dir === 'down' || dir === 'up');
    return useIdle ? idle : host.querySelector(':scope > .avatar-v5-canvas');
  }

  function stateFromPlayer(player,base) {
    const dir = player.dataset.ml3dDirection || String(base?.dataset.paintKey || '').split(':')[2] || 'down';
    const parts = String(base?.dataset.paintKey || '').split(':');
    const frame = Number(parts[3]) || 0;
    return {dir:['down','up','left','right'].includes(dir)?dir:'down',frame};
  }

  function syncLayerCss(layer,base) {
    const cs = getComputedStyle(base);
    const width = parseFloat(cs.width) || base.width;
    const height = parseFloat(cs.height) || base.height;
    layer.style.width = `${width}px`;
    layer.style.height = `${height}px`;
    layer.style.left = cs.left || '50%';
    layer.style.bottom = cs.bottom || '0px';
    layer.style.transform = cs.transform && cs.transform !== 'none' ? cs.transform : 'translateX(-50%)';
  }

  function repaintPlayers() {
    const p = profile();
    document.querySelectorAll('#playersLayer .player.local').forEach(player => {
      const host = player.querySelector(':scope > .avatar-base-host');
      if (!host) return;
      const base = visiblePlayerBase(player,host);
      if (!base) return;
      const skin = ensureCanvas(host,'avatar-v3-skin-canvas',base.width,base.height);
      const layer = ensureCanvas(host,'avatar-v3-layer-canvas',base.width,base.height);
      syncLayerCss(skin,base);
      syncLayerCss(layer,base);
      const state = stateFromPlayer(player,base);
      skinMask(base,skin,p.skin);
      drawComposite(layer,p,state.dir,state.frame,base);
    });
  }

  function previewBase() {
    return document.querySelector('#avatarFinalPreview > canvas.avatar-v5-preview');
  }

  function repaintPreview() {
    const root = document.getElementById('avatarFinalPreview');
    const base = previewBase();
    if (!root || !base) return;
    const p = profile();
    const skin = ensureCanvas(root,'avatar-v3-skin-preview',base.width,base.height);
    const layer = ensureCanvas(root,'avatar-v3-layer-preview',base.width,base.height);
    skinMask(base,skin,p.skin);
    drawComposite(layer,p,'down',0,base);
  }

  function makeOptionCanvas(kind,value,p) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const sourceBase = previewBase() || document.querySelector('#avatarFinalBase button.selected canvas.avatar-v5-choice') || document.querySelector('#avatarFinalBase button canvas.avatar-v5-choice');
    if (sourceBase) ctx.drawImage(sourceBase,0,0,c.width,c.height);

    if (!atlasReady || (kind === 'accessory' && value === 'none')) return c;
    const baseForFit = c;
    let piece = null;
    let boxKind = kind;
    let anchor = 'center';
    if (kind === 'hair') { piece=tintedFrame('hair',value,'down',0,p.hairColor,lighten(p.hairColor,.34)); anchor='bottom'; }
    if (kind === 'top') piece=tintedFrame('top',value,'down',0,p.topColor,p.topAccent);
    if (kind === 'bottom') { piece=tintedFrame('bottom',value,'down',0,p.bottomColor,p.bottomAccent); anchor='bottom'; }
    if (kind === 'shoes') { piece=tintedFrame('shoes',value,'down',0,p.shoesColor,p.shoesAccent); anchor='bottom'; }
    if (kind === 'accessory') piece=tintedFrame('accessory',ACCESSORIES.indexOf(value),'down',0,p.accessoryColor,p.accessoryAccent);
    drawFitted(ctx,piece,targetBox(boxKind,baseForFit,kind==='accessory'?value:'none'),anchor);
    return c;
  }

  function colorControl(parent,label,field,palette) {
    const p=profile();
    const row=document.createElement('div');
    row.className='avatar-v3-color-control';
    const head=document.createElement('div');
    head.className='avatar-v3-color-head';
    head.innerHTML=`<b>${label}</b><span>${p[field] || palette[0]}</span>`;
    row.append(head);

    const swatches=document.createElement('div');
    swatches.className='avatar-v3-swatches';
    for (const value of palette) {
      const b=document.createElement('button');
      b.type='button';
      b.className='avatar-v3-swatch'+(String(p[field]).toLowerCase()===value.toLowerCase()?' selected':'');
      b.style.setProperty('--sw',value);
      b.title=value;
      b.addEventListener('click',()=>setProfile({[field]:value}));
      swatches.append(b);
    }
    const picker=document.createElement('input');
    picker.type='color';
    picker.className='avatar-v3-picker';
    picker.value=p[field] || palette[0];
    picker.addEventListener('input',()=>setProfile({[field]:picker.value}));
    swatches.append(picker);
    row.append(swatches);
    parent.append(row);
  }

  function categoryValues(kind) {
    if (kind === 'accessory') return ACCESSORIES;
    return Array.from({length:COUNTS[kind]},(_,i)=>i+1);
  }

  function currentValue(kind,p) {
    return kind === 'accessory' ? (p.customAccessory || 'none') : p[kind];
  }

  function selectValue(kind,value) {
    setProfile({[kind === 'accessory' ? 'customAccessory' : kind]:value});
  }

  function renderOptions(host,kind) {
    const p=profile();
    host.textContent='';
    for (const value of categoryValues(kind)) {
      const b=document.createElement('button');
      b.type='button';
      b.className='avatar-v3-option'+(String(currentValue(kind,p))===String(value)?' selected':'');
      if (kind==='accessory' && value==='none') {
        const empty=document.createElement('span');
        empty.className='avatar-v3-none';
        empty.textContent='×';
        b.append(empty);
      } else {
        b.append(makeOptionCanvas(kind,value,p));
      }
      const label=document.createElement('small');
      label.textContent=kind==='accessory' ? ACCESSORY_LABELS[ACCESSORIES.indexOf(value)] : `${value}`;
      b.append(label);
      b.addEventListener('click',()=>selectValue(kind,value));
      host.append(b);
    }
  }

  function renderColors(host,kind) {
    host.textContent='';
    if (kind==='hair') colorControl(host,'COLOR DE PELO','hairColor',PALETTES.hairColor);
    if (kind==='top') {
      colorControl(host,'COLOR PRINCIPAL','topColor',PALETTES.topColor);
      colorControl(host,'DETALLE','topAccent',PALETTES.topAccent);
    }
    if (kind==='bottom') {
      colorControl(host,'COLOR PRINCIPAL','bottomColor',PALETTES.bottomColor);
      colorControl(host,'DETALLE','bottomAccent',PALETTES.bottomAccent);
    }
    if (kind==='shoes') {
      colorControl(host,'COLOR PRINCIPAL','shoesColor',PALETTES.shoesColor);
      colorControl(host,'DETALLE','shoesAccent',PALETTES.shoesAccent);
    }
    if (kind==='accessory') {
      colorControl(host,'COLOR PRINCIPAL','accessoryColor',PALETTES.accessoryColor);
      colorControl(host,'DETALLE','accessoryAccent',PALETTES.accessoryAccent);
    }
  }

  function createEditorPanel() {
    const panel=document.createElement('div');
    panel.id='avatarCustomizerV3';
    panel.innerHTML=`
      <div class="avatar-v3-skin"></div>
      <div class="avatar-v3-tabs"></div>
      <div class="avatar-v3-options"></div>
      <div class="avatar-v3-colors"></div>
      <p class="avatar-v3-status" aria-live="polite"></p>`;
    const tabs=panel.querySelector('.avatar-v3-tabs');
    for (const [kind,label] of [['hair','PELO'],['top','TOP'],['bottom','BOTTOM'],['shoes','CALZADO'],['accessory','ACCESORIOS']]) {
      const b=document.createElement('button');
      b.type='button';
      b.dataset.kind=kind;
      b.textContent=label;
      b.addEventListener('click',()=>{activeTab=kind;refreshEditor();});
      tabs.append(b);
    }
    return panel;
  }

  function ensureEditor() {
    const baseRow=document.getElementById('avatarFinalBase');
    if (!baseRow?.parentNode) return null;
    let panel=document.getElementById('avatarCustomizerV3');
    if (!panel) panel=createEditorPanel();
    if (panel.parentNode !== baseRow.parentNode || panel.previousElementSibling !== baseRow) {
      baseRow.insertAdjacentElement('afterend',panel);
    }
    return panel;
  }

  function refreshEditor(rebuild=true) {
    const panel=ensureEditor();
    if (!panel) return;
    const p=profile();
    panel.querySelectorAll('.avatar-v3-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.kind===activeTab));
    if (rebuild) {
      const skin=panel.querySelector('.avatar-v3-skin');
      skin.textContent='';
      colorControl(skin,'TONO DE PIEL','skin',PALETTES.skin);
      renderOptions(panel.querySelector('.avatar-v3-options'),activeTab);
      renderColors(panel.querySelector('.avatar-v3-colors'),activeTab);
    }
    const status=panel.querySelector('.avatar-v3-status');
    status.textContent=atlasError ? 'No se pudo cargar el atlas modular.' : (!atlasReady ? 'Cargando ropa y accesorios…' : 'Cambios aplicados al personaje.');
    lastProfileKey=JSON.stringify(p);
  }

  function removeLegacyCustomizerCanvases() {
    document.querySelectorAll('.avatar-custom-skin-canvas,.avatar-custom-layer-canvas,.avatar-custom-skin-preview,.avatar-custom-layer-preview').forEach(el=>el.remove());
  }

  function tick(now) {
    repaintPlayers();
    repaintPreview();

    if (now-lastEnsureAt > 180) {
      lastEnsureAt=now;
      const panel=ensureEditor();
      if (panel) {
        const current=JSON.stringify(profile());
        if (current!==lastProfileKey) refreshEditor();
      }
    }
    requestAnimationFrame(tick);
  }

  async function boot() {
    removeLegacyCustomizerCanvases();
    ensureEditor();
    refreshEditor();
    await loadAtlas();
    refreshEditor();

    document.addEventListener('click',event=>{
      if (event.target.closest('#avatarButton,#avatarFinalBase button,#saveAvatarFinal')) {
        setTimeout(()=>{ensureEditor();refreshEditor();},0);
        setTimeout(()=>{ensureEditor();refreshEditor();},80);
      }
    });

    requestAnimationFrame(tick);
  }

  window.ML3DAvatarCustomizerV3 = {
    defaults:DEFAULTS,
    getProfile:profile,
    setProfile,
    skinMask,
    drawComposite,
    refreshEditor,
    ensureEditor
  };

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
