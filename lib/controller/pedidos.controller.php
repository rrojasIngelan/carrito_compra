<?php
session_start();
require_once __DIR__ . '/../dao/pedidos.DAO.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    $accion = $_GET['accion'] ?? '';
    if ($accion === 'listar' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $cocina = ($_GET['vista'] ?? '') === 'cocina';
        $respuesta = array();
        if ($cocina) {
            if (empty($_SESSION['csrf_pedidos'])) $_SESSION['csrf_pedidos'] = bin2hex(random_bytes(32));
            $respuesta['csrf'] = $_SESSION['csrf_pedidos'];
        }
        session_write_close();
        $respuesta['list'] = (new pedidosDAO())->listarPedidos($cocina);
    } elseif ($accion === 'estado' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        if (stripos($_SERVER['CONTENT_TYPE'] ?? '','application/json') !== 0 ||
            ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site' ||
            !isset($_SESSION['csrf_pedidos']) || !hash_equals($_SESSION['csrf_pedidos'],$_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {
            http_response_code(403); throw new RuntimeException('Solicitud no autorizada');
        }
        session_write_close();
        $form = json_decode(file_get_contents('php://input',false,null,0,4097),true,16,JSON_THROW_ON_ERROR);
        if (!is_array($form)) throw new InvalidArgumentException('Solicitud inválida');
        (new pedidosDAO())->cambiarEstado($form['pedido'] ?? null,$form['anterior'] ?? null,$form['estado'] ?? null);
        $respuesta = array('estado'=>1);
    } else { http_response_code(405); $respuesta = array('error'=>'Acción o método no permitido'); }
    echo json_encode($respuesta,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
} catch (InvalidArgumentException | JsonException $e) {
    http_response_code(400); echo json_encode(array('error'=>'Datos de pedido inválidos'));
} catch (OutOfBoundsException $e) {
    http_response_code(404); echo json_encode(array('error'=>$e->getMessage()));
} catch (DomainException $e) {
    http_response_code(409); echo json_encode(array('error'=>$e->getMessage()));
} catch (Throwable $e) {
    if (http_response_code() !== 403) { http_response_code(500); error_log('Pedidos: '.$e->getMessage()); }
    echo json_encode(array('error'=>http_response_code()===403?'Solicitud no autorizada':'No se pudo acceder a los pedidos'));
}
