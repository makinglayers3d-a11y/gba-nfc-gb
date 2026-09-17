(() => {
  'use strict';
  if (window.__ml3dAvatarCustomizerV1) return;
  window.__ml3dAvatarCustomizerV1 = true;

  const W=64,H=96,OY=16;
  const colorFields={
    'Piel':'skin',
    'Pelo · color':'hairColor',
    'Color principal':'primary',
    'Color secundario':'secondary'
  };

  const hexToRgb=(hex)=>{const n=parseInt(String(hex||'#ffffff').slice(1),16);return {r:n>>16,g:(n>>8)&255,b:n&255};};
  const clamp=(n)=>Math.max(0,Math.min(255,Math.round(n)));
  const darken=(hex,a=.25)=>{const c=hexToRgb(hex);return `rgb(${clamp(c.r*(1-a))},${clamp(c.g*(1-a))},${clamp(c.b*(1-a))})`;};
  const lighten=(hex,a=.22)=>{const c=hexToRgb(hex);return `rgb(${clamp(c.r+(255-c.r)*a)},${clamp(c.g+(255-c.g)*a)},${clamp(c.b+(255-c.b)*a)})`;};
  const px=(ctx,x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
  const outline=(ctx,x,y,w,h,fill,stroke='#141a20')=>{px(ctx,x-1,y,w+2,h,stroke);px(ctx,x,y-1,w,h+2,stroke);px(ctx,x,y,w,h,fill);};

  function drawHair(ctx,p,dir){
    const c=p.hairColor,hi=lighten(c,.16),lo=darken(c,.32),back=dir==='up',side=dir==='left'||dir==='right';
    const patterns={
      1:[[8,5,16,5],[6,8,20,6],[7,14,4,4],[21,14,4,4]],
      2:[[7,4,18,6],[5,9,22,6],[6,15,6,5],[20,14,6,5]],
      3:[[9,3,5,4],[14,2,5,5],[19,4,5,4],[6,8,21,7]],
      4:[[7,5,18,5],[5,9,22,5],[6,14,5,6],[21,14,5,6]],
      5:[[9,3,4,5],[13,5,5,4],[18,2,5,6],[6,8,20,8]],
      6:[[6,5,20,6],[5,10,22,6],[6,16,5,5],[21,16,5,5]],
      7:[[8,4,17,6],[6,9,21,7],[5,15,7,5],[20,14,7,6]],
      8:[[7,4,18,5],[5,8,22,8],[6,15,4,6],[22,15,4,6]]
    };
    if(p.base==='female' && [2,5,7].includes(Number(p.hair))){
      if(side){outline(ctx,19,7,6,16,c);px(ctx,21,21,5,6,lo);} else {outline(ctx,7,8,18,14,c);px(ctx,7,17,4,10,lo);px(ctx,21,17,4,10,lo);}
    }
    (patterns[p.hair]||patterns[1]).forEach((r,i)=>outline(ctx,r[0],r[1],r[2],r[3],i===0?hi:c,lo));
    if(!back){px(ctx,9,10,5,3,c);px(ctx,13,9,4,4,c);px(ctx,18,10,5,3,c);}
  }

  function drawTop(ctx,p,dir,frame){
    const side=dir==='left'||dir==='right',pri=p.primary,sec=p.secondary,lo=darken(pri,.30),hi=lighten(pri,.2),x=side?11:9,w=side?10:14;
    outline(ctx,x,21,w,9,pri);
    const v=Number(p.top)||1;
    if(v===1){px(ctx,x+2,22,2,7,sec);px(ctx,x+w-4,22,2,7,sec);}
    if(v===2){px(ctx,x+2,22,w-4,3,sec);px(ctx,x+Math.floor(w/2)-1,25,2,4,lo);}
    if(v===3){px(ctx,x+1,22,w-2,2,lo);px(ctx,x+3,25,w-6,3,sec);}
    if(v===4){px(ctx,x+2,22,3,7,sec);px(ctx,x+w-5,22,3,7,sec);px(ctx,x+5,22,w-10,2,hi);}
    if(v===5){px(ctx,x+2,22,w-4,6,sec);px(ctx,x+2,27,w-4,2,lo);}
    if(v===6){px(ctx,x+Math.floor(w/2)-1,21,2,9,sec);px(ctx,x+2,22,2,7,hi);}
    if(v===7){px(ctx,x+2,22,w-4,2,lo);px(ctx,x+3,25,w-6,2,sec);}
    if(v===8){px(ctx,x+2,22,3,7,sec);px(ctx,x+w-5,22,3,7,lo);}
    const swing=frame===1?-1:frame===3?1:0;
    if(side){outline(ctx,8,22+swing,3,7,p.skin,'#3a2925');outline(ctx,21,22-swing,3,7,pri);} else {outline(ctx,6,22+swing,3,7,p.skin,'#3a2925');outline(ctx,23,22-swing,3,7,p.skin,'#3a2925');}
  }

  function drawBottom(ctx,p,dir,frame){
    const side=dir==='left'||dir==='right',pri=p.primary,sec=p.secondary,v=Number(p.bottom)||1,skirt=p.base==='female'&&[2,3,6,8].includes(v);
    if(skirt){outline(ctx,10,29,12,4,pri);px(ctx,9,32,14,2,sec);} else {outline(ctx,10,29,12,5,pri);if([2,4,5,7].includes(v))px(ctx,15,30,2,4,sec);}
    const swing=frame===1?1:frame===3?-1:0;
    if(side){outline(ctx,12,33,4,5+swing,p.skin,'#3a2925');outline(ctx,17,33,4,5-swing,p.skin,'#3a2925');}
    else {outline(ctx,10,33,4,5+swing,p.skin,'#3a2925');outline(ctx,18,33,4,5-swing,p.skin,'#3a2925');}
  }

  function drawShoes(ctx,p,dir,frame){
    const side=dir==='left'||dir==='right',c=p.secondary,s=frame===1?1:frame===3?-1:0;
    if(side){outline(ctx,10,37,6,2,c);outline(ctx,17+s,37,6,2,c);} else {outline(ctx,9,37,6,2,c);outline(ctx,17+s,37,6,2,c);}
    px(ctx,10,38,5,1,lighten(c,.35));px(ctx,18+s,38,5,1,lighten(c,.35));
  }

  function drawAccessory(ctx,p,dir){
    const a=p.accessory,back=dir==='up',side=dir==='left'||dir==='right',pri=p.primary,sec=p.secondary;
    if(a==='cap'){outline(ctx,7,6,18,4,pri);px(ctx,20,9,7,2,sec);}
    else if(a==='glasses'&&!back){outline(ctx,10,13,5,4,sec);outline(ctx,17,13,5,4,sec);px(ctx,15,14,2,1,'#17202a');}
    else if(a==='headphones'){px(ctx,7,10,3,9,pri);px(ctx,22,10,3,9,pri);px(ctx,9,7,14,2,sec);}
    else if(a==='backpack'){outline(ctx,side?20:7,22,6,10,pri);px(ctx,side?21:8,24,4,2,sec);}
    else if(a==='scarf'){px(ctx,9,20,14,3,pri);px(ctx,20,22,3,7,sec);}
    else if(a==='beret'){outline(ctx,8,6,16,4,pri);px(ctx,11,5,9,2,lighten(pri,.18));}
    else if(a==='shoulderbag'&&!back){px(ctx,11,20,2,13,sec);outline(ctx,18,28,7,6,pri);}
  }

  function drawLayers(target,p,dir='down',frame=0){
    const tmp=document.createElement('canvas');tmp.width=32;tmp.height=40;const t=tmp.getContext('2d');t.imageSmoothingEnabled=false;
    const right=dir==='right';if(right){t.save();t.translate(32,0);t.scale(-1,1);dir='left';}
    if(p.accessory==='backpack'||p.accessory==='shoulderbag')drawAccessory(t,p,dir);
    drawHair(t,p,dir);drawTop(t,p,dir,frame);drawBottom(t,p,dir,frame);drawShoes(t,p,dir,frame);
    if(!['backpack','shoulderbag'].includes(p.accessory))drawAccessory(t,p,dir);
    if(right)t.restore();
    const c=target.getContext('2d');c.imageSmoothingEnabled=false;c.clearRect(0,0,target.width,target.height);
    c.drawImage(tmp,0,0,32,40,0,OY,64,80);
  }

  function parseKey(canvas){const p=String(canvas?.dataset.paintKey||'male:rows:down:0').split(':');return {dir:p[2]||'down',frame:Number(p[3])||0};}
  function profile(){return window.ML3DAvatarFinal?.getProfile?.()||{base:'male',hair:1,top:1,bottom:1,shoes:1,accessory:'none',skin:'#efc3a1',hairColor:'#4a3024',primary:'#4a9bd0',secondary:'#efe7d8'};}
  function ensureCanvas(host,cls,w=W,h=H){let c=host.querySelector(`:scope>.${cls}`);if(!c){c=document.createElement('canvas');c.className=cls;c.width=w;c.height=h;host.append(c);}return c;}

  function drawSkinMask(base,out,skin){
    const s=base.getContext('2d').getImageData(0,0,base.width,base.height),d=out.getContext('2d').createImageData(out.width,out.height),col=hexToRgb(skin),limit=Math.min(s.data.length,d.data.length);
    for(let i=0;i<limit;i+=4){const r=s.data[i],g=s.data[i+1],b=s.data[i+2],a=s.data[i+3];if(a<15)continue;const warm=r>g*1.04&&g>b*1.03&&r>95&&g>55&&b>35&&(r-b)>28;if(!warm)continue;const lum=(r*0.299+g*0.587+b*0.114)/180,shade=Math.max(.55,Math.min(1.35,lum));d.data[i]=clamp(col.r*shade);d.data[i+1]=clamp(col.g*shade);d.data[i+2]=clamp(col.b*shade);d.data[i+3]=a;}
    out.getContext('2d').putImageData(d,0,0);
  }

  function repaintPlayers(){
    const p=profile();document.querySelectorAll('#playersLayer .player.local').forEach(player=>{const host=player.querySelector(':scope>.avatar-base-host');const base=host?.querySelector(':scope>.avatar-v5-canvas');if(!host||!base)return;const skin=ensureCanvas(host,'avatar-custom-skin-canvas'),layer=ensureCanvas(host,'avatar-custom-layer-canvas');const k=parseKey(base);drawSkinMask(base,skin,p.skin);drawLayers(layer,p,k.dir,k.frame);});
  }

  function paintPreview(){
    const root=document.getElementById('avatarFinalPreview'),base=root?.querySelector(':scope>.avatar-v5-preview');if(!root||!base)return;const p=profile();const skin=ensureCanvas(root,'avatar-custom-skin-preview',128,168),layer=ensureCanvas(root,'avatar-custom-layer-preview',128,168);
    const baseSmall=document.createElement('canvas');baseSmall.width=64;baseSmall.height=96;const bc=baseSmall.getContext('2d');bc.imageSmoothingEnabled=false;bc.drawImage(base,0,0,base.width,base.height,0,0,64,96);
    const tempSkin=document.createElement('canvas');tempSkin.width=64;tempSkin.height=96;drawSkinMask(baseSmall,tempSkin,p.skin);
    const tempLayer=document.createElement('canvas');tempLayer.width=64;tempLayer.height=96;drawLayers(tempLayer,p,'down',0);
    const paint=(src,dst)=>{const c=dst.getContext('2d');c.clearRect(0,0,128,168);c.imageSmoothingEnabled=false;c.drawImage(src,0,0,64,96,18,14,92,140);};paint(tempSkin,skin);paint(tempLayer,layer);
  }

  function addColorPickers(){
    document.querySelectorAll('#avatarFinalControls .avatar-final-section').forEach(section=>{const title=section.querySelector(':scope>strong')?.textContent?.trim();const field=colorFields[title];if(!field||section.querySelector('.avatar-custom-color-row'))return;const p=profile();const row=document.createElement('div');row.className='avatar-custom-color-row';row.innerHTML=`<label>Color libre</label><input class="avatar-custom-color-input" type="color" value="${p[field]}"><span class="avatar-custom-color-value">${p[field]}</span>`;const input=row.querySelector('input'),value=row.querySelector('span');input.addEventListener('input',()=>{value.textContent=input.value;window.ML3DAvatarFinal?.setProfile?.({[field]:input.value});setTimeout(()=>{paintPreview();repaintPlayers();},0);});section.append(row);});
  }

  function installTabs(){
    const controls=document.getElementById('avatarFinalControls');if(!controls||document.querySelector('.avatar-custom-tabs'))return;const labels=[['Peinado','PELO'],['Ropa superior','TOP'],['Ropa inferior','BOTTOM'],['Calzado','CALZADO'],['Accesorio','ACCESORIOS']];const tabs=document.createElement('div');tabs.className='avatar-custom-tabs';controls.before(tabs);let active='Peinado';
    const apply=()=>{document.querySelectorAll('#avatarFinalControls .avatar-final-section').forEach(s=>{const t=s.querySelector(':scope>strong')?.textContent?.trim()||'';const isCategory=labels.some(([a])=>a===t);s.classList.toggle('avatar-custom-hidden',isCategory&&t!==active);});tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.tab===active));};
    labels.forEach(([name,label])=>{const b=document.createElement('button');b.type='button';b.className='avatar-custom-tab';b.dataset.tab=name;b.textContent=label;b.addEventListener('click',()=>{active=name;apply();});tabs.append(b);});apply();
  }

  function decorateEditor(){if(!document.getElementById('avatarFinalControls'))return;addColorPickers();installTabs();paintPreview();}

  function boot(){
    const obs=new MutationObserver(()=>{requestAnimationFrame(decorateEditor);});const modal=document.getElementById('avatarModal');if(modal)obs.observe(modal,{childList:true,subtree:true});
    document.addEventListener('click',e=>{if(e.target.closest('#avatarButton,#avatarFinalBase button,.avatar-final-option,.avatar-final-swatch,#saveAvatarFinal'))setTimeout(()=>{decorateEditor();repaintPlayers();},0);});
    let last='';const tick=()=>{repaintPlayers();paintPreview();const p=JSON.stringify(profile());if(p!==last){last=p;decorateEditor();}requestAnimationFrame(tick);};decorateEditor();requestAnimationFrame(tick);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();