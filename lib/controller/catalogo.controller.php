<?php

require_once __DIR__ . '/../dao/catalogo.DAO.php';

function listConfiguracion($form) {
    $catalogoDao = new catalogoDAO();
    return $catalogoDao->listarConfiguracion();
}

function listProductos($form) {
    $catalogoDao = new catalogoDAO();
    return $catalogoDao->listarProductos();
}

function listCategorias($form) {
    $catalogoDao = new catalogoDAO();
    return $catalogoDao->listarCategorias();
}

function listCatalogoLocal($form) {
    $catalogoDao = new catalogoDAO();
    return $catalogoDao->listarCatalogoLocal();
}

function listEmpresasAlianza($form) {
    $catalogoDao = new catalogoDAO();
    return $catalogoDao->listarEmpresasAlianza();
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        header('Allow: GET');
        echo json_encode(array('error' => 'Método no permitido'));
        exit;
    }
    $form = $_GET;
    $accion = isset($form['accion']) ? $form['accion'] : '';
    // Despacho explícito: nunca ejecutar nombres de funciones recibidos del cliente.
    switch ($accion) {
        case 'listConfiguracion': $result = listConfiguracion($form); break;
        case 'listProductos': $result = listProductos($form); break;
        case 'listCategorias': $result = listCategorias($form); break;
        case 'listEmpresasAlianza': $result = listEmpresasAlianza($form); break;
        case 'listCatalogoLocal': $result = listCatalogoLocal($form); break;
        default:
            http_response_code(400);
            echo json_encode(array('error' => 'Acción inválida'));
            exit;
    }
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    error_log('Catálogo: ' . $e->getMessage());
    http_response_code(502);
    echo json_encode(array('error' => 'No se pudo cargar el catálogo'));
}
