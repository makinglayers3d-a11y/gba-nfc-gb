(() => {
  'use strict';
  if (window.__ml3dAvatarCustomizerV2Loader) return;
  window.__ml3dAvatarCustomizerV2Loader = true;
  const script=document.createElement('script');
  script.src='./avatar-customizer-v2.js?v=2';
  script.defer=true;
  document.head.appendChild(script);
})();
