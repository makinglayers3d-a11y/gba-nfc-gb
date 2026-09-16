(() => {
  "use strict";

  const PROFILE_KEY = "ml3d-link-avatar-final-v1";
  const MALE_URL = "./assets/avatar-approved/male.webp?v=2";
  const FEMALE_URL = "./assets/avatar-approved/female.webp?v=2";
  const DIR_ROW = { front: 0, back: 1, left: 2, right: 3 };
  const remoteProfiles = new Map();
  const stateByPlayer = new Map();

  function cleanName(value) {
    return String(value || "Jugador").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+★$/, "").trim().slice(0, 32) || "Jugador";
  }

  function loadLocalProfile() {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
      return { base: p.base === "female" ? "female" : "male", name: cleanName(p.name) };
    } catch {
      return { base: "male", name: "Jugador" };
    }
  }

  function spriteUrl(base) {
    return base === "female" ? FEMALE_URL : MALE_URL;
  }

  function playerName(el) {
    return cleanName(el.querySelector(".player-name-text")?.textContent || "Jugador");
  }

  function resolveProfile(el) {
    if (el.classList.contains("local")) return loadLocalProfile();
    return remoteProfiles.get(playerName(el)) || { base: "male", name: playerName(el) };
  }

  function ensureSprite(el) {
    const wrap = el.querySelector(".avatar-wrap");
    if (!wrap) return null;
    wrap.classList.add("ml3d-approved-mounted");
    let sprite = wrap.querySelector(".ml3d-approved-sprite");
    if (!sprite) {
      sprite = document.createElement("div");
      sprite.className = "ml3d-approved-sprite";
      sprite.setAttribute("aria-hidden", "true");
      wrap.append(sprite);
    }
    return sprite;
  }

  function positionOf(el) {
    const x = Number.parseFloat(el.style.left) || 0;
    const y = Number.parseFloat(el.style.top) || 0;
    return { x, y };
  }

  function chooseDirection(prev, next, fallback) {
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    if (Math.abs(dx) < 0.02 && Math.abs(dy) < 0.02) return fallback || "front";
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
    return dy < 0 ? "back" : "front";
  }

  function paint(el, now) {
    const sprite = ensureSprite(el);
    if (!sprite) return;

    const id = el.dataset.playerId || playerName(el);
    const pos = positionOf(el);
    const prevState = stateByPlayer.get(id) || { x: pos.x, y: pos.y, dir: "front", frame: 0, lastMove: 0 };
    const moved = Math.abs(pos.x - prevState.x) > 0.02 || Math.abs(pos.y - prevState.y) > 0.02;
    const dir = chooseDirection(prevState, pos, prevState.dir);
    let frame = prevState.frame;
    let lastMove = prevState.lastMove;

    if (moved) {
      frame = 1 + (Math.floor(now / 115) % 3);
      lastMove = now;
    } else if (now - lastMove > 150) {
      frame = 0;
    }

    const profile = resolveProfile(el);
    sprite.style.backgroundImage = `url("${spriteUrl(profile.base)}")`;

    const mobile = matchMedia("(max-width:560px)").matches;
    const cellW = mobile ? 54 : 64;
    const cellH = mobile ? 81 : 96;
    sprite.style.backgroundPosition = `${-frame * cellW}px ${-DIR_ROW[dir] * cellH}px`;

    stateByPlayer.set(id, { x: pos.x, y: pos.y, dir, frame, lastMove });
  }

  function renderAll(now = performance.now()) {
    document.querySelectorAll("#playersLayer .player").forEach((el) => paint(el, now));
  }

  function patchEditor() {
    const editor = document.querySelector(".avatar-final-editor");
    const preview = document.querySelector(".avatar-final-main-preview");
    if (!editor || !preview) return;

    let approved = preview.querySelector(".avatar-approved-preview");
    if (!approved) {
      approved = document.createElement("div");
      approved.className = "avatar-approved-preview";
      preview.append(approved);
    }
    const p = loadLocalProfile();
    approved.style.backgroundImage = `url("${spriteUrl(p.base)}")`;

    if (!editor.querySelector(".avatar-approved-status")) {
      const note = document.createElement("div");
      note.className = "avatar-approved-status";
      note.innerHTML = "<strong>Sprite aprobado activo.</strong><br>Las piezas modulares antiguas quedan ocultas hasta sustituirlas por assets direccionales del mismo estilo.";
      const baseRow = editor.querySelector(".avatar-final-base-row");
      (baseRow || preview).insertAdjacentElement("afterend", note);
    }
  }

  function captureAvatarPacket(event) {
    try {
      const pkt = JSON.parse(event.data);
      if (pkt?.type !== "avatar:final" || !pkt.profile) return;
      const name = cleanName(pkt.profile.name);
      remoteProfiles.set(name, { base: pkt.profile.base === "female" ? "female" : "male", name });
      renderAll();
    } catch {}
  }

  function hookDataChannels() {
    if (!globalThis.RTCDataChannel?.prototype || globalThis.RTCDataChannel.prototype.__ml3dApprovedHook) return;
    const proto = globalThis.RTCDataChannel.prototype;
    const nativeAdd = proto.addEventListener;
    proto.addEventListener = function(type, listener, options) {
      if (type === "message" && !this.__ml3dApprovedMessageHook) {
        this.__ml3dApprovedMessageHook = true;
        nativeAdd.call(this, "message", captureAvatarPacket);
      }
      return nativeAdd.call(this, type, listener, options);
    };
    proto.__ml3dApprovedHook = true;
  }

  function preload(url) {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }

  function boot() {
    hookDataChannels();
    preload(MALE_URL);
    preload(FEMALE_URL);

    const root = document.getElementById("playersLayer") || document.body;
    const observer = new MutationObserver(() => {
      renderAll();
      patchEditor();
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });

    const modal = document.getElementById("avatarModal");
    if (modal) new MutationObserver(patchEditor).observe(modal, { subtree: true, childList: true, attributes: true });

    document.addEventListener("click", (event) => {
      if (event.target.closest("#avatarButton,#saveProfile,.avatar-final-base-row button")) setTimeout(() => { patchEditor(); renderAll(); }, 0);
    });

    const tick = (now) => { renderAll(now); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    patchEditor();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
