(() => {
  "use strict";

  if (window.__ml3dAvatarRendererV3) return;
  window.__ml3dAvatarRendererV3 = true;

  const PROFILE_KEY = "ml3d-link-avatar-final-v1";
  const SHEETS = {
    male: "./assets/avatar-base/male-base.png?v=4",
    female: "./assets/avatar-base/female-base.png?v=4"
  };
  const DIR_INDEX = { down: 0, up: 1, left: 2, right: 3 };
  const GRID = 4;
  const W = 64;
  const H = 96;
  const BG_THRESHOLD = 58;
  const ALPHA = 20;
  const FRAME_MS = 65;
  const MOVE_HOLD_MS = 180;
  const EPS = 0.001;
  const WALK = [0, 1, 2, 3, 2, 1];

  const compiled = new Map();
  const playerState = new Map();
  let compiledByBase = null;

  const style = document.createElement("style");
  style.textContent = `
    .avatar-base-host > .avatar-base-canvas,
    .avatar-base-host > .avatar-clean-canvas { opacity:0!important; visibility:hidden!important; }
    .avatar-v3-canvas { position:absolute; left:50%; bottom:0; width:56px; height:84px; transform:translateX(-50%); image-rendering:pixelated; image-rendering:crisp-edges; pointer-events:none; }
    .player.local .avatar-v3-canvas { filter:drop-shadow(0 0 4px rgba(88,190,255,.88)); }
    #avatarFinalPreview > canvas:not(.avatar-v3-preview) { display:none!important; }
    #avatarFinalBase button > canvas:not(.avatar-v3-choice) { display:none!important; }
    .avatar-v3-preview { width:96px; height:144px; image-rendering:pixelated; image-rendering:crisp-edges; filter:drop-shadow(0 9px 8px rgba(0,0,0,.38)); }
    .avatar-v3-choice { width:40px; height:60px; image-rendering:pixelated; image-rendering:crisp-edges; flex:0 0 auto; }
    @media(max-width:560px){
      .avatar-v3-canvas { width:48px; height:72px; }
      .avatar-v3-preview { width:80px; height:120px; }
      .avatar-v3-choice { width:34px; height:51px; }
    }
  `;
  document.head.appendChild(style);

  function localBase() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}").base === "female" ? "female" : "male";
    } catch {
      return "male";
    }
  }

  function selectedBase() {
    const selected = document.querySelector("#avatarFinalBase button.selected");
    if (!selected) return localBase();
    return /MUJER/i.test(selected.textContent || "") ? "female" : "male";
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      image.src = src;
    });
  }

  function borderRef(data, w, h) {
    const points = [[0,0],[w-1,0],[0,h-1],[w-1,h-1],[w>>1,0],[w>>1,h-1],[0,h>>1],[w-1,h>>1]];
    let r=0,g=0,b=0,a=0;
    for (const [x,y] of points) {
      const i=(y*w+x)*4;
      r+=data[i]; g+=data[i+1]; b+=data[i+2]; a+=data[i+3];
    }
    return { r:r/points.length, g:g/points.length, b:b/points.length, a:a/points.length };
  }

  function distance(r,g,b,ref) {
    const dr=r-ref.r, dg=g-ref.g, db=b-ref.b;
    return Math.sqrt(dr*dr+dg*dg+db*db);
  }

  function clearBackground(canvas) {
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    const w=canvas.width,h=canvas.height,img=ctx.getImageData(0,0,w,h),d=img.data,ref=borderRef(d,w,h);
    if (ref.a < 24) return;
    const seen=new Uint8Array(w*h), q=new Int32Array(w*h); let head=0,tail=0;
    const bg=(n)=>{ const p=n*4; return d[p+3] < 24 || distance(d[p],d[p+1],d[p+2],ref) <= BG_THRESHOLD; };
    const push=(n)=>{ if(n<0||n>=seen.length||seen[n]||!bg(n))return; seen[n]=1; q[tail++]=n; };
    for(let x=0;x<w;x++){push(x);push((h-1)*w+x);} for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
    while(head<tail){ const n=q[head++],x=n%w,y=(n/w)|0; d[n*4+3]=0; if(x>0)push(n-1); if(x+1<w)push(n+1); if(y>0)push(n-w); if(y+1<h)push(n+w); }
    ctx.putImageData(img,0,0);
  }

  function components(canvas) {
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    const img=ctx.getImageData(0,0,canvas.width,canvas.height),d=img.data,w=canvas.width,h=canvas.height;
    const seen=new Uint8Array(w*h),q=new Int32Array(w*h),out=[];
    const fg=(n)=>d[n*4+3]>=ALPHA;
    for(let start=0;start<w*h;start++){
      if(seen[start]||!fg(start))continue;
      let head=0,tail=0,area=0,minX=w,minY=h,maxX=-1,maxY=-1,sumX=0,sumY=0; const px=[];
      seen[start]=1;q[tail++]=start;
      while(head<tail){
        const n=q[head++],x=n%w,y=(n/w)|0; px.push(n);area++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);sumX+=x;sumY+=y;
        for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){ if(!ox&&!oy)continue; const nx=x+ox,ny=y+oy;if(nx<0||nx>=w||ny<0||ny>=h)continue;const ni=ny*w+nx;if(seen[ni]||!fg(ni))continue;seen[ni]=1;q[tail++]=ni; }
      }
      out.push({pixels:px,area,minX,minY,maxX,maxY,cx:sumX/area,cy:sumY/area});
    }
    return {img,out};
  }

  function keepSubject(canvas) {
    const ctx=canvas.getContext("2d",{willReadFrequently:true}),w=canvas.width,h=canvas.height;
    const {img,out}=components(canvas); if(!out.length)return;
    const cx=w/2,cy=h*.58;
    const score=(c)=>{ const dx=Math.abs(c.cx-cx)/Math.max(1,w/2),dy=Math.abs(c.cy-cy)/Math.max(1,h/2),hh=c.maxY-c.minY+1; return c.area*Math.max(.08,1-(dx*.85+dy*.35))*(.7+.3*Math.min(1,hh/Math.max(1,h*.5))); };
    const main=[...out].sort((a,b)=>score(b)-score(a))[0];
    const mw=main.maxX-main.minX+1,mh=main.maxY-main.minY+1,padX=Math.max(8,Math.round(mw*.24)),padY=Math.max(8,Math.round(mh*.18)),floor=Math.max(6,main.area*.006),keep=new Uint8Array(w*h);
    for(const c of out){ const near=c.area>=floor&&c.maxX>=main.minX-padX&&c.minX<=main.maxX+padX&&c.maxY>=main.minY-padY&&c.minY<=main.maxY+padY; if(c===main||near)for(const n of c.pixels)keep[n]=1; }
    const d=img.data; for(let n=0;n<w*h;n++)if(!keep[n])d[n*4+3]=0; ctx.putImageData(img,0,0);
  }

  function bounds(canvas) {
    const ctx=canvas.getContext("2d",{willReadFrequently:true}),d=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){ if(d[(y*canvas.width+x)*4+3]<ALPHA)continue; minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y); }
    if(maxX<minX)return{x:0,y:0,w:canvas.width,h:canvas.height,anchorX:canvas.width/2};
    const hh=maxY-minY+1,feetStart=Math.max(minY,maxY-Math.max(4,Math.round(hh*.22))); let sum=0,count=0;
    for(let y=feetStart;y<=maxY;y++)for(let x=minX;x<=maxX;x++){ if(d[(y*canvas.width+x)*4+3]<ALPHA)continue;sum+=x;count++; }
    return{x:minX,y:minY,w:maxX-minX+1,h:hh,anchorX:count?sum/count:(minX+maxX)/2};
  }

  function maskDistance(a,b){
    const da=a.getContext("2d",{willReadFrequently:true}).getImageData(0,0,a.width,a.height).data,db=b.getContext("2d",{willReadFrequently:true}).getImageData(0,0,b.width,b.height).data;
    let diff=0,union=0; for(let i=3;i<da.length;i+=4){const aa=da[i]>=ALPHA,bb=db[i]>=ALPHA;if(aa||bb)union++;if(aa!==bb)diff++;} return union?diff/union:1;
  }

  function groupingScore(frames,mode){
    let total=0,pairs=0;
    for(let dir=0;dir<GRID;dir++){
      const group=[];for(let f=0;f<GRID;f++)group.push(mode==="rows"?frames[dir][f]:frames[f][dir]);
      for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){total+=maskDistance(group[i],group[j]);pairs++;}
    }
    return pairs?total/pairs:Infinity;
  }

  async function compile(base) {
    if(compiled.has(base))return compiled.get(base);
    const promise=(async()=>{
      const image=await loadImage(SHEETS[base]),raw=Array.from({length:GRID},()=>Array(GRID)); let maxW=1,maxH=1;
      for(let row=0;row<GRID;row++){
        const sy=Math.round(image.naturalHeight*row/GRID),ey=Math.round(image.naturalHeight*(row+1)/GRID);
        for(let col=0;col<GRID;col++){
          const sx=Math.round(image.naturalWidth*col/GRID),ex=Math.round(image.naturalWidth*(col+1)/GRID),cell=document.createElement("canvas");cell.width=Math.max(1,ex-sx);cell.height=Math.max(1,ey-sy);
          const ctx=cell.getContext("2d",{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.drawImage(image,sx,sy,cell.width,cell.height,0,0,cell.width,cell.height);clearBackground(cell);keepSubject(cell);const b=bounds(cell);maxW=Math.max(maxW,b.w);maxH=Math.max(maxH,b.h);raw[row][col]={cell,b};
        }
      }
      const scale=Math.min((W-10)/maxW,(H-8)/maxH),frames=Array.from({length:GRID},()=>Array(GRID));
      for(let row=0;row<GRID;row++)for(let col=0;col<GRID;col++){
        const {cell,b}=raw[row][col],out=document.createElement("canvas");out.width=W;out.height=H;const ctx=out.getContext("2d");ctx.imageSmoothingEnabled=false;const dw=Math.max(1,Math.round(b.w*scale)),dh=Math.max(1,Math.round(b.h*scale)),anchor=(b.anchorX-b.x)*scale,dx=Math.round(W/2-anchor),dy=H-dh-2;ctx.drawImage(cell,b.x,b.y,b.w,b.h,dx,dy,dw,dh);frames[row][col]=out;
      }
      const rs=groupingScore(frames,"rows"),cs=groupingScore(frames,"cols"),orientation=cs+.015<rs?"cols":"rows";
      return{frames,orientation};
    })();
    compiled.set(base,promise);return promise;
  }

  function sourceFrame(compiledSheet,direction,frame){
    const dir=DIR_INDEX[direction]??0;
    return compiledSheet.orientation==="rows"?compiledSheet.frames[dir][frame]:compiledSheet.frames[frame][dir];
  }

  function paint(canvas,compiledSheet,direction,frame){
    const src=sourceFrame(compiledSheet,direction,frame),ctx=canvas.getContext("2d");ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(src,0,0,canvas.width,canvas.height);
  }

  function resolveBase(player){
    if(player.classList.contains("local"))return localBase();
    const key=player.querySelector(".avatar-base-canvas")?.dataset.paintKey||"";
    return key.startsWith("female:")?"female":"male";
  }

  function ensurePlayerCanvas(player){
    let host=player.querySelector(":scope > .avatar-base-host");
    if(!host){const wrap=player.querySelector(".avatar-wrap");if(!wrap)return null;host=document.createElement("div");host.className="avatar-base-host";wrap.before(host);}
    let canvas=host.querySelector(":scope > .avatar-v3-canvas");if(!canvas){canvas=document.createElement("canvas");canvas.width=W;canvas.height=H;canvas.className="avatar-v3-canvas";canvas.setAttribute("aria-hidden","true");host.append(canvas);}return canvas;
  }

  function position(player){return{x:Number.parseFloat(player.style.left)||0,y:Number.parseFloat(player.style.top)||0};}
  function direction(prev,next){const dx=next.x-prev.x,dy=next.y-prev.y;if(Math.abs(dx)<=EPS&&Math.abs(dy)<=EPS)return prev.dir||"down";if(Math.abs(dx)>Math.abs(dy))return dx<0?"left":"right";return dy<0?"up":"down";}

  function ensurePreviewCanvas(root,className){let c=root.querySelector(`:scope > .${className}`);if(!c){c=document.createElement("canvas");c.width=W;c.height=H;c.className=className;root.append(c);}return c;}

  function refreshEditor(){
    if(!compiledByBase)return;
    const preview=document.getElementById("avatarFinalPreview");
    if(preview){const base=selectedBase(),sheet=compiledByBase[base]||compiledByBase.male;if(sheet)paint(ensurePreviewCanvas(preview,"avatar-v3-preview"),sheet,"down",0);}
    document.querySelectorAll("#avatarFinalBase button").forEach(button=>{const base=/MUJER/i.test(button.textContent||"")?"female":"male",sheet=compiledByBase[base]||compiledByBase.male;if(sheet)paint(ensurePreviewCanvas(button,"avatar-v3-choice"),sheet,"down",0);});
  }

  function installEditorSync(){
    document.addEventListener("click",event=>{if(event.target.closest("#avatarButton,#avatarFinalBase button,#saveAvatarFinal"))setTimeout(refreshEditor,0);});
    const modal=document.getElementById("avatarModal");if(modal)new MutationObserver(()=>refreshEditor()).observe(modal,{attributes:true,subtree:true,attributeFilter:["class","hidden"]});
    refreshEditor();
  }

  async function boot(){
    const [m,f]=await Promise.allSettled([compile("male"),compile("female")]);
    compiledByBase={male:m.status==="fulfilled"?m.value:null,female:f.status==="fulfilled"?f.value:null};
    installEditorSync();

    const tick=(now)=>{
      const alive=new Set();
      document.querySelectorAll("#playersLayer .player").forEach(player=>{
        const canvas=ensurePlayerCanvas(player);if(!canvas)return;
        const id=player.dataset.playerId||player.querySelector(".player-name-text")?.textContent||"local";alive.add(id);
        const pos=position(player),prev=playerState.get(id)||{x:pos.x,y:pos.y,dir:"down",moving:false,lastMove:-Infinity,walkStart:now};
        const moved=Math.abs(pos.x-prev.x)>EPS||Math.abs(pos.y-prev.y)>EPS,dir=moved?direction(prev,pos):prev.dir,lastMove=moved?now:prev.lastMove,moving=moved||player.classList.contains("is-moving")||now-lastMove<=MOVE_HOLD_MS,walkStart=moving&&prev.moving?prev.walkStart:now,idx=moving?Math.floor((now-walkStart)/FRAME_MS)%WALK.length:0,frame=moving?WALK[idx]:0,base=resolveBase(player),sheet=compiledByBase[base]||compiledByBase.male;
        if(sheet){const key=`${base}:${sheet.orientation}:${dir}:${frame}`;if(canvas.dataset.paintKey!==key){canvas.dataset.paintKey=key;paint(canvas,sheet,dir,frame);}}
        player.dataset.ml3dDirection=dir;player.classList.toggle("ml3d-walking",moving);playerState.set(id,{x:pos.x,y:pos.y,dir,moving,lastMove,walkStart});
      });
      for(const id of playerState.keys())if(!alive.has(id))playerState.delete(id);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
