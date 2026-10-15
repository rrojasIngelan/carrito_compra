// Instantánea independiente del carrito: no se modifica tras solicitar su registro.
function prepararVenta(estado, parametros, empresa, buscarProducto, calcularPrecio, ahora, ventaId) {
    var detalle = [];
    function agregar(linea, item, tipo, precio, nombre, cantidad, padre) {
        var producto = buscarProducto(item.id) || {};
        var neto = tipo === 'combo' ? precio : calcularPrecio(precio, item.id);
        detalle.push({
            linea: detalle.length + 1, linea_carrito: linea.uid || String(padre), tipo: tipo,
            id_item: tipo === 'combo' ? null : String(item.id),
            cod_item: tipo === 'combo' ? null : producto.cod || item.cod || null,
            nombre: nombre, cantidad: cantidad,
            precio_unitario_original: precio, precio_unitario_con_beneficio: neto,
            subtotal_original: precio * cantidad, descuento_alianza: (precio - neto) * cantidad,
            subtotal_con_beneficio: neto * cantidad, descuento_cupon: 0, total: neto * cantidad,
            ingredientes_quitados: tipo === 'producto' ? (linea.quitar || []).slice() : []
        });
    }
    estado.carrito.forEach(function (l, indice) {
        agregar(l, l, l.tipo_linea === 'extra' ? 'extra' : 'producto', l.precioBase, l.nombre, l.cant, indice);
        if (l.combo && l.combo.extra) agregar(l, {}, 'combo', l.combo.extra, l.combo.nombre || 'Combo', l.cant, indice);
        (l.extras || []).forEach(function (extra) { agregar(l, extra, 'extra', extra.precio, extra.nombre, l.cant, indice); });
    });
    var original = detalle.reduce(function (s,l) { return s + l.subtotal_original; },0);
    var base = detalle.reduce(function (s,l) { return s + l.subtotal_con_beneficio; },0);
    var descuentoCupon = Math.round(base * (estado.descuento || 0) / 100);
    // Repartir el cupón en pesos enteros para que la suma de líneas cuadre con el total.
    var reparto = detalle.map(function (l,indice) {
        var valor = base ? descuentoCupon * l.subtotal_con_beneficio / base : 0;
        l.descuento_cupon = Math.floor(valor);
        return {indice: indice, fraccion: valor - Math.floor(valor)};
    }).sort(function (a,b) { return b.fraccion - a.fraccion || a.indice - b.indice; });
    var resto = descuentoCupon - detalle.reduce(function (s,l) { return s + l.descuento_cupon; },0);
    for (var i = 0; i < resto; i++) detalle[reparto[i].indice].descuento_cupon++;
    detalle.forEach(function (l) { l.total = l.subtotal_con_beneficio - l.descuento_cupon; });
    var empresaResumen = empresa ? {id_empresa_alianza: empresa.id_empresa_alianza, nombre_empresa: empresa.nombre_empresa} : null;
    return {
        version: 1, venta_id: ventaId, modo: 'pmv', fecha_hora_cliente: ahora.toISOString(), moneda: 'CLP',
        cliente: parametros.cliente, sucursal: parametros.sucursal, centro: parametros.centro,
        tipo_orden: estado.tipoOrden, estado: 'pedido_confirmado',
        pago: {medio: estado.metodoPago, tipo_tarjeta: estado.tarjeta || null,
            estado: estado.metodoPago === 'efectivo' ? 'pendiente_caja' : 'simulado'},
        empresa: empresaResumen, cupon_porcentaje: estado.descuento || 0, detalle: detalle,
        totales: {subtotal_original: original, descuento_alianza: original - base,
            descuento_cupon: descuentoCupon, descuento_total: original - base + descuentoCupon,
            total: base - descuentoCupon,
            unidades: detalle.reduce(function (s,l) { return s + (l.tipo === 'combo' ? 0 : l.cantidad); },0)},
        envio: {estado: 'pendiente', intentos: 0}
    };
}

function nuevoIdVenta() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), function (b) { return b.toString(16).padStart(2,'0'); }).join('');
}

function registrarVenta(venta) {
    var controlador = new AbortController();
    var espera = setTimeout(function () {controlador.abort();},15000);
    return fetch('lib/controller/ventas.controller.php?accion=registrar', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(venta), signal:controlador.signal
    }).then(function (r) {
        if (!r.ok) throw new Error('No se pudo guardar la venta (HTTP ' + r.status + ')');
        return r.json();
    }).then(function (r) {
        if (!r.venta || r.venta.venta_id !== venta.venta_id) throw new Error('Confirmación de registro inválida');
        return r.venta;
    }).finally(function () {clearTimeout(espera);});
}
