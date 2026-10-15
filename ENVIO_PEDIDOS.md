# Envío de pedidos confirmados

`lib/configApp/data.json` define `urlPedidos` con `https://test1.ingelan.cl/lib/controller/pedidos_ws_tbk.controller.php`. Se lee en la configuración existente del catálogo. El envío utiliza POST `?accion=crear`, Content-Type application/json, con la venta completa retornada por SQLite, incluidos número local, fecha, detalle, totales y `venta_id` estable. No llama acciones de activación ni de avance de estado del backend.

Después del guardado local se muestra la pantalla final y se imprime sin esperar el envío. El trabajador de `lib/js/pedidos-envio.js` inicia al cargar la configuración, incluso si después falla el catálogo remoto. Recupera automáticamente todas las ventas locales pendientes, incluidas las anteriores a esta integración; procesa lotes de 20 sin bloquear nuevas ventas.

## Persistencia y reintentos

La cola principal es el SQLite local del sales journal, no solo memoria del navegador. `ventas_envio` guarda estado, intentos fallidos, fecha del siguiente intento y la respuesta del backend. Las ventas sin fila de control se consideran pendientes. `ventasDAO` devuelve el campo `envio` actualizado sin modificar el JSON original ni su huella de idempotencia; el journal y su exportación muestran el estado real de envío.

Un fallo de red, timeout de 12 segundos, HTTP de error o estado diferente de 1 conserva pendiente, incrementa intentos y agenda esperas de 2, 5, 15, 30 y 60 segundos (luego siempre 60). El trabajador revisa pendientes cada 2 segundos, por lo que puede existir hasta ese margen adicional. La espera queda guardada entre reinicios. Si XAMPP no está disponible, el trabajador vuelve a consultar; las ventas continúan en SQLite. Reanuda también al recibir el evento online. No hay procesamiento con el navegador cerrado.

Una respuesta válida estado 1 con identificador y número de pedido marca enviado y conserva `envio.pedido`. Antes de sincronizar SQLite se respalda la confirmación en localStorage (`kiosco_envios_confirmados`), para recuperar un acuse local perdido sin otro POST remoto. Si se pierde cualquier respuesta antes de persistirla, se repite la misma venta: el backend deduplica por venta_id. Pantallas simultáneas pueden repetir un POST, pero no generan otra venta en el backend conforme a ese contrato. Una actualización tardía pendiente no degrada un enviado.

## Comprobante y pantalla final

Mientras no hay respuesta, el comprobante usa el número local y omite el QR. Cuando llega, se actualiza la pantalla final y su vista del ticket con el número remoto y `pedido.url_qr` como imagen PNG; solo se permiten imágenes HTTPS del dominio público test1.ingelan.cl. Se conserva el número local en el journal para conciliación. No se reimprime automáticamente una segunda copia: un ticket ya impreso antes de la respuesta permanece sin QR. Una confirmación de un pedido anterior no altera la pantalla de una nueva compra.

## Verificación manual contra el backend

1. Abrir el kiosco actualizado y completar un pedido del PMV. La pantalla final e impresión deben aparecer sin esperar la red. El journal debe pasar a enviado y mostrar respuesta e intentos en el detalle JSON.
2. Revisar `https://test1.ingelan.cl/cola_pedidos.html?cliente=1&sucursal=2&centro=1`: debe aparecer el número con tipo, productos, cantidades y total correctos. Esta es la cola del backend; las vistas locales cocina/pedidos conservan su propia tabla de estados y no sincronizan cambios remotos.
3. Desconectar Internet dejando XAMPP funcionando. Confirmar otro pedido: queda guardado y pendiente; los intentos aumentan con espera creciente.
4. Cerrar y volver a abrir el kiosco, restablecer Internet y comprobar que se recupera la venta y aparece una sola vez en la cola del backend. Es normal esperar hasta un minuto por el backoff.
5. Copiar `envio.pedido.url_qr` desde el JSON del journal y abrirla en un navegador: debe mostrar el PNG. Escanear con el teléfono y confirmar el avance en la página del backend. El kiosco nunca abre automáticamente la URL que avanza el estado.

## Verificaciones ejecutadas

- `node tests/pedidos-envio.cjs`: POST completo, red caída, respuesta estado 3, timeout, reintentos, recuperación de confirmaciones, no reenvío de enviados y dominio público.
- `node tests/sales-journal.cjs`: SQLite temporal, espera creciente persistida, recuperación, acuse remoto, protección ante respuestas tardías y totales originales intactos; incluye pruebas de cocina local.
- `node tests/boleta.cjs`, `node tests/qr-pantalla.cjs`, `node tests/estructura.cjs`, comprobación de sintaxis JS/PHP.
- OPTIONS real al endpoint público: HTTP 200, Access-Control-Allow-Origin *, métodos GET/POST/OPTIONS y Content-Type permitido.

No se ha ejecutado una venta completa contra el backend real, ni una impresión física ni lectura desde teléfono en esta integración. Las pruebas de envío usan transporte simulado y bases temporales; no crean pedidos ficticios en el backend.
