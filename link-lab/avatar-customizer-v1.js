(() => {
  'use strict';
  if (window.__ml3dAvatarCustomizerSafeBase) return;
  window.__ml3dAvatarCustomizerSafeBase = true;

  function cleanup() {
    document.documentElement.classList.remove('ml3d-avatar-v3-active');
    document.documentElement.classList.add('ml3d-avatar-base-only');
    window.__ML3DAvatarCustomizerMode = 'base-only-safe';

    document.querySelectorAll(
      '#avatarCustomizerV2,#avatarCustomizerV3,' +
      '.avatar-custom-skin-canvas,.avatar-custom-layer-canvas,' +
      '.avatar-custom-skin-preview,.avatar-custom-layer-preview,' +
      '.avatar-v3-skin-canvas,.avatar-v3-layer-canvas,' +
      '.avatar-v3-skin-preview,.avatar-v3-layer-preview'
    ).forEach(node => node.remove());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanup, { once:true });
  } else {
    cleanup();
  }
})();
