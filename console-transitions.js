(() => {
  "use strict";

  const SP_TRANSITION_ASSETS = Object.freeze({
    silver: Object.freeze({ shell: "assets/gba-sp-silver.jpg?v=4", lid: "assets/sp-lids/silver.webp?v=1" }),
    "gray-red": Object.freeze({ shell: "assets/gba-sp-gray-red.png?v=3", lid: null }),
    "cream-burgundy": Object.freeze({ shell: "assets/gba-sp-cream-burgundy.png?v=2", lid: null }),
    "gold-zelda": Object.freeze({ shell: "assets/gba-sp-gold-zelda.png?v=1", lid: null }),
    "yellow-character": Object.freeze({ shell: "assets/gba-sp-yellow-character.jpg?v=1", lid: null })
  });

  let transitioning = false;
  let initialIntroPlayed = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const imageLoads = new Map();

  function appElement() {
    return document.querySelector("body > .app");
  }

  function closeOpenMenus() {
    document.querySelectorAll("dialog[open]").forEach((dialog) => {
      try { dialog.close(); } catch (_) { dialog.removeAttribute("open"); }
    });
    document.getElementById("ml3d-radial-menu")?.remove();
  }

  function copyCanvases(source, clone) {
    const sources = source.querySelectorAll("canvas");
    clone.querySelectorAll("canvas").forEach((canvas, index) => {
      const original = sources[index];
      if (!original) return;
      canvas.width = original.width;
      canvas.height = original.height;
      try { canvas.getContext("2d").drawImage(original, 0, 0); } catch (_) {}
    });
  }

  function loadImage(src) {
    if (!src) return Promise.resolve(false);
    if (!imageLoads.has(src)) {
      imageLoads.set(src, new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = src;
      }));
    }
    return imageLoads.get(src);
  }

  async function createRepresentation(family, style, rect) {
    const source = appElement();
    if (!source) throw new Error("No se encontró el contenedor del emulador");

    const overlay = document.createElement("div");
    overlay.className = `ml3d-console-transition-overlay is-${family}`;
    Object.assign(overlay.style, {
      left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`
    });

    const shell = document.createElement("div");
    shell.className = "ml3d-console-transition-shell";
    const clone = source.cloneNode(true);
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    clone.querySelectorAll("dialog").forEach((node) => node.remove());
    shell.appendChild(clone);
    overlay.appendChild(shell);
    document.body.appendChild(overlay);
    copyCanvases(source, clone);

    const asset = family === "sp" ? SP_TRANSITION_ASSETS[style] : null;
    if (asset?.lid && await loadImage(asset.lid)) {
      const hinge = document.createElement("img");
      hinge.className = "ml3d-console-transition-lid ml3d-console-transition-hinge";
      hinge.alt = "";
      hinge.src = asset.lid;
      const panel = hinge.cloneNode();
      panel.className = "ml3d-console-transition-lid ml3d-console-transition-panel";
      overlay.append(hinge, panel);
    }
    return {
      overlay,
      shell,
      hinge: overlay.querySelector(".ml3d-console-transition-hinge"),
      panel: overlay.querySelector(".ml3d-console-transition-panel")
    };
  }

  function motionFrames(rect, entering) {
    const drop = Math.max(innerHeight - rect.top + rect.height * .32, rect.height * .75);
    const frames = [
      { transform: `translate3d(0,${drop}px,0) scale(.12)`, opacity: 0, offset: 0 },
      { transform: `translate3d(0,${drop * .58}px,0) scale(.18)`, opacity: 1, offset: .18 },
      { transform: `translate3d(0,${drop * .3}px,0) scale(.34)`, opacity: 1, offset: .34 },
      { transform: `translate3d(0,${rect.height * .12}px,0) scale(.58)`, opacity: 1, offset: .55 },
      { transform: `translate3d(0,${rect.height * .02}px,0) scale(.88)`, opacity: 1, offset: .82 },
      { transform: "translate3d(0,0,0) scale(1)", opacity: 1, offset: 1 }
    ];
    return entering ? frames : reverseFrames(frames);
  }

  function reverseFrames(frames) {
    return frames.slice().reverse().map((frame) => ({ ...frame, offset: 1 - frame.offset }));
  }

  async function animateRepresentation(family, style, direction) {
    const app = appElement();
    if (!app) return;
    const rect = app.getBoundingClientRect();
    const view = await createRepresentation(family, style, rect);
    const entering = direction === "in";
    const duration = reducedMotion.matches ? 100 : (family === "sp" && view.panel ? 2200 : 1100);
    const easing = entering ? "cubic-bezier(.18,.72,.16,1)" : "cubic-bezier(.58,.04,.82,.42)";

    if (reducedMotion.matches && view.panel) {
      view.panel.style.opacity = "0";
      view.hinge.style.opacity = "0";
    }

    try {
      const animations = [view.overlay.animate(motionFrames(rect, entering), { duration, easing, fill: "both" })];
      if (family === "sp" && view.panel && !reducedMotion.matches) {
        const panelIn = [
          { transform: "perspective(1500px) rotateX(0deg) scaleY(1)", opacity: 1, offset: 0 },
          { transform: "perspective(1500px) rotateX(0deg) scaleY(1)", opacity: 1, offset: .34 },
          { transform: "perspective(1500px) rotateX(18deg) scaleY(.95)", opacity: 1, offset: .52 },
          { transform: "perspective(1500px) rotateX(58deg) scaleY(.5)", opacity: .82, offset: .72 },
          { transform: "perspective(1500px) rotateX(82deg) scaleY(.12)", opacity: .34, offset: .88 },
          { transform: "perspective(1500px) rotateX(89deg) scaleY(.02)", opacity: 0, offset: 1 }
        ];
        const hingeIn = [
          { opacity: 1, offset: 0 }, { opacity: 1, offset: .72 },
          { opacity: .55, offset: .88 }, { opacity: 0, offset: 1 }
        ];
        const shellIn = [
          { opacity: 0, filter: "brightness(.82)", offset: 0 },
          { opacity: 0, filter: "brightness(.82)", offset: .32 },
          { opacity: .28, filter: "brightness(.88)", offset: .55 },
          { opacity: .82, filter: "brightness(.97)", offset: .78 },
          { opacity: 1, filter: "brightness(1)", offset: .95 },
          { opacity: 1, filter: "brightness(1)", offset: 1 }
        ];
        animations.push(view.panel.animate(entering ? panelIn : reverseFrames(panelIn), { duration, easing, fill: "both" }));
        animations.push(view.hinge.animate(entering ? hingeIn : reverseFrames(hingeIn), { duration, easing: "ease-in-out", fill: "both" }));
        animations.push(view.shell.animate(entering ? shellIn : reverseFrames(shellIn), { duration, easing: "ease-in-out", fill: "both" }));
      }
      await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
    } finally {
      view.overlay.remove();
    }
  }

  async function runLocked(task) {
    if (transitioning) return false;
    transitioning = true;
    closeOpenMenus();
    document.body.classList.add("ml3d-console-transitioning");
    try {
      await task();
      return true;
    } finally {
      document.querySelectorAll(".ml3d-console-transition-overlay").forEach((node) => node.remove());
      document.body.classList.remove("ml3d-console-transitioning");
      transitioning = false;
    }
  }

  function currentAppearance() {
    return {
      family: document.body.dataset.appearanceFamily || "sp",
      style: document.body.dataset.spStyle || localStorage.getItem("ml3d-sp-style") || "silver"
    };
  }

  async function playConsoleIntro(family, style) {
    await animateRepresentation(family, style, "in");
  }

  async function playConsoleOutro(family, style) {
    await animateRepresentation(family, style, "out");
  }

  async function switchAppearanceAnimated(nextFamily, nextStyle, applyAppearance) {
    if (transitioning) return false;
    const current = currentAppearance();
    if (current.family === nextFamily && (nextFamily !== "sp" || current.style === nextStyle)) return true;
    return runLocked(async () => {
      await playConsoleOutro(current.family, current.style);
      applyAppearance();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await playConsoleIntro(nextFamily, nextStyle);
    });
  }

  async function playInitialIntro() {
    if (initialIntroPlayed || new URLSearchParams(location.search).get("skipintro") === "1") return;
    initialIntroPlayed = true;
    const current = currentAppearance();
    await runLocked(() => playConsoleIntro(current.family, current.style));
  }

  window.SP_TRANSITION_ASSETS = SP_TRANSITION_ASSETS;
  window.ML3DConsoleTransitions = Object.freeze({
    playConsoleIntro, playConsoleOutro, switchAppearanceAnimated, playInitialIntro,
    get transitioning() { return transitioning; }
  });

  loadImage(SP_TRANSITION_ASSETS.silver.lid);
})();
