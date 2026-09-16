(() => {
  "use strict";

  // Hotfix: evita bucles de MutationObserver provocados por cambios de style/class
  // dentro de playersLayer. El renderer base ya se repinta por requestAnimationFrame.
  const players = document.getElementById("playersLayer");
  if (!players || players.__ml3dBaseObserverHotfix) return;
  players.__ml3dBaseObserverHotfix = true;

  // Marca el contenedor para que avatar-base.js pueda detectar que solo debe
  // reaccionar a altas/bajas de nodos, no a atributos visuales.
  players.dataset.ml3dBaseObserverMode = "childlist";
})();
