(() => {
  "use strict";

  if (window.__ml3dAvatarIdleComplete) return;
  window.__ml3dAvatarIdleComplete = true;

  const PROFILE_KEY = "ml3d-link-avatar-final-v1";
  const SHEETS = {
    male: "./assets/avatar-base/male-base.png?v=4",
    female: "./assets/avatar-base/female-base.png?v=4"
  };
  const DIR_INDEX = { down: 0, up: 1, left: 2, right: 3 };
  const GRID = 4;
  const W = 64;
  const H = 96;
  const BG_THRESHOLD = 58;
  const ALPHA = 20;
  const compiled = new Map();
  let ready = null;

  function localBase() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}").base === "female"
        ? "female"
        : "male";
    } catch {
      return "male";
    }
  }

  function selectedBase() {
    const selected = document.querySelector("#avatarFinalBase button.selected");
    if (!selected) return localBase();
    return /MUJER/i.test(selected.textContent || "") ? "female" : "male";
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      image.src = src;
    });
  }

  function borderRef(data, w, h) {
    const points = [
      [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
      [w >> 1, 0], [w >> 1, h - 1], [0, h >> 1], [w - 1, h >> 1]
    ];
    let r = 0, g = 0, b = 0, a = 0;
    for (const [x, y] of points) {
      const i = (y * w + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      a += data[i + 3];
    }
    return {
      r: r / points.length,
      g: g / points.length,
      b: b / points.length,
      a: a / points.length
    };
  }

  function colorDistance(r, g, b, ref) {
    const dr = r - ref.r;
    const dg = g - ref.g;
    const db = b - ref.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function clearConnectedBackground(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    const image = ctx.getImageData(0, 0, w, h);
    const data = image.data;
    const ref = borderRef(data, w, h);
    if (ref.a < 24) return;

    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;

    const isBackground = (index) => {
      const p = index * 4;
      return data[p + 3] < 24 ||
        colorDistance(data[p], data[p + 1], data[p + 2], ref) <= BG_THRESHOLD;
    };
    const push = (index) => {
      if (
        index < 0 ||
        index >= visited.length ||
        visited[index] ||
        !isBackground(index)
      ) return;
      visited[index] = 1;
      queue[tail++] = index;
    };

    for (let x = 0; x < w; x += 1) {
      push(x);
      push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y += 1) {
      push(y * w);
      push(y * w + w - 1);
    }

    while (head < tail) {
      const index = queue[head++];
      const x = index % w;
      const y = (index / w) | 0;
      data[index * 4 + 3] = 0;
      if (x > 0) push(index - 1);
      if (x + 1 < w) push(index + 1);
      if (y > 0) push(index - w);
      if (y + 1 < h) push(index + w);
    }

    ctx.putImageData(image, 0, 0);
  }

  function connectedComponents(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const w = canvas.width;
    const h = canvas.height;
    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    const components = [];
    const isForeground = (index) => data[index * 4 + 3] >= ALPHA;

    for (let start = 0; start < w * h; start += 1) {
      if (visited[start] || !isForeground(start)) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      const pixels = [];
      let area = 0;
      let minX = w;
      let minY = h;
      let maxX = -1;
      let maxY = -1;
      let sumX = 0;
      let sumY = 0;

      while (head < tail) {
        const index = queue[head++];
        const x = index % w;
        const y = (index / w) | 0;
        pixels.push(index);
        area += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        sumX += x;
        sumY += y;

        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (!ox && !oy) continue;
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const next = ny * w + nx;
            if (visited[next] || !isForeground(next)) continue;
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }

      components.push({
        pixels,
        area,
        minX,
        minY,
        maxX,
        maxY,
        cx: sumX / area,
        cy: sumY / area
      });
    }

    return { image, components };
  }

  function keepCompleteSubject(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    const { image, components } = connectedComponents(canvas);
    if (!components.length) return;

    const centerX = w / 2;
    const centerY = h * 0.58;
    const score = (component) => {
      const dx = Math.abs(component.cx - centerX) / Math.max(1, w / 2);
      const dy = Math.abs(component.cy - centerY) / Math.max(1, h / 2);
      return component.area * Math.max(0.12, 1 - dx * 0.75 - dy * 0.2);
    };
    const main = [...components].sort((a, b) => score(b) - score(a))[0];
    const mainW = main.maxX - main.minX + 1;
    const mainH = main.maxY - main.minY + 1;
    const padX = Math.max(16, Math.round(mainW * 0.72));
    const padY = Math.max(12, Math.round(mainH * 0.34));
    const minArea = Math.max(2, main.area * 0.001);
    const keep = new Uint8Array(w * h);

    for (const component of components) {
      const closeEnough =
        component.area >= minArea &&
        component.maxX >= main.minX - padX &&
        component.minX <= main.maxX + padX &&
        component.maxY >= main.minY - padY &&
        component.minY <= main.maxY + padY;
      if (component === main || closeEnough) {
        for (const index of component.pixels) keep[index] = 1;
      }
    }

    const data = image.data;
    for (let index = 0; index < w * h; index += 1) {
      if (!keep[index]) data[index * 4 + 3] = 0;
    }
    ctx.putImageData(image, 0, 0);
  }

  function bounds(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (data[(y * canvas.width + x) * 4 + 3] < ALPHA) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX) {
      return { x: 0, y: 0, w: canvas.width, h: canvas.height };
    }
    return {
      x: minX,
      y: minY,
      w: maxX - minX + 1,
      h: maxY - minY + 1
    };
  }

  async function compile(base) {
    if (compiled.has(base)) return compiled.get(base);
    const promise = (async () => {
      const image = await loadImage(SHEETS[base]);
      const raw = Array.from({ length: GRID }, () => Array(GRID));
      let maxW = 1;
      let maxH = 1;

      for (let row = 0; row < GRID; row += 1) {
        const sy = Math.round(image.naturalHeight * row / GRID);
        const ey = Math.round(image.naturalHeight * (row + 1) / GRID);
        for (let col = 0; col < GRID; col += 1) {
          const sx = Math.round(image.naturalWidth * col / GRID);
          const ex = Math.round(image.naturalWidth * (col + 1) / GRID);
          const cell = document.createElement("canvas");
          cell.width = Math.max(1, ex - sx);
          cell.height = Math.max(1, ey - sy);
          const ctx = cell.getContext("2d", { willReadFrequently: true });
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(
            image,
            sx,
            sy,
            cell.width,
            cell.height,
            0,
            0,
            cell.width,
            cell.height
          );
          clearConnectedBackground(cell);
          keepCompleteSubject(cell);
          const frameBounds = bounds(cell);
          maxW = Math.max(maxW, frameBounds.w);
          maxH = Math.max(maxH, frameBounds.h);
          raw[row][col] = { cell, frameBounds };
        }
      }

      const scale = Math.min((W - 12) / maxW, (H - 8) / maxH);
      const frames = Array.from({ length: GRID }, () => Array(GRID));

      for (let row = 0; row < GRID; row += 1) {
        for (let col = 0; col < GRID; col += 1) {
          const { cell, frameBounds } = raw[row][col];
          const out = document.createElement("canvas");
          out.width = W;
          out.height = H;
          const ctx = out.getContext("2d");
          ctx.imageSmoothingEnabled = false;
          const dw = Math.max(1, Math.round(frameBounds.w * scale));
          const dh = Math.max(1, Math.round(frameBounds.h * scale));
          const dx = Math.round((W - dw) / 2);
          const dy = H - dh - 2;
          ctx.drawImage(
            cell,
            frameBounds.x,
            frameBounds.y,
            frameBounds.w,
            frameBounds.h,
            dx,
            dy,
            dw,
            dh
          );
          frames[row][col] = out;
        }
      }

      return { frames };
    })();
    compiled.set(base, promise);
    return promise;
  }

  function sourceFrame(sheet, orientation, direction, frame = 0) {
    const dir = DIR_INDEX[direction] ?? 0;
    return orientation === "cols"
      ? sheet.frames[frame][dir]
      : sheet.frames[dir][frame];
  }

  function parsePaintKey(canvas) {
    const parts = String(canvas?.dataset.paintKey || "").split(":");
    return {
      base: parts[0] === "female" ? "female" : "male",
      orientation: parts[1] === "cols" ? "cols" : "rows",
      direction: ["down", "up", "left", "right"].includes(parts[2]) ? parts[2] : "down"
    };
  }

  function paintFull(canvas, source) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }

  function paintContained(canvas, source, padding) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(
      (canvas.width - padding * 2) / W,
      (canvas.height - padding * 2) / H
    );
    const dw = Math.round(W * scale);
    const dh = Math.round(H * scale);
    const dx = Math.round((canvas.width - dw) / 2);
    const dy = Math.round((canvas.height - dh) / 2);
    ctx.drawImage(source, dx, dy, dw, dh);
  }

  function orientationForBase(base) {
    const canvases = document.querySelectorAll("#playersLayer .avatar-v5-canvas");
    for (const canvas of canvases) {
      const info = parsePaintKey(canvas);
      if (info.base === base) return info.orientation;
    }
    return "rows";
  }

  function repaintPlayers(compiledByBase) {
    document.querySelectorAll("#playersLayer .player").forEach((player) => {
      if (player.classList.contains("ml3d-walking")) return;
      const direction = player.dataset.ml3dDirection || "down";
      if (direction !== "down" && direction !== "up") return;
      const canvas = player.querySelector(":scope > .avatar-base-host > .avatar-v5-canvas");
      if (!canvas) return;
      const info = parsePaintKey(canvas);
      const sheet = compiledByBase[info.base] || compiledByBase.male;
      if (!sheet) return;
      const source = sourceFrame(sheet, info.orientation, direction, 0);
      paintFull(canvas, source);
    });
  }

  function repaintEditor(compiledByBase) {
    const modal = document.getElementById("avatarModal");
    if (!modal || modal.hidden) return;
    const base = selectedBase();
    const orientation = orientationForBase(base);
    const sheet = compiledByBase[base] || compiledByBase.male;
    if (!sheet) return;
    const source = sourceFrame(sheet, orientation, "down", 0);

    const preview = document.querySelector("#avatarFinalPreview > canvas.avatar-v5-preview");
    if (preview) paintContained(preview, source, 14);

    document.querySelectorAll("#avatarFinalBase button").forEach((button) => {
      const buttonBase = /MUJER/i.test(button.textContent || "") ? "female" : "male";
      const buttonSheet = compiledByBase[buttonBase] || compiledByBase.male;
      const buttonCanvas = button.querySelector(":scope > canvas.avatar-v5-choice");
      if (!buttonSheet || !buttonCanvas) return;
      const buttonOrientation = orientationForBase(buttonBase);
      const buttonSource = sourceFrame(buttonSheet, buttonOrientation, "down", 0);
      paintContained(buttonCanvas, buttonSource, 5);
    });
  }

  async function boot() {
    const [maleResult, femaleResult] = await Promise.allSettled([
      compile("male"),
      compile("female")
    ]);
    const compiledByBase = {
      male: maleResult.status === "fulfilled" ? maleResult.value : null,
      female: femaleResult.status === "fulfilled" ? femaleResult.value : null
    };

    const tick = () => {
      repaintPlayers(compiledByBase);
      repaintEditor(compiledByBase);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  ready = document.readyState === "loading"
    ? new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
    : Promise.resolve();
  ready.then(boot);
})();
