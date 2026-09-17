(() => {
  'use strict';
  if (window.__ml3dAvatarAssetThumbsV1) return;
  window.__ml3dAvatarAssetThumbsV1 = true;

  const W = 64, H = 96;
  const ATLAS = './assets/avatar-modular/avatar-modular-atlas-v1.png?v=3';
  const SECTION_Y = { hair:0, top:768, bottom:1536, shoes:2304, accessory:3072 };
  const COLS = { hair:4, top:4, bottom:4, shoes:3, accessory:4 };
  const DIR_ROW = { down:0, up:1, left:2, right:3 };
  const ACCESSORIES = ['none','cap','glasses','headphones','scarf','shoulderbag','bow','beanie','backpack'];

  let atlas = null;
  let ready = false;
  const cache = new Map();

  const compositor = () => window.ML3DAvatarCompositor;
  const profile = () => compositor()?.profile?.() || {};
  const clamp = n => Math.max(0, Math.min(255, Math.round(n)));
  const rgb = hex => {
    const clean = String(hex || '#ffffff').replace('#','').padEnd(6,'f');
    const n = Number.parseInt(clean,16) || 0xffffff;
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  };
  const lighten = (hex, amount=.3) => {
    const c = rgb(hex);
    return '#'+[c.r,c.g,c.b].map(v => clamp(v+(255-v)*amount).toString(16).padStart(2,'0')).join('');
  };

  function frameRect(kind, variant, dir='down', frame=0) {
    const index = Math.max(0, Number(variant)-1);
    const cols = COLS[kind];
    return {
      x:(index%cols)*256 + Math.max(0,Math.min(3,Number(frame)||0))*W,
      y:SECTION_Y[kind] + Math.floor(index/cols)*384 + (DIR_ROW[dir] ?? 0)*H
    };
  }

  function bounds(canvas) {
    const data = canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
    let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for(let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) {
      if(data[(y*canvas.width+x)*4+3] < 10) continue;
      minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
    }
    return maxX<minX ? null : {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
  }

  function tintedFrame(kind, variant, primary, accent) {
    if(!ready || !atlas || !variant) return null;
    const key=[kind,variant,primary,accent].join('|');
    if(cache.has(key)) return cache.get(key);
    const r=frameRect(kind,variant,'down',0);
    const c=document.createElement('canvas'); c.width=W; c.height=H;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(atlas,r.x,r.y,W,H,0,0,W,H);
    const img=ctx.getImageData(0,0,W,H), d=img.data, p=rgb(primary), a=rgb(accent||lighten(primary));
    for(let i=0;i<d.length;i+=4){
      if(d[i+3]<8) continue;
      const lum=(d[i]+d[i+1]+d[i+2])/3;
      if(lum<34){const v=clamp(8+lum*.45);d[i]=d[i+1]=d[i+2]=v;continue;}
      const t=Math.max(0,Math.min(1,(lum-130)/110));
      const shade=.42+(lum/255)*.78;
      d[i]=clamp((p.r+(a.r-p.r)*t)*shade);
      d[i+1]=clamp((p.g+(a.g-p.g)*t)*shade);
      d[i+2]=clamp((p.b+(a.b-p.b)*t)*shade);
    }
    ctx.putImageData(img,0,0);
    c._assetBounds=bounds(c);
    cache.set(key,c);
    return c;
  }

  function assetThumbFor(kind, value) {
    const out=document.createElement('canvas');
    out.width=96; out.height=126;
    if(!ready) return out;
    const p=profile();
    let variant=value, primary='#ffffff', accent='#d9e0e6';
    if(kind==='hair'){ primary=p.hairColor||'#4a3024'; accent=lighten(primary,.34); }
    else if(kind==='top'){ primary=p.topColor||p.primary||'#4a9bd0'; accent=p.topAccent||p.secondary||'#efe7d8'; }
    else if(kind==='bottom'){ primary=p.bottomColor||p.primary||'#33485f'; accent=p.bottomAccent||p.secondary||'#7ea8d4'; }
    else if(kind==='shoes'){ primary=p.shoesColor||'#20262e'; accent=p.shoesAccent||'#e8edf2'; }
    else if(kind==='accessory'){
      if(value==='none') return out;
      variant=ACCESSORIES.indexOf(value);
      if(variant<=0) return out;
      primary=p.accessoryColor||p.primary||'#4a9bd0';
      accent=p.accessoryAccent||p.secondary||'#efe7d8';
    }
    const piece=tintedFrame(kind,variant,primary,accent);
    const b=piece?._assetBounds;
    if(!piece || !b) return out;
    const ctx=out.getContext('2d');
    ctx.imageSmoothingEnabled=false;
    const padX=10, padY=12;
    const scale=Math.min((out.width-padX*2)/b.w,(out.height-padY*2)/b.h);
    const dw=Math.max(1,Math.round(b.w*scale));
    const dh=Math.max(1,Math.round(b.h*scale));
    const dx=Math.round((out.width-dw)/2);
    const dy=Math.round((out.height-dh)/2);
    ctx.drawImage(piece,b.x,b.y,b.w,b.h,dx,dy,dw,dh);
    return out;
  }

  function install() {
    const c=compositor();
    if(!c) return false;
    if(!c.fullThumbFor && c.thumbFor) c.fullThumbFor=c.thumbFor;
    c.assetThumbFor=assetThumbFor;
    c.thumbFor=assetThumbFor;
    return true;
  }

  const img=new Image();
  img.decoding='async';
  img.onload=()=>{
    atlas=img; ready=true; cache.clear(); install();
    window.ML3DAvatarCustomizerV3?.refresh?.(true);
  };
  img.src=ATLAS;

  if(!install()){
    const timer=setInterval(()=>{if(install()) clearInterval(timer);},30);
    setTimeout(()=>clearInterval(timer),5000);
  }
})();
