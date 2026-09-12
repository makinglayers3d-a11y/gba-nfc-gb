(() => {
  "use strict";
  const FAMILY_KEY = "ml3d-appearance-family";
  const SP_STYLE_KEY = "ml3d-sp-style";
  const SP_SHELL_COLOR_KEY = "ml3d-sp-shell-color";
  const SP_BUTTON_COLOR_KEY = "ml3d-sp-button-color";
  const SP_STYLES = ["silver", "gray-red", "cream-burgundy", "gold-zelda", "yellow-character", "custom-color"];
  let customRenderToken = 0;
  let customRenderTimer = 0;

  function build() {
    const section = document.querySelector("#menu .appearance-control");
    if (!section || document.getElementById("ml3d-appearance-selector")) return;
    const colorGroups = section.querySelectorAll(":scope > .color-group");
    const selector = document.createElement("div");
    selector.id = "ml3d-appearance-selector";
    selector.innerHTML = `
      <div class="ml3d-family-tabs" role="tablist" aria-label="Estilo de apariencia">
        <button type="button" data-family="custom">Personalizado</button>
        <button type="button" data-family="sp">SP</button>
      </div>
      <div class="ml3d-family-panel" data-panel="custom"><div class="ml3d-custom-slot"></div></div>
      <div class="ml3d-family-panel" data-panel="sp">
        <span class="ml3d-style-label">Color de Game Boy Advance SP</span>
        <div class="ml3d-sp-swatches">
          <button type="button" data-sp="silver" style="--swatch:#c8c9c9" aria-label="SP plateada" title="Plateada"></button>
          <button type="button" data-sp="gray-red" style="--swatch:linear-gradient(135deg,#c4c4c4 0 62%,#a31521 63%)" aria-label="SP gris con botones rojos" title="Gris y roja"></button>
          <button type="button" data-sp="cream-burgundy" style="--swatch:linear-gradient(135deg,#f3e4cd 0 62%,#741326 63%)" aria-label="SP crema con botones burdeos" title="Crema y burdeos"></button>
          <button type="button" data-sp="gold-zelda" style="--swatch:linear-gradient(135deg,#d8b64b 0 62%,#171717 63%)" aria-label="SP dorada Zelda" title="Dorada Zelda"></button>
          <button type="button" data-sp="yellow-character" style="--swatch:linear-gradient(135deg,#ffd70a 0 62%,#965d46 63%)" aria-label="SP amarilla" title="Amarilla"></button>
          <button type="button" data-sp="custom-color" class="ml3d-color-wheel" aria-label="Personalizar colores de la SP" title="Personalizar colores"></button>
        </div>
        <div class="ml3d-sp-color-popover" hidden>
          <button type="button" class="ml3d-color-close" aria-label="Cerrar y guardar personalización">×</button>
          <strong>Personalizar SP</strong>
          <label>Carcasa <input type="color" data-custom-color="shell" value="#bfc2c5"></label>
          <label>Teclas <input type="color" data-custom-color="buttons" value="#4b4547"></label>
          <small>Los colores se guardan automáticamente.</small>
        </div>
      </div>`;
    section.insertBefore(selector, section.children[1] || null);
    const customSlot = selector.querySelector(".ml3d-custom-slot");
    colorGroups.forEach((group) => customSlot.appendChild(group));
    selector.addEventListener("click", (event) => {
      const familyButton = event.target.closest("[data-family]");
      if (familyButton) return setFamily(familyButton.dataset.family);
      const spButton = event.target.closest("[data-sp]");
      if (spButton) {
        if (spButton.dataset.sp === "custom-color" && document.body.dataset.spStyle === "custom-color") {
          toggleColorPopover();
          return;
        }
        setSP(spButton.dataset.sp);
        if (spButton.dataset.sp === "custom-color") toggleColorPopover(true);
      }
      if (event.target.closest(".ml3d-color-close")) toggleColorPopover(false);
    });
    selector.querySelectorAll("[data-custom-color]").forEach((input) => {
      const key = input.dataset.customColor === "shell" ? SP_SHELL_COLOR_KEY : SP_BUTTON_COLOR_KEY;
      input.value = localStorage.getItem(key) || input.value;
      input.addEventListener("input", () => {
        localStorage.setItem(key, input.value);
        queueCustomSPRender();
      });
    });
    setFamily(localStorage.getItem(FAMILY_KEY) || "sp", false);
    setSP(localStorage.getItem(SP_STYLE_KEY) || "silver", false);
  }

  function setFamily(family, save = true) {
    family = family === "custom" ? "custom" : "sp";
    if (save) localStorage.setItem(FAMILY_KEY, family);
    document.body.dataset.appearanceFamily = family;
    document.querySelectorAll("#ml3d-appearance-selector [data-family]").forEach((button) => {
      const active = button.dataset.family === family;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("#ml3d-appearance-selector [data-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.panel !== family;
    });
    document.body.classList.toggle("sp-skin-test", family === "sp");
    document.body.classList.toggle("ml3d-custom-skin", family === "custom");
    window.dispatchEvent(new CustomEvent("ml3d-appearance-changed", {
      detail: { family, style: localStorage.getItem(SP_STYLE_KEY) || "silver" }
    }));
  }

  function setSP(style, save = true) {
    if (!SP_STYLES.includes(style)) style = "silver";
    if (save) localStorage.setItem(SP_STYLE_KEY, style);
    document.body.dataset.spStyle = style;
    document.querySelectorAll("#ml3d-appearance-selector [data-sp]").forEach((button) => {
      const active = button.dataset.sp === style;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (style === "custom-color") queueCustomSPRender(true);
    window.dispatchEvent(new CustomEvent("ml3d-sp-style-changed", { detail: { style } }));
  }

  function toggleColorPopover(force) {
    const popover = document.querySelector(".ml3d-sp-color-popover");
    if (!popover) return;
    const shouldOpen = typeof force === "boolean" ? force : popover.hidden;
    popover.hidden = !shouldOpen;
    document.querySelector('[data-sp="custom-color"]')?.setAttribute("aria-expanded", String(shouldOpen));
  }

  function parseHex(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function tintPixel(data, index, color) {
    const luminance = (data[index] * .2126 + data[index + 1] * .7152 + data[index + 2] * .0722) / 255;
    const shade = .28 + luminance * .9;
    data[index] = Math.min(255, color[0] * shade);
    data[index + 1] = Math.min(255, color[1] * shade);
    data[index + 2] = Math.min(255, color[2] * shade);
  }

  function inEllipse(x, y, cx, cy, rx, ry) {
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  }

  function isButtonPixel(x, y, width, height) {
    const sx = x / width;
    const sy = y / height;
    return (
      (sx > .105 && sx < .385 && sy > .645 && sy < .79) ||
      inEllipse(sx, sy, .652, .714, .105, .073) ||
      inEllipse(sx, sy, .843, .675, .09, .067) ||
      inEllipse(sx, sy, .496, .611, .052, .041) ||
      inEllipse(sx, sy, .389, .916, .052, .041) ||
      inEllipse(sx, sy, .596, .916, .052, .041)
    );
  }

  function renderCustomSP() {
    const token = ++customRenderToken;
    const image = new Image();
    image.onload = () => {
      if (token !== customRenderToken) return;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const shellColor = parseHex(localStorage.getItem(SP_SHELL_COLOR_KEY) || "#bfc2c5");
      const buttonColor = parseHex(localStorage.getItem(SP_BUTTON_COLOR_KEY) || "#4b4547");
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const index = (y * canvas.width + x) * 4;
          const sx = x / canvas.width;
          const sy = y / canvas.height;
          const isScreen = sx > .025 && sx < .975 && sy > .025 && sy < .477;
          if (isButtonPixel(x, y, canvas.width, canvas.height)) tintPixel(pixels.data, index, buttonColor);
          else if (!isScreen) tintPixel(pixels.data, index, shellColor);
        }
      }
      context.putImageData(pixels, 0, 0);
      document.documentElement.style.setProperty("--ml3d-custom-sp-shell", `url("${canvas.toDataURL("image/jpeg", .92)}")`);
    };
    image.src = "assets/gba-sp-custom-base.jpg?v=1";
  }

  function queueCustomSPRender(immediate = false) {
    window.clearTimeout(customRenderTimer);
    customRenderTimer = window.setTimeout(renderCustomSP, immediate ? 0 : 70);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
