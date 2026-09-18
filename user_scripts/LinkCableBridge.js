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
  let remoteWord = 0xFFFF;
  let remoteWordValid = false;
  let pendingWord = 0xFFFF;
  let wordPublishQueued = false;
  let transferCount = 0;
  let lastLinkState = "boot";
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
    lastLinkState = state;
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
    el.textContent =
      `LINK ${config.role === "host" ? "H" : "G"} P${config.playerNumber}\n` +
      `L:${localReady ? 1 : 0} R:${remoteReady ? 1 : 0} W:${remoteWordValid ? remoteWord.toString(16).padStart(4, "0") : "----"}\n` +
      `TX:${transferCount} ${lastLinkState}`;
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

  function publishSendWord(word = currentWord(), reason = "update", requestSeq = "") {
    word = Number(word) & 0xFFFF;
    return sendLocal({
      type: "gba:link:word",
      word,
      reason,
      requestSeq: String(requestSeq || "")
    });
  }

  function scheduleSendWord(word) {
    pendingWord = Number(word) & 0xFFFF;
    if (wordPublishQueued) return;
    wordPublishQueued = true;
    Promise.resolve().then(() => {
      wordPublishQueued = false;
      publishSendWord(pendingWord, "register");
    });
  }

  const adapter = {
    get playerNumber() {
      return config.playerNumber;
    },
    isConnected() {
      return Boolean(bus && config.roomId);
    },
    // Physical cable presence/readiness: this must be true as soon as the
    // WebRTC-backed cable is connected so games can enter their Multiplayer
    // menus. Remote SIO readiness is a separate condition.
    isReady() {
      return this.isConnected();
    },
    canTransfer() {
      return this.isConnected() && remoteReady;
    },
    onSerialModeChange(mode) {
      const nextReady = (Number(mode) | 0) === 2;
      if (nextReady === localReady) return;
      localReady = nextReady;
      publishLocalReady();
      if (localReady) scheduleSendWord(currentWord());
      emitStatus("local-ready", { ready: localReady });
    },
    onSendDataChange(word) {
      scheduleSendWord(word);
    },
    startMultiplayerTransfer(info = {}) {
      if (!this.canTransfer()) {
        emitStatus("transfer-waiting-remote", { remoteReady });
        return false;
      }

      localSequence = (localSequence + 1) >>> 0;
      const seq = `${Date.now().toString(36)}-${localSequence.toString(36)}`;
      const hostWord = Number(info.word) & 0xFFFF;
      const baud = Number(info.baud) & 0x3;

      if (!remoteWordValid) {
        sendLocal({
          type: "gba:link:word-request",
          seq,
          hostWord,
          baud
        });
        emitStatus("transfer-awaiting-word", { seq });
        return false;
      }

      const guestWord = remoteWord & 0xFFFF;
      remoteWordValid = false;
      transferCount += 1;

      sendLocal({
        type: "gba:link:fast-transfer",
        seq,
        coreSequence: Number(info.sequence) || 0,
        hostWord,
        guestWord,
        baud
      });

      Promise.resolve().then(() => {
        if (!serial?.completeExternalMultiplayerTransfer) return;
        serial.completeExternalMultiplayerTransfer(
          [hostWord, guestWord, 0xFFFF, 0xFFFF],
          0,
          false
        );
        emitStatus("transfer-fast-complete", { seq, hostWord, guestWord });
      });
      emitStatus("transfer-fast", { seq, hostWord, guestWord });
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
    scheduleSendWord(currentWord());
    emitStatus("attached", { localReady, remoteReady });
    return true;
  }

  function detachEmulator(target = null) {
    if (target && emulator && target !== emulator) return;
    try {
      serial?.detachLinkCable?.();
    } catch {}
    localReady = false;
    remoteReady = false;
    remoteWordValid = false;
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

    if (packet.type === "gba:link:remote-word") {
      remoteWord = Number(packet.word) & 0xFFFF;
      remoteWordValid = true;
      emitStatus("remote-word", {
        word: remoteWord,
        requestSeq: String(packet.requestSeq || "")
      });
      return;
    }

    if (packet.type === "gba:link:word-request") {
      publishSendWord(
        currentWord(),
        "request",
        String(packet.seq || packet.requestSeq || "")
      );
      emitStatus("word-request-reply", { seq: packet.seq });
      return;
    }

    if (packet.type === "gba:link:fast-transfer") {
      const playerNumber = sanitizePlayerNumber(packet.playerNumber ?? config.playerNumber);
      const hostWord = Number(packet.hostWord) & 0xFFFF;
      const guestWord = Number(packet.guestWord) & 0xFFFF;
      if (serial?.beginExternalMultiplayerTransfer) {
        serial.beginExternalMultiplayerTransfer(playerNumber);
      }
      serial?.completeExternalMultiplayerTransfer?.(
        [hostWord, guestWord, 0xFFFF, 0xFFFF],
        playerNumber,
        false
      );
      transferCount += 1;
      emitStatus("transfer-fast-remote", {
        seq: packet.seq,
        hostWord,
        guestWord
      });
      // Give the guest CPU a chance to process the serial IRQ and prepare the
      // next SIOMLT_SEND word, then publish it ahead of the next host transfer.
      setTimeout(() => publishSendWord(currentWord(), "post-transfer", packet.seq), 0);
      setTimeout(() => publishSendWord(currentWord(), "post-transfer-late", packet.seq), 16);
      return;
    }

    if (packet.type === "gba:link:poll") {
      const playerNumber = sanitizePlayerNumber(packet.playerNumber);
      config.playerNumber = playerNumber;
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
      emitStatus("transfer-complete", {
        seq: packet.seq,
        error: Boolean(packet.error)
      });
      return;
    }

    if (packet.type === "gba:link:disconnect") {
      remoteReady = false;
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
        cableReady: adapter.isReady(),
        remoteReady,
        ready: adapter.canTransfer(),
        remoteWord: remoteWordValid ? remoteWord : null,
        transferCount,
        lastState: lastLinkState
      };
    }
  };

  if (window.__gba) attachEmulator(window.__gba);
  emitStatus(bus ? "ready" : "broadcastchannel-unavailable");
})();
