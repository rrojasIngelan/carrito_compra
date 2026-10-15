const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const ctx=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../lib/js/ventas.js'),'utf8'),ctx);
const estado={tipoOrden:'Para llevar',metodoPago:'tarjeta',tarjeta:'Débito',descuento:10,carrito:[
    {uid:'l1',id:'13',nombre:'Hamburguesa',precioBase:3000,cant:2,combo:{nombre:'Combo',extra:1900},quitar:['Cebolla'],extras:[{id:'50',nombre:'Bebida',precio:1600}]},
    {uid:'l2',id:'20',nombre:'Pizza',precioBase:5500,cant:1,combo:null,quitar:[],extras:[]}
]};
const original=JSON.stringify(estado);
const parametros={cliente:1,sucursal:2,centro:1};
const venta=ctx.prepararVenta(estado,parametros,{id_empresa_alianza:'2',nombre_empresa:'BCI'},
    id=>({cod:'cod-'+id}), (precio,id)=>String(id)==='13'?1800:precio,new Date('2026-10-15T15:30:00Z'),'test-journal-00000000000001');
assert.equal(JSON.stringify(estado),original,'snapshot no modifica el carrito');
assert.equal(venta.detalle.length,4);
assert.equal(venta.totales.subtotal_original,18500);
assert.equal(venta.totales.descuento_alianza,2400);
assert.equal(venta.totales.descuento_cupon,1610);
assert.equal(venta.totales.total,14490);
assert.equal(venta.totales.unidades,5,'combo no duplica unidades físicas');
assert.equal(venta.detalle.reduce((s,l)=>s+l.total,0),venta.totales.total);
assert.equal(venta.detalle.reduce((s,l)=>s+l.descuento_cupon,0),1610);
assert.equal(venta.pago.estado,'simulado');
assert.equal(venta.empresa.nombre_empresa,'BCI');
const efectivo=ctx.prepararVenta({...estado,metodoPago:'efectivo'},parametros,null,()=>null,p=>p,new Date(),'test-journal-00000000000002');
assert.equal(efectivo.pago.estado,'pendiente_caja');
const pesos=ctx.prepararVenta({tipoOrden:'Para servir',metodoPago:'tarjeta',descuento:34,carrito:[1,2,3].map(id=>({id,nombre:'Item',precioBase:1,cant:1,extras:[]}))},parametros,null,()=>null,p=>p,new Date(),'test-journal-00000000000003');
assert.equal(pesos.totales.descuento_cupon,1);
assert.equal(pesos.detalle.reduce((s,l)=>s+l.total,0),2,'redondeo exacto a pesos');
const fixture=path.join(os.tmpdir(),'sales-journal-test-'+crypto.randomUUID()+'.json');
try {
    fs.writeFileSync(fixture,JSON.stringify(venta));
    const php=spawnSync('C:/xampp/php/php.exe',[path.join(__dirname,'ventas.php'),fixture],{encoding:'utf8'});
    if(php.stdout)process.stdout.write(php.stdout);
    if(php.stderr)process.stderr.write(php.stderr);
    assert.equal(php.status,0,'pruebas DAO PHP');
} finally {if(fs.existsSync(fixture))fs.unlinkSync(fixture);}
console.log('OK: snapshot, combos, extras, alianza, cupón, unidades, redondeo y estados de pago PMV.');
