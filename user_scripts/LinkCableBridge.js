(() => {
  "use strict";

  if (window.ML3DLinkCable) return;

  const CHANNEL_NAME = "ml3d-gba-link-v1";
  const STORAGE_KEY = "ml3d-gba-link-session-v1";
  const params = new URLSearchParams(location.search);

  let emulator = null;
  let serial = null;
  let localSequence = 0;
  let localReady = false;
  let localModeMulti = false;
  let remoteReady = false;
  let readyTimer = 0;
  let transferCount = 0;
  let lastState = "boot";
  let waitStartedAt = 0;
  let lastWaitMs = null;
  let config = loadConfig();
  const bus = typeof BroadcastChannel === "function"
    ? new BroadcastChannel(CHANNEL_NAME)
    : null;

  function sanitizePlayerNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(3, n | 0)) : 0;
  }

  function normalizeConfig(value = {}) {
    const roomId = String(value.roomId || "").trim().slice(0, 120);
    return {
      roomId,
      playerNumber: sanitizePlayerNumber(value.playerNumber),
      role: value.role === "host" ? "host" : "guest"
    };
  }

  function loadConfig() {
    const queryRoom = String(params.get("linkRoom") || "").trim();
    if (queryRoom) {
      return normalizeConfig({
        roomId: queryRoom,
        playerNumber: params.get("linkPlayer"),
        role: params.get("linkRole")
      });
    }
    try {
      return normalizeConfig(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch {
      return normalizeConfig();
    }
  }

  function saveConfig(next) {
    config = normalizeConfig(next);
    remoteReady = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {}
    if (serial) {
      serial.setLinkPlayerNumber(config.playerNumber);
      localModeMulti = (serial.SIOCNT_MODE | 0) === 2;
      localReady = false;
      if (localModeMulti) adapter.onSerialModeChange(2);
    }
    publishLocalReady();
    emitStatus("configured");
  }

  function emitStatus(state, extra = {}) {
    lastState = state;
    updateDebug();
    window.dispatchEvent(new CustomEvent("ml3d-link-cable-status", {
      detail: { state, ...config, ...extra }
    }));
  }

  function updateDebug() {
    if (params.get("linkDebug") !== "1") return;
    let el = document.getElementById("ml3d-link-debug");
    if (!el) {
      el = document.createElement("div");
      el.id = "ml3d-link-debug";
      el.style.cssText = "position:fixed;right:6px;bottom:6px;z-index:2147483647;padding:5px 7px;background:rgba(0,0,0,.78);color:#fff;font:10px/1.25 monospace;border:1px solid rgba(255,255,255,.25);border-radius:5px;pointer-events:none;white-space:pre";
      document.documentElement.appendChild(el);
    }
    const waiting = Boolean(emulator?.IOCore?.linkCableWait);
    const waitText = Number.isFinite(lastWaitMs) ? Math.round(lastWaitMs) + "ms" : "--";
    el.textContent =
      `LINK ${config.role === "host" ? "H" : "G"} P${config.playerNumber}\n` +
      `M:${localModeMulti ? 1 : 0} L:${localReady ? 1 : 0} R:${remoteReady ? 1 : 0} WAIT:${waiting ? 1 : 0}\n` +
      `TX:${transferCount} T:${waitText} ${lastState}`;
  }

  function sendLocal(packet) {
    if (!bus || !config.roomId) return false;
    bus.postMessage({
      ...packet,
      source: "emulator",
      roomId: config.roomId,
      playerNumber: config.playerNumber,
      role: config.role,
      time: Date.now()
    });
    return true;
  }

  function publishLocalReady() {
    if (!config.roomId) return false;
    return sendLocal({
      type: "gba:link:ready",
      ready: Boolean(localReady)
    });
  }

  const adapter = {
    get playerNumber() {
      return config.playerNumber;
    },
    isConnected() {
      return Boolean(bus && config.roomId);
    },
    // Physical cable detection must not depend on the other game already
    // being in MULTI mode, otherwise the secondary GBA can never enter the
    // Multiplayer menu.
    isReady() {
      return this.isConnected();
    },
    canTransfer() {
      return this.isConnected() && remoteReady;
    },
    onSerialModeChange(mode) {
      const nextModeMulti = (Number(mode) | 0) === 2;
      localModeMulti = nextModeMulti;
      clearTimeout(readyTimer);
      readyTimer = 0;

      if (!nextModeMulti) {
        if (localReady) {
          localReady = false;
          publishLocalReady();
        }
        emitStatus("local-mode", { modeMulti: false, ready: localReady });
        return;
      }

      // Games can touch MULTI briefly while probing the cable. Do not advertise
      // transfer readiness until the mode has remained stable long enough to
      // represent an actual multiplayer session.
      readyTimer = setTimeout(() => {
        readyTimer = 0;
        if (!serial || (serial.SIOCNT_MODE | 0) !== 2) return;
        localModeMulti = true;
        if (!localReady) {
          localReady = true;
          publishLocalReady();
        }
        emitStatus("local-ready", { modeMulti: true, ready: true });
      }, 250);
      emitStatus("local-mode", { modeMulti: true, ready: localReady });
    },
    startMultiplayerTransfer(info = {}) {
      if (!this.canTransfer()) {
        emitStatus("transfer-waiting-remote", { remoteReady });
        return false;
      }
      localSequence = (localSequence + 1) >>> 0;
      const seq = `${Date.now().toString(36)}-${localSequence.toString(36)}`;
      waitStartedAt = performance.now();
      sendLocal({
        type: "gba:link:request",
        seq,
        coreSequence: Number(info.sequence) || 0,
        word: Number(info.word) & 0xFFFF,
        baud: Number(info.baud) & 0x3
      });
      emitStatus("transfer-request", { seq });
      return true;
    }
  };

  function attachEmulator(nextEmulator) {
    detachEmulator();
    emulator = nextEmulator || null;
    serial = emulator?.IOCore?.serial || null;
    if (!serial || typeof serial.attachLinkCable !== "function") {
      emitStatus("core-unavailable");
      return false;
    }
    serial.attachLinkCable(adapter);
    serial.setLinkPlayerNumber(config.playerNumber);
    localModeMulti = (serial.SIOCNT_MODE | 0) === 2;
    localReady = false;
    publishLocalReady();
    if (localModeMulti) adapter.onSerialModeChange(2);
    emitStatus("attached", { localModeMulti, localReady, remoteReady });
    return true;
  }

  function detachEmulator(target = null) {
    if (target && emulator && target !== emulator) return;
    try {
      serial?.detachLinkCable?.();
    } catch {}
    clearTimeout(readyTimer);
    readyTimer = 0;
    localModeMulti = false;
    localReady = false;
    remoteReady = false;
    publishLocalReady();
    serial = null;
    emulator = null;
    emitStatus("detached");
  }

  function currentWord() {
    if (!serial) return 0xFFFF;
    if (typeof serial.getLinkSendData === "function") {
      return serial.getLinkSendData() & 0xFFFF;
    }
    return Number(serial.SIODATA8) & 0xFFFF;
  }

  function handleLocalBusMessage(event) {
    const packet = event.data;
    if (!packet || packet.source !== "lobby") return;

    if (packet.type === "gba:link:configure") {
      if (packet.roomId) {
        saveConfig({
          roomId: packet.roomId,
          playerNumber: packet.playerNumber,
          role: packet.role
        });
      }
      return;
    }

    if (!config.roomId || packet.roomId !== config.roomId) return;

    if (packet.type === "gba:link:remote-ready") {
      remoteReady = Boolean(packet.ready);
      emitStatus("remote-ready", { ready: remoteReady });
      return;
    }

    if (packet.type === "gba:link:poll") {
      const playerNumber = sanitizePlayerNumber(packet.playerNumber);
      config.playerNumber = playerNumber;
      waitStartedAt = performance.now();
      if (serial?.beginExternalMultiplayerTransfer) {
        serial.beginExternalMultiplayerTransfer(playerNumber);
      }
      sendLocal({
        type: "gba:link:reply",
        seq: String(packet.seq || ""),
        word: currentWord(),
        baud: Number(packet.baud) & 0x3
      });
      emitStatus("transfer-reply", { seq: packet.seq });
      return;
    }

    if (packet.type === "gba:link:complete") {
      const words = Array.isArray(packet.words)
        ? packet.words.slice(0, 4).map((v) => Number(v) & 0xFFFF)
        : [0xFFFF, 0xFFFF, 0xFFFF, 0xFFFF];

      while (words.length < 4) words.push(0xFFFF);

      serial?.completeExternalMultiplayerTransfer?.(
        words,
        sanitizePlayerNumber(packet.playerNumber ?? config.playerNumber),
        Boolean(packet.error)
      );
      transferCount += 1;
      if (waitStartedAt > 0) {
        lastWaitMs = Math.max(0, performance.now() - waitStartedAt);
      }
      waitStartedAt = 0;
      emitStatus("transfer-complete", {
        seq: packet.seq,
        error: Boolean(packet.error),
        waitMs: lastWaitMs
      });
      return;
    }

    if (packet.type === "gba:link:disconnect") {
      remoteReady = false;
      waitStartedAt = 0;
      emitStatus("remote-disconnect");
    }
  }

  if (bus) {
    bus.addEventListener("message", handleLocalBusMessage);
  }

  window.addEventListener("ml3d-rom-started", () => {
    if (window.__gba) attachEmulator(window.__gba);
  });

  window.addEventListener("pagehide", () => {
    detachEmulator();
  });

  window.ML3DLinkCable = {
    attachEmulator,
    detachEmulator,
    configure(next) {
      saveConfig({ ...config, ...next });
      return { ...config };
    },
    status() {
      return {
        ...config,
        attached: Boolean(serial),
        connected: adapter.isConnected(),
        localModeMulti,
        localReady,
        remoteReady,
        cableReady: adapter.isReady(),
        ready: adapter.canTransfer(),
        waiting: Boolean(emulator?.IOCore?.linkCableWait),
        transferCount,
        lastWaitMs,
        lastState
      };
    }
  };

  if (window.__gba) attachEmulator(window.__gba);
  emitStatus(bus ? "ready" : "broadcastchannel-unavailable");
})();
