# Sales journal del PMV

## Uso

Las próximas confirmaciones de pedido del kiosco quedan registradas automáticamente en `lib/db/sales-journal.sqlite`, usando SQLite/PDO ya disponible en XAMPP. Las ventas anteriores a esta implementación no se reconstruyen.

Consultar desde el PC: **http://localhost/carro_compras/?vista=ventas**. El enrutamiento vuelve a la raíz y carga la vista internamente. Elegir fecha inicial/final para ver los pedidos y sus importes por medio de pago, abrir el detalle JSON de una venta o exportar todo el rango. El resumen incluye todo el rango aunque la tabla tenga varias páginas de 1.000 registros.

La consulta y exportación están restringidas al propio equipo (127.0.0.1 / ::1). El archivo de base de datos está bloqueado por Apache y excluido de Git, incluidos sus archivos auxiliares. La base contiene datos operativos: conservarla al actualizar el código. Borrar los datos del navegador no elimina las ventas ya registradas en SQLite.

## Qué se guarda

- Identificador único `venta_id`, versión del contrato y número correlativo de pedido asignado por SQLite. Es un identificador operativo del PMV.
- Cliente, sucursal, centro, moneda CLP y tipo de orden (servir/llevar).
- Fecha y hora del dispositivo, fecha/hora de registro del servidor y zona `America/Santiago`. Los filtros utilizan la fecha del servidor.
- Medio seleccionado, tipo de tarjeta elegido y estado de pago. No se guardan números de tarjeta ni credenciales.
- Producto base, extras y recargo del combo en líneas separadas, con relación a la línea original del carrito. Incluye ID/código de producto cuando existe, descripción, cantidades e ingredientes quitados.
- Precio unitario original y con beneficio, subtotal original, descuento de alianza, descuento de cupón y total de cada línea.
- Empresa de alianza (ID/nombre), porcentaje del cupón y totales generales. No se guarda el token de activación QR.
- Estado de envío `pendiente`, con cero intentos. Todavía no se ejecuta el POST a un backend externo.

La cantidad de unidades cuenta productos y extras; el recargo del combo no agrega unidades ficticias. El cupón se distribuye entre líneas en pesos enteros mediante restos mayores, para que su suma coincida exactamente con el descuento del pedido. Los importes conservan el cálculo vigente del kiosco; no se inventa un desglose tributario que el catálogo no entrega.

## Registro y reintentos

Antes de mostrar “Pedido confirmado” y limpiar el carrito, se prepara una instantánea y se guarda mediante POST JSON en `lib/controller/ventas.controller.php?accion=registrar`. El DAO usa consultas parametrizadas y verifica cantidades, importes, descuentos y cuadratura de totales.

La instantánea pendiente se conserva en localStorage con la clave del carrito más `_venta_pendiente`. Ante un error se mantiene el pedido, se bloquea su reinicio y se ofrece Reintentar. Al recargar, el kiosco intenta recuperar ese registro pendiente. Cada reintento utiliza el mismo ID y los mismos datos: si el servidor ya guardó la venta, devuelve el mismo número; si el ID se reutiliza con otros datos, responde 409. Un doble clic durante el guardado no inicia otra solicitud.

Sólo tras la confirmación del registro se limpian carrito, alianza y estado pendiente. La base local no ofrece operaciones de borrado ni edición desde el reporte.

## Medios de pago y cuadratura

El flujo actual sigue siendo un PMV: la selección de tarjeta/RutPay/MachBank termina por simulación y efectivo deriva a caja. Por eso el journal registra `pago.estado=simulado` para medios electrónicos y `pendiente_caja` para efectivo. El estado del pedido es `pedido_confirmado`, no “cobrado”.

Los totales por medio permiten comparar los pedidos registrados con la caja y otros sistemas; no equivalen por sí solos a efectivo contado ni a liquidaciones bancarias. Al integrar pagos reales, el backend deberá registrar su confirmación y referencia de transacción. Los pedidos cancelados antes de confirmarse no son ventas y no se agregan a este journal.

## Contrato preparado para el POST futuro

La exportación tiene `version`, `desde`, `hasta`, `ventas[]`. Cada elemento de `ventas[]` es una venta completa e independiente, con:

```json
{
  "version": 1,
  "venta_id": "UUID-estable-para-idempotencia",
  "numero_pedido": 1,
  "modo": "pmv",
  "cliente": 1,
  "sucursal": 2,
  "centro": 1,
  "moneda": "CLP",
  "tipo_orden": "Para llevar",
  "estado": "pedido_confirmado",
  "pago": {"medio": "tarjeta", "tipo_tarjeta": "Débito", "estado": "simulado"},
  "empresa": {"id_empresa_alianza": "2", "nombre_empresa": "BCI"},
  "cupon_porcentaje": 10,
  "detalle": [],
  "totales": {},
  "envio": {"estado": "pendiente", "intentos": 0}
}
```

El ejemplo abrevia `detalle` y `totales`; el exportado contiene todos sus campos y las fechas. El backend futuro debe deduplicar por `venta_id`. Falta definir URL, autenticación, respuesta de aceptación y tratamiento de rechazos antes de implementar el envío y marcar una venta como enviada. No se borra el registro por enviarlo.

## Cómo verificar

1. Completar un pedido del PMV con un combo y extras, con/sin alianza y cupón. Confirmar por el flujo existente de pago.
2. Abrir el reporte en el propio PC, elegir la fecha de hoy y comprobar medio, cantidades, precio original, descuentos y total. Consultar el detalle y exportar JSON.
3. Recargar el reporte: la venta debe seguir presente. Para comprobar un fallo, detener Apache antes de confirmar y volver a iniciarlo; Reintentar debe conservar el pedido e insertar una sola venta.
4. Comparar la suma de `detalle[].total` con `totales.total`, y el subtotal original menos descuentos con ese mismo total.

Pruebas ejecutables desde la raíz:

```powershell
node tests/sales-journal.cjs
node tests/qr-pantalla.cjs
node tests/beneficios-qr.cjs
node tests/estructura.cjs
```

El test del journal genera una instantánea con combos/extras/alianza/cupón y verifica SQLite en una base temporal: persistencia al reabrir, idempotencia, conflicto de ID, importes inválidos, agrupación por medio, paginación y SQL parametrizado. No inserta ventas de prueba en el archivo operativo.

## Git

El código, las pruebas y esta documentación pueden subirse al repositorio. `.gitignore` excluye `lib/db/*.sqlite` y sus auxiliares; el registro operativo no se publica con el código. Aún no se realizaron commit ni push por esta implementación.
