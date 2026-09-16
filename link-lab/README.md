# ML3D Link Lab

Laboratorio aislado para desarrollar un cable Link virtual sin modificar todavía el emulador normal.

## Fase actual

Fase 1: validar un `RTCDataChannel` WebRTC entre dos navegadores mediante señalización manual.

Todavía NO hay emulación de puerto serie GBA ni sincronización de IodineGBA/binjgb.

## Prueba inicial recomendada

Usa dos dispositivos conectados a la misma red Wi-Fi.

1. Abre `link-lab/` en ambos dispositivos desde una versión publicada de esta rama.
2. En el dispositivo A pulsa `CREAR OFERTA` y copia el texto generado.
3. Pasa ese texto al dispositivo B y pégalo en `Oferta del dispositivo A`.
4. En B pulsa `GENERAR RESPUESTA` y copia la respuesta.
5. Devuelve la respuesta al dispositivo A y pégala en `Respuesta del dispositivo B`.
6. En A pulsa `APLICAR RESPUESTA`.
7. Cuando ambos indiquen `LINK CONECTADO`, prueba `ENVIAR MENSAJE` y `MEDIR PING`.

## Red

Esta primera fase usa:

```js
new RTCPeerConnection({ iceServers: [] })
```

Por tanto no depende de STUN, TURN ni de un servidor de salas. Está pensada para validar primero el transporte en red local. Para conexiones entre redes diferentes se añadirá después señalización automática y STUN/TURN.

## Siguiente fase

Después de validar el canal entre dos dispositivos:

1. Añadir transporte binario y numeración de paquetes.
2. Añadir pausa/reanudación coordinada al ir a segundo plano.
3. Integrar un núcleo GBA con soporte Link en una página separada.
4. Probar dos instancias localmente antes de usar dos dispositivos.
5. Solo después integrar `ML3D LINK` en la interfaz del emulador de pruebas.
