<?php
namespace PruebaCatalogo;

$respuestas = array(); $llamadas = 0; $opciones = array(); $ultima = null;
function curl_init($url) { return $url; }
function curl_setopt_array($cnx,$valores) { $GLOBALS['opciones']=$valores; return true; }
function curl_setopt($cnx,$opcion,$valor) { return true; }
function curl_exec($cnx) {
    $GLOBALS['llamadas']++;
    $GLOBALS['ultima']=array_shift($GLOBALS['respuestas']);
    return $GLOBALS['ultima']['contenido'];
}
function curl_getinfo($cnx,$opcion) { return $GLOBALS['ultima']['estado']; }
function curl_errno($cnx) { return $GLOBALS['ultima']['error']; }
function curl_error($cnx) { return $GLOBALS['ultima']['error'] ? 'Error de prueba' : ''; }
function curl_close($cnx) {}

$fuente=file_get_contents(__DIR__.'/../lib/dao/catalogo.DAO.php');
eval('namespace PruebaCatalogo; use RuntimeException;'.substr($fuente,5));
class CatalogoPrueba extends catalogoDAO {
    public function archivoCertificadosCA() { return __DIR__ . '/../lib/configApp/certs/cacert.pem'; }
    public function listarConfiguracion() {
        return array('parametros'=>array('url'=>'https://example.com/items','cliente'=>1,'sucursal'=>2,'cod'=>'*'));
    }
}
function verificar($condicion,$mensaje) { if (!$condicion) throw new \RuntimeException($mensaje); }
function ejecutar($lista,$excepcion=null) {
    $GLOBALS['respuestas']=$lista; $GLOBALS['llamadas']=0;
    try {
        $result=(new CatalogoPrueba())->listarProductos();
        verificar($excepcion===null,'Debió rechazar la respuesta');
        return $result;
    } catch (\RuntimeException $e) {
        if ($excepcion===null || strpos($e->getMessage(),$excepcion)===false) throw $e;
    }
}
$correcta=array('estado'=>200,'contenido'=>'{"list":[]}', 'error'=>0);
ejecutar(array(array('estado'=>502,'contenido'=>'Error temporal','error'=>0),$correcta));
verificar($llamadas===2,'Reintentar 502');
verificar($opciones[CURLOPT_SSL_VERIFYPEER]===true && $opciones[CURLOPT_SSL_VERIFYHOST]===2,'Conservar validación TLS');
verificar(is_readable($opciones[CURLOPT_CAINFO]),'Usar paquete CA del proyecto');
ejecutar(array(array('estado'=>0,'contenido'=>false,'error'=>28),$correcta));
verificar($llamadas===2,'Reintentar timeout');
ejecutar(array(array('estado'=>0,'contenido'=>false,'error'=>60)),'cURL 60');
verificar($llamadas===1,'No eludir fallo de certificado');
ejecutar(array(array('estado'=>403,'contenido'=>'Forbidden','error'=>0)),'HTTP 403');
verificar($llamadas===1,'No reintentar acceso denegado');
ejecutar(array(array('estado'=>200,'contenido'=>'HTML inesperado','error'=>0)),'Respuesta de catálogo inválida');
verificar($llamadas===1,'No aceptar datos ajenos al contrato');
ejecutar(array(array('estado'=>502,'contenido'=>'Error','error'=>0),array('estado'=>502,'contenido'=>'Error','error'=>0)),'HTTP 502');
verificar($llamadas===2,'Reintentos acotados');
echo "OK: reintento 502/timeout, límite, diagnóstico y validación HTTPS.\n";
