/* ==========================================================================
   Kiosco de autoatención  ·  flujo de upselling
   - Catálogo: catalogo.controller.php -> catalogoDAO -> archivos / webservice
   - Presentación, navegación y estado de la orden en el navegador
   ========================================================================== */
$(document).ready(function () {
  "use strict";

  var usarImagenesWS = $('body').attr('data-imagenes') === 'ws';
  var usarCatalogoLocal = $('body').attr('data-catalogo') === 'local';
  var categoriasLimpias = usarImagenesWS && $('body').attr('data-categorias-limpias') === 'true';
  var categoriasDesdeBackend = false;
  var claveCarrito = usarImagenesWS ? 'kiosco_carrito_ws' : 'kiosco_carrito';

  /* ----- Parámetros de negocio que el WS todavía no entrega ---------------- */
  var CFG = {
    // deltas del upsell de combo (según el flujo de referencia)
    combo: [
      { id: "solo",      nombre: "Solo",                    extra: 0,    incluye: "" },
      { id: "combo",     nombre: "Combo",                   extra: 1900, incluye: "Papa mediana + bebida mediana" },
      { id: "agrandado", nombre: "Combo agrandado",         extra: 2890, incluye: "Papa grande + bebida grande" }
    ],
    extrasSlugs: ["papa_mediana", "empanadas_3", "nuggets_6"],   // "Agrega a tu orden"
    crossSlugs:  ["papa_grande", "avalancha_oreo_manjar"],       // "¿Quieres agregar algo más?"
    cupon: { codigo: "KIOSCO10", pct: 10 },
    metodosPago: [
      { id: "tarjeta",  nombre: "Tarjeta",  desc: "Paga con tu tarjeta y espera tu pedido en el despacho", ico: "💳", badge: "Retira tu pedido sin hacer filas" },
      { id: "rutpay",   nombre: "RutPay",   desc: "Paga con RutPay desde tu celular",   ico: "📱" },
      { id: "machbank", nombre: "MachBank", desc: "Paga con MachBank desde tu celular", ico: "🏦" },
      { id: "efectivo", nombre: "Efectivo", desc: "Acércate a caja y paga tu pedido", ico: "💵" }
    ]
  };

  var IMG_FALLBACK = "./lib/img/imagenNoDisponible.jpg";

  /* ----- Estado ---------------------------------------------------------- */
  var productos = [];     // normalizados
  var categorias = [];    // [{slug, nombre, img}]
  var imgResource = "";
  var parametrosKiosco = {};
  var colaPedidos = null, ventaFinal = null;

  var estado = {
    tipoOrden: null,
    identificado: false,
    catActual: null,
    prodActual: null,
    editUid: null,
    detalle: null,         // {cant, combo, quitar:[], extras:[]}
    carrito: [],
    descuento: 0,
    metodoPago: null,
    tarjeta: null
  };
  var historial = [];
  var beneficiosAlianza = null;
  var lecturaQr = {token: null, temporizador: null, vencimiento: null, solicitud: null, version: 0};
  var empresaQr = null;
  var claveAlianza = claveCarrito + '_alianza';
  var claveVentaPendiente = claveCarrito + '_venta_pendiente';
  var ventaPendiente = null;
  var registrandoVenta = false;
  var temporizadorPago = null;

  function precioAlianza(precio, id) {
    var producto = byId(id);
    return precioConBeneficio(precio, id, beneficiosAlianza ? beneficiosAlianza.empresa : null, producto && producto.cod);
  }
  function precioProducto(producto) { return precioAlianza(producto.precio, producto.id); }

  /* ----- Protector de pantalla ------------------------------------------- */
  var protector = {
    espera: 90000, intervalo: 7000, esperaRespuesta: 20,
    temporizador: null, rotador: null, cuentaAtras: null,
    activo: false, avisoActivo: false, iniciado: false, ultimoId: null
  };
  var frasesProtector = ["Date un gusto. Te lo mereces", "El sabor que estabas esperando", "Tu favorito está a un toque", "Hoy se disfruta algo rico", "Haz de este momento algo delicioso"];
  function mostrarProductoProtector() {
    var disponibles = productos.filter(function (p) { return p.img && p.img !== IMG_FALLBACK; });
    if (!disponibles.length) return;
    if (disponibles.length > 1) disponibles = disponibles.filter(function (p) { return p.id !== protector.ultimoId; });
    var producto = disponibles[Math.floor(Math.random() * disponibles.length)];
    protector.ultimoId = producto.id;
    $("#protector-producto-img").attr({ src: producto.img, alt: producto.nombre }).off("error").on("error", function () { onerr(this); });
    $("#protector-producto").text(producto.nombre);
    $("#protector-descripcion").text(producto.descripcion || "Preparado para disfrutar cada bocado");
    $("#protector-precio").text(clp(precioProducto(producto)));
    $("#protector-descubre").text("Descubre lo mejor de " + producto.catNombre);
    $("#protector-frase").text(frasesProtector[Math.floor(Math.random() * frasesProtector.length)]);
    var pantalla = document.getElementById("protector-pantalla");
    pantalla.classList.remove("producto-entrando");
    void pantalla.offsetWidth;
    pantalla.classList.add("producto-entrando");
  }
  function activarProtector() {
    if (protector.activo || !productos.length) return;
    protector.activo = true;
    mostrarProductoProtector();
    $("#protector-pantalla").addClass("activo").attr("aria-hidden", "false");
    protector.rotador = setInterval(mostrarProductoProtector, protector.intervalo);
  }
  function cerrarAvisoInactividad() {
    protector.avisoActivo = false;
    clearInterval(protector.cuentaAtras);
    $("#aviso-inactividad").removeClass("activo").attr("aria-hidden", "true");
  }
  function activarAvisoInactividad() {
    if (protector.avisoActivo || registrandoVenta || ventaPendiente || $('body').attr('data-vista') === 'alianza-qr') return;
    protector.avisoActivo = true;
    var restantes = protector.esperaRespuesta;
    $("#inactividad-segundos").text(restantes);
    $("#aviso-inactividad").addClass("activo").attr("aria-hidden", "false");
    $("#inactividad-continuar").trigger("focus");
    protector.cuentaAtras = setInterval(function () {
      restantes--;
      $("#inactividad-segundos").text(Math.max(0, restantes));
      if (restantes <= 0) {
        cerrarAvisoInactividad();
        reiniciar();
      }
    }, 1000);
  }
  function programarInactividad() {
    clearTimeout(protector.temporizador);
    if (protector.avisoActivo || registrandoVenta || ventaPendiente || $('body').attr('data-vista') === 'alianza-qr') return;
    protector.temporizador = setTimeout(function () {
      if ($("body").attr("data-vista") === "atract") activarProtector();
      else activarAvisoInactividad();
    }, protector.espera);
  }
  function registrarActividad() {
    if (protector.avisoActivo) return;
    if (protector.activo) {
      protector.activo = false;
      clearInterval(protector.rotador);
      $("#protector-pantalla").removeClass("activo").attr("aria-hidden", "true");
    }
    programarInactividad();
  }
  function iniciarProtector() {
    if (!usarImagenesWS) return;
    protector.iniciado = true;
    ["pointerdown", "mousemove", "keydown", "touchstart"].forEach(function (evento) {
      document.addEventListener(evento, function (e) {
        var estabaActivo = protector.activo;
        registrarActividad();
        if (estabaActivo && evento !== "mousemove") {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);
    });
    registrarActividad();
  }
  $("#inactividad-continuar").on("click", function () {
    cerrarAvisoInactividad();
    registrarActividad();
  });
  $("#inactividad-salir").on("click", function () {
    cerrarAvisoInactividad();
    reiniciar();
  });

  /* ======================================================================
     Utilidades
     ====================================================================== */
  function clp(n) { return "$" + Math.round(n).toLocaleString("es-CL"); }
  function onerr(img) { img.onerror = null; img.src = IMG_FALLBACK; }
  function urlImagen(ruta) {
    if (!ruta) return IMG_FALLBACK;
    try { return imagenSegura(new URL(String(ruta), imgResource || document.baseURI).href); }
    catch (e) { return IMG_FALLBACK; }
  }

  function toast(msg) {
    var $t = $("#toast").text(msg).addClass("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { $t.removeClass("show"); }, 1700);
  }

  function bySlug(slug) {
    return productos.find(function (p) { return p.slug === slug; });
  }
  function byId(id) {
    return productos.find(function (p) { return String(p.id) === String(id); });
  }

  function precioUnit(l) {
    var ex = (l.extras || []).reduce(function (a, x) { return a + precioAlianza(x.precio, x.id); }, 0);
    return precioAlianza(l.precioBase, l.id) + (l.combo ? l.combo.extra : 0) + ex;
  }
  function ahorroAlianza() {
    return estado.carrito.reduce(function (suma, l) {
      var original = l.precioBase + (l.combo ? l.combo.extra : 0) +
        (l.extras || []).reduce(function (s, x) { return s + x.precio; }, 0);
      return suma + (original - precioUnit(l)) * l.cant;
    }, 0);
  }
  function subtotal(l) { return precioUnit(l) * l.cant; }
  function subtotalOriginal(l) {
    return (l.precioBase + (l.combo ? l.combo.extra : 0) + (l.extras || []).reduce(function (s,x) { return s + x.precio; },0)) * l.cant;
  }
  function totalBruto() { return estado.carrito.reduce(function (a, l) { return a + subtotal(l); }, 0); }
  function totalNeto() {
    var t = totalBruto();
    return t - Math.round(t * estado.descuento / 100);
  }
  function nItems() { return estado.carrito.reduce(function (a, l) { return a + l.cant; }, 0); }

  /* ======================================================================
     Carga del catálogo y retorno de datos
     ====================================================================== */
  function cargarCatalogo() {
    return consultarCatalogo('listConfiguracion').then(function (resp) {
      parametrosKiosco = resp.parametros;
      if (!colaPedidos && parametrosKiosco.urlPedidos) {
        try {
          colaPedidos = iniciarEnvioPedidos(parametrosKiosco,function (id,pedido) {
            if (!ventaFinal || ventaFinal.venta_id !== id) return;
            ventaFinal.envio = Object.assign({},ventaFinal.envio,{estado:'enviado',pedido:pedido});
            mostrarPedidoFinal(ventaFinal);
            $('#boleta').html(generarBoletaHtml(ventaFinal));
          });
        } catch (err) {console.error('No se pudo iniciar la cola de pedidos:',err);}
      }
      if (usarCatalogoLocal) {
        return consultarCatalogo('listCatalogoLocal').then(function (local) {
          return [local, local.categorias || null];
        });
      }
      var p = resp.parametros;
      localStorage.setItem('cliente', JSON.stringify({cliente: p.cliente, sucursal: p.sucursal, centro: p.centro}));
      imgResource = p.urlImg || '';
      localStorage.setItem('imgResource', JSON.stringify(imgResource));
      var consultaCategorias = Promise.resolve([]);
      if (p.urlCategorias) {
        consultaCategorias = consultarCatalogo('listCategorias').then(function (data) {
          return data && Array.isArray(data.list) ? data.list : [];
        });
      }
      return Promise.all([consultarCatalogo('listProductos'), consultaCategorias]);
    });
  }

  function retorno_catalogo(resultados) {
      var data = resultados[0];
      if (!data || !data.list) throw new Error('respuesta sin "list"');
      productos = normalizar(data.list);
      categoriasDesdeBackend = !usarCatalogoLocal;
      if (categoriasDesdeBackend) {
        categorias = categoriasBackend(resultados[1] || [], productos);
        var categoriasVisibles = Object.create(null);
        categorias.forEach(function (c) { categoriasVisibles[String(c.id)] = true; });
        productos = productos.filter(function (p) {
          return p.catId !== null && categoriasVisibles[String(p.catId)];
        });
        var categoriasConProductos = Object.create(null);
        productos.forEach(function (p) { categoriasConProductos[String(p.catId)] = true; });
        categorias = categorias.filter(function (c) { return categoriasConProductos[String(c.id)]; });
      } else {
        categorias = agruparCategorias(productos);
      }
      if (categoriasLimpias) aplicarCategoriasLimpias();
      arranque();
  }

  function error_catalogo(err) {
      console.error("Error cargando productos:", err);
      $("#pantallas").html('<div class="cart-vacio" style="padding:80px 20px">' +
        'No pudimos cargar el menú. Comprueba la conexión y vuelve a intentarlo.<br>' +
        '<button type="button" class="alianzas-continuar" id="catalogo-reintentar">Reintentar</button></div>');
      $('#catalogo-reintentar').on('click', function () { window.location.reload(); });
  }

  cargarCatalogo().then(retorno_catalogo).catch(error_catalogo);

  function normalizar(list) {
    return list.filter(function (it) {
      return parseInt(it.estatus, 10) !== 1;
    }).map(function (it) {
      return {
        id: it.id_item,
        slug: it.slug || ("item-" + it.id_item),
        cod: it.cod_item,
        nombre: it.nombre_producto,
        descripcion: it.descripcion || "",
        precio: parseInt(it.precio_unitario, 10) || 0,
        img: urlImagen(it.url_imagen_item),
        catId: it.id_categoria == null || String(it.id_categoria).trim() === '' ? null : parseInt(it.id_categoria, 10),
        catSlug: it.categoria_slug || "otros",
        catNombre: it.descripcion_categoria || "Otros",
        permiteCombo: it.permite_combo === true || it.permite_combo === "true" ||
                      parseInt(it.permite_combo, 10) === 1,
        maxQuitar: parseInt(it.max_quitar, 10) || 0,
        ingredientes: Array.isArray(it.ingredientes_quitar) ? it.ingredientes_quitar : []
      };
    });
  }

  function agruparCategorias(prods) {
    var orden = [], map = Object.create(null);
    prods.forEach(function (p) {
      if (!map[p.catSlug]) {
        map[p.catSlug] = { id: p.catSlug, slug: p.catSlug, nombre: p.catNombre, img: p.img };
        orden.push(map[p.catSlug]);
      }
    });
    return orden;
  }

  function categoriasBackend(listado, prods) {
    var nombres = Object.create(null);
    prods.forEach(function (p) {
      if (p.catId !== null && !nombres[String(p.catId)]) nombres[String(p.catId)] = p.catNombre;
    });
    var usadas = Object.create(null);
    return listado.map(function (c) {
      var id = c.id_categoria == null || String(c.id_categoria).trim() === '' ? null : parseInt(c.id_categoria, 10);
      if (id === null || isNaN(id) || usadas[String(id)]) return null;
      usadas[String(id)] = true;
      var modoVista = parseInt(c.modo_vista, 10);
      var descripcion = String(c.descripcion || '').trim();
      return {
        id: id,
        slug: String(c.slug || '').trim(),
        nombre: descripcion || nombres[String(id)] || String(c.slug || '').trim() || 'Categoría',
        descripcion: descripcion,
        modoVista: isNaN(modoVista) ? 0 : modoVista,
        mostrarDescripcion: modoVista === 1,
        orden: c.orden == null || String(c.orden).trim() === '' ? null : parseInt(c.orden, 10),
        img: urlImagen(c.url_imagen_categoria)
      };
    }).filter(Boolean);
  }

  // Variante local con fotos sin texto; el WS sigue definiendo productos y orden.
  function aplicarCategoriasLimpias() {
    var slugs = ['alitas', 'strips_familiar', 'mixto_familiar', 'para_dos', 'boxes',
      'combos_pollos', 'sandwich', 'twister', 'pizzas', 'snacks', 'postres', 'bebidas'];
    categorias.forEach(function (c) {
      var archivo = c.slug === 'alitas_picantes' ? 'alitas' : c.slug;
      if (slugs.indexOf(archivo) === -1) return;
      c.img = 'lib/img/categorias-limpias/' + archivo + '.png';
      c.imagenLimpia = true;
    });
  }
  function productosDeCat(categoriaId) {
    return productos.filter(function (p) {
      return categoriasDesdeBackend ? String(p.catId) === String(categoriaId) : p.catSlug === categoriaId;
    });
  }

  function grupoVenta(p) {
    var texto = ((p.catNombre || "") + " " + (p.nombre || "")).toLowerCase();
    if (/bebida|jugo|agua|gaseosa|coca|refresco/.test(texto)) return "bebida";
    if (/postre|helado|avalancha|dulce|brownie/.test(texto)) return "postre";
    if (/papa|snack|empanada|nugget|acompañamiento/.test(texto)) return "acompanamiento";
    return "principal";
  }

  function sugerenciasUpsell(limite, excluirId) {
    var excluidos = {};
    estado.carrito.forEach(function (l) {
      excluidos[String(l.id)] = true;
      (l.extras || []).forEach(function (x) { excluidos[String(x.id)] = true; });
    });
    if (excluirId != null) excluidos[String(excluirId)] = true;

    var contexto = estado.carrito.map(function (l) { return byId(l.id); }).filter(Boolean);
    if (estado.prodActual && excluirId != null) contexto.push(estado.prodActual);
    var gruposPresentes = {};
    contexto.forEach(function (p) { gruposPresentes[grupoVenta(p)] = true; });
    var referencia = contexto.length ? contexto.reduce(function (s, p) { return s + p.precio; }, 0) / contexto.length : 0;

    return productos.filter(function (p) {
      return p.precio > 0 && !excluidos[String(p.id)];
    }).map(function (p) {
      var grupo = grupoVenta(p), puntaje = 0;
      if (grupo === "bebida" && !gruposPresentes.bebida) puntaje += 140;
      if (grupo === "acompanamiento" && !gruposPresentes.acompanamiento) puntaje += 115;
      if (grupo === "postre" && !gruposPresentes.postre) puntaje += 100;
      if (grupo === "principal" && !gruposPresentes.principal) puntaje += 70;
      if (gruposPresentes[grupo]) puntaje -= 30;
      if (referencia && p.precio <= referencia * .55) puntaje += 35;
      if (excluirId != null && estado.prodActual && p.catId === estado.prodActual.catId) puntaje -= 20;
      return { producto: p, puntaje: puntaje };
    }).sort(function (a, b) {
      return b.puntaje - a.puntaje || a.producto.precio - b.producto.precio;
    }).slice(0, limite).map(function (x) { return x.producto; });
  }

  /* ======================================================================
     Navegación
     ====================================================================== */
  function ir(nombre, sinHist) {
    var act = $(".pantalla.activa").data("p");
    if (act && !sinHist && act !== nombre) historial.push(act);
    mostrar(nombre);
  }
  function volver() {
    if (!historial.length) return;
    mostrar(historial.pop());
  }
  // Ilustraciones del montaje de referencia, recortadas visualmente con CSS.
  // Se mantienen los nombres, precios y disponibilidad entregados por el servicio.
  function ilustrarFlujo() {
    if (usarImagenesWS || categoriasDesdeBackend) return;
    var recortes = {
      sandwich: [359, 546, 119, 107], combo: [88, 556, 105, 84],
      papas: [30, 1028, 62, 76], empanadas: [137, 1024, 53, 72],
      postre: [575, 950, 122, 151], pollo: [819, 130, 65, 61],
      twister: [949, 242, 62, 58], bebida: [884, 353, 63, 60]
    };
    $('.flujo-compra .pantalla.activa img:not(.marca img)').each(function () {
      var $img = $(this), texto = $img.parent().text().toLowerCase();
      if (this.id === 'det-img') texto = $('#det-nombre').text().toLowerCase();
      if (this.id === 'sugerido-img') texto = $('#sugerido-nombre').text().toLowerCase();
      var tipo = /avalancha|oreo|helado|postre/.test(texto) ? 'postre' :
        /empanada/.test(texto) ? 'empanadas' : /papa|snack/.test(texto) && !/sandwich|combo/.test(texto) ? 'papas' :
        /twister/.test(texto) ? 'twister' : /bebida/.test(texto) && !/sandwich|combo/.test(texto) ? 'bebida' :
        /combo/.test(texto) ? 'combo' : /sandwich|crispy|italiano|deluxe|box/.test(texto) ? 'sandwich' :
        /pollo|alita|strips|mixto|para dos|nugget/.test(texto) ? 'pollo' : null;
      if (!tipo) return;
      var r = recortes[tipo];
      $img.off('error').each(function () { this.onerror = null; }).attr('src',
        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="' + r[2] + '" height="' + r[3] + '"/%3E')
        .addClass('arte-referencia').css({
          'background-image': 'url("lib/img/kiosco-flujo-referencia.png")',
          'background-size': (1024 / r[2] * 100) + '% ' + (1536 / r[3] * 100) + '%',
          'background-position': (r[0] / (1024 - r[2]) * 100) + '% ' + (r[1] / (1536 - r[3]) * 100) + '%',
          'aspect-ratio': r[2] + ' / ' + r[3]
        });
    });
  }
  function mostrar(nombre) {
    if (nombre !== 'alianza-qr' && lecturaQr.solicitud) detenerLecturaQr();
    // La portada ocupa toda la pantalla; las barras aparecen al iniciar la orden.
    $('body').toggleClass('inicio-kiosco', nombre === 'atract');
    $('body').toggleClass('vista-identidad', nombre === 'identidad');
    $('body').toggleClass('vista-alianzas', nombre === 'alianzas' || nombre === 'alianza-qr');
    $('body').toggleClass('vista-categorias', nombre === 'categorias');
    $('body').toggleClass('flujo-compra', ['atract', 'identidad', 'alianzas', 'alianza-qr', 'categorias'].indexOf(nombre) === -1);
    $('body').attr('data-vista', nombre);
    $(".pantalla").removeClass("activa");
    $('.pantalla[data-p="' + nombre + '"]').addClass("activa");
    var sinVolver = { atract: 1, final: 1, datafono: 1 };
    $("#btn-volver").prop("hidden", !!sinVolver[nombre] || historial.length === 0);
    window.scrollTo(0, 0);

    if (nombre === "categorias") renderCategorias();
    if (nombre === "productos") renderProductos();
    if (nombre === "combo") renderCombo();
    if (nombre === "extras") {
      confirmarLinea(true);
      renderExtras();
    }
    if (nombre === "carrito") renderCarrito();
    if (nombre === "pago") renderPago();
    ilustrarFlujo();
    if (protector.iniciado) programarInactividad();
  }

  /* ======================================================================
     Barra superior
     ====================================================================== */
  function refrescarTop() {
    $("#cart-badge").text(nItems());
    $("#cart-monto").text(clp(totalNeto()));
    $("#cart-tipo").text(estado.tipoOrden ? estado.tipoOrden.toUpperCase() : " ");
    $("#top-cart").toggleClass("vacio", nItems() === 0);
    $('#beneficio-activo').text(beneficiosAlianza ? 'Beneficios ' + beneficiosAlianza.empresa.nombre_empresa + ' activos' : '').prop('hidden', !beneficiosAlianza);
  }

  /* ======================================================================
     1. Atracción
     ====================================================================== */
  $(document).on("click", "[data-orden]", function () {
    estado.tipoOrden = $(this).data("orden");
    refrescarTop();
    ir("identidad");
  });

  /* ======================================================================
     2. Identificación
     ====================================================================== */
  $("#btn-ident").on("click", function () {
    ir('alianzas');
    cargarEmpresasAlianza();
  });

  var consultaAlianzas = 0;
  function cargarEmpresasAlianza() {
    var consulta = ++consultaAlianzas;
    $('#alianzas-lista').empty().attr('aria-busy', 'true');
    $('#alianzas-estado').text('Cargando empresas con beneficios…');
    $('#alianzas-reintentar').prop('hidden', true);
    consultarCatalogo('listEmpresasAlianza').then(function (resp) {
      if (consulta !== consultaAlianzas) return;
      retorno_empresasAlianza(resp);
    }).catch(function (err) {
      if (consulta !== consultaAlianzas) return;
      $('#alianzas-estado').text('No se pudieron cargar las empresas. Puedes reintentar o continuar sin beneficios.');
      $('#alianzas-reintentar').prop('hidden', false);
      console.error('Error cargando empresas con beneficios:', err);
    }).finally(function () {
      if (consulta === consultaAlianzas) $('#alianzas-lista').attr('aria-busy', 'false');
    });
  }

  function retorno_empresasAlianza(resp) {
    if (!resp || !Array.isArray(resp.list)) throw new Error('Listado de empresas inválido');
    var empresas = resp.list.filter(function (empresa) { return String(empresa.estatus) === '0'; });
    var $lista = $('#alianzas-lista').empty();
    $('#alianzas-estado').text(empresas.length ? '' : 'No hay empresas con beneficios disponibles.');
    empresas.forEach(function (empresa) {
      var $boton = $('<button type="button" class="alianza-empresa" aria-pressed="false"></button>');
      if (empresa.url_imagen_empresa) {
        var imagen = imagenSegura(new URL(empresa.url_imagen_empresa, new URL(imgResource || 'lib/', document.baseURI)).href);
        $('<img alt="">').attr('src', imagen).on('error', function () { $(this).hide(); }).appendTo($boton);
      }
      var $detalle = $('<span class="alianza-detalle"></span>').appendTo($boton);
      $('<strong></strong>').text(empresa.nombre_empresa || 'Empresa con beneficios').appendTo($detalle);
      $('<span></span>').text('Identifícate para acceder a tus beneficios').appendTo($detalle);
      $boton.on('click', function () {
        $lista.find('button').attr('aria-pressed', 'false');
        $boton.attr('aria-pressed', 'true');
        mostrarQrAlianza(empresa);
      });
      $lista.append($boton);
    });
  }

  function mostrarQrAlianza(empresa) {
    limpiarBeneficios();
    empresaQr = empresa;
    var nombre = empresa.nombre_empresa || 'tu alianza';
    var $empresaQr = $('#alianza-qr-empresa').empty();
    if (empresa.url_imagen_empresa) {
      try {
        var baseLogo = new URL(imgResource || parametrosKiosco.urlImg || 'lib/', document.baseURI);
        var logoEmpresa = imagenSegura(new URL(empresa.url_imagen_empresa, baseLogo).href);
        $('<img>').attr({src: logoEmpresa, alt: nombre}).on('error', function () {
          $empresaQr.text(nombre);
        }).appendTo($empresaQr);
      } catch (err) { $empresaQr.text(nombre); }
    } else {
      $empresaQr.text(nombre);
    }
    $('#alianza-qr-estado').text('Preparando tu código QR…');
    $('#alianza-qr-reintentar').prop('hidden', true);
    $('#alianza-qr-enlace').prop('hidden', true).removeAttr('href');
    var $codigo = $('#alianza-qr-codigo').empty().attr('aria-label', 'Código QR de identificación para ' + nombre);
    ir('alianza-qr');
    var version = lecturaQr.version;
    lecturaQr.solicitud = new AbortController();
    lecturaQr.vencimiento = setTimeout(function () { expirarQr(version); }, 15 * 60 * 1000);
    consultarBeneficiosQr(parametrosKiosco, 'crear', {empresa: String(empresa.id_empresa_alianza)}, lecturaQr.solicitud.signal).then(function (lectura) {
      if (version !== lecturaQr.version || $('body').attr('data-vista') !== 'alianza-qr') return;
      if (typeof lectura.token !== 'string' || !lectura.token || typeof lectura.url_activacion !== 'string') throw new Error('Respuesta QR inválida');
      lecturaQr.token = lectura.token;
      var urlLectura = new URL(lectura.url_activacion);
      if (urlLectura.protocol !== 'https:' || urlLectura.origin !== new URL(parametrosKiosco.urlBeneficiosQr).origin) throw new Error('URL de activación inválida');
      new QRCode($codigo[0], {
        text: lectura.url_activacion,
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
      $codigo.find('img').attr('alt', 'Código QR de identificación para ' + nombre);
      $('#alianza-qr-estado').text('Escanea el QR y abre el enlace para activar tus beneficios.');
      $('#alianza-qr-enlace').attr('href', lectura.url_activacion).prop('hidden', false);
      $('#alianza-qr-red').text('El código estará disponible durante 15 minutos.');
      lecturaQr.temporizador = setTimeout(function () { esperarLecturaQr(version); }, 2500);
    }).catch(function (err) {
      if (version !== lecturaQr.version) return;
      errorQr('No se pudo generar el código QR. ' + err.message);
      console.error('Error generando QR de alianza:', err);
    });
  }

  function detenerLecturaQr() {
    clearTimeout(lecturaQr.temporizador);
    clearTimeout(lecturaQr.vencimiento);
    lecturaQr.version++;
    if (lecturaQr.solicitud) lecturaQr.solicitud.abort();
    lecturaQr.solicitud = null;
    lecturaQr.token = null;
  }

  function errorQr(mensaje) {
    detenerLecturaQr();
    $('#alianza-qr-codigo').empty().removeAttr('title');
    $('#alianza-qr-enlace').prop('hidden', true).removeAttr('href');
    $('#alianza-qr-estado').text(mensaje);
    $('#alianza-qr-red').text('');
    $('#alianza-qr-reintentar').prop('hidden', false);
  }

  function expirarQr(version) {
    if (version === lecturaQr.version) errorQr('El código QR venció. Genera uno nuevo para activar tus beneficios.');
  }

  function esperarLecturaQr(version) {
    if (version !== lecturaQr.version || !lecturaQr.token) return;
    consultarBeneficiosQr(parametrosKiosco, 'estado', {token: lecturaQr.token}, lecturaQr.solicitud.signal).then(function (r) {
      if (version !== lecturaQr.version) return;
      if (r.activado === true) {
        if (String(r.id_empresa_alianza) !== String(empresaQr.id_empresa_alianza)) throw new Error('La empresa activada no coincide con la seleccionada');
        var activacion = {token: lecturaQr.token, empresa: empresaQr};
        sessionStorage.setItem(claveAlianza, JSON.stringify(activacion));
        if (!activarBeneficios(activacion)) {
          errorQr('La alianza está fuera de vigencia. Selecciona otra empresa.');
          return;
        }
        detenerLecturaQr();
        historial = [];
        cerrarAvisoInactividad();
        mostrar('categorias');
        toast('Beneficios activados');
        return;
      }
      if (r.activado !== false) throw new Error('Estado de activación inválido');
      $('#alianza-qr-estado').text('Escanea el QR y abre el enlace para activar tus beneficios.');
      lecturaQr.temporizador = setTimeout(function () { esperarLecturaQr(version); }, 2500);
    }).catch(function (err) {
      if (version !== lecturaQr.version) return;
      if (err.estado === 4) { expirarQr(version); return; }
      if (err.estado || err.message === 'La empresa activada no coincide con la seleccionada' || err.message === 'Estado de activación inválido') {
        errorQr(err.message);
        return;
      }
      $('#alianza-qr-estado').text('Reconectando con el kiosco para comprobar la lectura…');
      $('#alianza-qr-reintentar').prop('hidden', false);
      lecturaQr.temporizador = setTimeout(function () { esperarLecturaQr(version); }, 2500);
    });
  }

  function activarBeneficios(respuesta) {
    if (!beneficioVigente(respuesta.empresa)) {
      limpiarBeneficios();
      toast('La alianza está fuera de vigencia');
      return false;
    }
    beneficiosAlianza = respuesta;
    estado.empresaActiva = respuesta.empresa;
    estado.identificado = true;
    refrescarTop();
    guardar();
    return true;
  }

  function limpiarBeneficios() {
    detenerLecturaQr();
    sessionStorage.removeItem(claveAlianza);
    beneficiosAlianza = null;
    estado.empresaActiva = null;
    estado.identificado = false;
    refrescarTop();
    guardar();
  }

  $('#alianza-qr-volver').on('click', volver);
  $('#alianza-qr-reintentar').on('click', function () { if (empresaQr) mostrarQrAlianza(empresaQr); });
  $('#alianza-qr-sin-beneficios').on('click', function () {
    limpiarBeneficios();
    historial = historial.filter(function (nombre) { return nombre !== 'alianza-qr'; });
    mostrar('categorias');
  });

  $('#alianzas-reintentar').on('click', cargarEmpresasAlianza);
  $('#alianzas-volver').on('click', volver);
  $('#alianzas-sin-beneficios').on('click', function () {
    limpiarBeneficios();
    ir('categorias');
  });
  $("#btn-sin-ben").on("click", function () {
    limpiarBeneficios();
    ir("categorias");
  });

  /* ======================================================================
     3. Categorías
     ====================================================================== */
  function renderCategorias() {
    var $g = $("#cat-grid").empty();
    $("#categorias-badge").text(nItems());
    $("#categorias-carrito").attr("aria-label", "Ver carrito: " + nItems() + " productos");
    if (categoriasDesdeBackend || usarImagenesWS) {
      if (!categorias.length) {
        $g.html('<p class="cart-vacio">No hay categorías disponibles.</p>');
        return;
      }
      categorias.forEach(function (c) {
        var $boton = $('<button type="button" class="cat-card"></button>');
        $('<img alt="">').attr('src', c.img).on('error', function () { onerr(this); }).appendTo($boton);
        $boton.attr('aria-label', c.nombre);
        if (c.imagenLimpia || c.mostrarDescripcion === true) {
          $('<span></span>').text(c.imagenLimpia ? c.nombre : (c.descripcion !== undefined ? c.descripcion : c.nombre)).appendTo($boton);
        }
        $boton.on('click', function () { estado.catActual = c.id; ir('productos'); });
        $g.append($boton);
      });
      return;
    }
    // Orden de las tarjetas de la imagen; el slug real se obtiene del servicio.
    var nombres = ["ALITAS PICANTES", "STRIPS FAMILIAR", "MIXTO FAMILIAR", "PARA DOS",
      "BOXES", "COMBOS POLLOS", "SANDWICH", "TWISTER", "SNACKS", "POSTRES", "BEBIDAS"];
    function nombreBase(nombre) {
      return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .split("(")[0].trim().replace(/\s+/g, " ").toUpperCase();
    }
    nombres.forEach(function (nombre) {
      var categoria = categorias.find(function (c) { return nombreBase(c.nombre) === nombre; });
      var $boton = $('<button type="button" class="categorias-zona"></button>').attr("aria-label", nombre);
      $boton.on("click", function () {
        if (!categoria) { toast("Categoría no disponible por el momento"); return; }
        estado.catActual = categoria.slug;
        ir("productos");
      });
      $g.append($boton);
    });
    $("#categorias-badge").text(nItems());
    $("#categorias-carrito").attr("aria-label", "Ver carrito: " + nItems() + " productos");
  }
  /* ======================================================================
     4. Lista de productos + riel de categorías
     ====================================================================== */
  function renderProductos() {
    var categoriaId = estado.catActual != null ? estado.catActual : (categorias[0] && categorias[0].id);
    estado.catActual = categoriaId;
    var cat = categorias.find(function (c) { return String(c.id) === String(categoriaId); });
    $("#prod-cat-tit").text(cat ? cat.nombre : "Categoría");

    var $rail = $("#cat-rail").empty();
    categorias.forEach(function (c) {
      var $r = $('<div class="r-item' + (String(c.id) === String(categoriaId) ? " on" : "") + '"></div>').attr('aria-label', c.nombre);
      var $imagenCategoria = $('<img alt="">').attr('src', c.img);
      if (usarImagenesWS) {
        $('<div class="rail-imagen"></div>').append($imagenCategoria).appendTo($r);
      } else {
        $imagenCategoria.appendTo($r);
      }
      if (c.imagenLimpia || c.mostrarDescripcion === true) {
        $('<span></span>').text(c.imagenLimpia ? c.nombre : (c.descripcion !== undefined ? c.descripcion : c.nombre)).appendTo($r);
      }
      $r.find("img").on("error", function () { onerr(this); });
      $r.on("click", function () { estado.catActual = c.id; renderProductos(); ilustrarFlujo(); });
      $rail.append($r);
    });

    var $l = $("#prod-list").empty();
    var items = productosDeCat(categoriaId);
    if (!items.length) { $l.html('<p class="cart-vacio">Sin productos.</p>'); return; }
    items.forEach(function (p) {
      var $row = $(
        '<div class="prod-row">' +
          '<img alt="" src="' + escaparHtml(imagenSegura(p.img)) + '">' +
          '<div class="info"><h3>' + escaparHtml(p.nombre) + "</h3><p>" + escaparHtml(p.descripcion) + "</p></div>" +
          '<div class="precio">' + clp(precioProducto(p)) +
            (precioProducto(p) < p.precio ? '<small class="producto-beneficio">Antes ' + clp(p.precio) + '</small>' : '') + "</div>" +
        "</div>"
      );
      $row.find("img").on("error", function () { onerr(this); });
      $row.on("click", function () { abrirDetalle(p.id); });
      $l.append($row);
    });
  }

  /* ======================================================================
     5. Detalle de producto (cantidad + quitar ingrediente)
     ====================================================================== */
  function abrirDetalle(id, linea) {
    var p = byId(id);
    if (!p) return;
    estado.prodActual = p;

    if (linea) {
      estado.editUid = linea.uid;
      estado.detalle = {
        cant: linea.cant,
        combo: linea.combo ? $.extend({}, linea.combo) : null,
        quitar: (linea.quitar || []).slice(),
        extras: estado.carrito.filter(function (x) { return x.extraDe === linea.uid; }).map(function (x) {
          return {id:x.id,nombre:x.nombre,precio:x.precioBase,uidCarrito:x.uid,cant:x.cant};
        })
      };
    } else {
      estado.editUid = null;
      estado.detalle = { cant: 1, combo: null, quitar: [], extras: [] };
    }

    $("#det-img").attr("src", p.img).each(function () {
      this.onerror = function () { onerr(this); };
    });
    $("#det-nombre").text(p.nombre);
    $("#det-desc").text(p.descripcion);
    $("#det-precio").text(clp(precioProducto(p)));
    $("#det-cant").text(estado.detalle.cant);

    var puedeQuitar = p.maxQuitar > 0 && p.ingredientes.length > 0;
    $("#sec-quitar").prop("hidden", !puedeQuitar);
    if (puedeQuitar) {
      $("#quitar-tt").text("Quitar ingrediente · " + p.nombre);
      $("#quitar-hint").text("Puedes seleccionar hasta " + p.maxQuitar +
        (p.maxQuitar === 1 ? " opción" : " opciones"));
      var $c = $("#chips-quitar").empty();
      p.ingredientes.forEach(function (ing) {
        var sel = estado.detalle.quitar.indexOf(ing.nombre) >= 0;
        var $chip = $('<div class="chip' + (sel ? " sel" : "") + '"><span class="em">&#128683;</span>' +
          ing.nombre + "</div>");
        $chip.on("click", function () {
          var i = estado.detalle.quitar.indexOf(ing.nombre);
          if (i >= 0) { estado.detalle.quitar.splice(i, 1); }
          else {
            if (estado.detalle.quitar.length >= p.maxQuitar) {
              toast("Máximo " + p.maxQuitar + " ingrediente(s)"); return;
            }
            estado.detalle.quitar.push(ing.nombre);
          }
          $chip.toggleClass("sel");
          pintarProgreso();
        });
        $c.append($chip);
      });
    }

    $("#det-continuar").text(estado.editUid ? "Continuar" : "Continuar");
    pintarProgreso();
    actualizarTotalDetalle();
    ir("detalle");
  }

  function lineaTmp() {
    var p = estado.prodActual, d = estado.detalle;
    return { id: p.id, precioBase: p.precio, combo: d.combo, extras: [], cant: d.cant };
  }
  function actualizarTotalDetalle() {
    var total = subtotal(lineaTmp()) + estado.detalle.extras.reduce(function (suma,extra) {
      return suma + precioAlianza(extra.precio,extra.id) * (extra.cant || 1);
    },0);
    $("#det-total").text(clp(total));
    $("#extras-total").text(clp(total));
  }
  function pintarProgreso() {
    var p = estado.prodActual, d = estado.detalle;
    $("#prog2").toggleClass("on", !p.permiteCombo || !!d.combo);
    $("#prog3").toggleClass("on", d.extras.length > 0 || d.quitar.length > 0);
  }

  $("#det-mas").on("click", function () {
    estado.detalle.cant++; $("#det-cant").text(estado.detalle.cant); actualizarTotalDetalle();
  });
  $("#det-menos").on("click", function () {
    if (estado.detalle.cant <= 1) return;
    estado.detalle.cant--; $("#det-cant").text(estado.detalle.cant); actualizarTotalDetalle();
  });
  $("#det-seguir, #det-salir").on("click", function () { ir("categorias"); });

  $("#det-continuar").on("click", function () {
    if (estado.prodActual.permiteCombo && !estado.detalle.combo) ir("combo");
    else ir("extras");
  });

  /* ======================================================================
     6. Upsell combo
     ====================================================================== */
  function renderCombo() {
    var p = estado.prodActual, d = estado.detalle;
    var $o = $("#combo-opts").empty();
    CFG.combo.forEach(function (op) {
      var total = (precioProducto(p) + op.extra) * d.cant;
      var nm = op.id === "solo" ? p.nombre : (op.nombre + " " + p.nombre);
      var $op = $(
        '<div class="combo-opt">' +
          '<div class="delta">' + (op.extra ? "+" + clp(op.extra) : "&nbsp;") + "</div>" +
          '<img alt="" src="' + escaparHtml(imagenSegura(p.img)) + '">' +
          '<div class="nm">' + escaparHtml(nm) + "</div>" +
          '<div class="inc">' + (op.incluye || "") + "</div>" +
          '<div class="tt2">Total ' + clp(total) + "</div>" +
        "</div>"
      );
      $op.find("img").on("error", function () { onerr(this); });
      $op.on("click", function () {
        estado.detalle.combo = op.id === "solo" ? null
          : { id: op.id, nombre: op.nombre, extra: op.extra, incluye: op.incluye };
        ir("extras");
      });
      $o.append($op);
    });
  }
  $("#combo-no").on("click", function () { estado.detalle.combo = null; ir("extras"); });
  $("#combo-salir").on("click", function () { ir("categorias"); });

  /* ======================================================================
     7. Extras  "Agrega a tu orden"
     ====================================================================== */
  function renderExtras() {
    var $g = $("#extras-grid").empty();
    var elegidos = estado.detalle.extras.map(function (extra) { return byId(extra.id); }).filter(Boolean);
    var lista = elegidos.concat(sugerenciasUpsell(4, estado.prodActual && estado.prodActual.id))
      .filter(function (p,indice,todos) { return todos.findIndex(function (x) {return String(x.id) === String(p.id);}) === indice; }).slice(0,4);
    if (!lista.length) { $g.html('<p style="color:var(--gris-txt)">Sin extras disponibles.</p>'); }
    lista.forEach(function (p) {
      var sel = estado.detalle.extras.some(function (x) { return x.id === p.id; });
      var $e = $(
        '<div class="extra-card' + (sel ? " sel" : "") + '">' +
          '<img alt="" src="' + escaparHtml(imagenSegura(p.img)) + '">' +
          '<div class="nm">' + escaparHtml(p.nombre) + "</div>" +
          '<div class="pr">+' + clp(precioProducto(p)) + "</div>" +
          '<button class="add">' + (sel ? "✓" : "+") + "</button>" +
        "</div>"
      );
      $e.find("img").on("error", function () { onerr(this); });
      $e.on("click", function () {
        var i = estado.detalle.extras.findIndex(function (x) { return x.id === p.id; });
        if (i >= 0) { estado.detalle.extras.splice(i, 1); $e.removeClass("sel").find(".add").text("+"); }
        else {
          if (estado.detalle.extras.length >= 4) { toast("Máximo 4 extras"); return; }
          estado.detalle.extras.push({ id: p.id, nombre: p.nombre, precio: p.precio });
          $e.addClass("sel").find(".add").text("✓");
        }
        actualizarTotalDetalle();
        pintarProgreso();
        confirmarLinea(true);
      });
      $g.append($e);
    });
    actualizarTotalDetalle();
  }
  $("#extras-seguir").on("click", function () { confirmarLinea(); ir("categorias"); });
  $("#extras-pagar").on("click", function () { confirmarLinea(); ir("carrito"); });

  /* ======================================================================
     Confirmar línea en el carrito
     ====================================================================== */
  function confirmarLinea(silencioso) {
    var p = estado.prodActual, d = estado.detalle;
    var linea = {
      uid: estado.editUid || ("l" + Date.now() + Math.floor(Math.random() * 1000)),
      id: p.id, slug: p.slug, nombre: p.nombre, img: p.img,
      precioBase: p.precio,
      combo: d.combo,
      quitar: d.quitar.slice(),
      extras: [],
      cant: d.cant
    };
    if (estado.editUid) {
      var i = estado.carrito.findIndex(function (l) { return l.uid === estado.editUid; });
      if (i >= 0) {
        linea.extraDe = estado.carrito[i].extraDe;
        linea.tipo_linea = estado.carrito[i].tipo_linea;
        estado.carrito[i] = linea;
      }
      else estado.carrito.push(linea);
      if (!silencioso) toast("Producto actualizado");
    } else {
      estado.carrito.push(linea);
      if (!silencioso) toast(p.nombre + " agregado");
    }
    // La misma configuración se actualiza al seleccionar extras y al continuar.
    estado.editUid = linea.uid;
    var seleccionados = d.extras.map(function (extra) { return String(extra.id); });
    estado.carrito = estado.carrito.filter(function (item) {
      return item.extraDe !== linea.uid || seleccionados.indexOf(String(item.id)) !== -1;
    });
    d.extras.forEach(function (extra) {
      var existente = estado.carrito.find(function (item) {return item.extraDe === linea.uid && String(item.id) === String(extra.id);});
      if (existente) return;
      var producto = byId(extra.id) || {};
      var uid = extra.uidCarrito || (linea.uid + '-extra-' + String(extra.id));
      estado.carrito.push({uid:uid,id:extra.id,slug:producto.slug,nombre:extra.nombre,
        img:producto.img || IMG_FALLBACK,precioBase:extra.precio,cant:extra.cant || 1,
        combo:null,quitar:[],extras:[],extraDe:linea.uid,tipo_linea:'extra'});
      extra.uidCarrito = uid;
    });
    guardar();
    refrescarTop();
  }

  /* ======================================================================
     8/10. Carrito
     ====================================================================== */
  // Pantalla 9: revisar cantidad del sugerido antes de agregar al carrito.
  var sugerido = null;
  var cantidadSugerido = 1;
  function pintarSugerido() {
    $("#sugerido-cantidad").text(cantidadSugerido);
    $("#sugerido-total").text(clp(precioProducto(sugerido) * cantidadSugerido));
    $("#sugerido-menos").prop("disabled", cantidadSugerido === 1);
  }
  function abrirSugerido(p) {
    sugerido = p;
    cantidadSugerido = 1;
    $("#sugerido-img").attr("src", p.img).off("error").on("error", function () { onerr(this); });
    $("#sugerido-nombre").text(p.nombre);
    $("#sugerido-desc").text(p.descripcion);
    pintarSugerido();
    ir("sugerido");
  }
  $("#sugerido-mas").on("click", function () { cantidadSugerido++; pintarSugerido(); });
  $("#sugerido-menos").on("click", function () { cantidadSugerido = Math.max(1, cantidadSugerido - 1); pintarSugerido(); });
  $("#sugerido-seguir").on("click", function () { ir("carrito"); });
  $("#sugerido-agregar").on("click", function () {
    if (!sugerido) return;
    estado.carrito.push({ uid: "l" + Date.now() + Math.floor(Math.random() * 1000),
      id: sugerido.id, slug: sugerido.slug, nombre: sugerido.nombre, img: sugerido.img,
      precioBase: sugerido.precio, combo: null, quitar: [], extras: [], cant: cantidadSugerido });
    guardar(); refrescarTop(); ir("carrito");
  });
  function subLinea(l) {
    var out = [];
    if (l.combo) out.push(l.combo.nombre + (l.combo.incluye ? " · " + l.combo.incluye : ""));
    (l.extras || []).forEach(function (x) { out.push("+ " + x.nombre + " (" + clp(precioAlianza(x.precio, x.id)) + ")"); });
    (l.quitar || []).forEach(function (q) { out.push(q); });
    return out.join("<br>");
  }

  function sincronizarDetalleCarrito() {
    if (!estado.editUid || !estado.detalle) return;
    var linea = estado.carrito.find(function (item) {return item.uid === estado.editUid;});
    if (!linea) {
      estado.editUid = null; estado.prodActual = null; estado.detalle = null;
      historial = historial.filter(function (pantalla) {return ['detalle','combo','extras'].indexOf(pantalla) === -1;});
      return;
    }
    estado.detalle.cant = linea.cant;
    estado.detalle.extras = estado.carrito.filter(function (item) {return item.extraDe === linea.uid;}).map(function (item) {
      return {id:item.id,nombre:item.nombre,precio:item.precioBase,cant:item.cant,uidCarrito:item.uid};
    });
  }

  function renderCarrito() {
    var tipo = estado.tipoOrden ? estado.tipoOrden.toUpperCase() : "";
    $("#cart-tipo-head, #cart-tipo-foot").text(tipo);
    $("#cart-tot-head").text(clp(totalNeto()));

    var $l = $("#cart-list").empty();
    if (!estado.carrito.length) {
      $l.html('<div class="cart-vacio"><span class="em">&#128533;</span>Tu carrito está vacío.</div>');
      $("#crosssell").hide();
      $("#dc-body").empty();
      $("#cart-tot-foot").text(clp(0));
      $("#ir-pagar").prop("disabled", true);
      refrescarTop();
      return;
    }
    $("#crosssell").show();
    $("#ir-pagar").prop("disabled", false);

    estado.carrito.forEach(function (l) {
      var $it = $(
        '<div class="cart-item">' +
          '<img alt="" src="' + escaparHtml(imagenSegura(l.img)) + '">' +
          '<div class="ci">' +
            "<h4>" + escaparHtml(l.nombre) + "</h4>" +
            '<div class="sub">' + escaparHtml((subLinea(l) || "Solo el producto")) + "</div>" +
            '<div class="acc">' +
              '<button class="lk elim">Eliminar</button>' +
              '<button class="lk edit">Editar</button>' +
              '<span class="mini-step"><button class="mm">&#8722;</button>' +
                '<span class="v">' + escaparHtml(l.cant) + '</span><button class="mp">+</button></span>' +
            "</div>" +
          "</div>" +
          '<div class="ci-precio">' + clp(subtotal(l)) +
            (subtotal(l) < subtotalOriginal(l) ? '<s class="producto-beneficio">' + clp(subtotalOriginal(l)) + '</s>' : '') + "</div>" +
        "</div>"
      );
      $it.find("img").on("error", function () { onerr(this); });
      $it.find(".elim").on("click", function () {
        estado.carrito = estado.carrito.filter(function (x) { return x.uid !== l.uid; });
        sincronizarDetalleCarrito();
        guardar(); renderCarrito(); refrescarTop(); ilustrarFlujo();
      });
      $it.find(".edit").on("click", function () { abrirDetalle(l.id, l); });
      $it.find(".mp").on("click", function () { l.cant++; sincronizarDetalleCarrito(); guardar(); renderCarrito(); refrescarTop(); ilustrarFlujo(); });
      $it.find(".mm").on("click", function () {
        if (l.cant > 1) l.cant--;
        else estado.carrito = estado.carrito.filter(function (x) { return x.uid !== l.uid; });
        sincronizarDetalleCarrito();
        guardar(); renderCarrito(); refrescarTop(); ilustrarFlujo();
      });
      $l.append($it);
    });

    // Venta cruzada dinámica: prioriza bebida, acompañamiento y postre faltantes.
    var $cg = $("#cross-grid").empty();
    var sugerencias = sugerenciasUpsell(4, null);
    $("#crosssell").toggle(sugerencias.length > 0);
    $("#crosssell-titulo").text("Completa tu pedido · Recomendado para ti");
    sugerencias.forEach(function (p) {
      var $c = $(
        '<div class="cross-card">' +
          '<img alt="" src="' + escaparHtml(imagenSegura(p.img)) + '">' +
          '<div class="cc"><small class="upsell-tag">SUMA MÁS SABOR</small>' + escaparHtml(p.nombre) + '<br><span class="pr">' + clp(precioProducto(p)) + "</span></div>" +
          '<button class="cc-add">+</button>' +
        "</div>"
      );
      $c.find("img").on("error", function () { onerr(this); });
      $c.find(".cc-add").on("click", function () { abrirSugerido(p); });
      $cg.append($c);
    });

    // detalle de compra
    var bruto = totalBruto();
    var desc = Math.round(bruto * estado.descuento / 100);
    var $d = $("#dc-body").empty();
    $d.append('<div class="fila"><span>Subtotal (' + nItems() + " ítem" +
      (nItems() === 1 ? "" : "s") + ")</span><span>" + clp(bruto + ahorroAlianza()) + "</span></div>");
    if (ahorroAlianza() > 0) $d.append('<div class="fila"><span>Beneficio ' + escaparHtml(beneficiosAlianza.empresa.nombre_empresa) + '</span><span>-' + clp(ahorroAlianza()) + '</span></div>');
    if (desc > 0) $d.append('<div class="fila"><span>Descuento (' + estado.descuento +
      "%)</span><span>-" + clp(desc) + "</span></div>");
    $d.append('<div class="fila"><span>' + escaparHtml((estado.tipoOrden || "")) + "</span><span>Sin costo</span></div>");
    $d.append('<div class="fila total"><span>Total</span><span>' + clp(bruto - desc) + "</span></div>");

    $("#cart-tot-foot").text(clp(bruto - desc));
    refrescarTop();
  }

  $("#dc-tit").on("click", function () {
    var $b = $("#dc-body");
    $b.prop("hidden", !$b.prop("hidden"));
    $("#dc-caret").html($b.prop("hidden") ? "&#9662;" : "&#9652;");
  });
  $("#seguir-comprando").on("click", function () { ir("categorias"); });
  $("#vaciar-cart").on("click", function () {
    if (!estado.carrito.length) return;
    estado.carrito = []; estado.descuento = 0;
    sincronizarDetalleCarrito();
    guardar(); renderCarrito(); refrescarTop(); ilustrarFlujo(); toast("Carrito vaciado");
  });
  $("#cancelar-pedido").on("click", reiniciar);
  $("#top-cart, #categorias-carrito").on("click", function () { if (estado.tipoOrden) ir("carrito"); });
  $("#ir-pagar").on("click", function () { if (estado.carrito.length) ir("pago"); });
  $("#cupon-btn").on("click", aplicarCupon);

  function aplicarCupon() {
    var c = window.prompt("Ingresa tu código de descuento:");
    if (c == null) return;
    if (c.trim().toUpperCase() === CFG.cupon.codigo) {
      estado.descuento = CFG.cupon.pct;
      toast("Cupón aplicado: " + CFG.cupon.pct + "% de descuento");
      renderCarrito(); renderPago(); refrescarTop();
    } else if (c.trim() !== "") {
      toast("Código no válido");
    }
  }

  /* ======================================================================
     11. Método de pago
     ====================================================================== */
  function renderPago() {
    $("#pago-tipo").text(estado.tipoOrden ? "· " + estado.tipoOrden : "");
    var $l = $("#pay-list").empty();
    CFG.metodosPago.forEach(function (m) {
      var $b = $(
        '<button class="pay-method">' +
          '<div class="mi">' + m.ico + "</div>" +
          "<div>" +
            (m.badge ? '<span class="badge-fila">' + m.badge + "</span><br>" : "") +
            '<span class="mt">' + m.nombre + "</span>" +
            '<div class="md">' + m.desc + "</div>" +
            (m.id === "tarjeta" ? '<div class="brands"><span>MASTER</span><span>VISA</span><span>DINERS</span><span>AMEX</span></div>' : "") +
          "</div>" +
        "</button>"
      );
      $b.on("click", function () { elegirMetodo(m.id); });
      $l.append($b);
    });
  }
  function elegirMetodo(id) {
    estado.metodoPago = id;
    var monto = clp(totalNeto());
    if (id === "tarjeta") { $("#tt-monto").text("Total a pagar: " + monto); ir("tipo-tarjeta"); }
    else if (id === "efectivo") { $("#efectivo-monto").text(monto); ir("efectivo"); }
    else {
      $("#celular-tt").text("Escanea el QR con " + (id === "rutpay" ? "RutPay" : "MachBank"));
      $("#celular-monto").text(monto); ir("pago-celular");
    }
  }
  $("#btn-codigo").on("click", aplicarCupon);

  /* ======================================================================
     12-13. Tarjeta / datáfono / celular / efectivo
     ====================================================================== */
  $(document).on("click", "[data-tarjeta]", function () {
    estado.tarjeta = $(this).text();
    $("#datafono-monto").text(clp(totalNeto()) + "  ·  " + estado.tarjeta);
    ir("datafono");
    clearTimeout(temporizadorPago);
    temporizadorPago = setTimeout(function () {
      if ($('body').attr('data-vista') === 'datafono') finalizar();
    },2500);
  });
  $("#celular-ok, #efectivo-ok").on("click", finalizar);

  /* ======================================================================
     Cierre
     ====================================================================== */
  function finalizar() {
    if (registrandoVenta || (!ventaPendiente && !estado.carrito.length)) return;
    registrandoVenta = true;
    cerrarAvisoInactividad();
    clearTimeout(protector.temporizador);
    $('#registro-venta').prop('hidden',false).attr('aria-busy','true');
    $('#registro-venta-mensaje').text('Confirmando tu pedido…');
    $('#registro-venta-reintentar').prop('hidden',true);
    try {
      if (!ventaPendiente) ventaPendiente = prepararVenta(estado,parametrosKiosco,
        beneficiosAlianza && beneficiosAlianza.empresa,byId,precioAlianza,new Date(),nuevoIdVenta());
      // Mantener la misma instantánea e ID si el servidor guardó pero se perdió su respuesta.
      localStorage.setItem(claveVentaPendiente,JSON.stringify(ventaPendiente));
    } catch (err) {
      errorRegistroVenta(err);
      return Promise.resolve();
    }
    return registrarVenta(ventaPendiente).then(function (venta) {
      ventaFinal = venta;
      mostrarPedidoFinal(venta);
      var unidades = venta.totales.unidades;
      $('#final-detalle').text(unidades + (unidades === 1 ? ' producto · ' : ' productos · ') +
        clp(venta.totales.total) + ' · ' + venta.tipo_orden + ' · ' + nombreMetodo(venta.pago.medio));
      limpiarBeneficios();
      historial = [];
      estado.carrito = []; estado.descuento = 0;
      localStorage.removeItem(claveCarrito);
      localStorage.removeItem(claveVentaPendiente);
      ventaPendiente = null;
      registrandoVenta = false;
      $('#registro-venta').prop('hidden',true).attr('aria-busy','false');
      mostrar('final');
      refrescarTop();
      if (colaPedidos) colaPedidos.procesar();
      // Un fallo de presentación no debe convertir una venta ya guardada en otro intento de registro.
      try {
        $('#boleta').html(generarBoletaHtml(venta));
        window.print();
      } catch (err) {
        console.error('No se pudo generar o imprimir el comprobante:',err);
      }
    }).catch(errorRegistroVenta);
  }

  function errorRegistroVenta(err) {
    registrandoVenta = false;
    $('#registro-venta').prop('hidden',false).attr('aria-busy','false');
    $('#registro-venta-mensaje').text('No pudimos guardar la confirmación. Tu pedido se conserva; vuelve a intentarlo.');
    $('#registro-venta-reintentar').prop('hidden',false);
    console.error('Error registrando venta:',err);
  }
  function mostrarPedidoFinal(venta) {
    var pedido = venta.envio && venta.envio.estado === 'enviado' && venta.envio.pedido;
    $('#num-pedido').text('#' + (pedido ? pedido.numero_pedido : venta.numero_pedido));
    $('#pedido-envio').text(pedido ? 'Pedido enviado a cocina' : 'Pedido guardado · pendiente de envío a cocina');
    $('#pedido-qr').empty().prop('hidden',true);
    var imagen = pedido && urlQrPedido(pedido);
    if (imagen) $('#pedido-qr').html('<p>Seguimiento de tu pedido</p><img src="' + escaparHtml(imagen) +
      '" alt="QR del pedido" style="width:180px;height:180px;margin:0 auto">').prop('hidden',false);
  }
  $('#registro-venta-reintentar').on('click',finalizar);
  function nombreMetodo(id) {
    var m = CFG.metodosPago.find(function (x) { return x.id === id; });
    return m ? m.nombre : id;
  }
  function reiniciar() {
    if (registrandoVenta || ventaPendiente) return;
    ventaFinal = null;
    $('#boleta').empty();
    clearTimeout(temporizadorPago);
    limpiarBeneficios();
    estado = {
      tipoOrden: null, identificado: false, catActual: null, prodActual: null,
      editUid: null, detalle: null, carrito: [], descuento: 0, metodoPago: null, tarjeta: null
    };
    historial = [];
    localStorage.removeItem(claveCarrito);
    refrescarTop();
    mostrar("atract");
  }
  $("#nuevo-pedido").on("click", reiniciar);
  $("#btn-volver, #categorias-volver, #identidad-volver").on("click", volver);

  /* ======================================================================
     Persistencia
     ====================================================================== */
  function guardar() {
    try {
      localStorage.setItem(claveCarrito, JSON.stringify({
        tipoOrden: estado.tipoOrden, descuento: estado.descuento, carrito: estado.carrito,
        empresaActiva: estado.empresaActiva || null
      }));
    } catch (e) {}
  }
  function restaurar() {
    try {
      var d = JSON.parse(localStorage.getItem(claveCarrito));
      if (d && d.carrito && d.carrito.length) {
        var restaurado = separarExtrasCarrito(d.carrito,byId);
        estado.carrito = restaurado.filter(function (linea) { return !!byId(linea.id); });
        estado.tipoOrden = d.tipoOrden || null;
        estado.descuento = d.descuento || 0;
        if (estado.carrito.length !== restaurado.length) {
          guardar();
          setTimeout(function () {
            toast('Se quitaron productos que ya no están disponibles en el menú');
          }, 0);
        }
      }
    } catch (e) {}
  }

  /* ======================================================================
     Arranque
     ====================================================================== */
  function arranque() {
    $("#ver-app").text("1.2.5");
    restaurar();
    refrescarTop();
    mostrar("atract");
    iniciarProtector();
    var pendienteGuardada = localStorage.getItem(claveVentaPendiente);
    if (pendienteGuardada) {
      try { ventaPendiente = JSON.parse(pendienteGuardada); }
      catch (err) { errorRegistroVenta(err); return; }
      finalizar();
      return;
    }
    var almacenada = sessionStorage.getItem(claveAlianza);
    if (almacenada) {
      try {
        var activacion = JSON.parse(almacenada);
        if (!activacion.token || !activacion.empresa) throw new Error('Sesión de alianza inválida');
        consultarBeneficiosQr(parametrosKiosco, 'estado', {token: activacion.token}).then(function (r) {
          if (sessionStorage.getItem(claveAlianza) !== almacenada) return;
          if (r.activado === true && String(r.id_empresa_alianza) === String(activacion.empresa.id_empresa_alianza)) activarBeneficios(activacion);
          else limpiarBeneficios();
        }).catch(function () { if (sessionStorage.getItem(claveAlianza) === almacenada) limpiarBeneficios(); });
      } catch (err) { limpiarBeneficios(); }
    }
  }

});
