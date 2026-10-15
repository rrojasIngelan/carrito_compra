<?php
require_once __DIR__ . '/../lib/dao/alianza.DAO.php';

function comprobar($condicion, $mensaje) {
    if (!$condicion) throw new RuntimeException($mensaje);
}

$dao = new alianzaDAO();
$token = bin2hex(random_bytes(32));
$directorioDao = dirname((new ReflectionClass('alianzaDAO'))->getFileName());
$archivo = sys_get_temp_dir() . '/carro_alianza_' . hash('sha256', $directorioDao) . '_' . $token . '.json';
$datos = array('propietario' => 'kiosco-prueba', 'estado' => 'pendiente', 'expira' => time() + 300,
    'empresa' => array('id_empresa_alianza' => '2', 'nombre_empresa' => 'BCI'),
    'beneficios_productos' => array(array('id_item' => '13', 'porcentaje' => 40)));
file_put_contents($archivo, json_encode($datos));
try {
    comprobar($dao->consultarLectura($token, 'kiosco-prueba')['estado'] === 'pendiente', 'Lectura inicial');
    try {
        $dao->consultarLectura($token, 'otro-kiosco');
        throw new RuntimeException('Aceptó sesión ajena');
    } catch (InvalidArgumentException $e) {}
    $movil = $dao->confirmarLectura($token);
    comprobar($movil['estado'] === 'confirmada' && !isset($movil['beneficios_productos']), 'Confirmación móvil');
    $kiosco = $dao->consultarLectura($token, 'kiosco-prueba');
    comprobar($kiosco['beneficios_productos'][0]['porcentaje'] === 40, 'Beneficios al kiosco');
    comprobar($dao->confirmarLectura($token)['estado'] === 'confirmada', 'Lectura idempotente');
    $dao->cancelarLectura($token, 'kiosco-prueba');
    comprobar($dao->confirmarLectura($token)['estado'] === 'cancelada', 'No reactivar cancelada');
    $datos['expira'] = time() - 1;
    file_put_contents($archivo, json_encode($datos));
    comprobar($dao->confirmarLectura($token)['estado'] === 'expirada', 'No activar expirada');
    try {
        $dao->confirmarLectura('../archivo');
        throw new RuntimeException('Aceptó token inválido');
    } catch (InvalidArgumentException $e) {}
    echo "OK: lectura, aislamiento, beneficios, repetición, cancelación y caducidad.\n";
} finally {
    if (is_file($archivo)) unlink($archivo);
}
