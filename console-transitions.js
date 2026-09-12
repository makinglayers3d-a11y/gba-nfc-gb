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

  function createRepresentation(family, style, rect) {
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
    if (asset?.lid) {
      const lid = document.createElement("img");
      lid.className = "ml3d-console-transition-lid";
      lid.alt = "";
      lid.decoding = "async";
      lid.src = asset.lid;
      lid.addEventListener("error", () => lid.remove(), { once: true });
      overlay.appendChild(lid);
    }
    return { overlay, shell, lid: overlay.querySelector(".ml3d-console-transition-lid") };
  }

  function motionFrames(rect, entering) {
    const drop = Math.max(innerHeight - rect.top + rect.height * .32, rect.height * .75);
    const frames = [
      { transform: `translate3d(0,${drop}px,0) scale(.16)`, opacity: 0 },
      { transform: `translate3d(0,${rect.height * .2}px,0) scale(.34)`, opacity: 1, offset: .34 },
      { transform: "translate3d(0,0,0) scale(1)", opacity: 1 }
    ];
    return entering ? frames : frames.reverse().map(({ offset, ...frame }, index) => ({
      ...frame, ...(index === 1 ? { offset: .66 } : {})
    }));
  }

  async function animateRepresentation(family, style, direction) {
    const app = appElement();
    if (!app) return;
    const rect = app.getBoundingClientRect();
    const view = createRepresentation(family, style, rect);
    const entering = direction === "in";
    const duration = reducedMotion.matches ? 90 : (family === "sp" && view.lid ? 1250 : 720);
    const easing = entering ? "cubic-bezier(.16,.84,.2,1)" : "cubic-bezier(.55,.02,.82,.45)";

    try {
      const animations = [view.overlay.animate(motionFrames(rect, entering), { duration, easing, fill: "both" })];
      if (family === "sp" && view.lid && !reducedMotion.matches) {
        const closed = { transform: "perspective(1200px) rotateX(0deg) scaleY(1)", opacity: 1 };
        const open = { transform: "perspective(1200px) rotateX(-86deg) scaleY(.08)", opacity: 0 };
        const lidFrames = entering
          ? [closed, { ...closed, offset: .3 }, { transform: "perspective(1200px) rotateX(-54deg) scaleY(.58)", opacity: .78, offset: .68 }, open]
          : [open, { transform: "perspective(1200px) rotateX(-54deg) scaleY(.58)", opacity: .78, offset: .32 }, { ...closed, offset: .7 }, closed];
        const shellFrames = entering
          ? [{ opacity: 0 }, { opacity: 0, offset: .28 }, { opacity: 1, offset: .76 }, { opacity: 1 }]
          : [{ opacity: 1 }, { opacity: 1, offset: .24 }, { opacity: 0, offset: .72 }, { opacity: 0 }];
        animations.push(view.lid.animate(lidFrames, { duration, easing, fill: "both" }));
        animations.push(view.shell.animate(shellFrames, { duration, easing: "ease-in-out", fill: "both" }));
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
})();
