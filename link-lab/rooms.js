(() => {
  "use strict";
  const DEFAULT_API_BASE = "https://ml3d-link-lab.makinglayers3d.workers.dev";
  const ICE_SERVERS = [{ urls: ["stun:stun.cloudflare.com:3478"] }];
  const $ = (s) => document.querySelector(s);
  const statusText = $("#statusText"), errorBox = $("#errorBox"), logEl = $("#log");
  const sendButton = $("#send"), pingButton = $("#ping"), pingResult = $("#pingResult");
  let selectedRoom = null, hostSession = null, joinSession = null;
  const pingIds = new Map();

  function log(message) {
    const t = new Date().toLocaleTimeString();
    logEl.textContent += `[${t}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }
  function setState(state, text) {
    document.body.dataset.state = state;
    statusText.textContent = text;
    if (state !== "error") { errorBox.hidden = true; errorBox.textContent = ""; }
  }
  function fail(error, title = "Error") {
    const message = error?.message || String(error);
    setState("error", title);
    errorBox.hidden = false;
    errorBox.textContent = message;
    log(`ERROR: ${message}`);
  }
  function apiBase() { return $("#apiBase").value.trim().replace(/\/+$/, ""); }
  async function api(path, { method = "GET", body, token } = {}) {
    const base = apiBase();
    if (!base) throw new Error("Configura primero la URL de la API ML3D Link.");
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Este navegador no ofrece ubicación."));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        (err) => reject(new Error(`No se pudo obtener la ubicación: ${err.message}`)),
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 }
      );
    });
  }
  function waitIce(peer) {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; peer.removeEventListener("icegatheringstatechange", onChange); resolve(); };
      const onChange = () => { if (peer.iceGatheringState === "complete") finish(); };
      peer.addEventListener("icegatheringstatechange", onChange);
      setTimeout(finish, 10000);
    });
  }
  function serialize(desc) { return JSON.stringify({ type: desc.type, sdp: desc.sdp }); }
  function parseDescription(value, expected) {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || parsed.type !== expected || typeof parsed.sdp !== "string") throw new Error(`Descripción ${expected} no válida.`);
    return parsed;
  }
  function makePeer(label, onChannel) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.addEventListener("connectionstatechange", () => log(`${label}: peer ${pc.connectionState}`));
    pc.addEventListener("iceconnectionstatechange", () => log(`${label}: ICE ${pc.iceConnectionState}`));
    pc.addEventListener("datachannel", (event) => onChannel(event.channel));
    return pc;
  }
  function openChannels() {
    const list = [];
    if (hostSession) for (const peer of hostSession.peers.values()) if (peer.channel?.readyState === "open") list.push(peer.channel);
    if (joinSession?.channel?.readyState === "open") list.push(joinSession.channel);
    return list;
  }
  function updateChannelButtons() {
    const ready = openChannels().length > 0;
    sendButton.disabled = !ready;
    pingButton.disabled = !ready;
  }
  function attachChannel(channel, label, connectedCallback) {
    channel.binaryType = "arraybuffer";
    channel.addEventListener("open", async () => {
      log(`${label}: canal abierto.`);
      setState("connected", "LINK CONECTADO");
      updateChannelButtons();
      try { await connectedCallback?.(); } catch (e) { log(`${label}: no se pudo confirmar conectado: ${e.message}`); }
      channel.send(JSON.stringify({ type: "hello", version: 1, label, time: Date.now() }));
    });
    channel.addEventListener("close", () => {
      log(`${label}: canal cerrado.`);
      updateChannelButtons();
      if (!openChannels().length) setState("idle", "Sin enlace activo");
    });
    channel.addEventListener("message", (event) => {
      let packet;
      try { packet = JSON.parse(event.data); } catch { log(`${label}: ${event.data}`); return; }
      if (packet.type === "ping") channel.send(JSON.stringify({ type: "pong", id: packet.id }));
      else if (packet.type === "pong") {
        const started = pingIds.get(packet.id);
        if (started) {
          const ms = Math.round(performance.now() - started);
          pingIds.delete(packet.id);
          pingResult.textContent = `Ping: ${ms} ms`;
          log(`${label}: ping ${ms} ms`);
        }
      } else if (packet.type === "message") log(`${label}: ${packet.text}`);
      else if (packet.type === "hello") log(`${label}: handshake ML3D Link recibido.`);
    });
  }
  async function checkApi() {
    try {
      $("#apiStatus").textContent = "Comprobando…";
      const data = await api("/v1/health");
      $("#apiStatus").textContent = `${data.service} · API v${data.apiVersion} · OK`;
      log("API de salas disponible.");
    } catch (e) {
      $("#apiStatus").textContent = `No disponible: ${e.message}`;
      fail(e, "API no disponible");
    }
  }
  function stopHostTimers() {
    if (!hostSession) return;
    clearInterval(hostSession.pollTimer);
    clearInterval(hostSession.heartbeatTimer);
  }
  async function createRoom() {
    try {
      setState("working", "Obteniendo ubicación…");
      const loc = await getLocation();
      setState("working", "Creando sala…");
      const data = await api("/v1/rooms", { method: "POST", body: {
        name: $("#roomName").value, game: $("#gameName").value, password: $("#roomPassword").value,
        maxPlayers: Number($("#maxPlayers").value), lat: loc.lat, lon: loc.lon
      }});
      hostSession = { room: data.room, token: data.hostToken, peers: new Map(), pollBusy: false };
      $("#hostPanel").hidden = false;
      $("#hostRoomTitle").textContent = data.room.name;
      $("#hostRoomCode").textContent = `Código: ${data.room.id} · ${data.room.maxPlayers} jugadores${data.room.locked ? " · 🔒" : ""}`;
      setState("working", "Sala publicada · esperando jugadores");
      log(`Sala ${data.room.id} creada. Precisión del navegador: ~${Math.round(loc.accuracy)} m.`);
      hostSession.pollTimer = setInterval(pollHostJoins, 1200);
      hostSession.heartbeatTimer = setInterval(() => api(`/v1/rooms/${encodeURIComponent(data.room.id)}/heartbeat`, { method: "POST", token: data.hostToken }).catch((e) => log(`Heartbeat host: ${e.message}`)), 20000);
      await pollHostJoins();
    } catch (e) { fail(e, "No se pudo crear la sala"); }
  }
  async function pollHostJoins() {
    if (!hostSession || hostSession.pollBusy) return;
    hostSession.pollBusy = true;
    try {
      const { room, token, peers } = hostSession;
      const data = await api(`/v1/rooms/${encodeURIComponent(room.id)}/joins`, { token });
      renderHostPlayers(data.joins);
      for (const join of data.joins) {
        if (join.status === "requested" && !peers.has(join.id)) await prepareHostOffer(join);
        const peer = peers.get(join.id);
        if (join.status === "answer_ready" && peer && !peer.answerApplied && join.answer) {
          await peer.pc.setRemoteDescription(parseDescription(join.answer, "answer"));
          peer.answerApplied = true;
          log(`Host: respuesta aplicada para ${join.displayName}.`);
        }
      }
    } catch (e) { log(`Polling host: ${e.message}`); }
    finally { if (hostSession) hostSession.pollBusy = false; }
  }
  function renderHostPlayers(joins) {
    const box = $("#hostPlayers");
    if (!joins.length) { box.textContent = "Esperando jugadores…"; return; }
    box.innerHTML = joins.map((j) => `<div class="room"><strong>${escapeHtml(j.displayName)}</strong><div class="badges"><span class="badge">${escapeHtml(j.status)}</span></div></div>`).join("");
  }
  async function prepareHostOffer(join) {
    const { room, token, peers } = hostSession;
    const peerInfo = { pc: null, channel: null, answerApplied: false };
    const pc = makePeer(`Host↔${join.displayName}`, () => {});
    peerInfo.pc = pc;
    const channel = pc.createDataChannel("ml3d-link", { ordered: true });
    peerInfo.channel = channel;
    attachChannel(channel, `Host↔${join.displayName}`, () => api(`/v1/rooms/${encodeURIComponent(room.id)}/joins/${encodeURIComponent(join.id)}/connected`, { method: "POST", token }));
    peers.set(join.id, peerInfo);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIce(pc);
    await api(`/v1/rooms/${encodeURIComponent(room.id)}/joins/${encodeURIComponent(join.id)}/offer`, { method: "POST", token, body: { offer: serialize(pc.localDescription) } });
    log(`Host: oferta preparada para ${join.displayName}.`);
  }
  async function closeRoom() {
    if (!hostSession) return;
    const { room, token, peers } = hostSession;
    try { await api(`/v1/rooms/${encodeURIComponent(room.id)}/close`, { method: "POST", token }); } catch (e) { log(`Cerrar sala: ${e.message}`); }
    stopHostTimers();
    for (const peer of peers.values()) try { peer.pc.close(); } catch {}
    hostSession = null;
    $("#hostPanel").hidden = true;
    updateChannelButtons();
    setState("idle", "Sala cerrada");
  }
  async function searchRooms() {
    try {
      setState("working", "Buscando cerca…");
      const loc = await getLocation();
      const radiusKm = Number($("#radius").value);
      const data = await api(`/v1/rooms/nearby?lat=${encodeURIComponent(loc.lat)}&lon=${encodeURIComponent(loc.lon)}&radiusKm=${encodeURIComponent(radiusKm)}`);
      renderRooms(data.rooms);
      setState("idle", data.rooms.length ? `${data.rooms.length} sala(s) encontrada(s)` : "No hay salas cercanas");
    } catch (e) { fail(e, "No se pudieron buscar salas"); }
  }
  function renderRooms(rooms) {
    const box = $("#roomsList");
    if (!rooms.length) { box.innerHTML = '<p class="hint">No hay salas disponibles dentro de ese radio.</p>'; return; }
    box.innerHTML = rooms.map((room) => {
      const distance = room.distanceMeters < 1000 ? `${room.distanceMeters} m` : `${(room.distanceMeters / 1000).toFixed(1)} km`;
      const full = room.players >= room.maxPlayers;
      return `<div class="room"><div class="room-head"><div><div class="room-title">${escapeHtml(room.name)}</div><div class="hint">${escapeHtml(room.game || "Juego no indicado")}</div></div><div>${room.locked ? "🔒" : ""}</div></div><div class="badges"><span class="badge">${distance}</span><span class="badge">${room.players}/${room.maxPlayers}</span><span class="badge">${escapeHtml(room.id)}</span></div><button data-room-id="${escapeHtml(room.id)}" ${full ? "disabled" : ""}>${full ? "SALA COMPLETA" : "UNIRME"}</button></div>`;
    }).join("");
    box.querySelectorAll("button[data-room-id]").forEach((button) => button.addEventListener("click", () => selectRoom(rooms.find((r) => r.id === button.dataset.roomId))));
  }
  function selectRoom(room) {
    selectedRoom = room;
    $("#joinCard").hidden = false;
    $("#joinRoomInfo").textContent = `${room.name}${room.game ? ` · ${room.game}` : ""} · ${room.players}/${room.maxPlayers}`;
    $("#joinPasswordWrap").hidden = !room.locked;
    $("#joinPassword").value = "";
    $("#joinCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function joinSelectedRoom() {
    if (!selectedRoom) return;
    try {
      setState("working", "Solicitando entrada…");
      const data = await api(`/v1/rooms/${encodeURIComponent(selectedRoom.id)}/join`, { method: "POST", body: { password: $("#joinPassword").value, displayName: $("#playerName").value } });
      joinSession = { room: selectedRoom, join: data.join, token: data.joinToken, pc: null, channel: null, answerSent: false, pollBusy: false };
      setState("working", "Esperando al host…");
      log(`Solicitud enviada a ${selectedRoom.name}.`);
      joinSession.pollTimer = setInterval(pollJoinState, 1000);
      joinSession.heartbeatTimer = setInterval(() => api(`/v1/rooms/${encodeURIComponent(selectedRoom.id)}/joins/${encodeURIComponent(data.join.id)}/heartbeat`, { method: "POST", token: data.joinToken }).catch((e) => log(`Heartbeat jugador: ${e.message}`)), 20000);
      await pollJoinState();
    } catch (e) { fail(e, "No se pudo entrar en la sala"); }
  }
  async function pollJoinState() {
    if (!joinSession || joinSession.pollBusy) return;
    joinSession.pollBusy = true;
    try {
      const { room, join, token } = joinSession;
      const data = await api(`/v1/rooms/${encodeURIComponent(room.id)}/joins/${encodeURIComponent(join.id)}`, { token });
      const state = data.join;
      if (state.status === "offer_ready" && state.offer && !joinSession.answerSent) await answerHostOffer(state.offer);
      else if (state.status === "connected") setState("connected", "LINK CONECTADO");
    } catch (e) { log(`Polling jugador: ${e.message}`); }
    finally { if (joinSession) joinSession.pollBusy = false; }
  }
  async function answerHostOffer(offerText) {
    const { room, join, token } = joinSession;
    const pc = makePeer(`Jugador↔${room.name}`, (channel) => {
      joinSession.channel = channel;
      attachChannel(channel, `Jugador↔${room.name}`, () => api(`/v1/rooms/${encodeURIComponent(room.id)}/joins/${encodeURIComponent(join.id)}/connected`, { method: "POST", token }));
    });
    joinSession.pc = pc;
    await pc.setRemoteDescription(parseDescription(offerText, "offer"));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIce(pc);
    await api(`/v1/rooms/${encodeURIComponent(room.id)}/joins/${encodeURIComponent(join.id)}/answer`, { method: "POST", token, body: { answer: serialize(pc.localDescription) } });
    joinSession.answerSent = true;
    setState("working", "Respuesta enviada · conectando…");
    log("Jugador: respuesta WebRTC enviada al host.");
  }
  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  }

  $("#saveApi").addEventListener("click", () => { localStorage.setItem("ml3d-link-api", apiBase()); $("#apiStatus").textContent = "API guardada en este navegador."; });
  $("#checkApi").addEventListener("click", checkApi);
  $("#createRoom").addEventListener("click", createRoom);
  $("#closeRoom").addEventListener("click", closeRoom);
  $("#searchRooms").addEventListener("click", searchRooms);
  $("#joinRoom").addEventListener("click", joinSelectedRoom);
  sendButton.addEventListener("click", () => {
    const text = $("#message").value.trim();
    if (!text) return;
    const channels = openChannels();
    for (const channel of channels) channel.send(JSON.stringify({ type: "message", text, time: Date.now() }));
    log(`Enviado a ${channels.length} enlace(s): ${text}`);
  });
  pingButton.addEventListener("click", () => {
    const started = performance.now();
    for (const channel of openChannels()) {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      pingIds.set(id, started);
      channel.send(JSON.stringify({ type: "ping", id }));
    }
  });
  window.addEventListener("pagehide", () => {
    stopHostTimers();
    if (joinSession) { clearInterval(joinSession.pollTimer); clearInterval(joinSession.heartbeatTimer); }
  });
  $("#apiBase").value = localStorage.getItem("ml3d-link-api") || DEFAULT_API_BASE;
  log("ML3D Link Salas listo. Necesita API de señalización y permiso de ubicación.");
})();
