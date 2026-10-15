# Pantallas de pedidos del PMV

- Cocina: `http://localhost/carro_compras/?vista=cocina`
- Clientes: `http://localhost/carro_compras/?vista=pedidos`

Desde otros equipos reemplazar localhost por la IP o dominio del servidor XAMPP. Ambas vistas deben apuntar al mismo servidor para compartir pedidos. Las instalaciones con SQLite independientes no se sincronizan entre sí. El enrutamiento carga las vistas internamente desde la raíz.

Cocina actualiza cada 3 segundos y permite avanzar: Pendiente → En preparación → Listo para entregar → Entregado. Un pedido activo pasa a urgente a los 15 minutos. El filtro de estado y los contadores permiten organizar el trabajo. Se muestran sucursal, centro, productos, cantidades, ingredientes quitados y el estado de pago del PMV. El tiempo mostrado es la espera desde el registro; los entregados aparecen identificados como entregados.

El tablero público solo recibe número, fecha y estado. Agrupa pendientes, preparación y listos; los entregados desaparecen del tablero público. Cocina conserva los entregados durante el día de su venta. Los pedidos no entregados de días anteriores siguen visibles, para no perder trabajo pendiente. Las ventas existentes sin estado de cocina comienzan pendientes.

Los estados quedan en la tabla `pedidos_estado` del mismo archivo protegido `lib/db/sales-journal.sqlite`. No se modifican instantáneas, descuentos, importes ni estados de pago del sales journal. La actualización exige la transición anterior vigente y evita sobrescribir cambios desde otra pantalla. Las escrituras utilizan POST JSON y un token de sesión contra solicitudes cruzadas.

En este PMV cocina es accesible sin login para quienes accedan al servidor, igual que el journal habilitado a solicitud del usuario. El token protege las solicitudes cruzadas; no identifica al personal ni sustituye autenticación. No se considera que un pedido esté pagado solo por avanzar su preparación.

## Verificación

1. Completar una venta en el kiosco y anotar su número de comprobante.
2. Abrir cocina y clientes en dos navegadores/equipos apuntando al mismo servidor.
3. Confirmar que aparece pendiente con el mismo número; revisar cantidades e ingredientes quitados en cocina.
4. Pulsar Comenzar preparación, Marcar listo y Marcar entregado. El cliente debe reflejar cada cambio en la siguiente actualización y retirar el número al entregarse.
5. Abrir cocina simultáneamente en dos equipos: un cambio sobre un estado ya actualizado debe rechazarse y recargar los datos.
6. Recargar ambas pantallas para verificar persistencia; interrumpir la conexión para comprobar el aviso de datos desactualizados.

Pruebas automatizadas: `node tests/sales-journal.cjs` incluye persistencia, flujo completo, conflictos, privacidad del listado público e integridad del journal. Las pruebas usan una base temporal y no generan pedidos de demostración en la base operativa.
