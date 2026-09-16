(() => {
  "use strict";

  const PARTS = [
    "./assets/arena-v7/part-00.txt",
    "./assets/arena-v7/part-01.txt",
    "./assets/arena-v7/part-02.txt",
    "./assets/arena-v7/part-03.txt"
  ];

  async function loadArena() {
    const stage = document.getElementById("lobbyStage");
    if (!stage) return;

    try {
      const chunks = await Promise.all(PARTS.map(async (url) => {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        return (await response.text()).trim();
      }));

      const base64 = chunks.join("");
      if (!base64.startsWith("UklGR")) throw new Error("Cabecera WebP no válida");

      stage.style.setProperty(
        "--ml3d-link-arena",
        `url("data:image/webp;base64,${base64}")`
      );
      stage.classList.add("arena-asset-ready");
    } catch (error) {
      console.error("ML3D Link arena asset:", error);
      stage.classList.add("arena-asset-error");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadArena, { once: true });
  } else {
    loadArena();
  }
})();
