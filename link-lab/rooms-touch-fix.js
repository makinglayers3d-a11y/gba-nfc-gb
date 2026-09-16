(() => {
  "use strict";

  const ids = ["avatarButton", "chatButton", "selectButton"];

  ids.forEach((id) => {
    const button = document.getElementById(id);
    if (!button) return;

    let suppressTrustedClickUntil = 0;

    button.addEventListener("click", (event) => {
      if (event.isTrusted && performance.now() < suppressTrustedClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);

    const activateFromTouch = (event) => {
      event.preventDefault();
      event.stopPropagation();
      suppressTrustedClickUntil = performance.now() + 450;
      button.click();
    };

    if (window.PointerEvent) {
      button.addEventListener("pointerup", (event) => {
        if (event.pointerType === "mouse") return;
        activateFromTouch(event);
      }, { passive: false });
    } else {
      button.addEventListener("touchend", activateFromTouch, { passive: false });
    }
  });

  const log = document.getElementById("log");
  if (log) {
    const time = new Date().toLocaleTimeString();
    log.textContent += `[${time}] Compatibilidad táctil L/R/SELECT activa.\n`;
  }
})();
