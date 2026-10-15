<?php
require_once __DIR__ . '/../dao/ventas.DAO.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function registrarVenta($form) {
    $ventasDao = new ventasDAO();
    return array('venta'=>$ventasDao->registrarVenta($form));
}

function listarVentas($form) {
    // PMV: consulta y exportación habilitadas desde cualquier equipo, por solicitud del usuario.
    $hoy = (new DateTimeImmutable('now',new DateTimeZone('America/Santiago')))->format('Y-m-d');
    $desde = $form['desde'] ?? $hoy; $hasta = $form['hasta'] ?? $hoy;
    if (!is_string($desde) || !is_string($hasta)) throw new InvalidArgumentException('Fecha inválida');
    $offset = filter_var($form['offset'] ?? 0,FILTER_VALIDATE_INT,array('options'=>array('min_range'=>0)));
    if ($offset === false) throw new InvalidArgumentException('Página inválida');
    $ventasDao = new ventasDAO();
    return $ventasDao->listarVentas($desde,$hasta,1000,$offset);
}

try {
    $accion = $_GET['accion'] ?? '';
    if ($accion === 'registrar' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        if (stripos($_SERVER['CONTENT_TYPE'] ?? '','application/json') !== 0 || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') throw new InvalidArgumentException('Solicitud inválida');
        $contenido = file_get_contents('php://input',false,null,0,1048577);
        if (strlen($contenido) > 1048576) throw new InvalidArgumentException('Venta demasiado extensa');
        $form = json_decode($contenido,true,64,JSON_THROW_ON_ERROR);
        $result = registrarVenta($form);
    } elseif ($accion === 'listar' && $_SERVER['REQUEST_METHOD'] === 'GET') $result = listarVentas($_GET);
    else {
        http_response_code(405);
        $result = array('error'=>'Acción o método no permitido');
    }
    echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
} catch (InvalidArgumentException $e) {
    http_response_code(400); echo json_encode(array('error'=>$e->getMessage()));
} catch (JsonException $e) {
    http_response_code(400); echo json_encode(array('error'=>'JSON inválido'));
} catch (DomainException $e) {
    http_response_code(409); echo json_encode(array('error'=>$e->getMessage()));
} catch (Throwable $e) {
    error_log('Sales journal: '.$e->getMessage());
    http_response_code(500); echo json_encode(array('error'=>'No se pudo acceder al registro de ventas'));
}
