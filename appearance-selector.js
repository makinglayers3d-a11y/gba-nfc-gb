(() => {
  "use strict";
  const FAMILY_KEY = "ml3d-appearance-family";
  const SP_STYLE_KEY = "ml3d-sp-style";
  const SP_STYLES = ["silver", "gray-red", "cream-burgundy", "gold-zelda", "yellow-character"];

  /* Remove state left behind by the retired custom SP colour editor. */
  localStorage.removeItem("ml3d-sp-shell-color");
  localStorage.removeItem("ml3d-sp-button-color");
  document.documentElement.style.removeProperty("--ml3d-custom-sp-shell");
  if (!SP_STYLES.includes(localStorage.getItem(SP_STYLE_KEY) || "silver")) {
    localStorage.setItem(SP_STYLE_KEY, "silver");
  }

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
        </div>
      </div>`;
    section.insertBefore(selector, section.children[1] || null);
    const customSlot = selector.querySelector(".ml3d-custom-slot");
    colorGroups.forEach((group) => customSlot.appendChild(group));
    selector.addEventListener("click", async (event) => {
      const familyButton = event.target.closest("[data-family]");
      if (familyButton) return requestAppearance(familyButton.dataset.family, currentStyle());
      const spButton = event.target.closest("[data-sp]");
      if (spButton) await requestAppearance("sp", spButton.dataset.sp);
    });
    setFamily(localStorage.getItem(FAMILY_KEY) || "sp", false);
    setSP(localStorage.getItem(SP_STYLE_KEY) || "silver", false);
  }

  function currentStyle() {
    const style = document.body.dataset.spStyle || localStorage.getItem(SP_STYLE_KEY) || "silver";
    return SP_STYLES.includes(style) ? style : "silver";
  }

  async function requestAppearance(family, style) {
    family = family === "custom" ? "custom" : "sp";
    if (!SP_STYLES.includes(style)) style = "silver";
    const apply = () => {
      setFamily(family);
      setSP(style);
    };
    const transitions = window.ML3DConsoleTransitions;
    if (transitions) await transitions.switchAppearanceAnimated(family, style, apply);
    else apply();
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
    window.dispatchEvent(new CustomEvent("ml3d-sp-style-changed", { detail: { style } }));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
