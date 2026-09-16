(() => {
  "use strict";

  if (window.__ml3dAvatarMovementFixV1) return;
  window.__ml3dAvatarMovementFixV1 = true;

  const PROFILE_KEY = "ml3d-link-avatar-final-v1";
  const SHEETS = {
    male: "./assets/avatar-base/male-base.png?v=3",
    female: "./assets/avatar-base/female-base.png?v=3"
  };
  const DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };
  const GRID = 4;
  const LOGICAL_W = 64;
  const LOGICAL_H = 96;
  const BG_THRESHOLD = 58;
  const FRAME_MS = 92;
  const MOVE_HOLD_MS = 260;
  const MOVE_EPSILON = 0.001;
  const FRAME_SEQUENCE = [0, 1, 2, 3, 2, 1];

  const compiled = new Map();
  const state = new Map();

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
    return { r: r / points.length, g: g / points.length, b: b / points.length, a: a / points.length };
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
      if (index < 0 || index >= visited.length || visited[index] || !isBackground(index)) return;
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

  function alphaBounds(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (data[(y * canvas.width + x) * 4 + 3] < 20) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) {
      return { x: 0, y: 0, w: canvas.width, h: canvas.height };
    }

    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
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
          ctx.drawImage(image, sx, sy, cell.width, cell.height, 0, 0, cell.width, cell.height);
          clearConnectedBackground(cell);
          const bounds = alphaBounds(cell);
          maxW = Math.max(maxW, bounds.w);
          maxH = Math.max(maxH, bounds.h);
          raw[row][col] = { cell, bounds };
        }
      }

      const scale = Math.min((LOGICAL_W - 8) / maxW, (LOGICAL_H - 6) / maxH);
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
          const dx = Math.round((LOGICAL_W - dw) / 2);
          const dy = LOGICAL_H - dh - 2;
          ctx.drawImage(cell, bounds.x, bounds.y, bounds.w, bounds.h, dx, dy, dw, dh);
          frames[row][col] = out;
        }
      }

      return frames;
    })();

    compiled.set(base, promise);
    return promise;
  }

  function positionOf(player) {
    const computed = getComputedStyle(player);
    const left = Number.parseFloat(player.style.left || computed.left) || 0;
    const top = Number.parseFloat(player.style.top || computed.top) || 0;
    return { x: left, y: top };
  }

  function directionFrom(previous, next) {
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if (Math.abs(dx) <= MOVE_EPSILON && Math.abs(dy) <= MOVE_EPSILON) return previous.dir || "down";
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
    return dy < 0 ? "up" : "down";
  }

  function resolveBase(player) {
    if (player.classList.contains("local")) return localBase();
    const canvas = player.querySelector(".avatar-base-canvas");
    const key = canvas?.dataset.paintKey || "";
    if (key.startsWith("female:")) return "female";
    if (key.startsWith("male:")) return "male";
    return "male";
  }

  async function draw(player, direction, frame) {
    const canvas = player.querySelector(".avatar-base-canvas");
    if (!canvas?.isConnected) return;
    const base = resolveBase(player);
    const frames = await compile(base);
    if (!canvas.isConnected) return;

    const row = DIR_ROW[direction] ?? 0;
    const source = frames[row][frame] || frames[row][0];
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    canvas.dataset.ml3dMovementPaint = `${base}:${direction}:${frame}`;
    player.dataset.ml3dDirection = direction;
    player.classList.toggle("ml3d-walking", frame !== 0 || player.classList.contains("is-moving"));
  }

  function tick(now) {
    const alive = new Set();

    document.querySelectorAll("#playersLayer .player").forEach((player) => {
      const id = player.dataset.playerId || player.querySelector(".player-name-text")?.textContent || "local";
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
      const dir = moved ? directionFrom(previous, pos) : previous.dir;
      const lastMove = moved ? now : previous.lastMove;
      const moving = moved || player.classList.contains("is-moving") || now - lastMove <= MOVE_HOLD_MS;
      const walkStart = moving
        ? (previous.moving ? previous.walkStart : now)
        : now;

      const sequenceIndex = moving
        ? Math.floor((now - walkStart) / FRAME_MS) % FRAME_SEQUENCE.length
        : 0;
      const frame = moving ? FRAME_SEQUENCE[sequenceIndex] : 0;
      const paintKey = `${dir}:${frame}:${moving ? 1 : 0}`;

      if (player.dataset.ml3dMovementKey !== paintKey) {
        player.dataset.ml3dMovementKey = paintKey;
        draw(player, dir, frame).catch((error) => console.error("ML3D movement:", error));
      }

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
  }

  Promise.allSettled([compile("male"), compile("female")]).finally(() => {
    requestAnimationFrame(tick);
  });
})();
