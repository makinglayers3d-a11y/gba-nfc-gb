(() => {
  'use strict';
  if (window.__ml3dAvatarCustomizerV2) return;
  window.__ml3dAvatarCustomizerV2 = true;

  const W=64,H=96,OY=16;
  const DEFAULTS={
    skin:'#efc3a1',hairColor:'#4a3024',
    topColor:'#4a9bd0',topAccent:'#efe7d8',
    bottomColor:'#33485f',bottomAccent:'#7ea8d4',
    shoesColor:'#20262e',shoesAccent:'#e8edf2',
    accessoryColor:'#4a9bd0',accessoryAccent:'#efe7d8',
    customAccessory:'none'
  };
  const ACCESSORIES=['none','cap','glasses','headphones','scarf','shoulderbag','bow','beanie','backpack'];
  const ACCESSORY_LABEL={none:'NINGUNO',cap:'GORRA',glasses:'GAFAS',headphones:'AURICULARES',scarf:'PAÑUELO',shoulderbag:'BOLSO',bow:'LAZO',beanie:'GORRO',backpack:'MOCHILA'};
  const hexToRgb=h=>{const n=parseInt(String(h||'#ffffff').replace('#',''),16);return {r:n>>16,g:n>>8&255,b:n&255};};
  const clamp=n=>Math.max(0,Math.min(255,Math.round(n)));
  const dark=(h,a=.28)=>{const c=hexToRgb(h);return `rgb(${clamp(c.r*(1-a))},${clamp(c.g*(1-a))},${clamp(c.b*(1-a))})`;};
  const light=(h,a=.22)=>{const c=hexToRgb(h);return `rgb(${clamp(c.r+(255-c.r)*a)},${clamp(c.g+(255-c.g)*a)},${clamp(c.b+(255-c.b)*a)})`;};
  const px=(c,x,y,w,h,col)=>{c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
  const box=(c,x,y,w,h,fill,stroke='#151c23')=>{px(c,x-1,y,w+2,h,stroke);px(c,x,y-1,w,h+2,stroke);px(c,x,y,w,h,fill);};
  const api=()=>window.ML3DAvatarFinal;
  const profile=()=>({...DEFAULTS,...(api()?.getProfile?.()||{})});
  const setProfile=p=>api()?.setProfile?.(p);

  function drawHair(c,p,dir){
    const v=Number(p.hair)||1,col=p.hairColor,hi=light(col,.16),lo=dark(col,.35),side=/left|right/.test(dir),back=dir==='up';
    const shapes={
      1:[[8,5,16,5],[6,9,20,6],[6,14,5,5],[21,14,5,5]],
      2:[[6,5,20,6],[5,10,22,6],[7,15,6,6],[19,14,7,7]],
      3:[[9,3,5,4],[14,2,5,5],[19,4,5,4],[6,8,21,8]],
      4:[[7,5,18,5],[5,9,22,6],[6,15,5,6],[21,15,5,6]],
      5:[[8,3,5,6],[13,5,5,4],[18,2,6,7],[6,9,20,8]],
      6:[[6,4,20,7],[5,10,22,7],[6,17,5,6],[21,17,5,6]],
      7:[[8,4,17,6],[6,9,21,7],[5,15,7,5],[20,14,7,6]],
      8:[[8,4,16,5],[6,8,20,7],[10,2,12,5],[11,0,10,4]]
    };
    if(p.base==='female' && [2,5,6,8].includes(v)){ if(side){box(c,19,8,6,16,col,lo);px(c,21,21,5,7,lo);} else {box(c,7,8,18,15,col,lo);px(c,7,17,4,11,lo);px(c,21,17,4,11,lo);} }
    (shapes[v]||shapes[1]).forEach((r,i)=>box(c,r[0],r[1],r[2],r[3],i===0?hi:col,lo));
    if(!back){px(c,9,10,5,3,col);px(c,13,9,4,4,col);px(c,18,10,5,3,col);}
  }

  function drawTop(c,p,dir,frame){
    const side=/left|right/.test(dir),v=Number(p.top)||1,pri=p.topColor,sec=p.topAccent,lo=dark(pri,.32),hi=light(pri,.22),x=side?11:9,w=side?10:14,s=frame===1?-1:frame===3?1:0;
    box(c,x,21,w,9,pri); if(v===1){px(c,x+2,22,2,7,sec);px(c,x+w-4,22,2,7,sec);px(c,x+4,26,w-8,2,lo);} if(v===2){px(c,x+2,22,w-4,3,sec);px(c,x+Math.floor(w/2)-1,25,2,4,lo);} if(v===3){px(c,x+1,22,w-2,2,sec);px(c,x+3,25,w-6,3,lo);} if(v===4){px(c,x+1,23,w-2,2,sec);px(c,x+2,21,2,8,sec);px(c,x+w-4,21,2,8,sec);} if(v===5){px(c,x+2,22,w-4,6,sec);px(c,x+2,27,w-4,2,lo);} if(v===6){px(c,x+Math.floor(w/2)-1,21,2,9,sec);px(c,x+2,22,2,7,hi);} if(v===7){px(c,x+2,22,w-4,2,lo);px(c,x+3,25,w-6,2,sec);} if(v===8){px(c,x+2,22,3,7,sec);px(c,x+w-5,22,3,7,lo);}
    if(side){box(c,8,22+s,3,7,p.skin,'#3a2925');box(c,21,22-s,3,7,pri);} else {box(c,6,22+s,3,7,p.skin,'#3a2925');box(c,23,22-s,3,7,p.skin,'#3a2925');}
  }

  function drawBottom(c,p,dir,frame){
    const side=/left|right/.test(dir),v=Number(p.bottom)||1,pri=p.bottomColor,sec=p.bottomAccent,skirt=v===8,s=frame===1?1:frame===3?-1:0;
    if(skirt){box(c,9,29,14,4,pri);px(c,9,32,14,2,sec);} else {box(c,10,29,12,5,pri);if([2,4,5,7].includes(v))px(c,15,30,2,4,sec);if(v===5){px(c,9,30,3,3,sec);px(c,20,30,3,3,sec);}if(v===7){px(c,10,30,2,8,sec);px(c,20,30,2,8,sec);}}
    if(side){box(c,12,33,4,5+s,p.skin,'#3a2925');box(c,17,33,4,5-s,p.skin,'#3a2925');} else {box(c,10,33,4,5+s,p.skin,'#3a2925');box(c,18,33,4,5-s,p.skin,'#3a2925');}
  }

  function drawShoes(c,p,dir,frame){
    const side=/left|right/.test(dir),pri=p.shoesColor,sec=p.shoesAccent,s=frame===1?1:frame===3?-1:0;
    if(side){box(c,10,37,6,2,pri);box(c,17+s,37,6,2,pri);} else {box(c,9,37,6,2,pri);box(c,17+s,37,6,2,pri);} px(c,10,38,5,1,sec);px(c,18+s,38,5,1,sec);
  }

  function drawAccessory(c,p,dir){
    const a=p.customAccessory||p.accessory||'none',back=dir==='up',side=/left|right/.test(dir),pri=p.accessoryColor,sec=p.accessoryAccent;
    if(a==='cap'){box(c,7,6,18,4,pri);px(c,20,9,7,2,sec);} else if(a==='glasses'&&!back){box(c,10,13,5,4,sec);box(c,17,13,5,4,sec);px(c,15,14,2,1,'#17202a');} else if(a==='headphones'){px(c,7,10,3,9,pri);px(c,22,10,3,9,pri);px(c,9,7,14,2,sec);} else if(a==='scarf'){px(c,9,20,14,3,pri);px(c,20,22,3,7,sec);} else if(a==='shoulderbag'){if(!back){px(c,11,20,2,13,sec);box(c,18,28,7,6,pri);}} else if(a==='bow'){box(c,9,4,6,5,pri);box(c,17,4,6,5,pri);px(c,14,5,4,4,sec);} else if(a==='beanie'){box(c,7,5,18,7,pri);px(c,8,10,16,2,sec);} else if(a==='backpack'){box(c,side?20:7,22,6,10,pri);px(c,side?21:8,24,4,2,sec);}
  }

  function drawLayers(target,p,dir='down',frame=0){
    const t=document.createElement('canvas');t.width=32;t.height=40;const c=t.getContext('2d');c.imageSmoothingEnabled=false;let d=dir;const flip=d==='right';if(flip){c.save();c.translate(32,0);c.scale(-1,1);d='left';}
    const acc=p.customAccessory||'none'; if(['backpack','shoulderbag'].includes(acc))drawAccessory(c,p,d); drawHair(c,p,d); drawTop(c,p,d,frame);drawBottom(c,p,d,frame);drawShoes(c,p,d,frame);if(!['backpack','shoulderbag'].includes(acc))drawAccessory(c,p,d);if(flip)c.restore();
    const o=target.getContext('2d');o.imageSmoothingEnabled=false;o.clearRect(0,0,target.width,target.height);o.drawImage(t,0,0,32,40,0,OY,64,80);
  }

  function skinMask(base,out,skin){
    const s=base.getContext('2d').getImageData(0,0,base.width,base.height),d=out.getContext('2d').createImageData(out.width,out.height),col=hexToRgb(skin),n=Math.min(s.data.length,d.data.length);
    for(let i=0;i<n;i+=4){const r=s.data[i],g=s.data[i+1],b=s.data[i+2],a=s.data[i+3];if(a<15)continue;const warm=r>g*1.03&&g>b*1.02&&r>85&&(r-b)>22;if(!warm)continue;const lum=(r*.299+g*.587+b*.114)/180,sh=Math.max(.55,Math.min(1.35,lum));d.data[i]=clamp(col.r*sh);d.data[i+1]=clamp(col.g*sh);d.data[i+2]=clamp(col.b*sh);d.data[i+3]=a;}out.getContext('2d').putImageData(d,0,0);
  }
  function ensure(host,cls,w=W,h=H){let c=host.querySelector(`:scope>.${cls}`);if(!c){c=document.createElement('canvas');c.className=cls;c.width=w;c.height=h;host.append(c);}return c;}
  const parseKey=c=>{const p=String(c?.dataset.paintKey||'male:rows:down:0').split(':');return {dir:p[2]||'down',frame:Number(p[3])||0};};

  function repaintPlayer(){const p=profile();document.querySelectorAll('#playersLayer .player.local').forEach(player=>{const host=player.querySelector(':scope>.avatar-base-host'),base=host?.querySelector(':scope>.avatar-v5-canvas');if(!host||!base)return;const skin=ensure(host,'avatar-custom-skin-canvas'),layer=ensure(host,'avatar-custom-layer-canvas'),k=parseKey(base);skinMask(base,skin,p.skin);drawLayers(layer,p,k.dir,k.frame);});}
  function repaintPreview(){const root=document.getElementById('avatarFinalPreview'),base=root?.querySelector(':scope>.avatar-v5-preview');if(!root||!base)return;const p=profile(),skin=ensure(root,'avatar-custom-skin-preview',128,168),layer=ensure(root,'avatar-custom-layer-preview',128,168);const bs=document.createElement('canvas');bs.width=64;bs.height=96;bs.getContext('2d').drawImage(base,0,0,base.width,base.height,0,0,64,96);const sm=document.createElement('canvas');sm.width=64;sm.height=96;skinMask(bs,sm,p.skin);const lm=document.createElement('canvas');lm.width=64;lm.height=96;drawLayers(lm,p,'down',0);for(const [src,dst] of [[sm,skin],[lm,layer]]){const c=dst.getContext('2d');c.clearRect(0,0,128,168);c.imageSmoothingEnabled=false;c.drawImage(src,0,0,64,96,18,14,92,140);}}

  function optionCanvas(kind,value,p){const c=document.createElement('canvas');c.width=64;c.height=80;const q={...p};if(kind==='hair')q.hair=value;if(kind==='top')q.top=value;if(kind==='bottom')q.bottom=value;if(kind==='shoes')q.shoes=value;if(kind==='accessory')q.customAccessory=value;drawLayers(c,q,'down',0);return c;}
  const PALETTES={skin:['#f6d6bc','#efc3a1','#d89c73','#b8754c','#8b5537','#5b3425'],hairColor:['#2b211c','#4a3024','#7c4d31','#8b3441','#e4b842','#dfe4ea','#40558d','#c33d49'],topColor:['#e7edf1','#63a9d7','#347bc5','#d34d52','#4e9255','#e0ac36','#835eb7','#202831'],bottomColor:['#aab4bd','#384a59','#754f39','#e9d2af','#e76b26','#d96991','#1e9eb0','#8e70bf'],shoesColor:['#2c74b8','#d84c43','#20262e','#81583a','#548b49','#ee7b27'],accessoryColor:['#d9dde1','#202831','#6e4c3f','#d45052','#4a9bd0','#4f8a56','#d89ac2','#777f89']};
  const LABELS={hair:'PELO',top:'PARTE SUPERIOR',bottom:'PARTE INFERIOR',shoes:'CALZADO',accessory:'ACCESORIOS'};
  const COUNTS={hair:8,top:8,bottom:8,shoes:6};

  function colorRow(host,label,field,values){const row=document.createElement('div');row.className='avatar-v2-colors';row.innerHTML=`<b>${label}</b>`;const p=profile();values.forEach(v=>{const b=document.createElement('button');b.type='button';b.className='avatar-v2-swatch'+(String(p[field]).toLowerCase()===v.toLowerCase()?' selected':'');b.style.setProperty('--sw',v);b.title=v;b.addEventListener('click',()=>{setProfile({[field]:v});refresh();});row.append(b);});const custom=document.createElement('input');custom.type='color';custom.value=p[field]||values[0];custom.className='avatar-v2-color-free';custom.addEventListener('input',()=>{setProfile({[field]:custom.value});refresh(false);});row.append(custom);host.append(row);}
  function optionRow(host,kind,values){const p=profile(),row=document.createElement('div');row.className='avatar-v2-options';values.forEach(v=>{const b=document.createElement('button');b.type='button';const current=kind==='accessory'?(p.customAccessory||'none'):p[kind];b.className='avatar-v2-option'+(String(current)===String(v)?' selected':'');b.dataset.kind=kind;b.dataset.value=v;b.append(optionCanvas(kind,v,p));const s=document.createElement('span');s.textContent=kind==='accessory'?ACCESSORY_LABEL[v]:`${LABELS[kind].split(' ')[0]} ${v}`;b.append(s);b.addEventListener('click',()=>{const patch=kind==='accessory'?{customAccessory:v,accessory:['cap','glasses','headphones','scarf','shoulderbag','backpack'].includes(v)?v:(v==='beanie'?'beret':'none')}:{[kind]:Number(v)};setProfile(patch);refresh();});row.append(b);});host.append(row);}
  function buildPanel(){const controls=document.getElementById('avatarFinalControls');if(!controls)return;controls.style.display='none';let panel=document.getElementById('avatarCustomizerV2');if(!panel){panel=document.createElement('div');panel.id='avatarCustomizerV2';controls.after(panel);}panel.replaceChildren();const p=profile();const tabs=document.createElement('div');tabs.className='avatar-v2-tabs';const pages=document.createElement('div');pages.className='avatar-v2-pages';const defs=[['hair','PELO'],['top','ROPA ↑'],['bottom','ROPA ↓'],['shoes','CALZADO'],['accessory','ACCESORIOS'],['colors','COLORES']];let active=panel.dataset.active||'hair';defs.forEach(([id,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.className=id===active?'active':'';b.onclick=()=>{panel.dataset.active=id;buildPanel();};tabs.append(b);});panel.append(tabs,pages);const page=document.createElement('section');page.className='avatar-v2-page';pages.append(page);
    if(active==='hair'){optionRow(page,'hair',Array.from({length:8},(_,i)=>i+1));colorRow(page,'COLOR DEL PELO','hairColor',PALETTES.hairColor);} 
    else if(active==='top'){optionRow(page,'top',Array.from({length:8},(_,i)=>i+1));colorRow(page,'COLOR PRINCIPAL','topColor',PALETTES.topColor);colorRow(page,'DETALLES','topAccent',PALETTES.topColor);} 
    else if(active==='bottom'){optionRow(page,'bottom',Array.from({length:8},(_,i)=>i+1));colorRow(page,'COLOR PRINCIPAL','bottomColor',PALETTES.bottomColor);colorRow(page,'DETALLES','bottomAccent',PALETTES.bottomColor);} 
    else if(active==='shoes'){optionRow(page,'shoes',Array.from({length:6},(_,i)=>i+1));colorRow(page,'COLOR PRINCIPAL','shoesColor',PALETTES.shoesColor);colorRow(page,'DETALLES','shoesAccent',PALETTES.shoesColor);} 
    else if(active==='accessory'){optionRow(page,'accessory',ACCESSORIES);colorRow(page,'COLOR PRINCIPAL','accessoryColor',PALETTES.accessoryColor);colorRow(page,'DETALLES','accessoryAccent',PALETTES.accessoryColor);} 
    else {colorRow(page,'TONO DE PIEL','skin',PALETTES.skin);colorRow(page,'PELO','hairColor',PALETTES.hairColor);colorRow(page,'ROPA PRINCIPAL','topColor',PALETTES.topColor);colorRow(page,'ROPA SECUNDARIA','bottomColor',PALETTES.bottomColor);colorRow(page,'CALZADO','shoesColor',PALETTES.shoesColor);colorRow(page,'ACCESORIOS','accessoryColor',PALETTES.accessoryColor);} }

  function refresh(rebuild=true){repaintPlayer();repaintPreview();if(rebuild)buildPanel();}
  function boot(){buildPanel();refresh(false);document.addEventListener('click',e=>{if(e.target.closest('#avatarButton,#avatarFinalBase button,#saveAvatarFinal'))setTimeout(()=>refresh(),0);});let last='';const tick=()=>{const k=JSON.stringify(profile());if(k!==last){last=k;repaintPlayer();repaintPreview();}requestAnimationFrame(tick);};requestAnimationFrame(tick);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();