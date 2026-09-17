(() => {
  'use strict';
  if (window.__ml3dAvatarCompositorV1) return;
  window.__ml3dAvatarCompositorV1 = true;

  const W=64,H=96;
  const ATLAS='./assets/avatar-modular/avatar-modular-atlas-v1.png?v=2';
  const SECTION_Y={hair:0,top:768,bottom:1536,shoes:2304,accessory:3072};
  const VARIANT_COLS={hair:4,top:4,bottom:4,shoes:3,accessory:4};
  const DIR_ROW={down:0,up:1,left:2,right:3};
  const ACCESSORIES=['none','cap','glasses','headphones','scarf','shoulderbag','bow','beanie','backpack'];
  const DEFAULTS={skin:'#efc3a1',hairColor:'#4a3024',topColor:'#4a9bd0',topAccent:'#efe7d8',bottomColor:'#33485f',bottomAccent:'#7ea8d4',shoesColor:'#20262e',shoesAccent:'#e8edf2',accessoryColor:'#4a9bd0',accessoryAccent:'#efe7d8',customAccessory:'none'};
  const api=()=>window.ML3DAvatarFinal;
  const clamp=n=>Math.max(0,Math.min(255,Math.round(n)));
  const hex=h=>{const n=parseInt(String(h||'#fff').replace('#','').padEnd(6,'f'),16)||0xffffff;return{r:(n>>16)&255,g:(n>>8)&255,b:n&255}};
  const lighten=(h,a=.3)=>{const c=hex(h);return '#'+[c.r,c.g,c.b].map(v=>clamp(v+(255-v)*a).toString(16).padStart(2,'0')).join('')};
  const profile=()=>{
    const p={...DEFAULTS,...(api()?.getProfile?.()||{})};
    if(!p.topColor)p.topColor=p.primary||DEFAULTS.topColor;
    if(!p.topAccent)p.topAccent=p.secondary||DEFAULTS.topAccent;
    if(!p.bottomColor)p.bottomColor=p.primary||DEFAULTS.bottomColor;
    if(!p.bottomAccent)p.bottomAccent=p.secondary||DEFAULTS.bottomAccent;
    if(!p.shoesColor)p.shoesColor=DEFAULTS.shoesColor;
    if(!p.shoesAccent)p.shoesAccent=DEFAULTS.shoesAccent;
    if(!p.accessoryColor)p.accessoryColor=p.primary||DEFAULTS.accessoryColor;
    if(!p.accessoryAccent)p.accessoryAccent=p.secondary||DEFAULTS.accessoryAccent;
    if(!p.customAccessory||p.customAccessory==='none'){
      const m={cap:'cap',glasses:'glasses',headphones:'headphones',scarf:'scarf',shoulderbag:'shoulderbag',backpack:'backpack',beret:'beanie'};
      p.customAccessory=m[p.accessory]||'none';
    }
    return p;
  };
  const setProfile=patch=>api()?.setProfile?.(patch);

  let atlas=null,ready=false;
  const rawCache=new Map(), tintCache=new Map();

  function loadAtlas(){return new Promise(resolve=>{const img=new Image();img.decoding='async';img.onload=()=>{atlas=img;ready=true;rawCache.clear();tintCache.clear();resolve(true)};img.onerror=()=>resolve(false);img.src=ATLAS;});}
  function rect(kind,variant,dir,frame){const cols=VARIANT_COLS[kind],i=Math.max(0,Number(variant)-1),bc=i%cols,br=Math.floor(i/cols);return{x:bc*256+(Math.max(0,Math.min(3,Number(frame)||0))*W),y:SECTION_Y[kind]+br*384+(DIR_ROW[dir]??0)*H};}
  function alphaBounds(c){const d=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;let minX=c.width,minY=c.height,maxX=-1,maxY=-1;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){if(d[(y*c.width+x)*4+3]<12)continue;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}if(maxX<minX)return{x:0,y:0,w:1,h:1};return{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1};}
  function rawFrame(kind,variant,dir='down',frame=0){if(!ready||!variant)return null;const k=[kind,variant,dir,frame].join('|');if(rawCache.has(k))return rawCache.get(k);const r=rect(kind,variant,dir,frame),c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(atlas,r.x,r.y,W,H,0,0,W,H);c._b=alphaBounds(c);rawCache.set(k,c);return c;}
  function tintFrame(kind,variant,dir,frame,primary,accent){const k=[kind,variant,dir,frame,primary,accent].join('|');if(tintCache.has(k))return tintCache.get(k);const src=rawFrame(kind,variant,dir,frame);if(!src)return null;const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0);const img=ctx.getImageData(0,0,W,H),d=img.data,p=hex(primary),a=hex(accent||lighten(primary,.3));for(let i=0;i<d.length;i+=4){if(d[i+3]<8)continue;const lum=(d[i]+d[i+1]+d[i+2])/3;if(lum<34){const v=clamp(8+lum*.45);d[i]=v;d[i+1]=v;d[i+2]=v;continue;}const t=Math.max(0,Math.min(1,(lum-130)/110));const rr=p.r+(a.r-p.r)*t,gg=p.g+(a.g-p.g)*t,bb=p.b+(a.b-p.b)*t,shade=.42+(lum/255)*.78;d[i]=clamp(rr*shade);d[i+1]=clamp(gg*shade);d[i+2]=clamp(bb*shade);}ctx.putImageData(img,0,0);c._b=src._b;tintCache.set(k,c);return c;}
  function canvasBounds(c){return alphaBounds(c)}
  function skinOverlay(base,skin){const out=document.createElement('canvas');out.width=base.width;out.height=base.height;const bctx=base.getContext('2d',{willReadFrequently:true}),o=out.getContext('2d',{willReadFrequently:true}),src=bctx.getImageData(0,0,base.width,base.height),dst=o.createImageData(base.width,base.height),col=hex(skin);for(let i=0;i<src.data.length;i+=4){const r=src.data[i],g=src.data[i+1],b=src.data[i+2],a=src.data[i+3];if(a<15)continue;const warm=r>g*1.02&&g>b*.96&&r>70&&(r-b)>10;if(!warm)continue;const lum=(r*.299+g*.587+b*.114)/185,sh=Math.max(.52,Math.min(1.34,lum));dst.data[i]=clamp(col.r*sh);dst.data[i+1]=clamp(col.g*sh);dst.data[i+2]=clamp(col.b*sh);dst.data[i+3]=a;}o.putImageData(dst,0,0);return out;}
  function targetBox(baseBounds,kind,dir){const b=baseBounds,side=dir==='left'||dir==='right';if(kind==='hair')return{x:b.x+b.w*.05,y:b.y-b.h*.08,w:b.w*.9,h:b.h*.42};if(kind==='top')return{x:b.x+b.w*(side?.18:.10),y:b.y+b.h*.34,w:b.w*(side?.64:.80),h:b.h*.33};if(kind==='bottom')return{x:b.x+b.w*(side?.24:.17),y:b.y+b.h*.61,w:b.w*(side?.52:.66),h:b.h*.24};if(kind==='shoes')return{x:b.x+b.w*(side?.18:.13),y:b.y+b.h*.82,w:b.w*(side?.64:.74),h:b.h*.18};return{x:b.x-b.w*.05,y:b.y-b.h*.08,w:b.w*1.1,h:b.h*.7};}
  function drawFitted(ctx,piece,kind,baseBounds,dir){if(!piece)return;const s=piece._b||canvasBounds(piece),t=targetBox(baseBounds,kind,dir);const scale=Math.min(t.w/Math.max(1,s.w),t.h/Math.max(1,s.h));let dw=s.w*scale,dh=s.h*scale,dx=t.x+(t.w-dw)/2,dy=t.y+(t.h-dh)/2;if(kind==='hair')dy=t.y+t.h-dh;if(kind==='shoes')dy=t.y+t.h-dh;ctx.drawImage(piece,s.x,s.y,s.w,s.h,Math.round(dx),Math.round(dy),Math.round(dw),Math.round(dh));}
  function compose(base,p,dir='down',frame=0){const out=document.createElement('canvas');out.width=base.width;out.height=base.height;const ctx=out.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(base,0,0);ctx.drawImage(skinOverlay(base,p.skin),0,0);const bb=canvasBounds(base);drawFitted(ctx,tintFrame('top',p.top,dir,frame,p.topColor,p.topAccent),'top',bb,dir);drawFitted(ctx,tintFrame('bottom',p.bottom,dir,frame,p.bottomColor,p.bottomAccent),'bottom',bb,dir);drawFitted(ctx,tintFrame('shoes',p.shoes,dir,frame,p.shoesColor,p.shoesAccent),'shoes',bb,dir);drawFitted(ctx,tintFrame('hair',p.hair,dir,frame,p.hairColor,lighten(p.hairColor,.34)),'hair',bb,dir);const ai=ACCESSORIES.indexOf(p.customAccessory||'none');if(ai>0)drawFitted(ctx,tintFrame('accessory',ai,dir,frame,p.accessoryColor,p.accessoryAccent),'accessory',bb,dir);return out;}
  function ensure(host,cls,w,h){let c=host.querySelector(`:scope > .${cls}`);if(!c){c=document.createElement('canvas');c.className=cls;c.setAttribute('aria-hidden','true');host.append(c);}if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;return c;}
  function stateFrom(base){const p=String(base?.dataset.paintKey||'male:rows:down:0').split(':');return{dir:['down','up','left','right'].includes(p[2])?p[2]:'down',frame:Number(p[3])||0};}
  function visibleBase(host){const idle=host.querySelector(':scope > .avatar-idle-complete-canvas');if(idle&&getComputedStyle(idle).display!=='none'&&getComputedStyle(idle).visibility!=='hidden'&&+getComputedStyle(idle).opacity!==0)return idle;return host.querySelector(':scope > .avatar-v5-canvas');}
  function paintLobby(){if(!ready)return;const p=profile();document.querySelectorAll('#playersLayer .player.local').forEach(player=>{const host=player.querySelector(':scope > .avatar-base-host');const base=host&&visibleBase(host);if(!host||!base)return;const st=stateFrom(host.querySelector(':scope > .avatar-v5-canvas'));const final=compose(base,p,st.dir,st.frame),c=ensure(host,'avatar-v3-final-canvas',final.width,final.height),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(final,0,0);c.dataset.source=base.classList.contains('avatar-idle-complete-canvas')?'idle':'walk';});}
  function paintPreview(){if(!ready)return;const root=document.getElementById('avatarFinalPreview'),base=root?.querySelector(':scope > .avatar-v5-preview');if(!root||!base)return;const final=compose(base,profile(),'down',0),c=ensure(root,'avatar-v3-final-preview',final.width,final.height),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(final,0,0);}
  function thumbFor(kind,value){const root=document.getElementById('avatarFinalPreview'),base=root?.querySelector(':scope > .avatar-v5-preview');const c=document.createElement('canvas');c.width=96;c.height=126;if(!base||!ready)return c;const p={...profile()};if(kind==='accessory')p.customAccessory=value;else p[kind]=value;const final=compose(base,p,'down',0),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(final,0,0,final.width,final.height,0,0,c.width,c.height);return c;}
  window.ML3DAvatarCompositor={ready:()=>ready,profile,setProfile,compose,paintLobby,paintPreview,thumbFor,rawFrame,tintFrame};
  loadAtlas().then(()=>{paintPreview();paintLobby();});
})();