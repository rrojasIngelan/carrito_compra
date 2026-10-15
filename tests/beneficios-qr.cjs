const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let peticiones = [], respuesta = {estado:1, activado:false};
const ctx = vm.createContext({URL, document:{baseURI:'http://localhost/carro_compras/'},
    fetch:async (url, opciones) => { peticiones.push({url:new URL(url), opciones}); return {ok:true, json:async()=>respuesta}; }
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../lib/js/utilidades.js'),'utf8'),ctx);
const hoy = new Date('2026-10-15T15:00:00Z');
const empresa = {estatus:'0',fecha_inicio_alianza:'2026-10-01',fecha_fin_alianza:'2026-10-31',
    beneficios:[{tipo_descuento:0,valor_descuento:10,fecha_inicio:'2026-10-01',fecha_fin:'2026-10-20'}],
    beneficios_productos:[{id_item:'13',cod_item:'008',porcentaje:40,estatus:'0'}]};
assert.equal(ctx.precioConBeneficio(3000,'13',empresa,'008',hoy),1800,'prioridad por producto');
assert.equal(ctx.precioConBeneficio(3000,'14',empresa,'009',hoy),2700,'porcentaje general');
assert.equal(ctx.precioConBeneficio(3000,'otro',empresa,'008',hoy),1800,'coincidencia por código');
assert.equal(ctx.precioConBeneficio(3000,'14',empresa,'009',new Date('2026-10-21T15:00:00Z')),3000,'fecha de regla');
assert.equal(ctx.precioConBeneficio(3000,'13',empresa,'008',new Date('2026-11-01T15:00:00Z')),3000,'fecha de alianza');
assert.equal(ctx.precioConBeneficio(3000,'14',{...empresa,estatus:'1'},null,hoy),3000,'inactiva');
const fijo = {...empresa,beneficios:[{tipo_descuento:1,valor_descuento:2000}]};
assert.equal(ctx.precioConBeneficio(3000,'13',fijo,null,hoy),1800);
assert.equal(ctx.precioConBeneficio(3000,'14',fijo,null,hoy),1000,'fijo por unidad');
assert.equal(ctx.precioConBeneficio(5000,'14',fijo,null,hoy) * 2,6000,'ejemplo confirmado por el usuario');
assert.equal(ctx.precioConBeneficio(500,'14',fijo,null,hoy),0,'sin precio negativo');
const cero = {...empresa,beneficios_productos:[{id_item:'13',porcentaje:0}]};
assert.equal(ctx.precioConBeneficio(3000,'13',cero,null,hoy),3000,'0 específico prevalece sobre general');
const parametros={urlBeneficiosQr:'https://test1.ingelan.cl/lib/controller/beneficios_qr_ws_tbk.controller.php',cliente:1,sucursal:2,centro:3};
(async()=>{
    await ctx.consultarBeneficiosQr(parametros,'crear',{empresa:'2'});
    assert.equal(peticiones[0].url.origin,'https://test1.ingelan.cl');
    assert.equal(peticiones[0].url.searchParams.get('centro'),'3');
    assert.equal(peticiones[0].url.searchParams.get('empresa'),'2');
    assert.equal(peticiones[0].opciones.method,'GET');
    await ctx.consultarBeneficiosQr(parametros,'estado',{token:'a&b'});
    assert.equal(peticiones[1].url.searchParams.get('token'),'a&b');
    assert.equal(peticiones[1].url.searchParams.get('accion'),'estado');
    await assert.rejects(ctx.consultarBeneficiosQr(parametros,'activar',{}));
    for (const codigo of [2,3,4]) {
        respuesta={estado:codigo};
        await assert.rejects(ctx.consultarBeneficiosQr(parametros,'estado',{token:'x'}),e=>e.estado===codigo);
    }
    console.log('OK: endpoint público, GET, errores 2/3/4, prioridad, porcentaje, fijo, vigencia y límites.');
})().catch(e=>{console.error(e);process.exitCode=1;});
