(() => {
  "use strict";

  if (window.__ml3dAvatarMotionSmoothing) return;
  window.__ml3dAvatarMotionSmoothing = true;

  const style = document.createElement("style");
  style.textContent = `
    /* rooms.js actualiza left/top por pasos cada 55 ms. Interpolamos el
       elemento jugador completo entre esos puntos; las poses del sprite
       permanecen nítidas y no se mezclan entre sí. */
    #playersLayer .player {
      transition-property: left, top !important;
      transition-duration: 62ms !important;
      transition-timing-function: linear !important;
      transition-delay: 0ms !important;
      will-change: left, top;
    }

    /* v5 ya no necesita compensar por píxeles una posición que rooms.js
       expresa en porcentajes. El desplazamiento suave lo hace el player. */
    #playersLayer .avatar-v5-canvas {
      margin-left: 0 !important;
      bottom: 0 !important;
    }

    /* En reposo damos un pequeño margen óptico al raster completo. No se
       toca ningún frame ni la animación: simplemente evitamos que detalles
       laterales, como la oreja, queden pegados al borde del canvas visible. */
    #playersLayer .player:not(.ml3d-walking) .avatar-v5-canvas {
      transform: translateX(-50%) scale(0.94) !important;
      transform-origin: 50% 100% !important;
    }
  `;
  document.head.appendChild(style);
})();
