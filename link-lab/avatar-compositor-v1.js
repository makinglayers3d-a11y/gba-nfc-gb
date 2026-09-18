(() => {
'use strict';
if(window.__ml3dAvatarCompositorV1)return;window.__ml3dAvatarCompositorV1=true;

const HAIR_W=32,HAIR_H=32;
const HAIR_ATLAS='./assets/avatar-modular/hair-atlas-v1.png?v=2';
const HAIR_DR={down:0,left:1,right:2,up:3};
const DEF={skin:'#efc3a1',hair:1,hairColor:'#4a3024'};
const api=()=>window.ML3DAvatarFinal;
const clamp=n=>Math.max(0,Math.min(255,Math.round(n)));
const rgb=h=>{const n=parseInt(String(h||'#fff').replace('#','').padEnd(6,'f'),16)||0xffffff;return{r:(n>>16)&255,g:(n>>8)&255,b:n&255}};
const light=(h,a=.3)=>{const c=rgb(h);return'#'+[c.r,c.g,c.b].map(v=>clamp(v+(255-v)*a).toString(16).padStart(2,'0')).join('')};

function profile(){
  return {...DEF,...(api()?.getProfile?.()||{})};
}
const setProfile=patch=>api()?.setProfile?.(patch);

let hairAtlas=null,ready=false;
const raw=new Map(),tinted=new Map();

function load(){
  return new Promise(res=>{
    const h=new Image();
    h.decoding='async';
    h.onload=()=>{hairAtlas=h;ready=true;raw.clear();tinted.clear();res(true)};
    h.onerror=()=>{console.error('[ML3D avatar] No se pudo cargar hair-atlas-v1.png');res(false)};
    h.src=HAIR_ATLAS;
  });
}

function hairRect(v,d,f){
  const i=Math.max(0,Math.min(8,+v-1));
  const frame=Math.max(0,Math.min(3,+f||0));
  return{x:(i*4+frame)*HAIR_W,y:(HAIR_DR[d]??0)*HAIR_H};
}

function keepMainComponent(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const im=ctx.getImageData(0,0,canvas.width,canvas.height),data=im.data,w=canvas.width,h=canvas.height;
  const visited=new Uint8Array(w*h),queue=new Int32Array(w*h);
  let best=null;
  const opaque=i=>data[i*4+3]>=12;
  for(let start=0;start<w*h;start++){
    if(visited[start]||!opaque(start))continue;
    let head=0,tail=0;queue[tail++]=start;visited[start]=1;
    const pixels=[];
    while(head<tail){
      const idx=queue[head++],x=idx%w,y=(idx/w)|0;
      pixels.push(idx);
      for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
        if(!ox&&!oy)continue;
        const nx=x+ox,ny=y+oy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
        const ni=ny*w+nx;if(visited[ni]||!opaque(ni))continue;
        visited[ni]=1;queue[tail++]=ni;
      }
    }
    if(!best||pixels.length>best.length)best=pixels;
  }
  if(!best){ctx.clearRect(0,0,w,h);return}
  const keep=new Uint8Array(w*h);for(const i of best)keep[i]=1;
  for(let i=0;i<w*h;i++)if(!keep[i])data[i*4+3]=0;
  ctx.putImageData(im,0,0);
}

function rawHair(v,d='down',f=0){
  if(!ready||!v)return null;
  const key=[v,d,f].join('|');
  if(raw.has(key))return raw.get(key);
  const r=hairRect(v,d,f),c=document.createElement('canvas');
  c.width=HAIR_W;c.height=HAIR_H;
  const x=c.getContext('2d',{willReadFrequently:true});
  x.imageSmoothingEnabled=false;
  x.drawImage(hairAtlas,r.x,r.y,HAIR_W,HAIR_H,0,0,HAIR_W,HAIR_H);
  keepMainComponent(c);
  raw.set(key,c);
  return c;
}

function tintHair(v,d,f,pri,acc){
  const key=[v,d,f,pri,acc].join('|');
  if(tinted.has(key))return tinted.get(key);
  const s=rawHair(v,d,f);if(!s)return null;
  const c=document.createElement('canvas');c.width=HAIR_W;c.height=HAIR_H;
  const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(s,0,0);
  const im=x.getImageData(0,0,HAIR_W,HAIR_H),dd=im.data,p=rgb(pri),a=rgb(acc||light(pri));
  for(let i=0;i<dd.length;i+=4){
    if(dd[i+3]<8)continue;
    const lum=(dd[i]+dd[i+1]+dd[i+2])/3;
    if(lum<34){const q=clamp(8+lum*.45);dd[i]=dd[i+1]=dd[i+2]=q;continue}
    const t=Math.max(0,Math.min(1,(lum-130)/110)),sh=.42+(lum/255)*.78;
    dd[i]=clamp((p.r+(a.r-p.r)*t)*sh);
    dd[i+1]=clamp((p.g+(a.g-p.g)*t)*sh);
    dd[i+2]=clamp((p.b+(a.b-p.b)*t)*sh);
  }
  x.putImageData(im,0,0);tinted.set(key,c);return c;
}

function skin(base,color){
  const o=document.createElement('canvas');o.width=base.width;o.height=base.height;
  const bi=base.getContext('2d',{willReadFrequently:true}).getImageData(0,0,base.width,base.height),ox=o.getContext('2d',{willReadFrequently:true}),di=ox.createImageData(base.width,base.height),co=rgb(color);
  for(let i=0;i<bi.data.length;i+=4){
    const r=bi.data[i],g=bi.data[i+1],b=bi.data[i+2],a=bi.data[i+3];
    if(a<15||!(r>g*1.02&&g>b*.96&&r>70&&(r-b)>10))continue;
    const sh=Math.max(.52,Math.min(1.34,(r*.299+g*.587+b*.114)/185));
    di.data[i]=clamp(co.r*sh);di.data[i+1]=clamp(co.g*sh);di.data[i+2]=clamp(co.b*sh);di.data[i+3]=a;
  }
  ox.putImageData(di,0,0);return o;
}

function drawHairFixed(ctx,piece,base){
  if(!piece)return;
  const size=Math.max(1,Math.round(base.height*(HAIR_H/96)));
  const dx=Math.round((base.width-size)/2);
  const dy=0;
  ctx.drawImage(piece,0,0,HAIR_W,HAIR_H,dx,dy,size,size);
}

function compose(base,p=profile(),d='down',f=0){
  const o=document.createElement('canvas');o.width=base.width;o.height=base.height;
  const x=o.getContext('2d');x.imageSmoothingEnabled=false;
  x.drawImage(base,0,0);
  x.drawImage(skin(base,p.skin),0,0);
  drawHairFixed(x,tintHair(p.hair,d,f,p.hairColor,light(p.hairColor,.34)),base);
  return o;
}

function ensure(h,cls,w,hg){
  let c=h.querySelector(`:scope > .${cls}`);
  if(!c){c=document.createElement('canvas');c.className=cls;c.setAttribute('aria-hidden','true');h.append(c)}
  if(c.width!==w)c.width=w;if(c.height!==hg)c.height=hg;return c;
}
function state(base){
  const p=String(base?.dataset.paintKey||'male:rows:down:0').split(':');
  return{dir:['down','up','left','right'].includes(p[2])?p[2]:'down',frame:+p[3]||0};
}
function visBase(h){return h.querySelector(':scope > .avatar-v5-canvas')}

function paintLobby(){
  if(!ready)return;const p=profile();
  document.querySelectorAll('#playersLayer .player.local').forEach(pl=>{
    const h=pl.querySelector(':scope > .avatar-base-host'),b=h&&visBase(h);if(!h||!b)return;
    const st=state(b),fin=compose(b,p,st.dir,st.frame),c=ensure(h,'avatar-v3-final-canvas',64,96),x=c.getContext('2d');
    x.imageSmoothingEnabled=false;x.clearRect(0,0,c.width,c.height);x.drawImage(fin,0,0,64,96);
    h.classList.add('avatar-v3-composed');
  });
}
function paintPreview(){
  if(!ready)return;
  const r=document.getElementById('avatarFinalPreview'),b=r?.querySelector(':scope > .avatar-v5-preview');if(!r||!b)return;
  const fin=compose(b,profile(),'down',0),c=ensure(r,'avatar-v3-final-preview',fin.width,fin.height),x=c.getContext('2d');
  x.imageSmoothingEnabled=false;x.clearRect(0,0,c.width,c.height);x.drawImage(fin,0,0);r.classList.add('avatar-v3-composed');
}
function thumbFor(k,v){
  const c=document.createElement('canvas');c.width=96;c.height=96;
  if(k!=='hair'||!ready)return c;
  const p=profile(),piece=tintHair(v,'down',0,p.hairColor,light(p.hairColor,.42));if(!piece)return c;
  const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(piece,0,0,32,32,8,8,80,80);return c;
}

window.ML3DAvatarCompositor={ready:()=>ready,profile,setProfile,compose,paintLobby,paintPreview,thumbFor};
load().then(()=>{paintPreview();paintLobby()});
})();