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
  let remoteReady = false;
  let transferFrozen = false;
  let transferWasRunning = false;
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
      localReady = (serial.SIOCNT_MODE | 0) === 2;
    }
    publishLocalReady();
    emitStatus("configured");
  }

  function emitStatus(state, extra = {}) {
    window.dispatchEvent(new CustomEvent("ml3d-link-cable-status", {
      detail: { state, ...config, ...extra }
    }));
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

  function freezeForTransfer() {
    if (!emulator || transferFrozen) return;
    transferWasRunning = (emulator.emulatorStatus | 0) < 0x10;
    if (!transferWasRunning) return;
    transferFrozen = true;
    // Freeze without calling pause(), because pause() exports the save. The
    // normal timer sees the pause bit and stops executing CPU cycles.
    emulator.emulatorStatus = emulator.emulatorStatus | 0x10;
    emitStatus("transfer-freeze");
  }

  function thawAfterTransfer() {
    if (!transferFrozen) return;
    transferFrozen = false;
    if (transferWasRunning && emulator) {
      transferWasRunning = false;
      try {
        emulator.play();
      } catch {
        emulator.emulatorStatus = emulator.emulatorStatus & 0xF;
      }
    }
    emitStatus("transfer-thaw");
  }

  const adapter = {
    get playerNumber() {
      return config.playerNumber;
    },
    isConnected() {
      return Boolean(bus && config.roomId);
    },
    isReady() {
      return this.isConnected() && remoteReady;
    },
    onSerialModeChange(mode) {
      const nextReady = (Number(mode) | 0) === 2;
      if (nextReady === localReady) return;
      localReady = nextReady;
      publishLocalReady();
      emitStatus("local-ready", { ready: localReady });
    },
    startMultiplayerTransfer(info = {}) {
      if (!this.isReady()) return false;
      localSequence = (localSequence + 1) >>> 0;
      const seq = `${Date.now().toString(36)}-${localSequence.toString(36)}`;
      sendLocal({
        type: "gba:link:request",
        seq,
        coreSequence: Number(info.sequence) || 0,
        word: Number(info.word) & 0xFFFF,
        baud: Number(info.baud) & 0x3
      });
      freezeForTransfer();
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
    localReady = (serial.SIOCNT_MODE | 0) === 2;
    publishLocalReady();
    emitStatus("attached", { localReady, remoteReady });
    return true;
  }

  function detachEmulator(target = null) {
    if (target && emulator && target !== emulator) return;
    try {
      serial?.detachLinkCable?.();
    } catch {}
    thawAfterTransfer();
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
      if (serial?.beginExternalMultiplayerTransfer) {
        serial.beginExternalMultiplayerTransfer(playerNumber);
      }
      freezeForTransfer();
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
      thawAfterTransfer();
      emitStatus("transfer-complete", {
        seq: packet.seq,
        error: Boolean(packet.error)
      });
      return;
    }

    if (packet.type === "gba:link:disconnect") {
      remoteReady = false;
      thawAfterTransfer();
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
        localReady,
        remoteReady,
        ready: adapter.isReady(),
        frozen: transferFrozen
      };
    }
  };

  if (window.__gba) attachEmulator(window.__gba);
  emitStatus(bus ? "ready" : "broadcastchannel-unavailable");
})();
