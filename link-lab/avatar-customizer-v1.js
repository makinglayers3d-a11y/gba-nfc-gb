(() => {
  'use strict';
  if (window.__ml3dAvatarCustomizerV3Loader) return;
  window.__ml3dAvatarCustomizerV3Loader = true;

  const B64_URL = './assets/avatar-modular/avatar-modular-atlas-v1.png.b64?v=3';
  const V3_URL = './avatar-customizer-v3.js?v=3';
  const V2_URL = './avatar-customizer-v2.js?v=2';

  function injectScript(src, onload, onerror) {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    if (onload) script.onload = onload;
    if (onerror) script.onerror = onerror;
    document.head.appendChild(script);
    return script;
  }

  function fallback(error) {
    console.warn('[ML3D avatar] v3 no disponible; se mantiene v2.', error || '');
    document.documentElement.classList.remove('ml3d-avatar-v3-active');
    injectScript(V2_URL);
  }

  async function boot() {
    try {
      const atlasResponse = await fetch(B64_URL, { cache:'no-store' });
      if (!atlasResponse.ok) throw new Error(`Atlas HTTP ${atlasResponse.status}`);
      const b64 = (await atlasResponse.text()).replace(/\s+/g, '');
      if (!b64.startsWith('iVBOR')) throw new Error('Payload de atlas no válido');

      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const atlasUrl = URL.createObjectURL(new Blob([bytes], { type:'image/png' }));
      window.__ML3DAvatarAtlasUrl = atlasUrl;

      const sourceResponse = await fetch(V3_URL, { cache:'no-store' });
      if (!sourceResponse.ok) throw new Error(`Customizer v3 HTTP ${sourceResponse.status}`);
      let source = await sourceResponse.text();
      const needle = "const ATLAS_SRC = './assets/avatar-modular/avatar-modular-atlas-v1.png?v=1';";
      if (!source.includes(needle)) throw new Error('No se encontró el punto de montaje del atlas');
      source = source.replace(needle, 'const ATLAS_SRC = window.__ML3DAvatarAtlasUrl;');

      const runtimeUrl = URL.createObjectURL(new Blob([source], { type:'text/javascript' }));
      injectScript(runtimeUrl, () => {
        document.documentElement.classList.add('ml3d-avatar-v3-active');
        URL.revokeObjectURL(runtimeUrl);
      }, () => {
        URL.revokeObjectURL(runtimeUrl);
        URL.revokeObjectURL(atlasUrl);
        fallback(new Error('No se pudo ejecutar el personalizador v3'));
      });

      window.addEventListener('pagehide', () => {
        try { URL.revokeObjectURL(atlasUrl); } catch {}
      }, { once:true });
    } catch (error) {
      fallback(error);
    }
  }

  boot();
})();
