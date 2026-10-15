document.addEventListener('DOMContentLoaded',function () {
    var desde = document.getElementById('desde'), hasta = document.getElementById('hasta');
    var mensaje = document.getElementById('estado'), offset = 0, consultando = false;
    var etiquetas = {tarjeta:'Tarjeta',efectivo:'Efectivo',rutpay:'RutPay',machbank:'MachBank'};
    function pesos(n) { return '$' + Number(n).toLocaleString('es-CL'); }
    desde.value = hasta.value = fechaBeneficios();
    function consultar(inicio) {
        var url = new URL('lib/controller/ventas.controller.php',document.baseURI);
        url.search = new URLSearchParams({accion:'listar',desde:desde.value,hasta:hasta.value,offset:inicio});
        return fetch(url.href,{cache:'no-store'}).then(function (r) {
            if (!r.ok) throw new Error('No se pudo consultar el registro (HTTP ' + r.status + ')');
            return r.json();
        });
    }
    function celda(fila, texto) { var td = document.createElement('td'); td.textContent = texto; fila.appendChild(td); return td; }
    function cargar() {
        if (consultando) return;
        consultando = true; mensaje.textContent = 'Consultando ventas…';
        consultar(offset).then(function (data) {
            var cuerpo = document.getElementById('ventas'); cuerpo.replaceChildren();
            data.list.forEach(function (venta) {
                var fila = document.createElement('tr');
                celda(fila,'#' + venta.numero_pedido);
                celda(fila,new Date(venta.fecha_hora).toLocaleString('es-CL',{timeZone:'America/Santiago'}));
                celda(fila,(etiquetas[venta.pago.medio] || venta.pago.medio) + ' / ' + venta.pago.estado);
                celda(fila,pesos(venta.totales.descuento_total)); celda(fila,pesos(venta.totales.total));
                celda(fila,venta.envio.estado);
                var boton = document.createElement('button'); boton.textContent = 'Ver detalle';
                boton.addEventListener('click',function () {
                    document.getElementById('detalle').hidden = false;
                    document.getElementById('detalle-json').textContent = JSON.stringify(venta,null,2);
                });
                celda(fila,'').appendChild(boton); cuerpo.appendChild(fila);
            });
            var resumen = document.getElementById('resumen'); resumen.replaceChildren();
            var suma = 0, pedidos = 0;
            data.resumen.forEach(function (medio) {
                suma += Number(medio.total); pedidos += Number(medio.pedidos);
                var tarjeta = document.createElement('div'); tarjeta.className = 'tarjeta';
                var nombre = document.createElement('span'); nombre.textContent = etiquetas[medio.medio] || medio.medio;
                var importe = document.createElement('strong'); importe.textContent = pesos(medio.total);
                var detalle = document.createElement('span'); detalle.textContent = medio.pedidos + ' pedidos · descuentos ' + pesos(medio.descuentos);
                tarjeta.append(nombre,importe,detalle); resumen.appendChild(tarjeta);
            });
            document.getElementById('pagina').textContent = 'Página ' + (offset/1000+1);
            document.getElementById('anterior').disabled = offset === 0;
            document.getElementById('siguiente').disabled = data.list.length < data.limite;
            mensaje.textContent = pedidos + ' pedidos · total ' + pesos(suma) + ' · ' + data.list.length + ' registros en esta página';
        }).catch(function (err) { mensaje.textContent = err.message; }).finally(function () { consultando = false; });
    }
    document.getElementById('filtros').addEventListener('submit',function (e) {e.preventDefault();if(!consultando){offset=0;cargar();}});
    document.getElementById('anterior').addEventListener('click',function () {if(!consultando&&offset){offset-=1000;cargar();}});
    document.getElementById('siguiente').addEventListener('click',function () {if(!consultando){offset+=1000;cargar();}});
    document.getElementById('volver-kiosco').addEventListener('click',function () {navegar('kiosco-ws');});
    document.getElementById('exportar').addEventListener('click',async function () {
        var boton = this; boton.disabled = true;
        try {
            var registros = [], posicion = 0, data;
            do { data = await consultar(posicion); registros = registros.concat(data.list); posicion += data.limite; } while (data.list.length === data.limite);
            var archivo = new Blob([JSON.stringify({version:1,desde:desde.value,hasta:hasta.value,ventas:registros},null,2)],{type:'application/json'});
            var enlace = document.createElement('a'), url = URL.createObjectURL(archivo);
            enlace.href = url; enlace.download = 'sales-journal-' + desde.value + '-' + hasta.value + '.json'; enlace.click();
            setTimeout(function () {URL.revokeObjectURL(url);},1000);
        } catch (err) {mensaje.textContent=err.message;} finally {boton.disabled=false;}
    });
    cargar();
});
