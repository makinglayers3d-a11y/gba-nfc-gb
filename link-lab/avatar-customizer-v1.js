(() => {
  'use strict';
  if (window.__ml3dAvatarCustomizerV3Loader) return;
  window.__ml3dAvatarCustomizerV3Loader = true;

  const root = document.documentElement;
  const cleanupV3 = () => {
    document.querySelectorAll(
      '#avatarCustomizerV3,' +
      '.avatar-v3-skin-canvas,.avatar-v3-layer-canvas,' +
      '.avatar-v3-skin-preview,.avatar-v3-layer-preview'
    ).forEach(node => node.remove());
  };

  function fallback(error) {
    console.error('[ML3D avatar] Fallo al cargar personalizador atlas v3.', error || 'unknown');
    cleanupV3();
    root.classList.remove('ml3d-avatar-v3-active');
    root.classList.add('ml3d-avatar-base-only');
    window.__ML3DAvatarCustomizerMode = 'base-only-safe';
  }

  function boot() {
    root.classList.remove('ml3d-avatar-base-only');
    root.classList.add('ml3d-avatar-v3-active');
    window.__ML3DAvatarCustomizerMode = 'atlas-v3-loading';

    const script = document.createElement('script');
    script.src = './avatar-customizer-v3.js?v=5';
    script.defer = true;
    script.onload = () => {
      window.__ML3DAvatarCustomizerMode = 'atlas-v3';
    };
    script.onerror = fallback;
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();
