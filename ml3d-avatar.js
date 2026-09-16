(() => {
  "use strict";

  const ROOT = "assets/ml3d-link/";
  const PROFILE_KEY = "ml3d-link-avatar-profile-v2";
  const DEFAULT_PROFILE = {
    name: "Jugador",
    base: "male",
    skin: 1,
    hair: 1,
    top: 1,
    bottom: 1,
    shoes: 1,
    accessory: "none",
    hairColor: "brown",
    primaryColor: "blue",
    secondaryColor: "dark"
  };

  const SKINS = ["#f6d2b8", "#edbd96", "#d99c72", "#b97550", "#895038", "#5f3529"];
  const COLORS = {
    brown: "#75482f", black: "#242a33", blonde: "#d9b15f", red: "#9b473e",
    blue: "#3979bd", cyan: "#45a8c7", green: "#4f885b", purple: "#7a579c",
    pink: "#ce6d91", orange: "#c77b36", yellow: "#d8b441", white: "#e8ebef",
    dark: "#343946", gray: "#69727f"
  };
  const ACCESSORIES = ["none", "cap", "glasses", "headphones", "backpack", "scarf", "bow"];
  const DIRECTIONS = ["down", "left", "right", "up"];

  const atlas = new Image();
  let manifest = null;
  let readyPromise = null;
  const cache = new Map();

  function clampInt(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  }

  function cleanName(value) {
    return String(value || "Jugador").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32) || "Jugador";
  }

  function normalizeProfile(value = {}) {
    const p = { ...DEFAULT_PROFILE, ...(value || {}) };
    return {
      name: cleanName(p.name),
      base: p.base === "female" ? "female" : "male",
      skin: clampInt(p.skin, 1, 6, 1),
      hair: clampInt(p.hair, 1, 4, 1),
      top: clampInt(p.top, 1, 4, 1),
      bottom: clampInt(p.bottom, 1, 4, 1),
      shoes: clampInt(p.shoes, 1, 4, 1),
      accessory: ACCESSORIES.includes(p.accessory) ? p.accessory : "none",
      hairColor: Object.hasOwn(COLORS, p.hairColor) ? p.hairColor : "brown",
      primaryColor: Object.hasOwn(COLORS, p.primaryColor) ? p.primaryColor : "blue",
      secondaryColor: Object.hasOwn(COLORS, p.secondaryColor) ? p.secondaryColor : "dark"
    };
  }

  function loadProfile() {
    try {
      const current = localStorage.getItem(PROFILE_KEY);
      if (current) return normalizeProfile(JSON.parse(current));
      const legacy = JSON.parse(localStorage.getItem("ml3d-link-profile-v1") || "{}");
      return normalizeProfile({ ...DEFAULT_PROFILE, name: legacy.name || DEFAULT_PROFILE.name });
    } catch {
      return { ...DEFAULT_PROFILE };
    }
  }

  function saveProfile(profile) {
    const p = normalizeProfile(profile);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    return p;
  }

  function hexToRgb(hex) {
    const s = String(hex).replace("#", "");
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }

  function shade(rgb, factor) {
    return rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * factor))));
  }

  function palette(profile) {
    const skin = hexToRgb(SKINS[profile.skin - 1]);
    const hair = hexToRgb(COLORS[profile.hairColor]);
    const primary = hexToRgb(COLORS[profile.primaryColor]);
    const secondary = hexToRgb(COLORS[profile.secondaryColor]);
    return {
      "240,180,140": skin,
      "197,128,93": shade(skin, 0.73),
      "120,72,45": hair,
      "72,43,29": shade(hair, 0.64),
      "202,74,82": primary,
      "120,41,47": shade(primary, 0.61),
      "74,126,201": secondary,
      "38,70,124": shade(secondary, 0.60)
    };
  }

  function ready() {
    if (readyPromise) return readyPromise;
    readyPromise = Promise.all([
      fetch(`${ROOT}avatar-atlas.json`, { cache: "force-cache" }).then((r) => {
        if (!r.ok) throw new Error(`avatar manifest HTTP ${r.status}`);
        return r.json();
      }),
      fetch(`${ROOT}avatar-atlas.b64.txt`, { cache: "force-cache" }).then(async (r) => {
        if (!r.ok) throw new Error(`avatar atlas HTTP ${r.status}`);
        const b64 = (await r.text()).trim();
        return new Promise((resolve, reject) => {
          atlas.onload = resolve;
          atlas.onerror = () => reject(new Error("No se pudo cargar el atlas de avatares."));
          atlas.src = `data:image/png;base64,${b64}`;
        });
      })
    ]).then(([m]) => { manifest = m; return true; });
    return readyPromise;
  }

  function entryPath(kind, profile) {
    if (kind === "base") return `base/${profile.base}.png`;
    if (kind === "hair") return `hair/${profile.base}-${profile.hair}.png`;
    if (kind === "top") return `tops/${profile.base}-${profile.top}.png`;
    if (kind === "bottom") return `bottoms/${profile.base}-${profile.bottom}.png`;
    if (kind === "shoes") return `shoes/${profile.shoes}.png`;
    if (kind === "accessory" && profile.accessory !== "none") return `accessories/${profile.accessory}.png`;
    return null;
  }

  function recolor(canvas, profile) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const map = palette(profile);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const replacement = map[`${d[i]},${d[i + 1]},${d[i + 2]}`];
      if (replacement) {
        d[i] = replacement[0]; d[i + 1] = replacement[1]; d[i + 2] = replacement[2];
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function cacheKey(profile, direction, frame) {
    return JSON.stringify([profile.base, profile.skin, profile.hair, profile.top, profile.bottom, profile.shoes,
      profile.accessory, profile.hairColor, profile.primaryColor, profile.secondaryColor, direction, frame]);
  }

  async function frameCanvas(profileValue, direction = "down", frame = 0) {
    await ready();
    const profile = normalizeProfile(profileValue);
    direction = DIRECTIONS.includes(direction) ? direction : "down";
    frame = clampInt(frame, 0, 3, 0);
    const key = cacheKey(profile, direction, frame);
    if (cache.has(key)) return cache.get(key);

    const canvas = document.createElement("canvas");
    canvas.width = manifest.cellWidth;
    canvas.height = manifest.cellHeight;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const row = DIRECTIONS.indexOf(direction);
    const sx = frame * manifest.cellWidth;

    for (const kind of ["base", "bottom", "shoes", "top", "hair", "accessory"]) {
      const path = entryPath(kind, profile);
      if (!path) continue;
      const e = manifest.entries[path];
      if (!e) continue;
      const sy = e.y + row * manifest.cellHeight;
      ctx.drawImage(atlas, sx, sy, manifest.cellWidth, manifest.cellHeight, 0, 0, manifest.cellWidth, manifest.cellHeight);
    }
    recolor(canvas, profile);
    cache.set(key, canvas);
    if (cache.size > 240) cache.clear();
    return canvas;
  }

  async function render(target, profileValue, direction = "down", frame = 0) {
    if (!(target instanceof HTMLCanvasElement)) return;
    const source = await frameCanvas(profileValue, direction, frame);
    if (target.width !== source.width) target.width = source.width;
    if (target.height !== source.height) target.height = source.height;
    const ctx = target.getContext("2d");
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0);
  }

  window.ML3DAvatar = {
    ready,
    render,
    normalizeProfile,
    loadProfile,
    saveProfile,
    colors: COLORS,
    skins: SKINS,
    accessories: ACCESSORIES,
    defaults: { ...DEFAULT_PROFILE }
  };
})();
