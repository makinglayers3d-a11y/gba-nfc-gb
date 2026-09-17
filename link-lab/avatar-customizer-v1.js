(() => {
  'use strict';
  if (window.__ml3dAvatarCustomizerStableLoader) return;
  window.__ml3dAvatarCustomizerStableLoader = true;

  const V2_URL = './avatar-customizer-v2.js?v=3';

  function boot() {
    document.documentElement.classList.remove('ml3d-avatar-v3-active');
    const script = document.createElement('script');
    script.src = V2_URL;
    script.defer = true;
    script.onload = () => {
      window.__ML3DAvatarCustomizerMode = 'modular-v2-stable';
    };
    script.onerror = error => {
      console.error('[ML3D avatar] No se pudo cargar el personalizador modular estable.', error);
    };
    document.head.appendChild(script);
  }

  boot();
})();
