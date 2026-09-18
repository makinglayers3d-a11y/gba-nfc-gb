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
  let remoteWordGeneration = 0;
  let consumedRemoteWordGeneration = 0;
  let localWordGeneration = 0;
  let lastConsumedLocalGeneration = 0;
  let pendingWord = 0xFFFF;
  let pendingWordReason = "register";
  let wordPublishQueued = false;
  let wordRequestPending = false;
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
      `L:${localReady ? 1 : 0} R:${remoteReady ? 1 : 0} W:${remoteWordValid ? remoteWord.toString(16).padStart(4, "0") : "----"} G:${remoteWordGeneration}/${consumedRemoteWordGeneration}\n` +
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

  function nextLocalWordGeneration() {
    localWordGeneration = (localWordGeneration + 1) >>> 0;
    if (!localWordGeneration) localWordGeneration = 1;
    return localWordGeneration;
  }

  function publishSendWord(
    word = currentWord(),
    reason = "update",
    requestSeq = "",
    advanceGeneration = true
  ) {
    word = Number(word) & 0xFFFF;
    if (advanceGeneration || !localWordGeneration) {
      nextLocalWordGeneration();
    }
    return sendLocal({
      type: "gba:link:word",
      word,
      generation: localWordGeneration >>> 0,
      reason,
      requestSeq: String(requestSeq || "")
    });
  }

  function scheduleSendWord(word, reason = "register") {
    pendingWord = Number(word) & 0xFFFF;
    pendingWordReason = String(reason || "register");
    if (wordPublishQueued) return;
    wordPublishQueued = true;
    Promise.resolve().then(() => {
      wordPublishQueued = false;
      publishSendWord(pendingWord, pendingWordReason, "", true);
    });
  }

  function transferDelayMs(baud) {
    // Two-player MULTI moves 32 serial bits. Approximate the real cable
    // duration at 9600/38400/57600/115200 bps without stalling the CPU.
    return [4, 1, 1, 1][Number(baud) & 0x3];
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
      if (localReady) scheduleSendWord(currentWord(), "mode-ready");
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

      if (
        !remoteWordValid ||
        (remoteWordGeneration >>> 0) <= (consumedRemoteWordGeneration >>> 0)
      ) {
        if (!wordRequestPending) {
          wordRequestPending = true;
          sendLocal({
            type: "gba:link:word-request",
            seq,
            hostWord,
            baud
          });
        }
        emitStatus("transfer-awaiting-word", { seq });
        return false;
      }

      const guestWord = remoteWord & 0xFFFF;
      const guestGeneration = remoteWordGeneration >>> 0;
      consumedRemoteWordGeneration = guestGeneration;
      remoteWordValid = false;
      wordRequestPending = false;
      transferCount += 1;

      sendLocal({
        type: "gba:link:fast-transfer",
        seq,
        coreSequence: Number(info.sequence) || 0,
        hostWord,
        guestWord,
        guestGeneration,
        baud
      });

      setTimeout(() => {
        if (!serial?.completeExternalMultiplayerTransfer) return;
        serial.completeExternalMultiplayerTransfer(
          [hostWord, guestWord, 0xFFFF, 0xFFFF],
          0,
          false
        );
        emitStatus("transfer-fast-complete", {
          seq,
          hostWord,
          guestWord,
          guestGeneration
        });
      }, transferDelayMs(baud));
      emitStatus("transfer-fast", { seq, hostWord, guestWord, guestGeneration });
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
    scheduleSendWord(currentWord(), "attach");
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
    remoteWordGeneration = 0;
    consumedRemoteWordGeneration = 0;
    localWordGeneration = 0;
    lastConsumedLocalGeneration = 0;
    wordRequestPending = false;
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
      const generation = Number(packet.generation) >>> 0;
      if (
        generation &&
        generation <= (consumedRemoteWordGeneration >>> 0)
      ) {
        emitStatus("remote-word-stale", { generation });
        return;
      }
      if (
        generation &&
        remoteWordValid &&
        generation <= (remoteWordGeneration >>> 0)
      ) {
        emitStatus("remote-word-duplicate", { generation });
        return;
      }
      remoteWord = Number(packet.word) & 0xFFFF;
      remoteWordGeneration = generation || ((remoteWordGeneration + 1) >>> 0) || 1;
      remoteWordValid = true;
      wordRequestPending = false;
      emitStatus("remote-word", {
        word: remoteWord,
        generation: remoteWordGeneration,
        requestSeq: String(packet.requestSeq || "")
      });
      return;
    }

    if (packet.type === "gba:link:word-request") {
      const consumed = (localWordGeneration >>> 0) <= (lastConsumedLocalGeneration >>> 0);
      publishSendWord(
        currentWord(),
        "request",
        String(packet.seq || packet.requestSeq || ""),
        consumed
      );
      emitStatus("word-request-reply", {
        seq: packet.seq,
        generation: localWordGeneration
      });
      return;
    }

    if (packet.type === "gba:link:fast-transfer") {
      const playerNumber = sanitizePlayerNumber(packet.playerNumber ?? config.playerNumber);
      const hostWord = Number(packet.hostWord) & 0xFFFF;
      const guestWord = Number(packet.guestWord) & 0xFFFF;
      const guestGeneration = Number(packet.guestGeneration) >>> 0;
      const baud = Number(packet.baud) & 0x3;
      if (guestGeneration) {
        lastConsumedLocalGeneration = Math.max(
          lastConsumedLocalGeneration >>> 0,
          guestGeneration
        ) >>> 0;
      }
      if (serial?.beginExternalMultiplayerTransfer) {
        serial.beginExternalMultiplayerTransfer(playerNumber);
      }

      setTimeout(() => {
        serial?.completeExternalMultiplayerTransfer?.(
          [hostWord, guestWord, 0xFFFF, 0xFFFF],
          playerNumber,
          false
        );
        transferCount += 1;
        emitStatus("transfer-fast-remote", {
          seq: packet.seq,
          hostWord,
          guestWord,
          guestGeneration
        });

        // If the game writes a fresh SIOMLT_SEND while handling the IRQ,
        // onSendDataChange publishes it. Only synthesize a new generation when
        // the register remains unchanged, because hardware reuses its current
        // send word on the next transfer.
        const generationAfterComplete = localWordGeneration >>> 0;
        setTimeout(() => {
          if (
            (localWordGeneration >>> 0) === generationAfterComplete &&
            (localWordGeneration >>> 0) <= (lastConsumedLocalGeneration >>> 0)
          ) {
            publishSendWord(currentWord(), "reuse-after-transfer", packet.seq, true);
          }
        }, 17);
      }, transferDelayMs(baud));
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
        remoteWordGeneration,
        consumedRemoteWordGeneration,
        localWordGeneration,
        lastConsumedLocalGeneration,
        transferCount,
        lastState: lastLinkState
      };
    }
  };

  if (window.__gba) attachEmulator(window.__gba);
  emitStatus(bus ? "ready" : "broadcastchannel-unavailable");
})();
