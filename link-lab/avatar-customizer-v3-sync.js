(() => {
  'use strict';
  if (window.__ml3dAvatarCustomizerV3Sync) return;
  window.__ml3dAvatarCustomizerV3Sync = true;

  const remoteProfiles = new Map();
  const cleanName = value => String(value || '').replace(/ ★$/,'').trim().slice(0,32);
  const accessoryMap = { cap:'cap', glasses:'glasses', headphones:'headphones', scarf:'scarf', shoulderbag:'shoulderbag', backpack:'backpack', beret:'beanie', bow:'bow', beanie:'beanie' };

  function normalize(raw={}) {
    const api = window.ML3DAvatarCustomizerV3;
    const defaults = api?.defaults || {};
    const p = { ...defaults, ...raw };
    p.topColor ||= p.primary || defaults.topColor;
    p.topAccent ||= p.secondary || defaults.topAccent;
    p.bottomColor ||= p.primary || defaults.bottomColor;
    p.bottomAccent ||= p.secondary || defaults.bottomAccent;
    p.shoesColor ||= defaults.shoesColor;
    p.shoesAccent ||= defaults.shoesAccent;
    p.accessoryColor ||= p.primary || defaults.accessoryColor;
    p.accessoryAccent ||= p.secondary || defaults.accessoryAccent;
    if (!p.customAccessory || p.customAccessory === 'none') p.customAccessory = accessoryMap[p.accessory] || 'none';
    return p;
  }

  function remember(raw, fallbackName='') {
    if (!raw) return;
    const profile = normalize(raw);
    const name = cleanName(profile.name || fallbackName);
    if (!name) return;
    profile.name = name;
    remoteProfiles.set(name, profile);
  }

  function capture(event) {
    try {
      const packet = typeof event?.data === 'string' ? JSON.parse(event.data) : null;
      if (!packet) return;
      if (packet.type === 'avatar:final' && packet.profile) remember(packet.profile);
      if (packet.type === 'lobby:snapshot' && packet.avatarFinal) {
        for (const [name, value] of Object.entries(packet.avatarFinal)) remember(value, name);
      }
      if (packet.type === 'lobby:player' && packet.avatarFinal) remember(packet.avatarFinal, packet.player?.name);
    } catch {}
  }

  function watchChannel(channel) {
    if (!channel || channel.__ml3dV3SyncWatched) return;
    channel.__ml3dV3SyncWatched = true;
    try { channel.addEventListener('message', capture); } catch {}
  }

  const previousCreate = RTCPeerConnection.prototype.createDataChannel;
  RTCPeerConnection.prototype.createDataChannel = function(...args) {
    const channel = previousCreate.apply(this,args);
    watchChannel(channel);
    return channel;
  };

  const previousPcAdd = RTCPeerConnection.prototype.addEventListener;
  RTCPeerConnection.prototype.addEventListener = function(type, listener, options) {
    if (type !== 'datachannel') return previousPcAdd.call(this,type,listener,options);
    return previousPcAdd.call(this,type,function(event) {
      watchChannel(event.channel);
      return listener.call(this,event);
    },options);
  };

  function playerName(player) {
    return cleanName(player.querySelector('.player-name-text')?.textContent);
  }

  function renderRemote() {
    const api = window.ML3DAvatarCustomizerV3;
    if (!api) return;
    document.querySelectorAll('#playersLayer .player:not(.local)').forEach(player => {
      const raw = remoteProfiles.get(playerName(player));
      if (!raw) return;
      const p = normalize(raw);
      const host = player.querySelector(':scope > .avatar-base-host');
      const base = host?.querySelector(':scope > .avatar-v5-canvas');
      if (!host || !base) return;
      const state = api.parsePaintKey(base);
      const signature = JSON.stringify([state.dir,state.frame,p.base,p.skin,p.hair,p.hairColor,p.top,p.topColor,p.topAccent,p.bottom,p.bottomColor,p.bottomAccent,p.shoes,p.shoesColor,p.shoesAccent,p.customAccessory,p.accessoryColor,p.accessoryAccent]);
      if (host.dataset.avatarV3RemoteSignature === signature) return;
      host.dataset.avatarV3RemoteSignature = signature;
      const skin = api.ensureCanvas(host,'avatar-v3-skin-canvas');
      const layers = api.ensureCanvas(host,'avatar-v3-layer-canvas');
      api.skinMask(base,skin,p.skin);
      api.drawComposite(layers,p,state.dir,state.frame);
    });
  }

  setInterval(renderRemote,32);
  window.ML3DAvatarRemoteProfilesV3 = remoteProfiles;
})();
