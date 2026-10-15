// Ejecuta las funciones reales de pantalla con reloj y transporte controlados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const elementos = new Map(), timers = new Map(), peticiones = [], almacenamiento = new Map();
let secuencia = 0, respuestaCrear, respuestaEstado, fallaRegistro=false;
const registros=[];
function elemento(selector) {
    if (!elementos.has(selector)) elementos.set(selector, {atributos:{}, propiedades:{}, texto:'', eventos:{}});
    const dato = elementos.get(selector), api = {0:{}};
    for (const metodo of ['empty','html','addClass','removeClass','toggleClass','off','hide','show','append','appendTo','each']) api[metodo] = () => api;
    api.attr = (clave,valor) => {
        if (typeof clave === 'object') {Object.assign(dato.atributos,clave); return api;}
        if (valor === undefined) return dato.atributos[clave];
        dato.atributos[clave]=valor; return api;
    };
    api.removeAttr = clave => {delete dato.atributos[clave];return api;};
    api.prop = (clave,valor) => {if(valor===undefined)return dato.propiedades[clave];dato.propiedades[clave]=valor;return api;};
    api.text = valor => {if(valor===undefined)return dato.texto;dato.texto=valor;return api;};
    api.on = (evento,callback) => {dato.eventos[evento]=callback;return api;};
    api.find = selectorHijo => elemento(selector+' '+selectorHijo);
    api.data = () => null;
    api.ready = callback => callback();
    return api;
}
elemento('body').attr('data-imagenes','ws');
elemento.extend = (destino, origen) => Object.assign(destino, origen);
const guardar = {getItem:clave=>almacenamiento.get(clave)||null,setItem:(clave,valor)=>almacenamiento.set(clave,valor),removeItem:clave=>almacenamiento.delete(clave)};
const ctx = vm.createContext({URL,AbortController,crypto:require('node:crypto').webcrypto,console:{error(){}},document:{baseURI:'http://localhost/carro_compras/'},
    window:{scrollTo(){}},localStorage:guardar,sessionStorage:guardar,
    jQuery:elemento,$:elemento,QRCode:Object.assign(function(){},{CorrectLevel:{M:0}}),
    setTimeout:(callback,ms)=>{const id=++secuencia;timers.set(id,{callback,ms});return id;},
    clearTimeout:id=>timers.delete(id),clearInterval() {},
    consultarCatalogo:()=>new Promise(()=>{}),
    registrarVenta:async venta=>{registros.push(venta.venta_id);if(fallaRegistro)throw new Error('Guardado fallido');return {...venta,numero_pedido:1};},
    consultarBeneficiosQr:(parametros,accion,datos,signal)=>{
        peticiones.push({accion,datos,signal});
        return accion==='crear' ? respuestaCrear() : respuestaEstado();
    }
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../lib/js/utilidades.js'),'utf8')
    .replace('function consultarBeneficiosQr(', 'function transporteNoUtilizado(')
    .replace('function consultarCatalogo(', 'function catalogoNoUtilizado('),ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../lib/js/ventas.js'),'utf8')
    .replace('function registrarVenta(', 'function registroNoUtilizado('),ctx);
let codigo = fs.readFileSync(path.join(__dirname,'../lib/js/kiosco.js'),'utf8');
const cierre = codigo.lastIndexOf('});');
codigo = codigo.slice(0,cierre) + `
globalThis.qrPrueba={mostrarQrAlianza,mostrar,esperarLecturaQr,detenerLecturaQr,finalizar,reiniciar,
    confirmarLinea,sincronizarDetalleCarrito,
    configurarExtras:(producto,detalle)=>{estado.prodActual=producto;estado.detalle=detalle;estado.editUid=null;estado.carrito=[];},
    lineas:()=>estado.carrito,
    lectura:()=>lecturaQr,beneficios:()=>beneficiosAlianza,
    parametros:p=>{parametrosKiosco=p;},
    carrito:lineas=>{estado.carrito=lineas;},total:totalBruto};
` + codigo.slice(cierre);
vm.runInContext(codigo,ctx);
ctx.qrPrueba.parametros({urlBeneficiosQr:'https://test1.ingelan.cl/lib/controller/beneficios_qr_ws_tbk.controller.php'});
const empresa={id_empresa_alianza:'2',nombre_empresa:'BCI',beneficios:[],beneficios_productos:[{id_item:'13',porcentaje:40}]};
const creada={estado:1,token:'prueba',url_activacion:'https://test1.ingelan.cl/lib/controller/beneficios_qr_ws_tbk.controller.php?accion=activar&token=prueba'};
const drenar=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
    respuestaCrear=()=>Promise.resolve(creada);
    respuestaEstado=()=>Promise.resolve({estado:1,activado:false,id_empresa_alianza:2});
    ctx.qrPrueba.mostrarQrAlianza(empresa); await drenar();
    assert.equal(ctx.qrPrueba.lectura().token,'prueba');
    assert.ok([...timers.values()].some(t=>t.ms===900000),'vencimiento a 15 minutos');
    assert.ok([...timers.values()].some(t=>t.ms===2500),'polling a 2,5 segundos');
    ctx.qrPrueba.mostrar('identidad');
    assert.equal(ctx.qrPrueba.lectura().token,null);
    assert.equal(peticiones[0].signal.aborted,true,'salir aborta la solicitud');
    assert.equal(timers.size,0,'salir elimina los dos temporizadores');
    let resolver;
    respuestaCrear=()=>new Promise(r=>{resolver=r;});
    ctx.qrPrueba.mostrarQrAlianza(empresa);
    ctx.qrPrueba.mostrar('identidad');
    resolver(creada);await drenar();
    assert.equal(ctx.qrPrueba.lectura().token,null,'respuesta tardía no inicia polling');
    respuestaCrear=()=>Promise.resolve(creada);
    ctx.qrPrueba.mostrarQrAlianza(empresa);await drenar();
    [...timers.values()].find(t=>t.ms===900000).callback();
    assert.match(elemento('#alianza-qr-estado').text(),/venció/);
    assert.equal(elemento('#alianza-qr-reintentar').prop('hidden'),false);
    assert.equal(ctx.qrPrueba.lectura().token,null);
    respuestaCrear=()=>Promise.reject(new Error('Falla de red'));
    ctx.qrPrueba.mostrarQrAlianza(empresa);await drenar();
    assert.equal(elemento('#alianza-qr-reintentar').prop('hidden'),false);
    respuestaCrear=()=>Promise.resolve(creada);
    respuestaEstado=()=>Promise.resolve({estado:1,activado:true,id_empresa_alianza:2});
    ctx.qrPrueba.mostrarQrAlianza(empresa);await drenar();
    ctx.qrPrueba.esperarLecturaQr(ctx.qrPrueba.lectura().version);await drenar();
    assert.equal(ctx.qrPrueba.beneficios().empresa.id_empresa_alianza,'2');
    assert.equal(elemento('body').attr('data-vista'),'categorias');
    assert.equal(ctx.qrPrueba.lectura().token,null);
    ctx.qrPrueba.carrito([{id:'13',precioBase:3000,cant:2,extras:[]}]);
    assert.equal(ctx.qrPrueba.total(),3600,'descuento real por ítem en dos unidades');
    empresa.beneficios=[{tipo_descuento:1,valor_descuento:2000}];
    ctx.qrPrueba.carrito([{id:'14',precioBase:5000,cant:2,extras:[]}]);
    assert.equal(ctx.qrPrueba.total(),6000,'monto general por unidad en el carrito real');
    ctx.qrPrueba.carrito([{id:'13',precioBase:3000,cant:1,extras:[]},{id:'14',precioBase:5000,cant:2,extras:[]}]);
    assert.equal(ctx.qrPrueba.total(),7800,'prioridad específica y monto general sin acumular');
    const detalle = {cant:1,combo:null,quitar:[],extras:[{id:'14',nombre:'Bebida',precio:1600}]};
    ctx.qrPrueba.configurarExtras({id:'13',nombre:'Hamburguesa',precio:3000},detalle);
    ctx.qrPrueba.confirmarLinea(true);
    assert.equal(ctx.qrPrueba.lineas().length,2,'selección guarda producto y extra en filas independientes');
    detalle.extras.push({id:'15',nombre:'Otra bebida',precio:1900});
    ctx.qrPrueba.confirmarLinea(true);
    assert.equal(ctx.qrPrueba.lineas().filter(l=>l.tipo_linea==='extra').length,2,'segunda selección agrega otra fila independiente');
    ctx.qrPrueba.confirmarLinea();
    ctx.qrPrueba.confirmarLinea();
    assert.equal(ctx.qrPrueba.lineas().length,3,'continuar no duplica la selección guardada');
    detalle.extras.splice(0,1);
    ctx.qrPrueba.confirmarLinea(true);
    assert.equal(ctx.qrPrueba.lineas().length,2,'desmarcar elimina sólo la fila del extra');
    ctx.qrPrueba.lineas().find(l=>l.tipo_linea==='extra').cant=3;
    ctx.qrPrueba.sincronizarDetalleCarrito();
    ctx.qrPrueba.confirmarLinea(true);
    assert.equal(ctx.qrPrueba.lineas().find(l=>l.tipo_linea==='extra').cant,3,'mantiene cantidad independiente al volver a confirmar');
    ctx.qrPrueba.carrito(ctx.qrPrueba.lineas().filter(l=>l.tipo_linea!=='extra'));
    ctx.qrPrueba.sincronizarDetalleCarrito();
    ctx.qrPrueba.confirmarLinea(true);
    assert.equal(ctx.qrPrueba.lineas().length,1,'un extra eliminado no reaparece al volver');
    const combo = {cant:2,combo:{id:'combo',extra:1900},quitar:[],extras:[]};
    ctx.qrPrueba.configurarExtras({id:'13',nombre:'Hamburguesa',precio:3000},combo);
    ctx.qrPrueba.mostrar('extras');
    assert.equal(ctx.qrPrueba.total(),7400,'entrar a extras guarda producto y recargo de combo');
    assert.equal(elemento('#cart-monto').text(),'$7.400','el carrito superior muestra el combo inmediatamente');
    combo.combo={id:'agrandado',extra:2890};
    ctx.qrPrueba.mostrar('extras');
    assert.equal(ctx.qrPrueba.lineas().length,1,'cambiar combo no duplica el producto');
    assert.equal(ctx.qrPrueba.total(),9380,'cambiar combo actualiza el recargo');
    assert.ok(peticiones.every(p=>p.accion==='crear'||p.accion==='estado'),'kiosco no llama activar');
    fallaRegistro=true;
    const primerIntento=ctx.qrPrueba.finalizar();
    ctx.qrPrueba.finalizar();
    await primerIntento;
    assert.equal(registros.length,1,'doble clic no inicia otro registro');
    assert.notEqual(ctx.qrPrueba.beneficios(),null,'no limpiar si falla el registro');
    assert.equal(ctx.qrPrueba.lineas().length,1,'mantener carrito ante fallo');
    ctx.qrPrueba.reiniciar();
    assert.equal(ctx.qrPrueba.lineas().length,1,'no reiniciar una venta pendiente');
    fallaRegistro=false;
    await ctx.qrPrueba.finalizar();
    assert.equal(registros[0],registros[1],'reintentar reutiliza el ID de venta');
    assert.equal(ctx.qrPrueba.beneficios(),null,'finalizar limpia la alianza');
    assert.equal(almacenamiento.has('kiosco_carrito_ws_alianza'),false);
    ctx.qrPrueba.reiniciar();
    assert.equal(ctx.qrPrueba.beneficios(),null,'cancelar conserva la alianza limpia');
    console.log('OK: carga, polling, salida, respuestas tardías, 15 minutos, reintento, activación y total.');
})().catch(e=>{console.error(e);process.exitCode=1;});
