(() => {
  "use strict";
  if (window.__ml3dLinkLoaderStarted) return;
  window.__ml3dLinkLoaderStarted = true;
  const parts = Array.from({ length: 7 }, (_, i) => `assets/ml3d-link/emulator-code/part-${String(i).padStart(2, "0")}.txt`);
  Promise.all(parts.map(async (url) => {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.text();
  })).then((chunks) => {
    const blob = new Blob([chunks.join("")], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const script = document.createElement("script");
    script.src = url;
    script.dataset.ml3dLinkRuntime = "true";
    script.onload = () => URL.revokeObjectURL(url);
    script.onerror = () => {
      URL.revokeObjectURL(url);
      console.error("ML3D Link: no se pudo iniciar el runtime integrado.");
    };
    document.head.appendChild(script);
  }).catch((error) => console.error("ML3D Link loader:", error));
})();
