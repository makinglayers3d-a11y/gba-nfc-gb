(() => {
  "use strict";

  const FINAL_URL = "./assets/arena-final/ml3d-link-arena-final-6144x4096.webp?v=1";

  function boot() {
    const stage = document.getElementById("lobbyStage");
    if (!stage) return;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      stage.style.setProperty("--ml3d-link-arena", `url("${FINAL_URL}")`);
      stage.classList.add("arena-asset-ready", "arena-final-ready");
      stage.classList.remove("arena-asset-error");
    };
    image.onerror = () => {
      console.warn("ML3D Link: fondo final no disponible; usando asset anterior como fallback.");
      const fallback = document.createElement("script");
      fallback.src = "./rooms-arena-asset.js?v=1";
      fallback.defer = true;
      document.head.append(fallback);
    };
    image.src = FINAL_URL;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
