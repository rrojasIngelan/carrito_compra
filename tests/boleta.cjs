const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const contexto = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../lib/js/boleta.js'),'utf8'),contexto);
const venta = {
    numero_pedido: 66, venta_id: 'venta-test', fecha_hora:'2026-10-15T12:30:00-03:00',
    sucursal:2, centro:1, tipo_orden:'Para llevar', pago:{medio:'tarjeta',estado:'simulado'},
    empresa:{nombre_empresa:'BCI'}, detalle:[
        {nombre:'Combo <especial>',cantidad:2,precio_unitario_original:5000,descuento_alianza:4000,descuento_cupon:0,total:6000},
        {nombre:'Agua Mineral',cantidad:1,precio_unitario_original:1200,descuento_alianza:0,descuento_cupon:120,total:1080}
    ], totales:{subtotal_original:11200,descuento_alianza:4000,descuento_cupon:120,total:7080}
};
const antes=JSON.stringify(venta), html=contexto.generarBoletaHtml(venta);
for (const texto of ['ORDEN: 66','Ingelan Autoservicios SpA','Arturo Claro 1465, Providencia',
    'Combo &lt;especial&gt;','Agua Mineral','2 x $5.000','$6.000','$1.080','$7.080',
    'Descuento alianza','Descuento cupón','PAGO SIMULADO','2026','12:30']) assert.ok(html.includes(texto),texto);
assert.ok(!html.includes('<especial>'),'escapa nombres antes de insertarlos en HTML');
assert.equal(JSON.stringify(venta),antes,'no modifica la venta registrada');
assert.ok(html.includes('<dt>Total neto</dt><dd>$5.950</dd>'));
assert.ok(html.includes('<dt>IVA 19 %</dt><dd>$1.130</dd>'),'IVA sobre el total con descuentos');
for (const [total,neto,iva] of [[11900,'10.000','1.900'],[0,'0','0'],[1,'1','0']]) {
    const comprobante=contexto.generarBoletaHtml({...venta,totales:{...venta.totales,total}});
    assert.ok(comprobante.includes('<dt>Total neto</dt><dd>$'+neto+'</dd>'));
    assert.ok(comprobante.includes('<dt>IVA 19 %</dt><dd>$'+iva+'</dd>'));
}
venta.pago={medio:'efectivo',estado:'pendiente_caja'};
assert.ok(contexto.generarBoletaHtml(venta).includes('PENDIENTE DE PAGO EN CAJA'));
for (const nombre of ['kiosco','kiosco-ws','kiosco-sin-ws']) {
    const vista=fs.readFileSync(path.join(__dirname,'../lib/view/'+nombre+'.view.html'),'utf8');
    assert.equal((vista.match(/id="boleta"/g)||[]).length,1);
    assert.ok(!vista.includes('id="imprimir-boleta"'),'sin botón de impresión manual');
    assert.ok(vista.indexOf('lib/js/boleta.js') < vista.indexOf('lib/js/kiosco.js'));
}
console.log('OK: comprobante, cantidades, precios, descuentos, escape HTML y tres entradas del kiosco.');
