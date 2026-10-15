const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const codigo=fs.readFileSync(path.join(__dirname,'../lib/js/pedidos-envio.js'),'utf8');
const drenar=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
function entorno(almacen=new Map()) {
    let seq=0;const timers=new Map(),eventos={},peticiones=[],avisos=[];
    const venta={venta_id:'test-cola-000000000001',numero_pedido:7,cliente:1,sucursal:2,centro:1,detalle:[{nombre:'Agua',cantidad:1}],totales:{total:1200},envio:{estado:'pendiente',intentos:0}};
    const db={venta,pendiente:true}, simulacion={red:false,errorEstado:false,errorAck:false,timeout:false};
    const ctx=vm.createContext({URL,URLSearchParams,AbortController,console:{error(){}},
        localStorage:{getItem:k=>almacen.get(k),setItem:(k,v)=>almacen.set(k,v)},
        window:{addEventListener:(e,fn)=>eventos[e]=fn},
        setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
        fetch:async(url,op={})=>{
            const u=String(url);peticiones.push({u,op});
            if(u.startsWith('https:')) {
                if(simulacion.timeout)return new Promise((resolve,reject)=>op.signal.addEventListener('abort',()=>reject(new Error('Timeout'))));
                if(!simulacion.red)throw new Error('Sin internet');
                return {ok:true,json:async()=>simulacion.errorEstado?{estado:3}:{estado:1,pedido:{id_pedido:10,numero_pedido:99,url_qr:'https://test1.ingelan.cl/qr.png'}}};
            }
            if(u.includes('pendientes'))return {ok:true,json:async()=>({list:db.pendiente?[JSON.parse(JSON.stringify(db.venta))]:[]})};
            const form=JSON.parse(op.body);
            if(simulacion.errorAck && form.estado==='enviado')throw new Error('Respuesta local perdida');
            db.venta.envio={estado:form.estado,intentos:form.intentos};db.pendiente=form.estado!=='enviado';
            return {ok:true,json:async()=>({estado:1})};
        }});
    vm.runInContext(codigo,ctx);
    return {ctx,timers,eventos,peticiones,avisos,db,simulacion,almacen,
        iniciar:()=>ctx.iniciarEnvioPedidos({urlPedidos:'https://test1.ingelan.cl/lib/controller/pedidos_ws_tbk.controller.php'},(id,p)=>avisos.push({id,p}))};
}
(async()=>{
    const e=entorno();const trabajador=e.iniciar();await drenar();
    assert.equal(e.db.venta.envio.intentos,1,'fallo de red incrementa intentos');
    assert.equal(e.db.venta.envio.estado,'pendiente');
    const remota=e.peticiones.find(p=>p.u.startsWith('https:'));
    assert.equal(new URL(remota.u).searchParams.get('accion'),'crear');
    const json=JSON.parse(remota.op.body);assert.equal(json.numero_pedido,7);assert.equal(json.venta_id,e.db.venta.venta_id);
    assert.equal(remota.op.headers['Content-Type'],'application/json');
    e.simulacion.red=true;e.simulacion.errorEstado=true;
    await trabajador.procesar();assert.equal(e.db.venta.envio.intentos,2,'estado 3 también es fallo');
    e.simulacion.errorEstado=false;
    await trabajador.procesar();assert.equal(e.db.venta.envio.estado,'enviado');
    assert.equal(e.avisos.length,1);assert.equal(e.avisos[0].p.numero_pedido,99);
    const envios=e.peticiones.filter(p=>p.u.startsWith('https:')).length;
    await trabajador.procesar();assert.equal(e.peticiones.filter(p=>p.u.startsWith('https:')).length,envios,'no reenvía confirmados');
    e.eventos.pagehide();assert.equal(e.timers.size,0,'detiene temporizador al salir');
    const f=entorno();f.simulacion.red=true;f.simulacion.errorAck=true;f.iniciar();await drenar();
    assert.ok(f.almacen.get('kiosco_envios_confirmados').includes('test-cola'),'respalda respuesta si falla confirmación SQLite');
    const g=entorno(f.almacen);g.simulacion.red=true;g.iniciar();await drenar();
    assert.equal(g.db.pendiente,false,'recupera confirmación al reiniciar');
    assert.equal(g.peticiones.filter(p=>p.u.startsWith('https:')).length,0,'sin reenviar un pedido ya confirmado');
    const t=entorno();t.simulacion.timeout=true;t.iniciar();await drenar();
    const timeout=Array.from(t.timers.values()).find(t=>t.ms===12000);assert.ok(timeout,'limita la espera de red');
    timeout.fn();await drenar();assert.equal(t.db.venta.envio.intentos,1,'timeout conserva pendiente y suma intento');
    assert.equal(t.db.venta.envio.estado,'pendiente');
    assert.throws(()=>g.ctx.iniciarEnvioPedidos({urlPedidos:'http://localhost/crear'},()=>{}),/dominio público/);
    console.log('OK: POST completo, fallos de red/estado, intentos, confirmación, recuperación y dominio público.');
})().catch(e=>{console.error(e);process.exitCode=1;});
