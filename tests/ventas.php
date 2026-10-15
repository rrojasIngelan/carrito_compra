<?php
require_once __DIR__ . '/../lib/dao/ventas.DAO.php';
function verificar($condicion,$mensaje) {if (!$condicion) throw new RuntimeException($mensaje);}
$venta = json_decode(file_get_contents($argv[1]),true,64,JSON_THROW_ON_ERROR);
$archivo = tempnam(sys_get_temp_dir(),'journal_prueba_');
$dao = null;
try {
    $dao = new ventasDAO($archivo);
    $guardada = $dao->registrarVenta($venta);
    verificar($guardada['numero_pedido']===1,'Correlativo del pedido');
    verificar($guardada['envio']['estado']==='pendiente','Salida pendiente de envío');
    $repetida = $dao->registrarVenta($venta);
    verificar($repetida['numero_pedido']===1,'Idempotencia');
    $otra = $venta; $otra['detalle'][0]['nombre']='Cambio de nombre';
    try {$dao->registrarVenta($otra);throw new RuntimeException('Aceptó reutilización del ID');} catch (DomainException $e) {}
    $invalida=$venta;$invalida['totales']['total']++;
    try {$dao->registrarVenta($invalida);throw new RuntimeException('Aceptó importe incorrecto');} catch (InvalidArgumentException $e) {}
    $invalida=$venta;$invalida['detalle'][0]['cantidad']=-1;
    try {$dao->registrarVenta($invalida);throw new RuntimeException('Aceptó cantidad negativa');} catch (InvalidArgumentException $e) {}
    $segunda=$venta;$segunda['venta_id']='test-journal-segunda-00000001';
    $segunda['pago']=array('medio'=>'efectivo','tipo_tarjeta'=>null,'estado'=>'pendiente_caja');
    $segunda['detalle'][0]['nombre']="'); DROP TABLE ventas;--";
    $dao->registrarVenta($segunda);
    $dao=null;$dao=new ventasDAO($archivo);
    $listado=$dao->listarVentas($guardada['fecha'],$guardada['fecha']);
    verificar(count($listado['list'])===2,'Persistencia al reabrir y sin duplicados');
    verificar(count($listado['resumen'])===2,'Cuadratura por medio seleccionado');
    verificar(array_sum(array_column($listado['resumen'],'total'))===$venta['totales']['total']*2,'Suma por medio');
    verificar($listado['list'][0]['detalle'][0]['nombre']===$segunda['detalle'][0]['nombre'],'SQL parametrizado');
    verificar(count($dao->listarVentas($guardada['fecha'],$guardada['fecha'],1,1)['list'])===1,'Paginación');
    try {$dao->listarVentas("2026-10-15' OR 1=1",'2026-10-15');throw new RuntimeException('Aceptó fecha inválida');} catch (InvalidArgumentException $e) {}
    echo "OK: SQLite, persistencia, correlativo, idempotencia, totales, parámetros SQL y reporte por medio.\n";
    require_once __DIR__ . '/../lib/dao/pedidos.DAO.php';
    $pedidos = new pedidosDAO($archivo);
    $publico = $pedidos->listarPedidos();
    verificar(count($publico)===2 && $publico[0]['estado']==='pendiente','Ventas existentes comienzan pendientes');
    verificar(!isset($publico[0]['detalle']) && !isset($publico[0]['pago_estado']),'Cliente no recibe detalles ni pagos');
    $cocina = $pedidos->listarPedidos(true);
    verificar($cocina[0]['detalle'][0]['cantidad']===$venta['detalle'][0]['cantidad'],'Cocina recibe cantidades');
    verificar($cocina[0]['detalle'][0]['ingredientes_quitados']===$venta['detalle'][0]['ingredientes_quitados'],'Observaciones de cocina');
    $id = $guardada['numero_pedido'];
    $pedidos->cambiarEstado($id,'pendiente','preparacion');
    try {$pedidos->cambiarEstado($id,'pendiente','preparacion');throw new RuntimeException('Aceptó estado obsoleto');} catch (DomainException $e) {}
    try {$pedidos->cambiarEstado($id,'preparacion','entregado');throw new RuntimeException('Aceptó salto de estado');} catch (InvalidArgumentException $e) {}
    try {$pedidos->cambiarEstado(999999,'pendiente','preparacion');throw new RuntimeException('Aceptó inexistente');} catch (OutOfBoundsException $e) {}
    $pedidos->cambiarEstado($id,'preparacion','listo');
    $pedidos=null; $pedidos=new pedidosDAO($archivo);
    verificar($pedidos->listarPedidos()[0]['estado']==='listo','Estado persiste al reabrir SQLite');
    $pedidos->cambiarEstado($id,'listo','entregado');
    verificar($pedidos->listarPedidos()[0]['estado']==='entregado','Entrega registrada');
    $inalterada=$dao->listarVentas($guardada['fecha'],$guardada['fecha'])['list'];
    verificar($inalterada[1]['totales']===$guardada['totales'],'Cambiar preparación no altera los importes');
    verificar($inalterada[1]['estado']==='pedido_confirmado','Conserva contrato del journal');
    $pedidos=null;
    echo "OK: pedidos pendientes, cocina, privacidad pública, flujo, concurrencia, persistencia y journal inalterado.\n";
    verificar(count($dao->listarPendientes()['list'])===2,'Recupera ventas anteriores sin estado de envío');
    $dao->guardarEnvio(array('venta_id'=>$venta['venta_id'],'estado'=>'pendiente','intentos'=>1));
    verificar(count($dao->listarPendientes()['list'])===1,'Respeta espera persistida tras fallo');
    $control = new PDO('sqlite:'.$archivo);
    foreach (array(1=>2000,2=>5000,3=>15000,4=>30000,5=>60000,6=>60000) as $intentos=>$espera) {
        $inicio=(int)floor(microtime(true)*1000);
        $dao->guardarEnvio(array('venta_id'=>$venta['venta_id'],'estado'=>'pendiente','intentos'=>$intentos));
        $proximo=(int)$control->query('SELECT proximo FROM ventas_envio')->fetchColumn();
        verificar($proximo >= $inicio+$espera && $proximo <= (int)floor(microtime(true)*1000)+$espera,'Espera creciente persistida');
    }
    $control=null;
    $pedidoBackend=array('id_pedido'=>10,'numero_pedido'=>99,'url_qr'=>'https://test1.ingelan.cl/qr.png');
    $dao->guardarEnvio(array('venta_id'=>$venta['venta_id'],'estado'=>'enviado','intentos'=>1,'pedido'=>$pedidoBackend));
    $dao->guardarEnvio(array('venta_id'=>$venta['venta_id'],'estado'=>'pendiente','intentos'=>2));
    $reenvio=$dao->registrarVenta($venta);
    verificar($reenvio['envio']['estado']==='enviado','Respuesta tardía no degrada envío confirmado');
    verificar($reenvio['envio']['pedido']['numero_pedido']===99,'Persiste respuesta remota');
    verificar($reenvio['numero_pedido']===$guardada['numero_pedido'],'Conserva correlativo local para conciliación');
    verificar($reenvio['totales']===$guardada['totales'],'Envío no cambia importes');
    $dao=null;$dao=new ventasDAO($archivo);
    verificar(count($dao->listarPendientes()['list'])===1,'No reenvía confirmados tras reinicio');
    echo "OK: cola durable, espera tras fallo, recuperación, confirmación remota e idempotencia local.\n";
} finally {
    $dao=null;
    if (is_file($archivo)) unlink($archivo);
}
