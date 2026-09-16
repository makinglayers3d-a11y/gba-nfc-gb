(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const statusText = $("#statusText");
  const logEl = $("#log");
  const localOffer = $("#localOffer");
  const remoteOffer = $("#remoteOffer");
  const localAnswer = $("#localAnswer");
  const remoteAnswer = $("#remoteAnswer");
  const messageInput = $("#message");
  const sendButton = $("#send");
  const pingButton = $("#ping");
  const pingResult = $("#pingResult");

  let pc = null;
  let channel = null;
  let pingStartedAt = 0;

  function log(message) {
    const time = new Date().toLocaleTimeString();
    logEl.textContent += `[${time}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setState(state, text) {
    document.body.dataset.linkState = state;
    statusText.textContent = text;
  }

  function setChannelReady(ready) {
    sendButton.disabled = !ready;
    pingButton.disabled = !ready;
  }

  function waitForIceGatheringComplete(peer) {
    if (peer.iceGatheringState === "complete") {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const onStateChange = () => {
        if (peer.iceGatheringState === "complete") {
          peer.removeEventListener("icegatheringstatechange", onStateChange);
          resolve();
        }
      };

      peer.addEventListener("icegatheringstatechange", onStateChange);

      // Evita que la interfaz quede bloqueada indefinidamente si el navegador
      // tarda demasiado en declarar ICE como completo.
      window.setTimeout(() => {
        peer.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      }, 8000);
    });
  }

  function serializeDescription(description) {
    return JSON.stringify({
      type: description.type,
      sdp: description.sdp
    });
  }

  function parseDescription(text) {
    const parsed = JSON.parse(text.trim());

    if (!parsed || !parsed.type || !parsed.sdp) {
      throw new Error("Descripción WebRTC no válida.");
    }

    return parsed;
  }

  function attachChannel(dataChannel) {
    channel = dataChannel;

    channel.binaryType = "arraybuffer";

    channel.addEventListener("open", () => {
      setState("connected", "LINK CONECTADO");
      setChannelReady(true);
      log("Canal ML3D Link abierto.");

      sendPacket({
        type: "hello",
        protocol: "ml3d-link-lab",
        version: 1,
        time: Date.now()
      });
    });

    channel.addEventListener("close", () => {
      setChannelReady(false);
      setState("idle", "Canal cerrado");
      log("Canal ML3D Link cerrado.");
    });

    channel.addEventListener("error", (event) => {
      setState("error", "Error de canal");
      log(`Error del canal: ${event.message || "desconocido"}`);
    });

    channel.addEventListener("message", (event) => {
      let packet = event.data;

      try {
        packet = JSON.parse(event.data);
      } catch (_) {
        log(`Recibido: ${String(event.data)}`);
        return;
      }

      if (packet.type === "ping") {
        sendPacket({ type: "pong", id: packet.id });
        return;
      }

      if (packet.type === "pong") {
        if (pingStartedAt) {
          const elapsed = performance.now() - pingStartedAt;
          pingResult.textContent = `Ping: ${Math.round(elapsed)} ms`;
          log(`Ping WebRTC: ${Math.round(elapsed)} ms`);
          pingStartedAt = 0;
        }
        return;
      }

      if (packet.type === "message") {
        log(`Mensaje remoto: ${packet.text}`);
        return;
      }

      if (packet.type === "lifecycle") {
        log(`Estado remoto: ${packet.state}`);
        return;
      }

      log(`Paquete remoto: ${JSON.stringify(packet)}`);
    });
  }

  function createPeerConnection() {
    closePeer(false);

    // Primera fase: sin STUN/TURN ni servidor de señalización.
    // Está pensada para validar WebRTC manualmente, preferiblemente
    // en dos dispositivos de la misma red local.
    pc = new RTCPeerConnection({ iceServers: [] });

    pc.addEventListener("connectionstatechange", () => {
      log(`PeerConnection: ${pc.connectionState}`);

      if (pc.connectionState === "connecting") {
        setState("connecting", "Conectando…");
      } else if (pc.connectionState === "connected") {
        setState("connected", "LINK CONECTADO");
      } else if (["failed", "disconnected"].includes(pc.connectionState)) {
        setState("error", "Conexión interrumpida");
      } else if (pc.connectionState === "closed") {
        setState("idle", "Sin conexión");
      }
    });

    pc.addEventListener("iceconnectionstatechange", () => {
      log(`ICE: ${pc.iceConnectionState}`);
    });

    pc.addEventListener("datachannel", (event) => {
      log("Canal recibido desde el dispositivo A.");
      attachChannel(event.channel);
    });

    return pc;
  }

  function sendPacket(packet) {
    if (!channel || channel.readyState !== "open") {
      return false;
    }

    channel.send(JSON.stringify(packet));
    return true;
  }

  function closePeer(updateUi = true) {
    setChannelReady(false);

    if (channel) {
      try { channel.close(); } catch (_) {}
      channel = null;
    }

    if (pc) {
      try { pc.close(); } catch (_) {}
      pc = null;
    }

    if (updateUi) {
      setState("idle", "Sin conexión");
      pingResult.textContent = "Ping: —";
      log("Conexión cerrada manualmente.");
    }
  }

  async function createOffer() {
    try {
      setState("connecting", "Generando oferta…");
      const peer = createPeerConnection();

      attachChannel(peer.createDataChannel("ml3d-link", {
        ordered: true
      }));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGatheringComplete(peer);

      localOffer.value = serializeDescription(peer.localDescription);
      setState("idle", "Oferta lista");
      log("Oferta creada. Cópiala al dispositivo B.");
    } catch (error) {
      setState("error", "No se pudo crear la oferta");
      log(`ERROR: ${error.message}`);
    }
  }

  async function createAnswer() {
    try {
      const offer = parseDescription(remoteOffer.value);
      setState("connecting", "Procesando oferta…");

      const peer = createPeerConnection();
      await peer.setRemoteDescription(offer);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await waitForIceGatheringComplete(peer);

      localAnswer.value = serializeDescription(peer.localDescription);
      setState("connecting", "Respuesta lista");
      log("Respuesta creada. Devuélvela al dispositivo A.");
    } catch (error) {
      setState("error", "No se pudo generar la respuesta");
      log(`ERROR: ${error.message}`);
    }
  }

  async function applyAnswer() {
    try {
      if (!pc) {
        throw new Error("Primero debes crear una oferta en este dispositivo.");
      }

      const answer = parseDescription(remoteAnswer.value);
      await pc.setRemoteDescription(answer);
      setState("connecting", "Esperando conexión…");
      log("Respuesta aplicada. Esperando apertura del canal.");
    } catch (error) {
      setState("error", "No se pudo aplicar la respuesta");
      log(`ERROR: ${error.message}`);
    }
  }

  async function copyText(textarea, label) {
    if (!textarea.value) return;

    try {
      await navigator.clipboard.writeText(textarea.value);
      log(`${label} copiada al portapapeles.`);
    } catch (_) {
      textarea.focus();
      textarea.select();
      log(`No se pudo copiar automáticamente. ${label} seleccionada.`);
    }
  }

  $("#createOffer").addEventListener("click", createOffer);
  $("#createAnswer").addEventListener("click", createAnswer);
  $("#applyAnswer").addEventListener("click", applyAnswer);
  $("#copyOffer").addEventListener("click", () => copyText(localOffer, "Oferta"));
  $("#copyAnswer").addEventListener("click", () => copyText(localAnswer, "Respuesta"));
  $("#disconnect").addEventListener("click", () => closePeer(true));

  sendButton.addEventListener("click", () => {
    const text = messageInput.value.trim();
    if (!text) return;

    if (sendPacket({ type: "message", text, time: Date.now() })) {
      log(`Enviado: ${text}`);
    }
  });

  pingButton.addEventListener("click", () => {
    pingStartedAt = performance.now();
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    if (!sendPacket({ type: "ping", id })) {
      pingStartedAt = 0;
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!channel || channel.readyState !== "open") return;

    sendPacket({
      type: "lifecycle",
      state: document.hidden ? "background" : "foreground",
      time: Date.now()
    });
  });

  window.addEventListener("pagehide", () => {
    sendPacket({ type: "lifecycle", state: "pagehide", time: Date.now() });
  });

  if (!("RTCPeerConnection" in window)) {
    setState("error", "WebRTC no disponible");
    log("Este navegador no expone RTCPeerConnection.");
  } else {
    log("ML3D Link Lab listo. Protocolo manual v1.");
  }
})();
