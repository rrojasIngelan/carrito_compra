<?php

require_once __DIR__ . '/../dao/alianza.DAO.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
$propietario = hash('sha256', session_id());
session_write_close();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function crearLectura($form, $propietario) {
    if (!isset($form['empresa']) || !is_string($form['empresa']) || !preg_match('/^[0-9]{1,12}$/D', $form['empresa'])) {
        throw new InvalidArgumentException('Empresa inválida');
    }
    $alianzaDao = new alianzaDAO();
    return $alianzaDao->crearLectura($form['empresa'], $propietario);
}

try {
    $accion = isset($_GET['accion']) ? $_GET['accion'] : '';
    $metodo = $_SERVER['REQUEST_METHOD'];
    if ($accion === 'consultarLectura' && $metodo === 'GET') {
        $alianzaDao = new alianzaDAO();
        $result = $alianzaDao->consultarLectura(isset($_GET['token']) ? $_GET['token'] : '', $propietario);
    } else {
        if (!is_string($accion) || !in_array($accion, array('crearLectura', 'confirmarLectura', 'cancelarLectura'), true)) {
            throw new InvalidArgumentException('Acción inválida');
        }
        if ($metodo !== 'POST') {
            http_response_code(405);
            header('Allow: POST');
            echo json_encode(array('error' => 'Método no permitido'));
            exit;
        }
        if (stripos(isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '', 'application/json') !== 0 ||
            (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && $_SERVER['HTTP_SEC_FETCH_SITE'] === 'cross-site')) {
            throw new InvalidArgumentException('Solicitud inválida');
        }
        $form = json_decode(file_get_contents('php://input'), true);
        if (!is_array($form)) throw new InvalidArgumentException('Datos inválidos');
        $alianzaDao = new alianzaDAO();
        switch ($accion) {
            case 'crearLectura': $result = crearLectura($form, $propietario); break;
            case 'confirmarLectura': $result = $alianzaDao->confirmarLectura(isset($form['token']) ? $form['token'] : ''); break;
            case 'cancelarLectura': $result = $alianzaDao->cancelarLectura(isset($form['token']) ? $form['token'] : '', $propietario); break;
        }
    }
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(array('error' => $e->getMessage()));
} catch (Throwable $e) {
    error_log('Lectura alianza: ' . $e->getMessage());
    http_response_code(502);
    echo json_encode(array('error' => 'No se pudo procesar la lectura'));
}
