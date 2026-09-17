(() => {
  'use strict';
  if (window.__ml3dAvatarCustomizerV3Loader) return;
  window.__ml3dAvatarCustomizerV3Loader = true;

  const root = document.documentElement;
  let loading = false;
  let loaded = false;

  function cleanupV3() {
    document.querySelectorAll(
      '#avatarCustomizerV3,' +
      '.avatar-v3-skin-canvas,.avatar-v3-layer-canvas,' +
      '.avatar-v3-skin-preview,.avatar-v3-layer-preview'
    ).forEach(node => node.remove());
  }

  function fallback(error) {
    console.error('[ML3D avatar] Fallo al cargar personalizador atlas v3.', error || 'unknown');
    cleanupV3();
    root.classList.remove('ml3d-avatar-v3-active');
    root.classList.add('ml3d-avatar-base-only');
    window.__ML3DAvatarCustomizerMode = 'base-only-safe';
  }

  function loadV3() {
    if (loading || loaded || !document.getElementById('avatarFinalBase')) return;
    loading = true;
    root.classList.remove('ml3d-avatar-base-only');
    root.classList.add('ml3d-avatar-v3-active');
    window.__ML3DAvatarCustomizerMode = 'atlas-v3-loading';

    const script = document.createElement('script');
    script.src = './avatar-customizer-v3.js?v=7';
    script.defer = true;
    script.onload = () => {
      loading = false;
      loaded = true;
      window.__ML3DAvatarCustomizerMode = 'atlas-v3-fit';
      window.ML3DAvatarCustomizerV3?.ensureEditor?.();
      window.ML3DAvatarCustomizerV3?.refreshEditor?.();
    };
    script.onerror = error => {
      loading = false;
      fallback(error);
    };
    document.head.appendChild(script);
  }

  function waitForEditor() {
    if (document.getElementById('avatarFinalBase')) {
      requestAnimationFrame(() => setTimeout(loadV3, 80));
      return;
    }
    const observer = new MutationObserver(() => {
      if (!document.getElementById('avatarFinalBase')) return;
      observer.disconnect();
      requestAnimationFrame(() => setTimeout(loadV3, 80));
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  function boot() {
    root.classList.remove('ml3d-avatar-base-only');
    root.classList.add('ml3d-avatar-v3-active');
    waitForEditor();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
