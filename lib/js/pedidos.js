document.addEventListener('DOMContentLoaded',function () {
    var cocina = document.body.dataset.vista === 'cocina', pedidos = [], csrf = '', ocupado = false;
    var temporizador = null, controlador = null, activo = true;
    var etiquetas = {pendiente:'Pendiente',preparacion:'En preparación',listo:'Listo para entregar',entregado:'Entregado'};
    var siguiente = {pendiente:'preparacion',preparacion:'listo',listo:'entregado'};
    var acciones = {pendiente:'Comenzar preparación',preparacion:'Marcar listo',listo:'Marcar entregado'};
    var mensaje = document.getElementById('mensaje'), conexion = document.getElementById('conexion');
    function nodo(tipo,texto,clase) {
        var el = document.createElement(tipo); if (texto != null) el.textContent = texto;
        if (clase) el.className = clase; return el;
    }
    function minutos(p) { return Math.max(0,Math.floor((Date.now()-new Date(p.fecha_hora).getTime())/60000)); }
    function urgente(p) { return ['pendiente','preparacion'].includes(p.estado) && minutos(p)>=15; }
    function origen(accion) {
        var url = new URL('lib/controller/pedidos.controller.php',document.baseURI);
        url.search = new URLSearchParams({accion:accion,vista:cocina?'cocina':'cliente'}); return url;
    }
    async function respuesta(r) {
        var data = await r.json(); if (!r.ok) throw new Error(data.error || 'No se pudo consultar los pedidos'); return data;
    }
    function dibujar() {
        document.getElementById('reloj').textContent = new Date().toLocaleString('es-CL',{timeZone:'America/Santiago'});
        var contenedor = document.getElementById('pedidos'); contenedor.replaceChildren();
        if (!cocina) {
            ['pendiente','preparacion','listo'].forEach(function (estado) {
                var columna = nodo('section',null,'columna '+estado);
                var lista = pedidos.filter(function (p) {return p.estado===estado;});
                columna.appendChild(nodo('h2',etiquetas[estado]+' · '+lista.length));
                lista.forEach(function (p) {columna.appendChild(nodo('div','#'+p.numero_pedido,'numero-cliente'));});
                if (!lista.length) columna.appendChild(nodo('p','Sin pedidos por ahora','vacio'));
                contenedor.appendChild(columna);
            });
            return;
        }
        var contadores = document.getElementById('contadores'); contadores.replaceChildren();
        ['todos','pendiente','preparacion','listo','entregado','urgente'].forEach(function (estado) {
            var total = pedidos.filter(function (p) {return estado==='todos'||(estado==='urgente'?urgente(p):p.estado===estado);}).length;
            var boton = nodo('button',null,'contador '+estado);
            boton.append(nodo('strong',total),nodo('span',etiquetas[estado] || (estado==='todos'?'Total de pedidos':'Urgentes')));
            boton.addEventListener('click',function () {document.getElementById('filtro').value=estado;dibujar();});
            contadores.appendChild(boton);
        });
        var filtro = document.getElementById('filtro').value;
        var visibles = pedidos.filter(function (p) {return filtro==='todos'||(filtro==='urgente'?urgente(p):p.estado===filtro);});
        visibles.forEach(function (p) {
            var fila = nodo('article',null,'pedido '+p.estado+(urgente(p)?' urgente':''));
            var identidad = nodo('div'); identidad.append(nodo('h2','#'+p.numero_pedido),nodo('p',new Date(p.fecha_hora).toLocaleString('es-CL',{timeZone:'America/Santiago'})),nodo('p',p.tipo_orden));
            if (urgente(p)) identidad.appendChild(nodo('strong','URGENTE','alerta'));
            var productos = nodo('ul',null,'productos');
            p.detalle.forEach(function (l) {
                var item = nodo('li',l.cantidad+' × '+l.nombre);
                if (l.ingredientes_quitados && l.ingredientes_quitados.length) item.appendChild(nodo('small','Sin: '+l.ingredientes_quitados.join(', ')));
                productos.appendChild(item);
            });
            var punto = nodo('div',null,'punto'); punto.append(nodo('p','Sucursal '+p.sucursal+' · Centro '+p.centro),
                nodo('small',p.pago_estado==='pendiente_caja'?'Pago pendiente en caja':'PMV · pago simulado'));
            var estado = nodo('div'); estado.appendChild(nodo('strong',etiquetas[p.estado]));
            if (siguiente[p.estado]) {
                var boton = nodo('button',acciones[p.estado]); boton.disabled=ocupado;
                boton.addEventListener('click',function () {cambiar(p);}); estado.appendChild(boton);
            }
            fila.append(identidad,productos,punto,estado,nodo('strong',p.estado==='entregado'?'Entregado':minutos(p)+' min','tiempo'));
            contenedor.appendChild(fila);
        });
        if (!visibles.length) contenedor.appendChild(nodo('p','No hay pedidos en este estado.','vacio'));
    }
    function programar() { clearTimeout(temporizador); if (activo) temporizador=setTimeout(cargar,3000); }
    async function cargar() {
        if (ocupado || !activo) return;
        ocupado=true; controlador=new AbortController();
        var limite=setTimeout(function () {controlador.abort();},10000);
        try {
            var data=await fetch(origen('listar'),{cache:'no-store',signal:controlador.signal}).then(respuesta);
            if (!activo) return;
            pedidos=data.list; csrf=data.csrf || ''; conexion.textContent='En línea · actualización automática'; conexion.className='conectado';
            mensaje.textContent='';
        } catch (e) {
            if (activo) {conexion.textContent='Sin conexión · los datos pueden estar desactualizados';conexion.className='desconectado';}
        } finally { clearTimeout(limite); ocupado=false; if(activo)dibujar(); programar(); }
    }
    async function cambiar(p) {
        if (ocupado || !activo) return;
        ocupado=true; clearTimeout(temporizador); dibujar();
        controlador=new AbortController(); var limite=setTimeout(function () {controlador.abort();},10000);
        try {
            await fetch(origen('estado'),{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
                body:JSON.stringify({pedido:p.numero_pedido,anterior:p.estado,estado:siguiente[p.estado]}),signal:controlador.signal}).then(respuesta);
        } catch(e) {mensaje.textContent=e.name==='AbortError'?'No se recibió confirmación. Actualiza antes de volver a intentar.':e.message;}
        finally {clearTimeout(limite);ocupado=false;programar();if(activo)dibujar();}
        // Consultar de nuevo incluso si se perdió la respuesta: el servidor puede haber guardado el cambio.
        if (activo) {
            var aviso=mensaje.textContent; await cargar(); if(aviso)mensaje.textContent=aviso;
        }
    }
    if(cocina) {
        document.getElementById('filtro').addEventListener('change',dibujar);
        document.getElementById('actualizar').addEventListener('click',cargar);
    }
    window.addEventListener('pagehide',function () {activo=false;clearTimeout(temporizador);if(controlador)controlador.abort();});
    window.addEventListener('pageshow',function () {if(!activo){activo=true;cargar();}});
    cargar();
});
