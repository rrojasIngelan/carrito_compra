<?php

require_once __DIR__ . '/catalogo.DAO.php';

class alianzaDAO {
    private function archivo($token) {
        if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) {
            throw new InvalidArgumentException('Código inválido');
        }
        return sys_get_temp_dir() . '/carro_alianza_' . hash('sha256', __DIR__) . '_' . $token . '.json';
    }

    public function crearLectura($empresaId, $propietario) {
        // Retirar desafíos antiguos de este proyecto, fuera del directorio público.
        $prefijo = sys_get_temp_dir() . '/carro_alianza_' . hash('sha256', __DIR__) . '_';
        foreach (array_slice(glob($prefijo . '*.json') ?: array(), 0, 100) as $anterior) {
            if (filemtime($anterior) < time() - 3600) unlink($anterior);
        }
        $catalogoDao = new catalogoDAO();
        $empresas = $catalogoDao->listarEmpresasAlianza();
        $empresa = null;
        foreach ($empresas['list'] as $item) {
            if ((string)$item['id_empresa_alianza'] === $empresaId && (string)$item['estatus'] === '0') {
                $empresa = $item;
                break;
            }
        }
        if ($empresa === null) throw new InvalidArgumentException('Empresa no disponible');
        $hoy = (new DateTimeImmutable('now', new DateTimeZone('America/Santiago')))->format('Y-m-d');
        if ((!empty($empresa['fecha_inicio_alianza']) && substr($empresa['fecha_inicio_alianza'], 0, 10) > $hoy) ||
            (!empty($empresa['fecha_fin_alianza']) && substr($empresa['fecha_fin_alianza'], 0, 10) < $hoy)) {
            throw new InvalidArgumentException('Alianza fuera de vigencia');
        }
        $beneficios = array();
        foreach (isset($empresa['beneficios_productos']) ? $empresa['beneficios_productos'] : array() as $item) {
            $porcentaje = isset($item['porcentaje']) ? (float)$item['porcentaje'] : 0;
            if ((string)$item['estatus'] === '0' && $porcentaje > 0 && $porcentaje <= 100) {
                $beneficios[] = array('id_item' => (string)$item['id_item'], 'porcentaje' => $porcentaje);
            }
        }
        $token = bin2hex(random_bytes(32));
        $datos = array('propietario' => $propietario, 'estado' => 'pendiente', 'expira' => time() + 300,
            'empresa' => array('id_empresa_alianza' => $empresaId, 'nombre_empresa' => $empresa['nombre_empresa']),
            'beneficios_productos' => $beneficios);
        if (file_put_contents($this->archivo($token), json_encode($datos), LOCK_EX) === false) {
            throw new RuntimeException('No se pudo crear la lectura');
        }
        $config = $catalogoDao->listarConfiguracion();
        return array('token' => $token, 'expira' => $datos['expira'],
            'urlPublicaKiosco' => isset($config['parametros']['urlPublicaKiosco']) ? $config['parametros']['urlPublicaKiosco'] : '');
    }

    public function consultarLectura($token, $propietario) {
        return $this->operarLectura($token, $propietario, 'consultar');
    }

    public function confirmarLectura($token) {
        return $this->operarLectura($token, null, 'confirmar');
    }

    public function cancelarLectura($token, $propietario) {
        return $this->operarLectura($token, $propietario, 'cancelar');
    }

    private function operarLectura($token, $propietario, $accion) {
        $archivo = $this->archivo($token);
        if (!is_file($archivo)) throw new InvalidArgumentException('Código no disponible');
        $archivoAbierto = fopen($archivo, 'r+');
        if (!$archivoAbierto) throw new RuntimeException('No se pudo consultar la lectura');
        try {
            if (!flock($archivoAbierto, LOCK_EX)) throw new RuntimeException('Lectura ocupada');
            $datos = json_decode(stream_get_contents($archivoAbierto), true);
            if (!is_array($datos)) throw new RuntimeException('Lectura inválida');
            if ($propietario !== null && !hash_equals($datos['propietario'], $propietario)) {
                throw new InvalidArgumentException('Código no disponible');
            }
            if ($datos['expira'] < time()) $datos['estado'] = 'expirada';
            if ($accion === 'confirmar' && $datos['estado'] === 'pendiente') {
                $datos['estado'] = 'confirmada';
                $datos['expira'] = time() + 1800;
            }
            if ($accion === 'cancelar') $datos['estado'] = 'cancelada';
            rewind($archivoAbierto);
            ftruncate($archivoAbierto, 0);
            fwrite($archivoAbierto, json_encode($datos));
            fflush($archivoAbierto);
            $result = array('estado' => $datos['estado'], 'empresa' => $datos['empresa']);
            // Sólo la sesión del kiosco obtiene las reglas de descuento.
            if ($propietario !== null && $datos['estado'] === 'confirmada') {
                $result['beneficios_productos'] = $datos['beneficios_productos'];
            }
            return $result;
        } finally {
            flock($archivoAbierto, LOCK_UN);
            fclose($archivoAbierto);
        }
    }
}
