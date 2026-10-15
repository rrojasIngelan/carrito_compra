# Verificación ejecutada — 15 de octubre de 2026

- `node tests/estructura.cjs`: aprobado. Verifica las rutas locales de las cinco vistas, el orden de carga de scripts, el escape HTML y el rechazo de protocolos de imagen ejecutables.
- `node --check` para carrito, resumen, kiosco y utilidades: aprobado.
- `php -l` para DAO, controladores, entrada y archivo de compatibilidad: aprobado.
- HTTP en Apache/XAMPP: las cuatro acciones de catálogo devolvieron 200. Catálogo local: 40 registros; servicio de productos: 40 registros; servicio de categorías: 12 registros en el momento de la consulta.
- Acción inexistente y acción recibida como arreglo: 400. Método POST: 405.
- HTTP para las rutas antiguas `css/kiosco.css`, `img/logo.png`, `js/js.js`, `config/data.json` y `controller/pagoTbk.controller.php`: 200. El controlador de pago mantiene su cuerpo vacío original.
- Acceso directo a DAO y respaldo `lib/queries/dbmantbk`: 403.
- Navegador, kiosco local: entrada original redirige a la vista; tipo de orden, invitado, categorías y productos visibles.
- Navegador, kiosco WS: categorías y productos remotos; detalle de Pizza a $5.500; cantidad aumentada a 2; extras sin seleccionar; carrito con 2 unidades y total $11.000; pantalla de selección de método de pago visible.

No se ejecutaron cobros, registros de ventas ni importaciones de respaldos. No se verificaron exhaustivamente cupones, edición, eliminación, restauración, inactividad ni el flujo clásico completo de carrito/resumen. La matriz manual para continuar esas comprobaciones está en README.md. Las pruebas realizadas no permiten afirmar que todas las funcionalidades estén verificadas.

## Ajuste de navegación interna

Comprobado mediante HTTP en XAMPP: GET de la raíz devuelve carrito y base /carro_compras/; POST de resumen, carrito y kiosco-ws responde 200 sin cambiar la URL raíz; GET posterior conserva la vista en sesión; resumen.html termina en la raíz mostrando resumen; un nombre de vista con recorrido de directorios devuelve 400. Sintaxis PHP/JavaScript y tests/estructura.cjs aprobados. No se ejecutó una nueva prueba interactiva de navegador para este ajuste.


## Empresas con beneficios

GET del servicio indicado y del controlador local con accion=listEmpresasAlianza: HTTP 200, BCI y Santander. Sintaxis PHP del DAO/controlador, sintaxis de kiosco.js y tests/estructura.cjs: aprobados. En navegador se comprobó desde la raíz: tipo de orden, Identifícate con tu app, listado con logos reales, selección de BCI sin activar beneficios, Volver y Continuar sin beneficios hacia categorías. Revisión visual realizada. No se probaron fallos de red inducidos ni autenticación de alianzas; el flujo de identificación posterior a la selección está pendiente de definición.


## QR del PMV

Verificado en navegador desde la raíz: seleccionar BCI muestra pantalla QR con su nombre y contenido de demostración (empresa 2); Volver regresa al listado; Santander genera un QR con empresa 1; Continuar sin beneficios conduce a categorías. Inspección visual del QR realizada. Sintaxis JavaScript y pruebas de rutas / contenido JSON del QR aprobadas. No se escaneó con una app real, ni se probó confirmación de identidad o aplicación de beneficios.

## Activación al abrir el QR — PMV

Este flujo sustituye al QR JSON estático de las verificaciones anteriores.

- Pruebas HTTP con sesiones independientes: pendiente antes de abrir, confirmada después del POST móvil, repetición idempotente y código cancelado no reactivable.
- `php tests/alianza.php`: aprobado; cubre aislamiento de sesiones, confirmación, beneficios al kiosco, repetición, cancelación, expiración y rechazo de tokens inválidos.
- `node tests/estructura.cjs`: aprobado; incluye 40% en producto elegible, producto no elegible, porcentajes inválidos, reglas duplicadas y ausencia de alianza.
- Sintaxis PHP y JavaScript de los archivos nuevos/modificados: aprobada.
- Navegador: QR BCI generado desde la raíz; apertura del enlace codificado en otra pestaña; confirmación móvil; avance automático del kiosco a categorías; aviso de beneficios activos; hamburguesa rebajada de $3.000 a $1.800.
- Carrito de prueba: dos pizzas sin beneficio ($11.000) y una hamburguesa con BCI ($1.800); subtotal original $14.000, beneficio BCI $1.200, total $12.800.

La apertura en otra pestaña simula la acción que debe realizar el teléfono tras escanear. No se verificó lectura con cámara ni conexión desde un dispositivo físico, una app bancaria o un proveedor de pagos. La dirección accesible para el teléfono se configura en urlPublicaKiosco o se obtiene abriendo el kiosco por su IP de red.

También se comprobó en navegador que Cancelar pedido regresa a la portada y retira los beneficios de la orden de prueba.


## Integración con beneficios_qr_ws_tbk.controller.php — frontend actual

Sustituye las pruebas anteriores de confirmación local. El backend existente no se modificó.

- Navegador en localhost: elegir BCI → GET crear al dominio público → QR con url_activacion HTTPS del backend y logo de empresa.
- Abrir url_activacion en una segunda pestaña: el servidor mostró “¡Beneficios activados!”; el kiosco detectó `activado: true`, mostró el aviso y avanzó automáticamente a categorías.
- Hamburguesa de Pollo: precio original $3.000, beneficio BCI 40%, precio $1.800; detalle y resumen mostraron la rebaja y el original tachado.
- Pruebas Node aprobadas: estructura.cjs, beneficios-qr.cjs, qr-pantalla.cjs. Cubren monto general por unidad (dos unidades de $5.000 menos $2.000 cada una = $6.000), prioridad por ítem, vigencia, errores 2/3/4, polling, salida, respuestas tardías, reintento, activación y limpieza al finalizar/cancelar.
- Vencimiento de 15 minutos probado con reloj controlado, no mediante espera real.

No se escaneó con cámara ni se verificó un teléfono físico. La apertura real del enlace público se probó en navegador. Las reglas generales se probaron con datos controlados: el servicio consultado devolvió `beneficios: []` y porcentajes por producto. No se ejecutaron cobros ni registros de ventas.

## Extras al seleccionar

La selección y deselección de extras guarda inmediatamente la configuración en el carrito y actualiza el total superior. La misma línea se actualiza al continuar, sin duplicarla. Pruebas automatizadas ejecutadas: primer extra, segunda selección, confirmaciones repetidas y deselección (tests/qr-pantalla.cjs). No se realizó una nueva comprobación visual de este ajuste.


## Combo en carrito superior

Al ingresar a Extras se guarda inmediatamente el producto y su combo, sin exigir seleccionar un extra o pulsar Pagar. Prueba automatizada ejecutada: producto $3.000 con beneficio 40%, combo +$1.900 y cantidad 2 produce $7.400 en el carrito superior; cambiar a combo +$2.890 actualiza a $9.380 sin duplicar la línea. Sintaxis y suites Node aprobadas. Sin nueva prueba visual para este ajuste.
## Sales journal local

- SQLite/PDO disponible en XAMPP. Archivo operativo inicializado sin insertar ventas de prueba.
- `node tests/sales-journal.cjs`: aprobado. Instantánea con productos, combos, extras, alianza, cupón, reparto exacto a pesos y estados de pago. DAO probado en SQLite temporal: persistencia, correlativo, idempotencia, rechazo de ID reutilizado con otros datos, importes inválidos, SQL parametrizado, paginación y agrupación por medio.
- `node tests/qr-pantalla.cjs`: aprobado, incluido fallo del registro sin borrar carrito/alianza, bloqueo de reinicio pendiente, doble clic y reintento con el mismo ID.
- Suites estructura.cjs y beneficios-qr.cjs y sintaxis PHP/JavaScript: aprobadas.
- HTTP local: vista del journal 200; listado 200; descarga del SQLite 403; fecha inválida 400; GET para registrar 405; venta vacía por POST 400.
- Navegador: reporte abre en la raíz, filtros por fecha, tabla vacía y resumen de cero pedidos visibles. No se insertó una venta operativa de prueba ni se verificó una exportación descargada desde la UI.
- `.gitignore` verificado: excluye sales-journal.sqlite. No se realizaron commit, push ni envío de ventas al backend externo.

## Recuperación del error 502 al cargar catálogo

Durante la revisión, el controlador local y el servicio remoto respondieron HTTP 200; la causa original de la captura no pudo confirmarse. Se añadió un reintento acotado para fallos transitorios de GET (502/503/504 y conexiones/timeouts), con presupuesto de 25 segundos y validación HTTPS intacta. Los fallos definitivos incluyen en el registro del servidor la clave del servicio, HTTP y error cURL; no se muestran datos internos al cliente. La pantalla de error ofrece Reintentar mediante recarga, sin sustituir precios por un catálogo antiguo.

Prueba de fallos controlados `php tests/catalogo-reintento.php`: aprobada, cubriendo recuperación ante 502/timeout, límite de dos intentos, error de certificado, 403 y JSON inválido. Sintaxis y suites Node anteriores: aprobadas. Verificación HTTP final: 200, 40 productos. No se reprodujo el fallo original ni se realizó otra prueba visual.

## cURL 60 en otra instalación XAMPP

El diagnóstico enviado por el usuario confirmó HTTP 0 / cURL 60 (unable to get local issuer certificate), aunque el CA de php.ini existía y era legible. Se incorporó el paquete CA público de Mozilla distribuido por curl.se, verificado contra su SHA256 oficial. El DAO utiliza CURLOPT_CAINFO con la ruta relativa del proyecto, manteniendo CURLOPT_SSL_VERIFYPEER=true y CURLOPT_SSL_VERIFYHOST=2. El diagnóstico muestra ahora ese archivo efectivo.

Comprobado en este equipo con el nuevo paquete: productos 40 y categorías 12, sin desactivar TLS. Pruebas de reintentos, CA configurado y rechazo de error de certificado aprobadas; suites Node y journal aprobadas. El test PHP de CA requirió ejecución fuera del entorno restringido del agente porque éste impide leer archivos .pem. Falta verificar en el equipo del usuario: una raíz privada de proxy/antivirus no está incluida automáticamente en el conjunto público de Mozilla.

## Extras como productos independientes

Los extras se guardan como filas propias del carrito con precio, imagen, cantidad y controles de edición/eliminación. Al confirmar o volver a la selección se reutilizan sus filas y cantidades; una eliminación no se revierte al regresar. La carga de carritos anteriores convierte los extras anidados a filas propias conservando cantidades e importes. El sales journal identifica esas filas como extra, sin cobrarlas otra vez en la línea principal.

Pruebas ejecutadas: extras-carrito.cjs, qr-pantalla.cjs, sales-journal.cjs y estructura.cjs. Caso equivalente a la captura: combo $4.990 + agua $1.200 = $6.190; aumentar el agua a dos unidades produce $7.390 manteniendo un combo; eliminar el agua deja $4.990. También se comprobaron migración idempotente, conservación de cantidades al volver, eliminación persistente y journal sin duplicar importes. No se ejecutó una nueva prueba visual para esta modificación.

## Comprobante imprimible del pedido

Al confirmar una venta guardada en SQLite, el kiosco genera un ticket desde la misma instantánea del sales journal. Incluye Ingelan Autoservicios SpA, Arturo Claro 1465, Providencia, número de pedido, fecha de Santiago, productos, cantidades, precios, descuentos, total y medio/estado de pago. El comprobante del PMV no genera folio tributario ni timbre fiscal.

Verificación manual:
1. Recargar el kiosco con Ctrl+F5, agregar un combo y un extra, cambiar cantidades y completar el pago.
2. En la confirmación, revisar el ticket y comparar sus líneas y total con el registro de ventas.
3. Pulsar «Imprimir boleta». Seleccionar impresora y papel térmico de 80 mm, escala 100 %, sin encabezados/pies del navegador; también se puede guardar como PDF.
4. Cancelar el diálogo y volver a imprimir: no debe crearse otra venta. «Nuevo pedido» limpia el ticket anterior.
5. Probar una venta con alianza/cupón y otra en efectivo: deben verse los descuentos y el estado pendiente de pago en caja, respectivamente.

Ejecutado: node tests/boleta.cjs, node tests/extras-carrito.cjs, node tests/qr-pantalla.cjs, node tests/sales-journal.cjs, node tests/beneficios-qr.cjs y node --check lib/js/kiosco.js. No se ha probado una impresora física ni el diálogo de impresión.
