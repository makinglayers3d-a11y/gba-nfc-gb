(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const roomId = String(params.get("linkRoom") || "");
  const mySeat = Math.max(0, Math.min(1, Number(params.get("linkPlayer")) | 0));
  const role = params.get("linkRole") === "host" ? "host" : "guest";
  const enabled = Boolean(roomId);
  const BUS_NAME = "ml3d-gba-link-v1";
  const FRAME_CYCLES = 280896;
  const INPUT_DELAY = 4;
  const RING = 256;
  const UNKNOWN = -1;

  let localMask = 0;
  let controller = null;
  let pendingStart = null;

  function handleLocalKey(key, down) {
    key = Number(key) | 0;
    if (key < 0 || key > 9) return false;
    const bit = 1 << key;
    if (down) localMask |= bit;
    else localMask &= ~bit;
    localMask &= 0x3ff;
    return Boolean(controller?.started);
  }

  window.ML3DLocalLinkSession = {
    handleLocalKey,
    get active() {
      return Boolean(controller?.started);
    },
    get status() {
      return controller?.status?.() || { enabled, roomId, mySeat, role };
    }
  };

  if (!enabled || typeof BroadcastChannel !== "function") return;

  const bus = new BroadcastChannel(BUS_NAME);

  function sendLocal(packet) {
    bus.postMessage({
      ...packet,
      source: "emulator",
      roomId,
      time: Date.now()
    });
  }

  async function fingerprint(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
    );
    return [...new Uint8Array(digest).slice(0, 8)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function makeHiddenCore(rom) {
    const core = new GameBoyAdvanceEmulator();
    core.attachPlayStatusHandler(() => {});
    core.settings.offthreadGfxEnabled = false;
    core.settings.SKIPBoot = true;
    core.attachROM(rom.slice());
    core.play();
    try {
      core.audioPushNewState?.();
    } catch {}
    return core;
  }

  class LocalDualLink {
    constructor(visible, hidden, hash) {
      this.visible = visible;
      this.hidden = hidden;
      this.romHash = hash;
      this.cores = mySeat === 0 ? [visible, hidden] : [hidden, visible];
      this.serials = this.cores.map((core) => core.IOCore.serial);
      // The cycle counter is coordinator-only metadata. Normalize both cores
      // at the moment the deterministic session is created so pre-session UI
      // activity can never become a permanent scheduling skew.
      for (const core of this.cores) {
        if (core?.IOCore) {
          core.IOCore.linkCycleCounter = 0;
          core.IOCore.cyclesOveriteratedPreviously = 0;
          core.IOCore.linkIterationCut = false;
        }
      }
      this.frame = 0;
      this.sessionId = "";
      this.started = false;
      this.remoteReady = false;
      this.remoteHash = "";
      this.pendingTransfer = null;
      this.transferCount = 0;
      this.wedged = false;
      this.inputTimer = null;
      this.readyTimer = null;
      this.tickTimer = null;
      this.lastApplied = [0, 0];
      this.inputs = new Int16Array(RING * 2).fill(UNKNOWN);
      this.sentFrames = new Set();
      this.lastTickAt = performance.now();
      this.stallCount = 0;
      this.debug = null;

      for (let frame = 0; frame < INPUT_DELAY; frame++) {
        this.setInput(frame, 0, 0);
        this.setInput(frame, 1, 0);
      }

      this.installLocalCable();
      this.buildDebug();
      this.publishReady();
      this.readyTimer = setInterval(() => {
        if (!this.started) this.publishReady();
      }, 500);
    }

    slot(frame, seat) {
      return (frame % RING) * 2 + seat;
    }

    setInput(frame, seat, mask) {
      if (!Number.isSafeInteger(frame) || frame < 0) return false;
      if (frame < this.frame || frame >= this.frame + RING) return false;
      this.inputs[this.slot(frame, seat)] = Number(mask) & 0x3ff;
      return true;
    }

    getInput(frame, seat) {
      return this.inputs[this.slot(frame, seat)];
    }

    publishReady() {
      sendLocal({
        type: "gba:lockstep:ready",
        playerNumber: mySeat,
        role,
        romHash: this.romHash,
        protocol: "dual-core-v1"
      });
    }

    maybeHostStart() {
      if (role !== "host" || this.started || !this.remoteReady) return;
      if (!this.remoteHash || this.remoteHash !== this.romHash) {
        this.setDebugError("ROM DISTINTA");
        return;
      }
      const sessionId =
        (crypto.randomUUID?.() || (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)));
      sendLocal({
        type: "gba:lockstep:start",
        sessionId,
        delay: INPUT_DELAY,
        romHash: this.romHash
      });
      this.start(sessionId, INPUT_DELAY);
    }

    acceptRemoteReady(packet) {
      this.remoteReady = Boolean(packet.ready !== false);
      this.remoteHash = String(packet.romHash || "");
      this.renderDebug();
      this.maybeHostStart();
    }

    start(sessionId, delay) {
      if (this.started) return;
      if (Number(delay) !== INPUT_DELAY) {
        this.setDebugError("DELAY INCOMPATIBLE");
        return;
      }
      this.sessionId = String(sessionId || "");
      if (!this.sessionId) return;
      this.started = true;
      clearInterval(this.readyTimer);
      this.readyTimer = null;
      this.frame = 0;
      this.lastTickAt = performance.now();
      try {
        this.visible.audioPushNewState?.();
        this.hidden.audioPushNewState?.();
      } catch {}
      this.tickTimer = setInterval(() => this.tick(), 1000 / 60);
      this.renderDebug();
    }

    installLocalCable() {
      try {
        window.ML3DLinkCable?.detachEmulator?.(this.visible);
      } catch {}
      document.getElementById("ml3d-link-debug")?.remove();

      const makeAdapter = (seat) => ({
        playerNumber: seat,
        isConnected: () => true,
        isReady: () => true,
        canTransfer: () => {
          if (seat !== 0) return true;
          return (this.serials[1]?.SIOCNT_MODE | 0) === 2;
        },
        onSerialModeChange: () => this.renderDebug(),
        startMultiplayerTransfer: (info = {}) => {
          if (seat !== 0 || this.pendingTransfer) return false;
          if ((this.serials[1]?.SIOCNT_MODE | 0) !== 2) return false;
          this.pendingTransfer = {
            sequence: Number(info.sequence) | 0,
            word: Number(info.word) & 0xffff,
            baud: Number(info.baud) & 0x3,
            parentCycle: Number(this.cores[0].IOCore.linkCycleCounter) || 0
          };
          try {
            const io = this.cores[0].IOCore;
            if (typeof io.flagLinkIterationEnd === "function") io.flagLinkIterationEnd();
            else io.flagIterationEnd();
          } catch {}
          return true;
        }
      });

      this.serials[0].attachLinkCable(makeAdapter(0));
      this.serials[0].setLinkPlayerNumber(0);
      this.serials[1].attachLinkCable(makeAdapter(1));
      this.serials[1].setLinkPlayerNumber(1);
    }

    carryTransfer() {
      const pending = this.pendingTransfer;
      if (!pending) return false;
      const childCycles = Number(this.cores[1].IOCore.linkCycleCounter) || 0;
      if (childCycles < pending.parentCycle) return false;
      if ((this.serials[1].SIOCNT_MODE | 0) !== 2) {
        this.pendingTransfer = null;
        this.serials[0].SIOTransferStarted = false;
        return false;
      }

      const childWord = this.serials[1].getLinkSendData() & 0xffff;
      const words = [pending.word, childWord, 0xffff, 0xffff];

      this.serials[1].beginExternalMultiplayerTransfer(1);
      this.serials[0].completeExternalMultiplayerTransfer(
        words, 0, false, 1, false, pending.baud
      );
      this.serials[1].completeExternalMultiplayerTransfer(
        words, 1, false, 1, false, pending.baud
      );

      this.pendingTransfer = null;
      this.transferCount += 1;
      return true;
    }

    applyMask(seat, mask) {
      const core = this.cores[seat];
      const previous = this.lastApplied[seat] & 0x3ff;
      mask &= 0x3ff;
      const changed = previous ^ mask;
      for (let key = 0; key < 10; key++) {
        const bit = 1 << key;
        if (!(changed & bit)) continue;
        if (mask & bit) core.keyDown(key);
        else core.keyUp(key);
      }
      this.lastApplied[seat] = mask;
    }

    publishLocalInput() {
      const target = this.frame + INPUT_DELAY;
      if (this.sentFrames.has(target)) return;
      this.sentFrames.add(target);
      this.setInput(target, mySeat, localMask);
      sendLocal({
        type: "gba:lockstep:input",
        sessionId: this.sessionId,
        playerNumber: mySeat,
        frame: target,
        mask: localMask
      });
      const oldest = this.frame - 8;
      for (const frame of this.sentFrames) {
        if (frame < oldest) this.sentFrames.delete(frame);
      }
    }

    acceptRemoteInput(packet) {
      if (!this.started || String(packet.sessionId || "") !== this.sessionId) return;
      const seat = Number(packet.playerNumber) | 0;
      if (seat === mySeat || seat < 0 || seat > 1) return;
      this.setInput(Number(packet.frame), seat, Number(packet.mask));
    }

    frameReady() {
      return this.getInput(this.frame, 0) !== UNKNOWN &&
        this.getInput(this.frame, 1) !== UNKNOWN;
    }

    stepCore(seat, cycles) {
      const io = this.cores[seat].IOCore;
      const before = Number(io.linkCycleCounter) || 0;
      io.enter(Math.max(1, cycles | 0));
      const after = Number(io.linkCycleCounter) || 0;

      if (after > before) return true;

      // A tiny negative overrun can legitimately consume a scheduler slice
      // without advancing hardware. Clear it once and retry on the next round
      // instead of declaring the whole dual-core session wedged.
      if ((io.cyclesOveriteratedPreviously | 0) < 0) {
        io.cyclesOveriteratedPreviously = 0;
        return true;
      }
      return false;
    }

    runFrame() {
      const masks = [this.getInput(this.frame, 0), this.getInput(this.frame, 1)];
      this.applyMask(0, masks[0]);
      this.applyMask(1, masks[1]);

      const targets = this.cores.map((core) =>
        (Number(core.IOCore.linkCycleCounter) || 0) + FRAME_CYCLES
      );

      let rounds = 0;
      let noProgressRounds = 0;
      const MAX_ROUNDS = 12000;
      while (rounds++ < MAX_ROUNDS) {
        if (this.pendingTransfer && this.carryTransfer()) continue;

        const c0 = Number(this.cores[0].IOCore.linkCycleCounter) || 0;
        const c1 = Number(this.cores[1].IOCore.linkCycleCounter) || 0;
        const done0 = c0 >= targets[0];
        const done1 = c1 >= targets[1];
        if (done0 && done1 && !this.pendingTransfer) break;

        let seat;
        if (this.pendingTransfer) {
          seat = 1;
        } else if (done0) {
          seat = 1;
        } else if (done1) {
          seat = 0;
        } else {
          seat = c0 <= c1 ? 0 : 1;
        }

        const current = Number(this.cores[seat].IOCore.linkCycleCounter) || 0;
        let remaining = Math.max(1, targets[seat] - current);
        const multi =
          (this.serials[0].SIOCNT_MODE | 0) === 2 ||
          (this.serials[1].SIOCNT_MODE | 0) === 2;
        // Before MULTI there is no cable edge to catch, so use coarse slices.
        // Once either core enters MULTI, tighten the skew to ~0.24 ms of GBA
        // time while still keeping the JS call count mobile-friendly.
        const slice = multi ? 4096 : 65536;

        if (this.pendingTransfer && seat === 1) {
          remaining = Math.max(
            1,
            Math.min(remaining, Math.max(1, this.pendingTransfer.parentCycle - current))
          );
        }

        const progressed = this.stepCore(seat, Math.min(slice, remaining));
        if (progressed) {
          noProgressRounds = 0;
        } else if (!this.pendingTransfer) {
          noProgressRounds += 1;
          if (noProgressRounds >= 16) {
            this.wedged = true;
            break;
          }
        }
      }

      if (rounds >= MAX_ROUNDS) this.wedged = true;

      try {
        this.visible.submitAudioBuffer?.();
        this.hidden.submitAudioBuffer?.();
      } catch {}

      this.inputs[this.slot(this.frame, 0)] = UNKNOWN;
      this.inputs[this.slot(this.frame, 1)] = UNKNOWN;
      this.frame += 1;
      return !this.wedged;
    }

    tick() {
      if (!this.started || this.wedged) {
        this.renderDebug();
        return;
      }

      this.publishLocalInput();

      let ran = 0;
      if (this.frameReady()) {
        if (this.runFrame()) {
          ran = 1;
          this.publishLocalInput();
        }
      }

      if (!ran) this.stallCount += 1;
      this.renderDebug();
    }

    buildDebug() {
      const old = document.getElementById("ml3d-local-link-debug");
      if (old) old.remove();
      const el = document.createElement("div");
      el.id = "ml3d-local-link-debug";
      el.style.cssText =
        "position:fixed;right:6px;bottom:6px;z-index:2147483647;" +
        "padding:6px 8px;background:rgba(0,0,0,.86);color:#fff;" +
        "font:10px/1.3 monospace;border:1px solid rgba(255,255,255,.3);" +
        "border-radius:6px;pointer-events:none;white-space:pre";
      document.documentElement.appendChild(el);
      this.debug = el;
      this.renderDebug();
    }

    setDebugError(message) {
      if (!this.debug) this.buildDebug();
      this.debug.textContent = "LOCAL LINK ERROR\n" + message;
    }

    renderDebug() {
      if (!this.debug) return;
      const s0 = this.serials?.[0];
      const s1 = this.serials?.[1];
      const c0 = Number(this.cores?.[0]?.IOCore?.linkCycleCounter) || 0;
      const c1 = Number(this.cores?.[1]?.IOCore?.linkCycleCounter) || 0;
      const current0 = this.getInput(this.frame, 0);
      const current1 = this.getInput(this.frame, 1);
      this.debug.textContent =
        `LOCAL LINK ${role === "host" ? "H" : "G"} P${mySeat} ${this.started ? "RUN" : "SYNC"}\n` +
        (!this.started ? `ESPERANDO PEER:${this.remoteReady ? "OK" : "..."} ROM:${this.remoteHash ? (this.remoteHash === this.romHash ? "OK" : "DIFF") : "..."}\n` : "") +
        `F:${this.frame} IN:${current0 === UNKNOWN ? "-" : current0.toString(16)}/${current1 === UNKNOWN ? "-" : current1.toString(16)} D:${INPUT_DELAY}\n` +
        `M:${s0?.SIOCNT_MODE ?? "-"}/${s1?.SIOCNT_MODE ?? "-"} BUSY:${s0?.SIOTransferStarted ? 1 : 0}/${s1?.SIOTransferStarted ? 1 : 0}\n` +
        `XFER:${this.transferCount} PEND:${this.pendingTransfer ? 1 : 0} Δ:${Math.round(c0 - c1)} STALL:${this.stallCount}` +
        (this.wedged ? "\nWEDGED" : "");
    }

    status() {
      return {
        roomId,
        mySeat,
        role,
        started: this.started,
        sessionId: this.sessionId,
        frame: this.frame,
        transfers: this.transferCount,
        pendingTransfer: Boolean(this.pendingTransfer),
        remoteReady: this.remoteReady,
        romHash: this.romHash,
        remoteHash: this.remoteHash,
        wedged: this.wedged,
        stalls: this.stallCount
      };
    }

    destroy() {
      clearInterval(this.readyTimer);
      clearInterval(this.tickTimer);
      this.readyTimer = null;
      this.tickTimer = null;
      try {
        this.serials[0]?.detachLinkCable?.();
        this.serials[1]?.detachLinkCable?.();
      } catch {}
      try {
        this.hidden?.stop?.();
      } catch {}
      this.debug?.remove();
      this.started = false;
    }
  }

  async function bootLocalDual() {
    const runtime = window.ML3DLinkRuntime;
    const visible = runtime?.emulator;
    const rom = runtime?.romBytes;
    if (!visible || !rom || !rom.byteLength) return;

    runtime.stopTimers?.();
    try {
      window.ML3DLinkCable?.detachEmulator?.(visible);
    } catch {}

    const hash = await fingerprint(rom);
    const hidden = makeHiddenCore(rom);
    controller?.destroy?.();
    controller = new LocalDualLink(visible, hidden, hash);

    if (pendingStart) {
      const start = pendingStart;
      pendingStart = null;
      controller.start(String(start.sessionId || ""), Number(start.delay));
    }
  }

  bus.addEventListener("message", (event) => {
    const packet = event.data;
    if (!packet || packet.source !== "lobby" || packet.roomId !== roomId) return;

    if (packet.type === "gba:lockstep:remote-ready") {
      controller?.acceptRemoteReady(packet);
      return;
    }

    if (packet.type === "gba:lockstep:start") {
      if (String(packet.romHash || "") && controller && packet.romHash !== controller.romHash) {
        controller.setDebugError("ROM DISTINTA");
        return;
      }
      if (!controller) pendingStart = packet;
      else controller.start(String(packet.sessionId || ""), Number(packet.delay));
      return;
    }

    if (packet.type === "gba:lockstep:remote-input") {
      controller?.acceptRemoteInput(packet);
      return;
    }

    if (packet.type === "gba:lockstep:stop") {
      controller?.destroy?.();
      controller = null;
    }
  });

  window.addEventListener("ml3d-rom-started", (event) => {
    if (event.detail?.system !== "gba") return;
    bootLocalDual().catch((error) => {
      console.error("ML3D Local Link:", error);
      controller?.setDebugError?.(String(error?.message || error));
    });
  });

  window.addEventListener("pagehide", () => {
    controller?.destroy?.();
    try { bus.close(); } catch {}
  });
})();
