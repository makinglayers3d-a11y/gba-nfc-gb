(() => {
  "use strict";

  const moveTimers = new WeakMap();
  const lastPositions = new WeakMap();

  function part(className) {
    const el = document.createElement("span");
    el.className = className;
    return el;
  }

  function decorateAvatar(wrap) {
    if (!(wrap instanceof HTMLElement)) return;
    if (wrap.querySelector(":scope > .avatar-pro-layer")) return;

    const layer = document.createElement("span");
    layer.className = "avatar-pro-layer";
    layer.append(
      part("avatar-pro-ear left"),
      part("avatar-pro-ear right"),
      part("avatar-pro-neck"),
      part("avatar-pro-arm left"),
      part("avatar-pro-arm right"),
      part("avatar-pro-collar"),
      part("avatar-pro-belt"),
      part("avatar-pro-leg left"),
      part("avatar-pro-leg right"),
      part("avatar-pro-shoe left"),
      part("avatar-pro-shoe right")
    );
    wrap.append(layer);
  }

  function updatePlayerDepth(player) {
    if (!(player instanceof HTMLElement)) return;
    const top = parseFloat(player.style.top || "58");
    if (!Number.isFinite(top)) return;

    const normalized = Math.max(0, Math.min(1, (top - 28) / 60));
    const scale = 0.86 + normalized * 0.17;
    const scaleText = scale.toFixed(3);
    if (player.style.getPropertyValue("--depth-scale") !== scaleText) {
      player.style.setProperty("--depth-scale", scaleText);
    }

    const z = String(20 + Math.round(top));
    if (player.style.zIndex !== z) player.style.zIndex = z;

    const previous = lastPositions.get(player);
    const current = `${player.style.left}|${player.style.top}`;
    if (previous && previous !== current) {
      player.classList.add("is-moving");
      clearTimeout(moveTimers.get(player));
      moveTimers.set(player, setTimeout(() => player.classList.remove("is-moving"), 180));
    }
    lastPositions.set(player, current);
  }

  function refresh(root = document) {
    root.querySelectorAll?.(".avatar-wrap").forEach(decorateAvatar);
    root.querySelectorAll?.(".player").forEach(updatePlayerDepth);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(".avatar-wrap")) decorateAvatar(node);
          node.querySelectorAll?.(".avatar-wrap").forEach(decorateAvatar);
          if (node.matches(".player")) updatePlayerDepth(node);
          node.querySelectorAll?.(".player").forEach(updatePlayerDepth);
        });
      } else if (mutation.type === "attributes" && mutation.target instanceof HTMLElement && mutation.target.matches(".player")) {
        updatePlayerDepth(mutation.target);
      }
    }
  });

  const start = () => {
    refresh();
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style"]
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
