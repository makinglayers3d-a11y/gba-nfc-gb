(() => {
  'use strict';
  if (window.__ml3dAvatarAssetThumbsV2) return;
  window.__ml3dAvatarAssetThumbsV2 = true;

  const W=64,H=96;
  const ATLAS='./assets/avatar-modular/avatar-modular-atlas-v1.png?v=3';
  const SECTION_Y={hair:0,top:768,bottom:1536,shoes:2304,accessory:3072};
  const COLS={hair:4,top:4,bottom:4,shoes:3,accessory:4};
  const ACCESSORIES=['none','cap','glasses','headphones','scarf','shoulderbag','bow','beanie','backpack'];

  /*
   * El atlas generado no tiene una celda frontal igualmente legible para todas
   * las variantes. Para las miniaturas elegimos la celda con mayor superficie
   * visible dentro de cada bloque. Esto afecta SOLO al selector; el compositor
   * del personaje mantiene su lógica independiente.
   */
  const PREVIEW_CELL={
    hair:[[2,0],[2,0],[0,0],[0,0],[2,3],[3,3],[1,3],[0,3]],
    top:[[2,0],[2,0],[0,0],[0,0],[3,0],[1,0],[0,0],[0,0]],
    bottom:[[0,0],[0,0],[0,0],[0,0],[0,3],[3,3],[0,3],[0,3]],
    shoes:[[3,3],[3,0],[1,0],[3,3],[3,3],[1,3]],
    accessory:[[2,0],[0,0],[2,0],[3,0],[0,0],[3,0],[0,3],[2,0]]
  };

  let atlas=null,ready=false;
  const cache=new Map();
  const compositor=()=>window.ML3DAvatarCompositor;
  const profile=()=>compositor()?.profile?.()||{};
  const clamp=n=>Math.max(0,Math.min(255,Math.round(n)));
  const rgb=h=>{const n=parseInt(String(h||'#fff').replace('#','').padEnd(6,'f'),16)||0xffffff;return{r:(n>>16)&255,g:(n>>8)&255,b:n&255}};
  const lighten=(h,a=.3)=>{const c=rgb(h);return'#'+[c.r,c.g,c.b].map(v=>clamp(v+(255-v)*a).toString(16).padStart(2,'0')).join('')};

  function cellRect(kind,variant){
    const index=Math.max(0,Number(variant)-1),cols=COLS[kind];
    const [row,col]=PREVIEW_CELL[kind]?.[index]||[0,0];
    return{x:(index%cols)*256+col*W,y:SECTION_Y[kind]+Math.floor(index/cols)*384+row*H};
  }

  function bounds(canvas){
    const d=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height).data;
    let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
      if(d[(y*canvas.width+x)*4+3]<1)continue;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    }
    if(maxX<minX)return null;
    const pad=3;
    minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);
    maxX=Math.min(canvas.width-1,maxX+pad);maxY=Math.min(canvas.height-1,maxY+pad);
    return{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};
  }

  function tintedFrame(kind,variant,primary,accent){
    if(!ready||!atlas||!variant)return null;
    const key=[kind,variant,primary,accent].join('|');
    if(cache.has(key))return cache.get(key);
    const r=cellRect(kind,variant),c=document.createElement('canvas');c.width=W;c.height=H;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.drawImage(atlas,r.x,r.y,W,H,0,0,W,H);
    const im=ctx.getImageData(0,0,W,H),d=im.data,p=rgb(primary),a=rgb(accent||lighten(primary));
    for(let i=0;i<d.length;i+=4){
      if(d[i+3]<2)continue;
      const lum=(d[i]+d[i+1]+d[i+2])/3;
      const t=Math.max(0,Math.min(1,(lum-105)/135));
      const shade=.62+(lum/255)*.68;
      d[i]=clamp((p.r+(a.r-p.r)*t)*shade);
      d[i+1]=clamp((p.g+(a.g-p.g)*t)*shade);
      d[i+2]=clamp((p.b+(a.b-p.b)*t)*shade);
    }
    ctx.putImageData(im,0,0);c._assetBounds=bounds(c);cache.set(key,c);return c;
  }

  function assetThumbFor(kind,value){
    const out=document.createElement('canvas');out.width=96;out.height=126;
    if(!ready)return out;
    const p=profile();let variant=value,primary='#fff',accent='#d9e0e6';
    if(kind==='hair'){primary=p.hairColor||'#4a3024';accent=lighten(primary,.42)}
    else if(kind==='top'){primary=p.topColor||p.primary||'#4a9bd0';accent=p.topAccent||p.secondary||'#efe7d8'}
    else if(kind==='bottom'){primary=p.bottomColor||p.primary||'#33485f';accent=p.bottomAccent||p.secondary||'#7ea8d4'}
    else if(kind==='shoes'){primary=p.shoesColor||'#20262e';accent=p.shoesAccent||'#e8edf2'}
    else if(kind==='accessory'){
      if(value==='none')return out;
      variant=ACCESSORIES.indexOf(value);if(variant<=0)return out;
      primary=p.accessoryColor||p.primary||'#4a9bd0';accent=p.accessoryAccent||p.secondary||'#efe7d8';
    }
    const piece=tintedFrame(kind,variant,primary,accent),b=piece?._assetBounds;if(!piece||!b)return out;
    const ctx=out.getContext('2d');ctx.imageSmoothingEnabled=false;
    const padX=8,padY=9,scale=Math.min((out.width-padX*2)/b.w,(out.height-padY*2)/b.h);
    const dw=Math.max(1,Math.round(b.w*scale)),dh=Math.max(1,Math.round(b.h*scale));
    ctx.drawImage(piece,b.x,b.y,b.w,b.h,Math.round((out.width-dw)/2),Math.round((out.height-dh)/2),dw,dh);
    return out;
  }

  function install(){
    const c=compositor();if(!c)return false;
    if(!c.fullThumbFor&&c.thumbFor)c.fullThumbFor=c.thumbFor;
    c.assetThumbFor=assetThumbFor;c.thumbFor=assetThumbFor;return true;
  }

  const img=new Image();img.decoding='async';
  img.onload=()=>{atlas=img;ready=true;cache.clear();install();window.ML3DAvatarCustomizerV3?.refresh?.(true)};
  img.src=ATLAS;
  if(!install()){const timer=setInterval(()=>{if(install())clearInterval(timer)},30);setTimeout(()=>clearInterval(timer),5000)}
})();
