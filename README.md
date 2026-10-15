# Carro de compras

Para las consultas HTTPS del catálogo se utiliza el paquete CA público incluido en `lib/configApp/certs/cacert.pem`, con validación de certificado y hostname activa. Esto evita depender de un archivo CA antiguo o incompleto de XAMPP. Su origen, SHA256 y licencia están en esa misma carpeta. Para diagnosticar otra instalación, abrir `http://localhost/carro_compras/tests/diagnostico-catalogo.php`. Si el error cURL 60 persiste con el paquete actualizado y existe inspección HTTPS corporativa, solicitar a TI la cadena raíz aprobada; no desactivar la verificación TLS.

El kiosco registra las próximas confirmaciones en un **sales journal local**. Consulta en `http://localhost/carro_compras/?vista=ventas`. Detalle del almacenamiento, medios de pago, reintentos, exportación y contrato del POST futuro en [SALES_JOURNAL.md](SALES_JOURNAL.md).

Aplicación PHP y JavaScript para XAMPP. No requiere instalar paquetes en el servidor. El generador QR se incluye como archivo JavaScript local. El catálogo remoto utiliza la extensión cURL de PHP con verificación TLS activa.

## Organización

- `index.php`: entrada principal; inicia en `kiosco-ws.view.html` y selecciona las vistas internas mediante una lista permitida.
- `lib/view/*.view.html`: carrito, resumen y las tres variantes del kiosco.
- `lib/js/carrito.js`, `resumen.js`, `kiosco.js`: presentación, eventos, estado y persistencia de cada pantalla.
- `lib/js/utilidades.js`: comunicación con el controlador y escape de datos para HTML.
- `lib/controller/catalogo.controller.php`: funciones `listConfiguracion($form)`, `listProductos($form)`, `listCategorias($form)` y `listCatalogoLocal($form)`, con despacho explícito de acciones GET y respuestas JSON.
- `lib/dao/catalogo.DAO.php`: clase `catalogoDAO`, lectura de JSON y consultas a servicios. No recibe destinos remotos desde la solicitud.
- `lib/configApp/data.json`: parámetros de cliente y servicios existentes.
- `lib/configApp/catalogo-local.json`: catálogo de demostración existente.
- `lib/css`, `lib/img`: recursos y bibliotecas existentes, conservados.
- `lib/queries`: respaldos originales, sin modificaciones y bloqueados por Apache. No se importan automáticamente.

Se adoptaron las carpetas y la separación de funciones de controlador / clases DAO de las referencias de la empresa. No se agregaron POJO, clases de conexión ni consultas SQL artificiales: este proyecto obtiene datos de JSON y de servicios externos. Las consultas SQL permanecen en los servicios existentes, fuera de este repositorio.

## Contratos y compatibilidad

La URL de navegación es la raíz del proyecto (`http://localhost/carro_compras/`). `index.php` renderiza internamente la vista activa, guardada en sesión PHP. `navegar(vista)` envía la selección por POST a esa misma raíz; una recarga conserva la vista. Las entradas HTML antiguas y las rutas directas de vistas pasan por el punto de entrada y redirigen a la raíz. El servidor ajusta la base de recursos según el directorio de instalación. La navegación interna de pantallas del kiosco continúa en JavaScript. `.htaccess` conserva las rutas anteriores de JS, CSS, imágenes y configuración; requiere `mod_rewrite` y `AllowOverride` habilitados. La ruta anterior del controlador de pago conserva un archivo de compatibilidad.

El catálogo conserva los cuerpos JSON (`parametros`, `list` y `categorias`), los parámetros remotos `cliente`, `sucursal`, `cod`, las claves de localStorage (`carrito`, `cliente`, `imgResource`, `kiosco_carrito`, `kiosco_carrito_ws`) y las reglas de precios, extras, descuentos e inactividad. El navegador ahora consulta `lib/controller/catalogo.controller.php?accion=...`; el DAO realiza las consultas GET a los mismos servicios configurados. La red y los certificados del servidor PHP deben permitir esas consultas.

Los datos se escapan al construir HTML y se restringen los protocolos de imágenes a HTTP/HTTPS. Los errores del servidor devuelven un mensaje genérico; su detalle queda en el registro PHP. Las acciones admitidas se enumeran en un `switch`; no se ejecutan nombres arbitrarios de funciones.

## Alcance del pago

El controlador `pagoTbk.controller.php` ya estaba comentado y no ejecutaba pagos. El resumen sigue simulando una respuesta de error y el kiosco sigue simulando el cierre del pedido. No constituyen una integración de cobro real. Se conservó `insertVenta()` y su contrato externo existente; no se ejecuta automáticamente ni se probó enviando ventas. Antes de una integración real, el backend de ventas debe autenticar la operación, verificar precios y cantidades contra su catálogo y procesar el pago con su proveedor.

## Verificación

Desde la raíz del proyecto:

```powershell
node tests/estructura.cjs
node --check lib/js/carrito.js
node --check lib/js/resumen.js
node --check lib/js/kiosco.js
node --check lib/js/utilidades.js
C:/xampp/php/php.exe -l lib/dao/catalogo.DAO.php
C:/xampp/php/php.exe -l lib/controller/catalogo.controller.php
```

Con Apache iniciado, abrir `http://localhost/carro_compras/`, `resumen.html`, `kiosco.html`, `kiosco-ws.html` y `kiosco-sin-ws.html`. En cada kiosco recorrer tipo de orden, categorías, detalle, cantidades, combo/extras, carrito y método de pago; comprobar también edición, eliminación, cupón y restauración al recargar. En la variante WS comprobar el protector y el aviso de inactividad.

Para verificar el backend, consultar `lib/controller/catalogo.controller.php?accion=listCatalogoLocal` y las otras tres acciones documentadas. Una acción desconocida debe devolver 400 y POST debe devolver 405. El acceso HTTP a `lib/queries/dbmantbk` y `lib/dao/catalogo.DAO.php` debe devolver 403.

## Empresas con beneficios

El botón Identifícate con tu app abre la pantalla interna de alianzas. JavaScript consulta GET lib/controller/catalogo.controller.php?accion=listEmpresasAlianza; el DAO utiliza urlEmpresasAlianza de data.json y envía cliente y sucursal, sin cod. Las empresas activas (estatus 0) se muestran con su nombre y logo mediante texto escapado y URLs de imagen HTTP/HTTPS. Incluye carga, lista vacía, error, reintento, volver y continuar sin beneficios. Elegir una empresa prepara un QR temporal mediante urlBeneficiosQr. El frontend consulta directamente el backend público para crear y consultar su activación.


## QR público de beneficios — integración frontend

La integración activa está en `lib/js/kiosco.js` y `lib/js/utilidades.js`. Utiliza `parametros.urlBeneficiosQr` de `lib/configApp/data.json`, configurado en `https://test1.ingelan.cl/lib/controller/beneficios_qr_ws_tbk.controller.php`. No agrega backend ni dependencias. Reutiliza QRCode.js local y el listado de empresas existente. Los archivos de confirmación local de iteraciones anteriores permanecen sin uso en este flujo; sus tokens no son compatibles y no se recuperan.

Al seleccionar una empresa se llama por GET directo al dominio público con `accion=crear`, `cliente`, `sucursal`, `centro`, `empresa`. El QR codifica exactamente `url_activacion`; el kiosco no construye una URL de localhost ni llama automáticamente a `activar`. La pantalla conserva el logo, muestra carga, error/reintento y un enlace alternativo de activación.

Mientras la pantalla está abierta se consulta `accion=estado`, `cliente`, `token` cada 2,5 segundos, sin peticiones simultáneas. Volver, continuar sin beneficios, activar o vencer el QR cancela temporizadores y solicitudes pendientes. Las respuestas tardías se ignoran. A los 15 minutos se retiran QR y enlace y se ofrece generar uno nuevo. El protector de inactividad no interrumpe la espera. Los estados de error 2/3/4 se manejan explícitamente; los fallos de red permiten reconectar o reintentar.

Con `activado: true`, se comprueba que `id_empresa_alianza` coincida con la empresa elegida y esté vigente. Se guarda empresa/token en sessionStorage y la empresa activa en el estado del carrito, y se avanza a categorías con el aviso “Beneficios activados”. Al recargar se consulta el backend antes de restaurar los beneficios. Terminar o cancelar la venta, o continuar sin beneficios, retira la empresa activa y sus descuentos; no se envía una cancelación al backend, porque el contrato no define esa acción.

### Reglas de descuento

- El beneficio por producto (ID o código) prevalece sobre el general; no se acumulan ambos en una unidad. Entre reglas específicas duplicadas se toma el porcentaje mayor.
- Si no hay regla específica vigente, se usa el primer beneficio general activo y vigente del listado: tipo 0 = porcentaje; tipo 1 = monto fijo **por unidad**, según lo confirmado para este PMV. Dos unidades de $5.000 con beneficio general de $2.000 cuestan $6.000.
- Se respetan estatus y fechas de la alianza y de cada beneficio (`fecha_inicio` / `fecha_fin`, o fechas de alianza), con días inclusivos en America/Santiago. Sin fechas se considera sin restricción temporal; una fecha mal formada no habilita descuento.
- El precio nunca baja de cero; el monto se redondea a pesos. El beneficio se aplica al producto y a extras que correspondan a unidades del catálogo. Los recargos de combo conservan el comportamiento anterior. El cupón existente se calcula después de la alianza.
- Catálogo y resumen muestran el precio rebajado y el original tachado; el detalle del carrito muestra el ahorro de la empresa. Los precios originales permanecen en el modelo del carrito.

### Cómo probar desde un teléfono

1. Abrir `http://localhost/carro_compras/` en el PC.
2. Seleccionar tipo de orden → Identifícate con tu app → BCI o Santander.
3. Esperar el QR y escanearlo con el teléfono. **Abrir el enlace leído**: reconocer la imagen sin abrir la URL no activa nada.
4. El teléfono abre `https://test1.ingelan.cl/...accion=activar...`. Sólo necesita acceso a Internet; no necesita conectarse a localhost, conocer la IP del PC ni compartir su red.
5. El kiosco debe detectar la activación en aproximadamente 2,5 segundos más el tiempo de red, mostrar “Beneficios activados” y continuar a categorías.
6. Agregar un producto elegible y comprobar precio original, rebaja y ahorro en el resumen. En la consulta probada, BCI tiene 40% en Hamburguesa de Pollo: $3.000 → $1.800.

`urlPublicaKiosco` ya no se usa para estos QR: siempre se llama al dominio público de `urlBeneficiosQr` y se codifica la URL entregada por ese servidor.

### Cómo probar sin teléfono

En la pantalla del QR, pulsar **Abrir enlace de activación**. Se abre `url_activacion` en una pestaña nueva; volver a la pestaña del kiosco y comprobar la activación automática. También puede copiarse esa URL y abrirse en otro navegador. No hace falta compartir cookies.

Probar también: Volver mientras carga / espera, Continuar sin beneficios, pérdida de red y Reintentar, 15 minutos sin activar y Generar QR nuevo, finalizar/cancelar el pedido y recargar la página. Para una nueva prueba elegir de nuevo una empresa y generar otro token.

### Pruebas automatizadas

```powershell
node tests/estructura.cjs
node tests/beneficios-qr.cjs
node tests/qr-pantalla.cjs
```

Cubren rutas, API GET pública, parámetros, errores 2/3/4, porcentajes, montos por unidad, prioridad y vigencia, carga/reintentos, temporizadores, salida, respuestas tardías, activación y limpieza. La caducidad se comprueba con reloj controlado, sin esperar 15 minutos reales. El backend no verifica app de origen ni pertenencia bancaria, de acuerdo con el alcance del MVP.
