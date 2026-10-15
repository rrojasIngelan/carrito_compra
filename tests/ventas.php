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
} finally {
    $dao=null;
    if (is_file($archivo)) unlink($archivo);
}
