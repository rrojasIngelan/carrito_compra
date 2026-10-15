<?php
session_start();

// Iniciar también las sesiones abiertas antes de definir el kiosco como portada.
if (!isset($_SESSION['inicio_kiosco_ws'])) {
    $_SESSION['vista_carro_compras'] = 'kiosco-ws';
    $_SESSION['inicio_kiosco_ws'] = true;
}

// Rutas internas permitidas. La solicitud nunca determina una ruta de archivo.
$vistas = array('carrito', 'resumen', 'kiosco', 'kiosco-ws', 'kiosco-sin-ws', 'ventas', 'cocina', 'pedidos');
$base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/') . '/';
if (isset($_GET['lectura_qr'])) {
    $tokenLectura = $_GET['lectura_qr'];
    if (!is_string($tokenLectura) || !preg_match('/^[a-f0-9]{64}$/D', $tokenLectura)) {
        http_response_code(400);
        exit('Código inválido');
    }
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('Referrer-Policy: no-referrer');
    $contenido = file_get_contents(__DIR__ . '/lib/view/lectura-qr.view.html');
    echo str_replace(array('<base href="../../">', 'TOKEN_LECTURA'),
        array('<base href="' . htmlspecialchars($base, ENT_QUOTES, 'UTF-8') . '">', $tokenLectura), $contenido);
    exit;
}
$vista = isset($_POST['vista']) ? $_POST['vista'] : (isset($_GET['vista']) ? $_GET['vista'] : null);
if ($vista !== null) {
    if (!is_string($vista) || !in_array($vista, $vistas, true)) {
        http_response_code(400);
        exit('Vista inválida');
    }
    $_SESSION['vista_carro_compras'] = $vista;
}
// Los enlaces antiguos ingresan al punto de entrada y limpian la URL.
if (isset($_GET['vista'])) {
    header('Location: ' . $base);
    exit;
}
$vista = isset($_SESSION['vista_carro_compras']) ? $_SESSION['vista_carro_compras'] : 'kiosco-ws';
if (!in_array($vista, $vistas, true)) $vista = 'kiosco-ws';
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
$contenido = file_get_contents(__DIR__ . '/lib/view/' . $vista . '.view.html');
echo str_replace('<base href="../../">', '<base href="' . htmlspecialchars($base, ENT_QUOTES, 'UTF-8') . '">', $contenido);
