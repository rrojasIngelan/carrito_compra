<?php
// Diagnóstico desde CLI o localhost; no se expone a clientes de la red.
if (PHP_SAPI !== 'cli' && !in_array($_SERVER['REMOTE_ADDR'] ?? '',array('127.0.0.1','::1'),true)) {
    http_response_code(403);
    exit;
}
if (PHP_SAPI !== 'cli') header('Content-Type: text/plain; charset=utf-8');
require_once __DIR__ . '/../lib/dao/catalogo.DAO.php';
echo 'PHP: ', PHP_VERSION, PHP_EOL;
echo 'php.ini: ', php_ini_loaded_file() ?: '(no cargado)', PHP_EOL;
echo 'cURL disponible: ', function_exists('curl_init') ? 'sí' : 'no', PHP_EOL;
$ca = ini_get('curl.cainfo');
echo 'curl.cainfo: ', $ca ?: '(almacén predeterminado)', PHP_EOL;
if ($ca) echo 'Archivo CA legible: ', is_readable($ca) ? 'sí' : 'no', PHP_EOL;
$dao = new catalogoDAO();
echo 'CA utilizado por el proyecto: ', $dao->archivoCertificadosCA(), PHP_EOL;
echo 'CA del proyecto legible: ', is_readable($dao->archivoCertificadosCA()) ? 'sí' : 'no', PHP_EOL;
foreach (array('listarProductos','listarCategorias') as $metodo) {
    try {
        $dao = new catalogoDAO();
        $datos = $dao->$metodo();
        echo $metodo, ': OK, ', count($datos['list']), ' registros', PHP_EOL;
    } catch (Throwable $e) {
        echo $metodo, ': ERROR: ', $e->getMessage(), PHP_EOL;
    }
}
