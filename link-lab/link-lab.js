(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);

  const statusText = $("#statusText");
  const errorDetail = $("#errorDetail");
  const logEl = $("#log");
  const localOffer = $("#localOffer");
  const remoteOffer = $("#remoteOffer");
  const localAnswer = $("#localAnswer");
  const remoteAnswer = $("#remoteAnswer");
  const messageInput = $("#message");
  const sendButton = $("#send");
  const pingButton = $("#ping");
  const pingResult = $("#pingResult");

  const SIGNAL_PREFIX = "ML3D1.";

  let pc = null;
  let channel = null;
  let pingStartedAt = 0;

  function log(message) {
    const time = new Date().toLocaleTimeString();
    logEl.textContent += `[${time}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clearError() {
    if (!errorDetail) return;
    errorDetail.hidden = true;
    errorDetail.textContent = "";
  }

  function showError(message) {
    if (!errorDetail) return;
    errorDetail.hidden = false;
    errorDetail.textContent = message;
  }

  function setState(state, text) {
    document.body.dataset.linkState = state;
    statusText.textContent = text;
    if (state !== "error") clearError();
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
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        peer.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      };

      const onStateChange = () => {
        if (peer.iceGatheringState === "complete") finish();
      };

      peer.addEventListener("icegatheringstatechange", onStateChange);
      window.setTimeout(finish, 10000);
    });
  }

  function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";

    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  function fromBase64Url(value) {
    let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new TextDecoder().decode(bytes);
  }

  function serializeDescription(description) {
    const json = JSON.stringify({
      type: description.type,
      sdp: description.sdp
    });

    return `${SIGNAL_PREFIX}${toBase64Url(json)}`;
  }

  function parseDescription(text, expectedType) {
    let value = String(text || "").trim();

    if (!value) {
      throw new Error("No hay ningún código pegado.");
    }

    let parsed;

    try {
      if (value.startsWith(SIGNAL_PREFIX)) {
        value = fromBase64Url(value.slice(SIGNAL_PREFIX.length));
      }

      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error("El código está incompleto o se ha modificado al copiarlo.");
    }

    if (!parsed || typeof parsed.type !== "string" || typeof parsed.sdp !== "string") {
      throw new Error("Descripción WebRTC no válida.");
    }

    if (expectedType && parsed.type !== expectedType) {
      throw new Error(`Se esperaba una ${expectedType}, pero se recibió ${parsed.type}.`);
    }

    if (!parsed.sdp.startsWith("v=0")) {
      throw new Error("El SDP recibido no parece válido.");
    }

    return { type: parsed.type, sdp: parsed.sdp };
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
        version: 2,
        time: Date.now()
      });
    });

    channel.addEventListener("close", () => {
      setChannelReady(false);
      setState("idle", "Canal cerrado");
      log("Canal ML3D Link cerrado.");
    });

    channel.addEventListener("error", (event) => {
      const message = event.message || "Error desconocido del canal.";
      setState("error", "Error de canal");
      showError(message);
      log(`Error del canal: ${message}`);
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

      if (packet.type === "hello") {
        log(`Handshake ML3D Link v${packet.version || "?"} recibido.`);
        return;
      }

      log(`Paquete remoto: ${JSON.stringify(packet)}`);
    });
  }

  function createPeerConnection() {
    closePeer(false);

    pc = new RTCPeerConnection({ iceServers: [] });

    pc.addEventListener("signalingstatechange", () => {
      log(`Signaling: ${pc ? pc.signalingState : "closed"}`);
    });

    pc.addEventListener("connectionstatechange", () => {
      if (!pc) return;

      log(`PeerConnection: ${pc.connectionState}`);

      if (pc.connectionState === "connecting") {
        setState("connecting", "Conectando peer…");
      } else if (pc.connectionState === "connected") {
        setState("connecting", "Peer conectado · abriendo canal…");
      } else if (["failed", "disconnected"].includes(pc.connectionState)) {
        setState("error", "Conexión interrumpida");
        showError(`PeerConnection: ${pc.connectionState}`);
      } else if (pc.connectionState === "closed") {
        setState("idle", "Sin conexión");
      }
    });

    pc.addEventListener("iceconnectionstatechange", () => {
      if (!pc) return;
      log(`ICE: ${pc.iceConnectionState}`);
    });

    pc.addEventListener("icegatheringstatechange", () => {
      if (!pc) return;
      log(`ICE gathering: ${pc.iceGatheringState}`);
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
      clearError();
      setState("connecting", "Generando oferta…");
      const peer = createPeerConnection();

      attachChannel(peer.createDataChannel("ml3d-link", {
        ordered: true
      }));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGatheringComplete(peer);

      if (!peer.localDescription || peer.localDescription.type !== "offer") {
        throw new Error("El navegador no conservó la oferta local.");
      }

      localOffer.value = serializeDescription(peer.localDescription);
      setState("idle", "Oferta lista");
      log(`Oferta creada (${localOffer.value.length} caracteres). Cópiala completa al dispositivo B.`);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setState("error", "No se pudo crear la oferta");
      showError(message);
      log(`ERROR: ${message}`);
    }
  }

  async function createAnswer() {
    try {
      clearError();
      const offer = parseDescription(remoteOffer.value, "offer");
      setState("connecting", "Procesando oferta…");

      const peer = createPeerConnection();
      await peer.setRemoteDescription(offer);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await waitForIceGatheringComplete(peer);

      if (!peer.localDescription || peer.localDescription.type !== "answer") {
        throw new Error("El navegador no conservó la respuesta local.");
      }

      localAnswer.value = serializeDescription(peer.localDescription);
      setState("connecting", "Respuesta lista · envíala a A");
      log(`Respuesta creada (${localAnswer.value.length} caracteres). Devuélvela completa al dispositivo A.`);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setState("error", "No se pudo generar la respuesta");
      showError(message);
      log(`ERROR: ${message}`);
    }
  }

  async function applyAnswer() {
    try {
      clearError();

      if (!pc) {
        throw new Error("La oferta activa de A ya no existe. Pulsa CREAR OFERTA de nuevo y repite el intercambio sin recargar la página.");
      }

      if (pc.signalingState !== "have-local-offer") {
        throw new Error(`A no está esperando una respuesta (estado: ${pc.signalingState}). Crea una oferta nueva y vuelve a intentarlo.`);
      }

      const answer = parseDescription(remoteAnswer.value, "answer");
      log(`Aplicando respuesta. Estado previo: ${pc.signalingState}.`);

      await pc.setRemoteDescription(answer);

      setState("connecting", "Respuesta aplicada · abriendo enlace…");
      log(`Respuesta aplicada correctamente. Signaling: ${pc.signalingState}. Esperando apertura del canal.`);
    } catch (error) {
      const name = error && error.name ? `${error.name}: ` : "";
      const message = `${name}${error && error.message ? error.message : String(error)}`;
      setState("error", "No se pudo aplicar la respuesta");
      showError(message);
      log(`ERROR al aplicar respuesta: ${message}`);
    }
  }

  async function copyText(textarea, label) {
    if (!textarea.value) return;

    try {
      await navigator.clipboard.writeText(textarea.value);
      log(`${label} copiada al portapapeles (${textarea.value.length} caracteres).`);
    } catch (_) {
      textarea.focus();
      textarea.select();
      log(`No se pudo copiar automáticamente. ${label} seleccionada: usa Copiar del navegador.`);
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
    showError("Este navegador no expone RTCPeerConnection.");
    log("Este navegador no expone RTCPeerConnection.");
  } else {
    log("ML3D Link Lab listo. Protocolo manual v2.");
  }
})();
