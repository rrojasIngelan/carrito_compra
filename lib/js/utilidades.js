// Cambiar de vista a través de la entrada, manteniendo la URL raíz.
function navegar(vista) {
    var formulario = document.createElement('form');
    formulario.method = 'POST';
    formulario.action = new URL('.', document.baseURI).href;
    var campo = document.createElement('input');
    campo.type = 'hidden';
    campo.name = 'vista';
    campo.value = vista;
    formulario.appendChild(campo);
    document.body.appendChild(formulario);
    formulario.submit();
}

// Comunicación del catálogo. Callbacks explícitos, sin eval ni despacho dinámico.
function consultarCatalogo(accion) {
    return fetch('lib/controller/catalogo.controller.php?accion=' + encodeURIComponent(accion))
        .then(function (response) {
            if (!response.ok) {
                return response.json().catch(function () {return {};}).then(function (data) {
                    throw new Error('No se pudo cargar el catálogo (HTTP ' + response.status + ')' +
                        (data.diagnostico_local ? ': ' + data.diagnostico_local : ''));
                });
            }
            return response.json();
        });
}

function escaparHtml(valor) {
    return String(valor == null ? '' : valor).replace(/[&<>"']/g, function (caracter) {
        return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[caracter];
    });
}

function imagenSegura(valor) {
    try {
        var url = new URL(valor, document.baseURI);
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (e) {}
    return new URL('lib/img/imagenNoDisponible.jpg', document.baseURI).href;
}

function consultarBeneficiosQr(parametros, accion, datos, signal) {
    if (accion !== 'crear' && accion !== 'estado') return Promise.reject(new Error('Acción QR inválida'));
    var url;
    try { url = new URL(parametros.urlBeneficiosQr); }
    catch (err) { return Promise.reject(new Error('URL de beneficios QR inválida')); }
    if (url.protocol !== 'https:') return Promise.reject(new Error('URL de beneficios QR inválida'));
    url.searchParams.set('accion', accion);
    url.searchParams.set('cliente', parametros.cliente);
    if (accion === 'crear') {
        url.searchParams.set('sucursal', parametros.sucursal);
        url.searchParams.set('centro', parametros.centro);
        url.searchParams.set('empresa', datos.empresa);
    } else url.searchParams.set('token', datos.token);
    return fetch(url.href, {method: 'GET', cache: 'no-store', credentials: 'omit', signal: signal}).then(function (r) {
        if (!r.ok) throw new Error('No se pudo procesar la lectura (HTTP ' + r.status + ')');
        return r.json();
    }).then(function (r) {
        if (Number(r.estado) !== 1) {
            var error = new Error(Number(r.estado) === 4 ? 'Código QR no encontrado o vencido' :
                Number(r.estado) === 2 ? 'Revisa los parámetros del kiosco' : 'El servidor no pudo procesar el QR');
            error.estado = Number(r.estado);
            throw error;
        }
        return r;
    });
}

function fechaBeneficios(ahora) {
    var partes = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Santiago', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(ahora || new Date());
    var campos = {};
    partes.forEach(function (parte) { campos[parte.type] = parte.value; });
    return campos.year + '-' + campos.month + '-' + campos.day;
}

function beneficioVigente(beneficio, ahora) {
    if (!beneficio || (beneficio.estatus != null && String(beneficio.estatus) !== '0')) return false;
    var dia = fechaBeneficios(ahora);
    var inicio = beneficio.fecha_inicio || beneficio.fecha_inicio_alianza;
    var fin = beneficio.fecha_fin || beneficio.fecha_fin_alianza;
    function fecha(valor) {
        if (!valor || String(valor).slice(0,10) === '0000-00-00') return '';
        return /^\d{4}-\d{2}-\d{2}/.test(String(valor)) ? String(valor).slice(0,10) : 'invalida';
    }
    inicio = fecha(inicio); fin = fecha(fin);
    return inicio !== 'invalida' && fin !== 'invalida' && (!inicio || inicio <= dia) && (!fin || fin >= dia);
}

function beneficioPorItem(empresa, id, cod, ahora) {
    if (!beneficioVigente(empresa, ahora)) return null;
    var reglas = Array.isArray(empresa.beneficios_productos) ? empresa.beneficios_productos : [];
    return reglas.filter(function (b) {
        var coincide = (b.id_item != null && id != null && String(b.id_item) === String(id)) ||
            (cod != null && b.cod_item != null && String(b.cod_item) === String(cod));
        return coincide && beneficioVigente(b, ahora) && Number.isFinite(Number(b.porcentaje)) && Number(b.porcentaje) >= 0 && Number(b.porcentaje) <= 100;
    }).sort(function (a,b) { return Number(b.porcentaje) - Number(a.porcentaje); })[0] || null;
}

function beneficioGeneral(empresa, ahora) {
    if (!beneficioVigente(empresa, ahora)) return null;
    return (Array.isArray(empresa.beneficios) ? empresa.beneficios : []).find(function (b) {
        var tipo = Number(b.tipo_descuento), valor = Number(b.valor_descuento);
        return beneficioVigente(b, ahora) && (tipo === 0 || tipo === 1) && Number.isFinite(valor) && valor >= 0 && (tipo !== 0 || valor <= 100);
    }) || null;
}

function precioConBeneficio(precio, id, empresa, cod, ahora) {
    // Compatibilidad con llamadas anteriores del carrito que sólo pasaban reglas por ítem.
    if (Array.isArray(empresa)) empresa = {beneficios_productos: empresa};
    var item = beneficioPorItem(empresa, id, cod, ahora);
    var general = item ? null : beneficioGeneral(empresa, ahora);
    var porcentaje = item ? Number(item.porcentaje) : general && Number(general.tipo_descuento) === 0 ? Number(general.valor_descuento) : 0;
    var descuento = !item && general && Number(general.tipo_descuento) === 1
        ? Math.round(Number(general.valor_descuento)) : Math.round(Number(precio) * porcentaje / 100);
    return Math.max(0, Number(precio) - descuento);
}

// Convertir carritos anteriores sin modificar sus importes ni cantidades.
function separarExtrasCarrito(carrito, buscarProducto) {
    var resultado = [];
    carrito.forEach(function (linea, indice) {
        var principal = Object.assign({}, linea, {extras: []});
        resultado.push(principal);
        (linea.extras || []).forEach(function (extra, posicion) {
            var producto = buscarProducto(extra.id) || {};
            resultado.push({uid:(linea.uid || 'anterior-'+indice)+'-extra-'+posicion,
                id:extra.id,slug:producto.slug,nombre:extra.nombre,img:producto.img || 'lib/img/imagenNoDisponible.jpg',
                precioBase:extra.precio,cant:linea.cant,combo:null,quitar:[],extras:[],
                extraDe:linea.uid,tipo_linea:'extra'});
        });
    });
    return resultado;
}
