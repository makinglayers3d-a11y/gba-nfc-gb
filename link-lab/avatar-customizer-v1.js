(() => {
  'use strict';
  if (window.__ml3dAvatarCustomizerV3Loader) return;
  window.__ml3dAvatarCustomizerV3Loader = true;

  const root=document.documentElement;
  let loading=false,loaded=false;

  function fallback(error){
    console.error('[ML3D avatar] Fallo al cargar personalizador modular.',error||'unknown');
    root.classList.remove('ml3d-avatar-v3-active');
    root.classList.add('ml3d-avatar-base-only');
    window.__ML3DAvatarCustomizerMode='base-only-safe';
  }

  function loadV3(){
    if(loading||loaded||!document.getElementById('avatarFinalBase'))return;
    loading=true;
    root.classList.remove('ml3d-avatar-base-only');
    root.classList.add('ml3d-avatar-v3-active');
    window.__ML3DAvatarCustomizerMode='atlas-v3-loading';
    const script=document.createElement('script');
    script.src='./avatar-customizer-v3.js?v=8';
    script.defer=true;
    script.onload=()=>{loading=false;loaded=true;window.__ML3DAvatarCustomizerMode='unified-v3';window.ML3DAvatarCustomizerV3?.refresh?.(true)};
    script.onerror=e=>{loading=false;fallback(e)};
    document.head.appendChild(script);
  }

  function wait(){
    if(document.getElementById('avatarFinalBase')){requestAnimationFrame(()=>setTimeout(loadV3,80));return;}
    const ob=new MutationObserver(()=>{if(!document.getElementById('avatarFinalBase'))return;ob.disconnect();requestAnimationFrame(()=>setTimeout(loadV3,80));});
    ob.observe(document.body,{childList:true,subtree:true});
  }

  function boot(){root.classList.remove('ml3d-avatar-base-only');root.classList.add('ml3d-avatar-v3-active');wait();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
