(() => {
  'use strict';
  if (window.__ml3dAvatarCustomizerV3) return;
  window.__ml3dAvatarCustomizerV3 = true;

  const W = 64;
  const H = 96;
  const ATLAS_SRC = './assets/avatar-modular/avatar-modular-atlas-v1.png?v=1';
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
  const profile = () => {
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
  };
  const setProfile = patch => api()?.setProfile?.(patch);
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

  let atlas = null;
  let atlasReady = false;
  let atlasError = false;
  const frameCache = new Map();
  let activeTab = 'hair';
  let lastProfileKey = '';

  function loadAtlas() {
    return new Promise(resolve => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { atlas = img; atlasReady = true; atlasError = false; frameCache.clear(); resolve(true); };
      img.onerror = () => { atlasError = true; resolve(false); };
      img.src = ATLAS_SRC;
    });
  }

  function frameRect(kind, variant, dir, frame) {
    const cols = VARIANT_COLS[kind];
    const index = Math.max(0, Number(variant)-1);
    const blockCol = index % cols;
    const blockRow = Math.floor(index / cols);
    const x = blockCol * 256 + (Math.max(0, Math.min(3, Number(frame)||0)) * W);
    const y = SECTION_Y[kind] + blockRow * 384 + (DIR_ROW[dir] ?? 0) * H;
    return {x,y};
  }

  function tintedFrame(kind, variant, dir, frame, primary, accent) {
    if (!atlasReady || !atlas || !variant) return null;
    const key = [kind,variant,dir,frame,primary,accent].join('|');
    if (frameCache.has(key)) return frameCache.get(key);
    const rect = frameRect(kind, variant, dir, frame);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', {willReadFrequently:true});
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(atlas, rect.x, rect.y, W, H, 0, 0, W, H);
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

  function skinMask(base, out, skin) {
    if (!base || !out) return;
    if (out.width !== base.width) out.width = base.width;
    if (out.height !== base.height) out.height = base.height;
    const bctx = base.getContext('2d', {willReadFrequently:true});
    const octx = out.getContext('2d', {willReadFrequently:true});
    const src = bctx.getImageData(0,0,base.width,base.height);
    const dst = octx.createImageData(base.width,base.height);
    const col = hexToRgb(skin);
    for (let i=0;i<src.data.length;i+=4) {
      const r=src.data[i], g=src.data[i+1], b=src.data[i+2], alpha=src.data[i+3];
      if (alpha < 15) continue;
      const warm = r > g*1.025 && g > b*.98 && r > 80 && (r-b) > 14;
      if (!warm) continue;
      const lum = (r*.299 + g*.587 + b*.114) / 185;
      const shade = Math.max(.52, Math.min(1.34,lum));
      dst.data[i]=clamp(col.r*shade);
      dst.data[i+1]=clamp(col.g*shade);
      dst.data[i+2]=clamp(col.b*shade);
      dst.data[i+3]=alpha;
    }
    octx.clearRect(0,0,out.width,out.height);
    octx.putImageData(dst,0,0);
  }

  function drawComposite(target, p, dir='down', frame=0) {
    const ctx = target.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,target.width,target.height);
    if (!atlasReady) return;
    const accessory = p.customAccessory || 'none';
    const accIndex = ACCESSORIES.indexOf(accessory);
    const pieces = [
      tintedFrame('top', p.top, dir, frame, p.topColor, p.topAccent),
      tintedFrame('bottom', p.bottom, dir, frame, p.bottomColor, p.bottomAccent),
      tintedFrame('shoes', p.shoes, dir, frame, p.shoesColor, p.shoesAccent),
      tintedFrame('hair', p.hair, dir, frame, p.hairColor, lighten(p.hairColor,.34))
    ];
    if (accIndex > 0) pieces.push(tintedFrame('accessory', accIndex, dir, frame, p.accessoryColor, p.accessoryAccent));
    for (const piece of pieces) if (piece) ctx.drawImage(piece,0,0,target.width,target.height);
  }

  function ensureCanvas(host, cls, w=W, h=H) {
    let c = host.querySelector(`:scope > .${cls}`);
    if (!c) {
      c = document.createElement('canvas');
      c.className = cls;
      c.width = w; c.height = h;
      c.setAttribute('aria-hidden','true');
      host.append(c);
    }
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    return c;
  }

  function parsePaintKey(canvas) {
    const parts = String(canvas?.dataset.paintKey || 'male:rows:down:0').split(':');
    return { dir:['down','up','left','right'].includes(parts[2]) ? parts[2] : 'down', frame:Number(parts[3]) || 0 };
  }

  function repaintPlayers() {
    const p = profile();
    document.querySelectorAll('#playersLayer .player.local').forEach(player => {
      const host = player.querySelector(':scope > .avatar-base-host');
      const base = host?.querySelector(':scope > .avatar-v5-canvas');
      if (!host || !base) return;
      const skin = ensureCanvas(host,'avatar-v3-skin-canvas');
      const layer = ensureCanvas(host,'avatar-v3-layer-canvas');
      const state = parsePaintKey(base);
      skinMask(base,skin,p.skin);
      drawComposite(layer,p,state.dir,state.frame);
    });
  }

  function drawContained(src,dst,padding=14) {
    const ctx = dst.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,dst.width,dst.height);
    const scale = Math.min((dst.width-padding*2)/W,(dst.height-padding*2)/H);
    const dw = Math.round(W*scale), dh = Math.round(H*scale);
    const dx = Math.round((dst.width-dw)/2), dy = Math.round((dst.height-dh)/2);
    ctx.drawImage(src,0,0,W,H,dx,dy,dw,dh);
  }

  function repaintPreview() {
    const root = document.getElementById('avatarFinalPreview');
    const base = root?.querySelector(':scope > .avatar-v5-preview');
    if (!root || !base) return;
    const p = profile();
    const skin = ensureCanvas(root,'avatar-v3-skin-preview',128,168);
    skinMask(base,skin,p.skin);
    const logical = document.createElement('canvas');
    logical.width=W; logical.height=H;
    drawComposite(logical,p,'down',0);
    const layer = ensureCanvas(root,'avatar-v3-layer-preview',128,168);
    drawContained(logical,layer,14);
  }

  function optionPreview(kind, value, p) {
    const c = document.createElement('canvas');
    c.width=W; c.height=H;
    if (!atlasReady) return c;
    if (kind === 'accessory' && value === 'none') return c;
    const variant = kind === 'accessory' ? ACCESSORIES.indexOf(value) : value;
    let primary, accent;
    if (kind === 'hair') { primary=p.hairColor; accent=lighten(p.hairColor,.34); }
    if (kind === 'top') { primary=p.topColor; accent=p.topAccent; }
    if (kind === 'bottom') { primary=p.bottomColor; accent=p.bottomAccent; }
    if (kind === 'shoes') { primary=p.shoesColor; accent=p.shoesAccent; }
    if (kind === 'accessory') { primary=p.accessoryColor; accent=p.accessoryAccent; }
    const piece = tintedFrame(kind,variant,'down',0,primary,accent);
    if (piece) c.getContext('2d').drawImage(piece,0,0);
    return c;
  }

  function colorControl(parent,label,field,palette) {
    const p = profile();
    const row = document.createElement('div');
    row.className = 'avatar-v3-color-control';
    const head = document.createElement('div');
    head.className = 'avatar-v3-color-head';
    head.innerHTML = `<b>${label}</b><span>${p[field] || palette[0]}</span>`;
    row.append(head);
    const swatches = document.createElement('div');
    swatches.className = 'avatar-v3-swatches';
    palette.forEach(value => {
      const b = document.createElement('button');
      b.type='button';
      b.className='avatar-v3-swatch' + (String(p[field]).toLowerCase()===value.toLowerCase() ? ' selected' : '');
      b.style.setProperty('--sw',value);
      b.title=value;
      b.addEventListener('click',()=>{ setProfile({[field]:value}); frameCache.clear(); refreshEditor(); });
      swatches.append(b);
    });
    const picker = document.createElement('input');
    picker.type='color';
    picker.className='avatar-v3-picker';
    picker.value = p[field] || palette[0];
    picker.addEventListener('input',()=>{ setProfile({[field]:picker.value}); frameCache.clear(); refreshEditor(false); });
    swatches.append(picker);
    row.append(swatches);
    parent.append(row);
  }

  function categoryValues(kind) {
    if (kind === 'accessory') return ACCESSORIES;
    return Array.from({length:COUNTS[kind]},(_,i)=>i+1);
  }

  function currentValue(kind,p) {
    if (kind === 'accessory') return p.customAccessory || 'none';
    return p[kind];
  }

  function selectValue(kind,value) {
    const field = kind === 'accessory' ? 'customAccessory' : kind;
    setProfile({[field]:value});
    refreshEditor();
  }

  function renderOptions(host,kind) {
    const p = profile();
    host.textContent='';
    const values = categoryValues(kind);
    for (const value of values) {
      const b=document.createElement('button');
      b.type='button';
      b.className='avatar-v3-option' + (String(currentValue(kind,p))===String(value) ? ' selected' : '');
      if (kind === 'accessory' && value === 'none') {
        const empty=document.createElement('span'); empty.className='avatar-v3-none'; empty.textContent='×'; b.append(empty);
      } else {
        b.append(optionPreview(kind,value,p));
      }
      const label=document.createElement('small');
      label.textContent = kind==='accessory' ? ACCESSORY_LABELS[ACCESSORIES.indexOf(value)] : `${value}`;
      b.append(label);
      b.addEventListener('click',()=>selectValue(kind,value));
      host.append(b);
    }
  }

  function renderColors(host,kind) {
    host.textContent='';
    if (kind === 'hair') colorControl(host,'COLOR DE PELO','hairColor',PALETTES.hairColor);
    if (kind === 'top') { colorControl(host,'COLOR PRINCIPAL','topColor',PALETTES.topColor); colorControl(host,'DETALLE','topAccent',PALETTES.topAccent); }
    if (kind === 'bottom') { colorControl(host,'COLOR PRINCIPAL','bottomColor',PALETTES.bottomColor); colorControl(host,'DETALLE','bottomAccent',PALETTES.bottomAccent); }
    if (kind === 'shoes') { colorControl(host,'COLOR PRINCIPAL','shoesColor',PALETTES.shoesColor); colorControl(host,'DETALLE','shoesAccent',PALETTES.shoesAccent); }
    if (kind === 'accessory') { colorControl(host,'COLOR PRINCIPAL','accessoryColor',PALETTES.accessoryColor); colorControl(host,'DETALLE','accessoryAccent',PALETTES.accessoryAccent); }
  }

  function ensureEditor() {
    const baseRow = document.getElementById('avatarFinalBase');
    if (!baseRow) return null;
    let panel = document.getElementById('avatarCustomizerV3');
    if (!panel) {
      panel = document.createElement('div');
      panel.id='avatarCustomizerV3';
      panel.innerHTML=`
        <div class="avatar-v3-skin"></div>
        <div class="avatar-v3-tabs"></div>
        <div class="avatar-v3-options"></div>
        <div class="avatar-v3-colors"></div>
        <p class="avatar-v3-status" aria-live="polite"></p>`;
      baseRow.insertAdjacentElement('afterend',panel);
      const tabs=panel.querySelector('.avatar-v3-tabs');
      [['hair','PELO'],['top','TOP'],['bottom','BOTTOM'],['shoes','CALZADO'],['accessory','ACCESORIOS']].forEach(([kind,label])=>{
        const b=document.createElement('button'); b.type='button'; b.dataset.kind=kind; b.textContent=label;
        b.addEventListener('click',()=>{activeTab=kind;refreshEditor();}); tabs.append(b);
      });
    }
    return panel;
  }

  function refreshEditor(rebuild=true) {
    const panel = ensureEditor();
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
    status.textContent = atlasError ? 'No se pudo cargar el atlas modular.' : (!atlasReady ? 'Cargando ropa y accesorios…' : 'Cambios aplicados al personaje.');
    lastProfileKey=JSON.stringify(p);
  }

  function removeLegacyCustomizerCanvases() {
    document.querySelectorAll('.avatar-custom-skin-canvas,.avatar-custom-layer-canvas,.avatar-custom-skin-preview,.avatar-custom-layer-preview').forEach(el=>el.remove());
  }

  function tick() {
    repaintPlayers();
    repaintPreview();
    const now=JSON.stringify(profile());
    if (now !== lastProfileKey) refreshEditor();
    requestAnimationFrame(tick);
  }

  async function boot() {
    removeLegacyCustomizerCanvases();
    refreshEditor();
    await loadAtlas();
    refreshEditor();
    document.addEventListener('click',event=>{
      if (event.target.closest('#avatarButton,#avatarFinalBase button,#saveAvatarFinal')) setTimeout(()=>refreshEditor(),0);
    });
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
