/* Cola persistida en SQLite. El backend remoto deduplica por venta_id. */
function iniciarEnvioPedidos(parametros,alEnviar) {
    var endpoint = new URL(parametros.urlPedidos);
    if (endpoint.origin !== 'https://test1.ingelan.cl') throw new Error('urlPedidos debe usar el dominio público test1.ingelan.cl');
    endpoint.search = new URLSearchParams({accion:'crear'});
    var ocupado=false, detenido=false, temporizador=null;
    var clave='kiosco_envios_confirmados', confirmados={};
    try {confirmados=JSON.parse(localStorage.getItem(clave)||'{}') || {};} catch(e) {}
    function guardarConfirmados() {
        try {localStorage.setItem(clave,JSON.stringify(confirmados));} catch(e) {console.error('No se pudo guardar la confirmación de envío en el navegador',e);}
    }
    async function solicitar(url,opciones) {
        var controlador=new AbortController(), limite=setTimeout(function(){controlador.abort();},12000);
        try {
            var r=await fetch(url,Object.assign({cache:'no-store'},opciones,{signal:controlador.signal}));
            if(!r.ok)throw new Error('HTTP '+r.status);
            return await r.json();
        } finally {clearTimeout(limite);}
    }
    function guardarEnvio(form) {
        return solicitar('lib/controller/ventas.controller.php?accion=envio',{
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)
        }).then(function(r){if(r.estado!==1)throw new Error('No se pudo guardar el estado de envío');});
    }
    async function enviar(venta) {
        var form;
        try {
            var r=await solicitar(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(venta)});
            if(r.estado!==1 || !r.pedido || !Number.isInteger(Number(r.pedido.id_pedido)) || Number(r.pedido.id_pedido)<1 ||
                !Number.isInteger(Number(r.pedido.numero_pedido)) || Number(r.pedido.numero_pedido)<1) throw new Error('Respuesta de creación inválida');
            form={venta_id:venta.venta_id,estado:'enviado',intentos:venta.envio.intentos,pedido:r.pedido};
        } catch(e) {
            await guardarEnvio({venta_id:venta.venta_id,estado:'pendiente',intentos:venta.envio.intentos+1});
            return;
        }
        // Si se interrumpe la sincronización local, recuperar esta confirmación antes de reenviar.
        confirmados[venta.venta_id]=form; guardarConfirmados();
        try {alEnviar(venta.venta_id,form.pedido);} catch(e) {console.error('No se pudo mostrar el pedido enviado',e);}
        await guardarEnvio(form);
        delete confirmados[venta.venta_id]; guardarConfirmados();
    }
    async function procesar() {
        if(ocupado||detenido)return;
        ocupado=true;clearTimeout(temporizador);
        try {
            for(var id of Object.keys(confirmados)) {
                await guardarEnvio(confirmados[id]);
                delete confirmados[id];guardarConfirmados();
            }
            var r=await solicitar('lib/controller/ventas.controller.php?accion=pendientes');
            if(!Array.isArray(r.list))throw new Error('Cola de pedidos inválida');
            for(var venta of r.list) {
                if(detenido)break;
                await enviar(venta);
            }
        } catch(e) {console.error('Cola de pedidos: se reintentará en segundo plano',e);}
        finally {ocupado=false;if(!detenido)temporizador=setTimeout(procesar,2000);}
    }
    function detener() {detenido=true;clearTimeout(temporizador);}
    window.addEventListener('online',procesar);
    window.addEventListener('pagehide',detener);
    window.addEventListener('pageshow',function(){if(detenido){detenido=false;procesar();}});
    procesar();
    return {procesar:procesar};
}
