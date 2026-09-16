(() => {
  "use strict";

  if (window.__ml3dAvatarMovementFixV2) return;
  window.__ml3dAvatarMovementFixV2 = true;

  const PROFILE_KEY = "ml3d-link-avatar-final-v1";
  const SHEETS = {
    male: "./assets/avatar-base/male-base.png?v=4",
    female: "./assets/avatar-base/female-base.png?v=4"
  };
  const DIR_INDEX = { down: 0, up: 1, left: 2, right: 3 };
  const GRID = 4;
  const LOGICAL_W = 64;
  const LOGICAL_H = 96;
  const BG_THRESHOLD = 58;
  const ALPHA_THRESHOLD = 20;
  const FRAME_MS = 105;
  const MOVE_HOLD_MS = 220;
  const MOVE_EPSILON = 0.001;
  const FRAME_SEQUENCE = [0, 1, 2, 3];

  const sheets = new Map();
  const state = new Map();

  const style = document.createElement("style");
  style.textContent = `
    .avatar-base-host > .avatar-base-canvas {
      opacity: 0 !important;
      visibility: hidden !important;
    }
    .avatar-clean-canvas {
      position: absolute;
      left: 50%;
      bottom: 0;
      width: 56px;
      height: 84px;
      transform: translateX(-50%);
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      pointer-events: none;
    }
    .player.local .avatar-clean-canvas {
      filter: drop-shadow(0 0 4px rgba(88,190,255,.88));
    }
    @media(max-width:560px){
      .avatar-clean-canvas { width:48px; height:72px; }
    }
  `;
  document.head.appendChild(style);

  function localBase() {
    try {
      const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
      return profile.base === "female" ? "female" : "male";
    } catch {
      return "male";
    }
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

  function colorDistance(r, g, b, ref) {
    const dr = r - ref.r;
    const dg = g - ref.g;
    const db = b - ref.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function borderReference(data, w, h) {
    const points = [
      [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
      [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1],
      [0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)]
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

  function clearConnectedBackground(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    const image = ctx.getImageData(0, 0, w, h);
    const data = image.data;
    const ref = borderReference(data, w, h);
    if (ref.a < 24) return;

    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;

    const isBackground = (index) => {
      const p = index * 4;
      if (data[p + 3] < 24) return true;
      return colorDistance(data[p], data[p + 1], data[p + 2], ref) <= BG_THRESHOLD;
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
    const { data } = image;
    const w = canvas.width;
    const h = canvas.height;
    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    const components = [];

    const isForeground = (index) =>
      data[index * 4 + 3] >= ALPHA_THRESHOLD;

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
        pixels.push(index);
        area += 1;
        const x = index % w;
        const y = (index / w) | 0;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        sumX += x;
        sumY += y;

        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (ox === 0 && oy === 0) continue;
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const ni = ny * w + nx;
            if (visited[ni] || !isForeground(ni)) continue;
            visited[ni] = 1;
            queue[tail++] = ni;
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

  function keepMainSubject(canvas) {
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
      const centerWeight = Math.max(0.08, 1 - (dx * 0.85 + dy * 0.35));
      const height = component.maxY - component.minY + 1;
      const verticalWeight = 0.7 + 0.3 * Math.min(1, height / Math.max(1, h * 0.5));
      return component.area * centerWeight * verticalWeight;
    };

    const main = [...components].sort((a, b) => score(b) - score(a))[0];
    if (!main) return;

    const mainW = main.maxX - main.minX + 1;
    const mainH = main.maxY - main.minY + 1;
    const padX = Math.max(8, Math.round(mainW * 0.24));
    const padY = Math.max(8, Math.round(mainH * 0.18));
    const areaFloor = Math.max(6, main.area * 0.006);

    const keep = new Uint8Array(w * h);

    for (const component of components) {
      const nearMain =
        component.area >= areaFloor &&
        component.maxX >= main.minX - padX &&
        component.minX <= main.maxX + padX &&
        component.maxY >= main.minY - padY &&
        component.minY <= main.maxY + padY;

      if (component === main || nearMain) {
        for (const index of component.pixels) keep[index] = 1;
      }
    }

    const data = image.data;
    for (let index = 0; index < w * h; index += 1) {
      if (!keep[index]) data[index * 4 + 3] = 0;
    }

    ctx.putImageData(image, 0, 0);
  }

  function alphaBoundsAndAnchor(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (data[(y * canvas.width + x) * 4 + 3] < ALPHA_THRESHOLD) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) {
      return {
        x: 0,
        y: 0,
        w: canvas.width,
        h: canvas.height,
        anchorX: canvas.width / 2
      };
    }

    const h = maxY - minY + 1;
    const feetStart = Math.max(minY, maxY - Math.max(4, Math.round(h * 0.22)));
    let feetSumX = 0;
    let feetCount = 0;

    for (let y = feetStart; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (data[(y * canvas.width + x) * 4 + 3] < ALPHA_THRESHOLD) continue;
        feetSumX += x;
        feetCount += 1;
      }
    }

    return {
      x: minX,
      y: minY,
      w: maxX - minX + 1,
      h,
      anchorX: feetCount ? feetSumX / feetCount : (minX + maxX) / 2
    };
  }

  function maskDistance(a, b) {
    const ctxA = a.getContext("2d", { willReadFrequently: true });
    const ctxB = b.getContext("2d", { willReadFrequently: true });
    const dataA = ctxA.getImageData(0, 0, a.width, a.height).data;
    const dataB = ctxB.getImageData(0, 0, b.width, b.height).data;
    let different = 0;
    let union = 0;

    for (let i = 3; i < dataA.length; i += 4) {
      const aa = dataA[i] >= ALPHA_THRESHOLD;
      const bb = dataB[i] >= ALPHA_THRESHOLD;
      if (aa || bb) union += 1;
      if (aa !== bb) different += 1;
    }

    return union ? different / union : 1;
  }

  function groupingScore(frames, orientation) {
    let total = 0;
    let pairs = 0;

    for (let direction = 0; direction < GRID; direction += 1) {
      const group = [];
      for (let frame = 0; frame < GRID; frame += 1) {
        group.push(
          orientation === "rows"
            ? frames[direction][frame]
            : frames[frame][direction]
        );
      }

      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          total += maskDistance(group[i], group[j]);
          pairs += 1;
        }
      }
    }

    return pairs ? total / pairs : Infinity;
  }

  async function compileSheet(base) {
    if (sheets.has(base)) return sheets.get(base);

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
          keepMainSubject(cell);
          const bounds = alphaBoundsAndAnchor(cell);
          maxW = Math.max(maxW, bounds.w);
          maxH = Math.max(maxH, bounds.h);
          raw[row][col] = { cell, bounds };
        }
      }

      const scale = Math.min(
        (LOGICAL_W - 10) / maxW,
        (LOGICAL_H - 8) / maxH
      );

      const frames = Array.from({ length: GRID }, () => Array(GRID));

      for (let row = 0; row < GRID; row += 1) {
        for (let col = 0; col < GRID; col += 1) {
          const { cell, bounds } = raw[row][col];
          const out = document.createElement("canvas");
          out.width = LOGICAL_W;
          out.height = LOGICAL_H;
          const ctx = out.getContext("2d");
          ctx.imageSmoothingEnabled = false;

          const dw = Math.max(1, Math.round(bounds.w * scale));
          const dh = Math.max(1, Math.round(bounds.h * scale));
          const anchorOffset = (bounds.anchorX - bounds.x) * scale;
          const dx = Math.round(LOGICAL_W / 2 - anchorOffset);
          const dy = LOGICAL_H - dh - 2;

          ctx.drawImage(
            cell,
            bounds.x,
            bounds.y,
            bounds.w,
            bounds.h,
            dx,
            dy,
            dw,
            dh
          );

          frames[row][col] = out;
        }
      }

      const rowsScore = groupingScore(frames, "rows");
      const colsScore = groupingScore(frames, "cols");
      const orientation = colsScore + 0.015 < rowsScore ? "cols" : "rows";

      console.info(
        `ML3D avatar ${base}: layout ${orientation} ` +
        `(rows=${rowsScore.toFixed(3)}, cols=${colsScore.toFixed(3)})`
      );

      return { frames, orientation };
    })();

    sheets.set(base, promise);
    return promise;
  }

  function resolveBase(player) {
    if (player.classList.contains("local")) return localBase();

    const legacyCanvas = player.querySelector(".avatar-base-canvas");
    const paintKey = legacyCanvas?.dataset.paintKey || "";

    if (paintKey.startsWith("female:")) return "female";
    if (paintKey.startsWith("male:")) return "male";

    return "male";
  }

  function ensureCleanCanvas(player) {
    const host = player.querySelector(":scope > .avatar-base-host");
    if (!host) return null;

    let canvas = host.querySelector(":scope > .avatar-clean-canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = LOGICAL_W;
      canvas.height = LOGICAL_H;
      canvas.className = "avatar-clean-canvas";
      canvas.setAttribute("aria-hidden", "true");
      host.append(canvas);
    }

    return canvas;
  }

  function positionOf(player) {
    return {
      x: Number.parseFloat(player.style.left) || 0,
      y: Number.parseFloat(player.style.top) || 0
    };
  }

  function directionFrom(previous, next) {
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;

    if (
      Math.abs(dx) <= MOVE_EPSILON &&
      Math.abs(dy) <= MOVE_EPSILON
    ) {
      return previous.dir || "down";
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      return dx < 0 ? "left" : "right";
    }

    return dy < 0 ? "up" : "down";
  }

  function draw(canvas, compiled, direction, frame) {
    const dirIndex = DIR_INDEX[direction] ?? 0;
    const source =
      compiled.orientation === "rows"
        ? compiled.frames[dirIndex][frame]
        : compiled.frames[frame][dirIndex];

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }

  async function boot() {
    const [maleResult, femaleResult] = await Promise.allSettled([
      compileSheet("male"),
      compileSheet("female")
    ]);

    const compiledByBase = {
      male: maleResult.status === "fulfilled" ? maleResult.value : null,
      female: femaleResult.status === "fulfilled" ? femaleResult.value : null
    };

    const tick = (now) => {
      const alive = new Set();

      document.querySelectorAll("#playersLayer .player").forEach((player) => {
        const canvas = ensureCleanCanvas(player);
        if (!canvas) return;

        const id =
          player.dataset.playerId ||
          player.querySelector(".player-name-text")?.textContent ||
          "local";

        alive.add(id);

        const pos = positionOf(player);
        const previous = state.get(id) || {
          x: pos.x,
          y: pos.y,
          dir: "down",
          moving: false,
          lastMove: -Infinity,
          walkStart: now
        };

        const moved =
          Math.abs(pos.x - previous.x) > MOVE_EPSILON ||
          Math.abs(pos.y - previous.y) > MOVE_EPSILON;

        const dir = moved
          ? directionFrom(previous, pos)
          : previous.dir;

        const lastMove = moved ? now : previous.lastMove;
        const moving =
          moved ||
          player.classList.contains("is-moving") ||
          now - lastMove <= MOVE_HOLD_MS;

        const walkStart =
          moving && previous.moving
            ? previous.walkStart
            : now;

        const sequenceIndex = moving
          ? Math.floor((now - walkStart) / FRAME_MS) % FRAME_SEQUENCE.length
          : 0;

        const frame = moving
          ? FRAME_SEQUENCE[sequenceIndex]
          : 0;

        const base = resolveBase(player);
        const compiled = compiledByBase[base] || compiledByBase.male;
        if (!compiled) return;

        const paintKey =
          `${base}:${compiled.orientation}:${dir}:${frame}:${moving ? 1 : 0}`;

        if (canvas.dataset.paintKey !== paintKey) {
          canvas.dataset.paintKey = paintKey;
          draw(canvas, compiled, dir, frame);
        }

        player.dataset.ml3dDirection = dir;
        player.classList.toggle("ml3d-walking", moving);

        state.set(id, {
          x: pos.x,
          y: pos.y,
          dir,
          moving,
          lastMove,
          walkStart
        });
      });

      for (const id of state.keys()) {
        if (!alive.has(id)) state.delete(id);
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
