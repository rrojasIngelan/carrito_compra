/* Comprobante del PMV: se construye desde la venta confirmada, no desde el carrito vacío. */
function generarBoletaHtml(venta) {
    function texto(valor) {
        return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (c) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
        });
    }
    function pesos(valor) { return '$' + Number(valor).toLocaleString('es-CL'); }
    var medios = {tarjeta:'Tarjeta', efectivo:'Efectivo', rutpay:'RutPay', machbank:'MachBank'};
    var fecha = venta.fecha_hora || venta.fecha_hora_cliente;
    var fechaTexto = fecha ? new Date(fecha).toLocaleString('es-CL', {timeZone:'America/Santiago'}) : '';
    var filas = venta.detalle.map(function (linea) {
        var descuento = linea.descuento_alianza + linea.descuento_cupon;
        return '<tr><td colspan="2">' + texto(linea.nombre) + '</td></tr>' +
            '<tr><td>' + texto(linea.cantidad) + ' x ' + pesos(linea.precio_unitario_original) +
            '</td><td class="importe">' + pesos(linea.total) + '</td></tr>' +
            (descuento ? '<tr class="descuento"><td colspan="2">Descuento: −' + pesos(descuento) + '</td></tr>' : '');
    }).join('');
    var t = venta.totales;
    return '<header><div class="boleta-orden">ORDEN: ' + texto(venta.numero_pedido) + '</div>' +
        '<h1>Ingelan Autoservicios SpA</h1><p>Arturo Claro 1465, Providencia</p>' +
        '<p>COMPROBANTE DE COMPRA · PMV</p></header>' +
        '<p>Fecha: ' + texto(fechaTexto) + '<br>Sucursal: ' + texto(venta.sucursal) +
        ' · Centro: ' + texto(venta.centro) + '<br>' + texto(venta.tipo_orden) +
        '<br>Medio de pago: ' + texto(medios[venta.pago.medio] || venta.pago.medio) +
        (venta.pago.tipo_tarjeta ? ' · ' + texto(venta.pago.tipo_tarjeta) : '') +
        '<br>' + (venta.pago.estado === 'pendiente_caja' ? 'PENDIENTE DE PAGO EN CAJA' :
            venta.pago.estado === 'simulado' ? 'PAGO SIMULADO · PMV' : texto(venta.pago.estado)) + '</p>' +
        '<table><thead><tr><th>DESCRIPCIÓN / CANT. X PRECIO</th><th class="importe">VALOR</th></tr></thead>' +
        '<tbody>' + filas + '</tbody></table><dl>' +
        '<dt>Subtotal</dt><dd>' + pesos(t.subtotal_original) + '</dd>' +
        (t.descuento_alianza ? '<dt>Descuento alianza</dt><dd>−' + pesos(t.descuento_alianza) + '</dd>' : '') +
        (t.descuento_cupon ? '<dt>Descuento cupón</dt><dd>−' + pesos(t.descuento_cupon) + '</dd>' : '') +
        '<dt class="boleta-total">TOTAL</dt><dd class="boleta-total">' + pesos(t.total) + '</dd></dl>' +
        (venta.empresa ? '<p>Alianza: ' + texto(venta.empresa.nombre_empresa) + '</p>' : '') +
        '<footer><p>Gracias por tu compra</p><small>Comprobante del PMV, sin validez tributaria.</small>' +
        '<small>Referencia: ' + texto(venta.venta_id) + '</small></footer>';
}
