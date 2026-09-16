# ML3D Link Lab

Laboratorio aislado para desarrollar un cable Link virtual sin modificar todavía el emulador normal.

## Fases disponibles

### Fase 1 — señalización manual

`index.html` mantiene la prueba de `RTCDataChannel` mediante copiar/pegar oferta y respuesta.

### Fase 2 — salas cercanas

`rooms.html` añade:

- Crear sala con nombre.
- Juego opcional.
- Contraseña opcional.
- Capacidad de 2, 3 o 4 jugadores.
- Publicación por cercanía.
- Búsqueda por radio (500 m, 1 km, 5 km o 10 km).
- Señalización WebRTC automática mediante el Worker `cloudflare-link-worker/`.
- STUN de Cloudflare para mejorar la conexión entre redes/NAT.
- Mensajes y ping para validar el canal antes de integrar un núcleo de emulación.

La posición del host se redondea en el Worker antes de guardarse y el buscador solo recibe una distancia aproximada.

## Backend

La fase 2 necesita desplegar `cloudflare-link-worker/` como Worker separado con una D1 propia llamada `ml3d-link-lab`. No reutiliza el Worker ni la D1 del acceso promocional.

## Todavía pendiente

Todavía NO hay emulación del puerto serie GBA ni sincronización de IodineGBA/binjgb. La fase de salas valida descubrimiento, autenticación, señalización y transporte. Cuando sea estable, el siguiente paso será conectar un núcleo GBA con soporte Link al `RTCDataChannel`.
