(() => {
  "use strict";

  const PROFILE_KEY = "ml3d-link-avatar-v2";
  const VERSION = 2;
  const channels = new Set();
  const remoteProfiles = new Map();
  const seen = new Set();
  const previousPos = new Map();

  const DEFAULT = {
    version: VERSION,
    id: crypto?.randomUUID?.() || `av-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: "Jugador",
    base: "male",
    hair: 1,
    top: 1,
    bottom: 1,
    shoes: 1,
    accessory: "none",
    skin: "#efc3a1",
    hairColor: "#3a291f",
    primary: "#3f79bd",
    secondary: "#eef3f7"
  };

  const CATALOG = {
    bases: ["male", "female"],
    hair: [1,2,3,4,5,6,7,8],
    top: [1,2,3,4,5,6,7,8],
    bottom: [1,2,3,4,5,6,7,8],
    shoes: [1,2,3,4,5,6],
    accessory: ["none","cap","glasses","headphones","backpack","scarf","beret","shoulderbag"],
    skin: ["#f6d6bc","#efc3a1","#d89c73","#b8754c","#8b5537","#5b3425"],
    hairColor: ["#2b211c","#4a3024","#7c4d31","#c18a4d","#151a24","#667284","#8b3441","#5b456f"],
    primary: ["#d94e4e","#e47732","#e4b842","#59a55a","#4a9bd0","#4c71c5","#8165c5","#d96991","#303842","#eceff2"],
    secondary: ["#202831","#6a4637","#efe7d8","#b84545","#3f78b8","#4d8f5b","#d9b84a","#d66d93","#f4f5f6","#77818a"]
  };

  function cleanName(v){ return String(v || "Jugador").replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,32) || "Jugador"; }
  function load(){
    try { return normalize({ ...DEFAULT, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") }); }
    catch { return { ...DEFAULT }; }
  }
  function normalize(v={}){
    const n = { ...DEFAULT, ...v };
    n.version = VERSION;
    n.name = cleanName(n.name);
    n.base = CATALOG.bases.includes(n.base) ? n.base : "male";
    n.hair = CATALOG.hair.includes(Number(n.hair)) ? Number(n.hair) : 1;
    n.top = CATALOG.top.includes(Number(n.top)) ? Number(n.top) : 1;
    n.bottom = CATALOG.bottom.includes(Number(n.bottom)) ? Number(n.bottom) : 1;
    n.shoes = CATALOG.shoes.includes(Number(n.shoes)) ? Number(n.shoes) : 1;
    n.accessory = CATALOG.accessory.includes(n.accessory) ? n.accessory : "none";
    for (const key of ["skin","hairColor","primary","secondary"]) if (!/^#[0-9a-f]{6}$/i.test(n[key])) n[key] = DEFAULT[key];
    return n;
  }
  function save(p){ profile = normalize(p); localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); return profile; }
  let profile = load();

  function packetId(){ return `${profile.id}:${Date.now()}:${Math.random().toString(16).slice(2)}`; }
  function broadcastProfile(){
    const pkt = JSON.stringify({ type:"avatar:v2", id:packetId(), profile:{...profile}, time:Date.now() });
    for (const ch of channels) if (ch.readyState === "open") try { ch.send(pkt); } catch {}
    renderAll();
  }

  const nativeSend = RTCDataChannel.prototype.send;
  RTCDataChannel.prototype.send = function(data){
    channels.add(this);
    let outgoing = data;
    try {
      const p = typeof data === "string" ? JSON.parse(data) : null;
      if (p?.type === "lobby:profile") {
        const name = cleanName(p.profile?.name || profile.name);
        save({ ...profile, name });
        queueMicrotask(() => {
          if (this.readyState === "open") try { nativeSend.call(this, JSON.stringify({ type:"avatar:v2", id:packetId(), profile:{...profile}, time:Date.now() })); } catch {}
        });
      }
      if (p?.type === "lobby:snapshot") {
        p.avatarV2 = Object.fromEntries(remoteProfiles);
        p.avatarV2[profile.name] = profile;
        outgoing = JSON.stringify(p);
      }
      if (p?.type === "lobby:player") {
        const n = cleanName(p.player?.name);
        if (remoteProfiles.has(n)) p.avatarV2 = remoteProfiles.get(n);
        outgoing = JSON.stringify(p);
      }
    } catch {}
    return nativeSend.call(this, outgoing);
  };

  const nativeAdd = RTCDataChannel.prototype.addEventListener;
  RTCDataChannel.prototype.addEventListener = function(type, listener, options){
    channels.add(this);
    if (type !== "message") return nativeAdd.call(this, type, listener, options);
    const wrapped = (event) => {
      try {
        const p = JSON.parse(event.data);
        if (p?.type === "avatar:v2" && p.profile) {
          if (p.id && seen.has(p.id)) return;
          if (p.id) { seen.add(p.id); if (seen.size > 150) seen.delete(seen.values().next().value); }
          const incoming = normalize(p.profile);
          remoteProfiles.set(incoming.name, incoming);
          renderAll();
          for (const ch of channels) if (ch !== this && ch.readyState === "open") try { nativeSend.call(ch, JSON.stringify(p)); } catch {}
        } else if (p?.type === "lobby:snapshot" && p.avatarV2) {
          for (const [name,val] of Object.entries(p.avatarV2)) remoteProfiles.set(cleanName(name), normalize(val));
          renderAll();
        } else if (p?.type === "lobby:player" && p.avatarV2) {
          remoteProfiles.set(cleanName(p.player?.name), normalize(p.avatarV2));
          renderAll();
        }
      } catch {}
      return listener.call(this, event);
    };
    return nativeAdd.call(this, type, wrapped, options);
  };

  const nativePcAdd = RTCPeerConnection.prototype.addEventListener;
  RTCPeerConnection.prototype.addEventListener = function(type, listener, options){
    if (type !== "datachannel") return nativePcAdd.call(this,type,listener,options);
    return nativePcAdd.call(this,type,(event)=>{ channels.add(event.channel); wireChannel(event.channel); listener.call(this,event); },options);
  };
  const nativeCreate = RTCPeerConnection.prototype.createDataChannel;
  RTCPeerConnection.prototype.createDataChannel = function(...args){ const ch = nativeCreate.apply(this,args); channels.add(ch); wireChannel(ch); return ch; };
  function wireChannel(ch){
    if (ch.__ml3dV2) return; ch.__ml3dV2 = true;
    ch.addEventListener("open",()=>setTimeout(()=>{ if(ch.readyState==="open") try{ nativeSend.call(ch,JSON.stringify({type:"avatar:v2",id:packetId(),profile:{...profile},time:Date.now()})); }catch{} },120));
    ch.addEventListener("close",()=>channels.delete(ch));
  }

  function svg(p, direction="front", frame=0){
    p = normalize(p);
    const female = p.base === "female";
    const flip = direction === "right" ? -1 : 1;
    const side = direction === "left" || direction === "right";
    const back = direction === "back";
    const step = frame % 2 ? 2 : 0;
    const skin=p.skin, hair=p.hairColor, pri=p.primary, sec=p.secondary;
    const hairBack = female ? `<rect x="12" y="13" width="40" height="28" rx="8" fill="${hair}"/>` : `<rect x="14" y="12" width="36" height="20" rx="8" fill="${hair}"/>`;
    const bangs = back ? "" : hairShape(p.hair,hair);
    const face = back ? "" : `<rect x="23" y="26" width="5" height="7" fill="#17202a"/><rect x="37" y="26" width="5" height="7" fill="#17202a"/>`;
    const bodyX = side ? 22 : 18;
    const bodyW = side ? 22 : 28;
    const accessory = accessoryShape(p.accessory,pri,sec,back,side);
    return `<svg viewBox="0 0 64 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g transform="translate(32 0) scale(${flip} 1) translate(-32 0)">
      <ellipse cx="32" cy="73" rx="17" ry="5" fill="rgba(0,0,0,.28)"/>
      ${accessory}
      ${hairBack}
      <rect x="17" y="16" width="30" height="27" rx="10" fill="${skin}" stroke="#2a2220" stroke-width="2"/>
      ${bangs}${face}
      <rect x="${bodyX}" y="42" width="${bodyW}" height="20" rx="4" fill="${pri}" stroke="#1d2530" stroke-width="2"/>
      <rect x="${bodyX+4}" y="46" width="${Math.max(8,bodyW-8)}" height="5" fill="${sec}" opacity=".92"/>
      <rect x="12" y="44" width="7" height="17" rx="3" fill="${side?pri:skin}" stroke="#2a2220" stroke-width="2"/>
      <rect x="45" y="44" width="7" height="17" rx="3" fill="${side?pri:skin}" stroke="#2a2220" stroke-width="2"/>
      ${bottomShape(p.bottom,pri,sec,female)}
      <rect x="20" y="61" width="9" height="${11+step}" rx="2" fill="${sec}" stroke="#1d2530" stroke-width="2"/>
      <rect x="35" y="61" width="9" height="${11+(step?0:2)}" rx="2" fill="${sec}" stroke="#1d2530" stroke-width="2"/>
      ${shoeShape(p.shoes,pri)}
    </g></svg>`;
  }

  function hairShape(i,c){
    const shapes={
      1:`<path d="M15 20Q18 7 32 7Q47 7 50 22L44 18L40 24L34 17L28 24L22 17L17 24Z" fill="${c}" stroke="#241d1a" stroke-width="2"/>`,
      2:`<path d="M14 22Q15 8 31 7Q49 7 50 20L46 28L40 20L34 25L28 17L21 25L16 28Z" fill="${c}" stroke="#241d1a" stroke-width="2"/>`,
      3:`<path d="M15 21Q18 6 33 8Q48 7 49 22L45 19L39 24L35 16L29 23L23 18L18 25Z" fill="${c}" stroke="#241d1a" stroke-width="2"/>`,
      4:`<path d="M15 20Q16 8 31 8Q47 8 49 21L44 22L39 17L35 25L29 18L24 25L19 20Z" fill="${c}" stroke="#241d1a" stroke-width="2"/>`,
      5:`<path d="M14 20Q19 6 34 8Q48 8 50 22L43 20L38 25L31 17L25 26L18 22Z" fill="${c}" stroke="#241d1a" stroke-width="2"/>`,
      6:`<path d="M15 21Q17 7 31 7Q45 7 50 20L46 25L41 20L36 25L30 18L24 24L18 21Z" fill="${c}" stroke="#241d1a" stroke-width="2"/>`,
      7:`<path d="M14 22Q17 7 32 7Q49 7 50 21L45 18L40 24L34 19L28 25L22 18L17 24Z" fill="${c}" stroke="#241d1a" stroke-width="2"/>`,
      8:`<path d="M15 20Q17 8 30 7Q46 7 50 20L45 25L39 18L34 25L29 17L23 24L18 21Z" fill="${c}" stroke="#241d1a" stroke-width="2"/>`
    }; return shapes[i]||shapes[1];
  }
  function bottomShape(i,pri,sec,female){
    if(female && [2,3,6,8].includes(i)) return `<path d="M18 58H46L43 66H21Z" fill="${pri}" stroke="#1d2530" stroke-width="2"/>`;
    return `<rect x="19" y="57" width="26" height="9" rx="2" fill="${i%2?"#29333e":pri}" stroke="#1d2530" stroke-width="2"/>`;
  }
  function shoeShape(i,pri){ const c=["#b74444","#365f9f","#272d35","#805532","#50835a","#d7dbe0"][i-1]||pri; return `<rect x="18" y="69" width="12" height="6" rx="2" fill="${c}" stroke="#20252c" stroke-width="2"/><rect x="34" y="69" width="12" height="6" rx="2" fill="${c}" stroke="#20252c" stroke-width="2"/>`; }
  function accessoryShape(a,pri,sec,back,side){
    if(a==="cap") return `<path d="M16 15Q31 4 48 14L47 20H16Z" fill="${pri}" stroke="#1e2630" stroke-width="2"/><rect x="43" y="17" width="10" height="4" rx="2" fill="${sec}"/>`;
    if(a==="glasses"&&!back) return `<g fill="none" stroke="#17202a" stroke-width="2"><rect x="19" y="25" width="11" height="8" rx="3"/><rect x="34" y="25" width="11" height="8" rx="3"/><path d="M30 29H34"/></g>`;
    if(a==="headphones") return `<path d="M14 22Q14 8 32 8Q50 8 50 22" fill="none" stroke="${pri}" stroke-width="4"/><rect x="12" y="20" width="6" height="12" rx="3" fill="${sec}"/><rect x="46" y="20" width="6" height="12" rx="3" fill="${sec}"/>`;
    if(a==="backpack") return `<rect x="8" y="42" width="15" height="22" rx="5" fill="${pri}" stroke="#1d2530" stroke-width="2"/>`;
    if(a==="scarf") return `<rect x="20" y="39" width="25" height="6" rx="3" fill="${pri}"/><path d="M39 43L47 58H40Z" fill="${pri}"/>`;
    if(a==="beret") return `<ellipse cx="32" cy="14" rx="18" ry="8" fill="${pri}" stroke="#1d2530" stroke-width="2"/>`;
    if(a==="shoulderbag") return `<path d="M19 40L43 63" stroke="${sec}" stroke-width="3"/><rect x="39" y="55" width="13" height="12" rx="3" fill="${pri}" stroke="#1d2530" stroke-width="2"/>`;
    return "";
  }

  function profileForPlayer(el){
    const name = cleanName(el.querySelector(".player-name-text")?.textContent?.replace(/ ★$/,""));
    if(el.classList.contains("local")) return profile;
    return remoteProfiles.get(name) || { ...DEFAULT, name, primary:"#4d9be6" };
  }
  function renderPlayer(el){
    const wrap = el.querySelector(".avatar-wrap"); if(!wrap) return;
    const p = profileForPlayer(el);
    let avatar = wrap.querySelector(".ml3d-avatar-v2");
    if(!avatar){ avatar=document.createElement("div"); avatar.className="ml3d-avatar-v2"; wrap.append(avatar); wrap.classList.add("ml3d-v2-mounted"); }
    const prev = previousPos.get(el.dataset.playerId) || {};
    const x=parseFloat(el.style.left)||0, y=parseFloat(el.style.top)||0;
    let direction=prev.direction||"front";
    if(Number.isFinite(prev.x)){
      const dx=x-prev.x, dy=y-prev.y;
      if(Math.abs(dx)>.05 || Math.abs(dy)>.05){ direction=Math.abs(dx)>Math.abs(dy)?(dx<0?"left":"right"):(dy<0?"back":"front"); avatar.classList.add("walking"); clearTimeout(avatar.__walkTimer); avatar.__walkTimer=setTimeout(()=>avatar.classList.remove("walking"),150); }
    }
    const frame=(Date.now()>>7)&1;
    previousPos.set(el.dataset.playerId,{x,y,direction});
    avatar.innerHTML=svg(p,direction,frame);
  }
  function renderAll(){ document.querySelectorAll("#playersLayer .player").forEach(renderPlayer); renderPreview(); }

  function rebuildEditor(){
    const modal=document.querySelector("#avatarModal .modal-card"); if(!modal || modal.dataset.v2) return; modal.dataset.v2="1";
    const oldSave=document.querySelector("#saveProfile"); if(oldSave) oldSave.style.display="none";
    const oldGroups=["#colorChoices","#bodyChoices","#faceChoices","#accessoryChoices"];
    for(const s of oldGroups){ const e=document.querySelector(s); if(e) e.style.display="none"; }
    modal.querySelectorAll("label").forEach(l=>{ if(!l.htmlFor || l.htmlFor!=="profileName") l.style.display="none"; });
    const root=document.createElement("div"); root.className="avatar-v2-editor"; root.innerHTML=`<div class="avatar-v2-preview" id="avatarV2Preview"></div><div class="avatar-v2-tabs"><button type="button" data-base="male">HOMBRE</button><button type="button" data-base="female">MUJER</button></div><div id="avatarV2Controls"></div><button type="button" class="primary avatar-v2-save" id="saveAvatarV2">GUARDAR PERSONAJE</button><p class="avatar-v2-note">Perfil guardado en este dispositivo y sincronizado con la sala.</p>`;
    modal.insertBefore(root,oldSave||null);
    root.querySelectorAll("[data-base]").forEach(b=>b.addEventListener("click",()=>{profile=normalize({...profile,base:b.dataset.base});buildControls();renderPreview();}));
    root.querySelector("#saveAvatarV2").addEventListener("click",()=>{
      const name=document.querySelector("#profileName")?.value||profile.name; save({...profile,name});
      if(document.querySelector("#profileName")) document.querySelector("#profileName").value=profile.name;
      if(oldSave) oldSave.click();
      setTimeout(broadcastProfile,40);
      renderAll();
    });
    buildControls(); renderPreview();
  }
  function section(title,values,field,labelFn=(v)=>String(v)){
    const wrap=document.createElement("div"); wrap.className="avatar-v2-section"; wrap.innerHTML=`<strong>${title}</strong>`;
    const grid=document.createElement("div"); grid.className="avatar-v2-grid";
    values.forEach(v=>{ const b=document.createElement("button"); b.type="button"; b.className="avatar-v2-choice"+(profile[field]===v?" selected":""); b.textContent=labelFn(v); b.addEventListener("click",()=>{profile=normalize({...profile,[field]:v});buildControls();renderPreview();}); grid.append(b); });
    wrap.append(grid); return wrap;
  }
  function swatches(title,values,field){
    const wrap=document.createElement("div"); wrap.className="avatar-v2-section"; wrap.innerHTML=`<strong>${title}</strong>`; const grid=document.createElement("div"); grid.className="avatar-v2-grid";
    values.forEach(v=>{const b=document.createElement("button"); b.type="button"; b.className="avatar-v2-choice swatch"+(profile[field]===v?" selected":""); b.style.background=v; b.textContent=" "; b.addEventListener("click",()=>{profile=normalize({...profile,[field]:v});buildControls();renderPreview();});grid.append(b);}); wrap.append(grid); return wrap;
  }
  function buildControls(){
    const box=document.querySelector("#avatarV2Controls"); if(!box)return; box.textContent="";
    box.append(section("Peinado",CATALOG.hair,"hair",v=>`PELO ${v}`),section("Ropa superior",CATALOG.top,"top",v=>`TOP ${v}`),section("Ropa inferior",CATALOG.bottom,"bottom",v=>`BAJO ${v}`),section("Calzado",CATALOG.shoes,"shoes",v=>`ZAP ${v}`),section("Accesorio",CATALOG.accessory,"accessory",v=>({none:"NADA",cap:"GORRA",glasses:"GAFAS",headphones:"CASCOS",backpack:"MOCHILA",scarf:"BUFANDA",beret:"BOINA",shoulderbag:"BOLSO"}[v]||v)),swatches("Piel",CATALOG.skin,"skin"),swatches("Pelo",CATALOG.hairColor,"hairColor"),swatches("Color principal",CATALOG.primary,"primary"),swatches("Color secundario",CATALOG.secondary,"secondary"));
    document.querySelectorAll("[data-base]").forEach(b=>b.classList.toggle("selected",b.dataset.base===profile.base));
  }
  function renderPreview(){ const box=document.querySelector("#avatarV2Preview"); if(!box)return; box.innerHTML=`<div class="ml3d-avatar-v2">${svg(profile,"front",0)}</div>`; }

  function startObservers(){
    const layer=document.querySelector("#playersLayer"); if(layer){ new MutationObserver(()=>renderAll()).observe(layer,{childList:true,subtree:true,attributes:true,attributeFilter:["style","class"]}); }
    const modal=document.querySelector("#avatarModal"); if(modal){ new MutationObserver(()=>{if(!modal.hidden){const n=document.querySelector("#profileName"); if(n) profile=normalize({...profile,name:n.value}); buildControls();renderPreview();}}).observe(modal,{attributes:true,attributeFilter:["hidden"]}); }
    renderAll();
  }

  window.addEventListener("load",()=>{ rebuildEditor(); startObservers(); setTimeout(renderAll,100); });
  window.ML3DAvatarV2={get profile(){return {...profile};},catalog:CATALOG,render:svg,broadcast:broadcastProfile};
})();
