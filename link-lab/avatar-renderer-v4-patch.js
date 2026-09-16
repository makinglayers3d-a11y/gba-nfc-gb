(() => {
  "use strict";

  if (window.__ml3dAvatarRendererV4Patch) return;
  window.__ml3dAvatarRendererV4Patch = true;

  const W = 64;
  const H = 96;
  const BLEND_MS = 48;
  const states = new WeakMap();

  const style = document.createElement("style");
  style.textContent = `
    /* La hoja base antigua ocultaba cualquier canvas que no usara sus clases.
       Estas reglas, con mayor especificidad, restauran la preview v3. */
    #avatarFinalPreview > canvas.avatar-v3-preview {
      display:block!important;
      visibility:visible!important;
      opacity:1!important;
      position:relative!important;
      z-index:3!important;
      margin:auto!important;
    }
    #avatarFinalBase button > canvas.avatar-v3-choice {
      display:block!important;
      visibility:visible!important;
      opacity:1!important;
      position:relative!important;
      z-index:3!important;
    }

    /* El canvas v3 sigue generando las poses, pero la salida visible lateral
       pasa por un canvas intermedio que mezcla cada cambio de pose a 60 Hz. */
    .avatar-v3-canvas {
      opacity:0!important;
      visibility:hidden!important;
    }
    .avatar-v4-smooth {
      position:absolute;
      left:50%;
      bottom:0;
      width:56px;
      height:84px;
      transform:translateX(-50%);
      image-rendering:pixelated;
      image-rendering:crisp-edges;
      pointer-events:none;
    }
    .player.local .avatar-v4-smooth {
      filter:drop-shadow(0 0 4px rgba(88,190,255,.88));
    }
    @media(max-width:560px){
      .avatar-v4-smooth { width:48px; height:72px; }
    }
  `;
  document.head.appendChild(style);

  function makeBuffer() {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    return canvas;
  }

  function ensureOutput(player) {
    const host = player.querySelector(":scope > .avatar-base-host");
    if (!host) return null;

    let output = host.querySelector(":scope > .avatar-v4-smooth");
    if (!output) {
      output = document.createElement("canvas");
      output.width = W;
      output.height = H;
      output.className = "avatar-v4-smooth";
      output.setAttribute("aria-hidden", "true");
      host.append(output);
    }
    return output;
  }

  function copy(source, target) {
    const ctx = target.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(source, 0, 0, target.width, target.height);
  }

  function renderBlend(output, from, to, amount) {
    const ctx = output.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, output.width, output.height);

    ctx.globalAlpha = 1;
    ctx.drawImage(from, 0, 0, output.width, output.height);

    ctx.globalAlpha = amount;
    ctx.drawImage(to, 0, 0, output.width, output.height);
    ctx.globalAlpha = 1;
  }

  function ease(t) {
    return t * t * (3 - 2 * t);
  }

  function tick(now) {
    document.querySelectorAll("#playersLayer .player").forEach((player) => {
      const source = player.querySelector(":scope > .avatar-base-host > .avatar-v3-canvas");
      if (!source) return;

      const output = ensureOutput(player);
      if (!output) return;

      let state = states.get(player);
      if (!state) {
        state = {
          key: "",
          startedAt: now,
          from: makeBuffer(),
          to: makeBuffer(),
          initialized: false
        };
        states.set(player, state);
      }

      const key = source.dataset.paintKey || "";
      const direction = player.dataset.ml3dDirection || "down";
      const lateral =
        player.classList.contains("ml3d-walking") &&
        (direction === "left" || direction === "right");

      if (!state.initialized) {
        copy(source, output);
        copy(source, state.from);
        copy(source, state.to);
        state.key = key;
        state.startedAt = now;
        state.initialized = true;
      }

      if (key !== state.key) {
        /* Partimos de lo que el usuario estaba viendo, no de la pose anterior
           pura. Esto evita un pequeño salto cuando llega un frame nuevo antes
           de terminar la transición previa. */
        copy(output, state.from);
        copy(source, state.to);
        state.key = key;
        state.startedAt = now;
      }

      if (!lateral) {
        copy(source, output);
        copy(source, state.from);
        copy(source, state.to);
        state.startedAt = now;
        return;
      }

      const t = Math.min(1, Math.max(0, (now - state.startedAt) / BLEND_MS));
      renderBlend(output, state.from, state.to, ease(t));
    });

    requestAnimationFrame(tick);
  }

  function forceEditorVisible() {
    const preview = document.querySelector("#avatarFinalPreview > canvas.avatar-v3-preview");
    if (preview) {
      preview.style.setProperty("display", "block", "important");
      preview.style.setProperty("visibility", "visible", "important");
      preview.style.setProperty("opacity", "1", "important");
    }

    document.querySelectorAll("#avatarFinalBase button > canvas.avatar-v3-choice").forEach((canvas) => {
      canvas.style.setProperty("display", "block", "important");
      canvas.style.setProperty("visibility", "visible", "important");
      canvas.style.setProperty("opacity", "1", "important");
    });
  }

  const modal = document.getElementById("avatarModal");
  if (modal) {
    new MutationObserver(forceEditorVisible).observe(modal, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "style"]
    });
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("#avatarButton,#avatarFinalBase button,#saveAvatarFinal")) {
      setTimeout(forceEditorVisible, 0);
      setTimeout(forceEditorVisible, 40);
    }
  });

  forceEditorVisible();
  requestAnimationFrame(tick);
})();
