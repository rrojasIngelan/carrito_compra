<?php

class catalogoDAO {

    public function listarConfiguracion() {
        return $this->leerArchivo('data.json');
    }

    public function listarCatalogoLocal() {
        return $this->leerArchivo('catalogo-local.json');
    }

    public function listarProductos() {
        return $this->consultarServicio('url');
    }

    public function listarCategorias() {
        return $this->consultarServicio('urlCategorias');
    }

    public function listarEmpresasAlianza() {
        return $this->consultarServicio('urlEmpresasAlianza');
    }

    private function leerArchivo($archivo) {
        $contenido = file_get_contents(__DIR__ . '/../configApp/' . $archivo);
        $result = json_decode($contenido, true);
        if (!is_array($result) || json_last_error() !== JSON_ERROR_NONE) {
            throw new RuntimeException('Archivo de datos inválido');
        }
        return $result;
    }

    private function consultarServicio($servicio) {
        $config = $this->listarConfiguracion();
        $parametros = $config['parametros'];
        $url = isset($parametros[$servicio]) ? $parametros[$servicio] : '';
        // El destino proviene únicamente de configuración del servidor.
        if (!filter_var($url, FILTER_VALIDATE_URL) || parse_url($url, PHP_URL_SCHEME) !== 'https') {
            throw new RuntimeException('Servicio no configurado');
        }
        $filtros = array(
            'cliente' => $parametros['cliente'],
            'sucursal' => $parametros['sucursal']
        );
        if ($servicio !== 'urlEmpresasAlianza') $filtros['cod'] = $parametros['cod'];
        $consulta = http_build_query($filtros);
        $cnx = curl_init($url . (strpos($url, '?') === false ? '?' : '&') . $consulta);
        curl_setopt_array($cnx, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => array('Accept: application/json')
        ));
        $inicio = microtime(true);
        for ($intento = 0; $intento < 2; $intento++) {
            // Un reintento sólo para consultas GET con fallos transitorios; máximo 25 s en total.
            curl_setopt($cnx, CURLOPT_TIMEOUT, max(1, min(15, (int)(25 - (microtime(true) - $inicio)))));
            $contenido = curl_exec($cnx);
            $estado = curl_getinfo($cnx, CURLINFO_HTTP_CODE);
            $numeroError = curl_errno($cnx);
            $detalleError = curl_error($cnx);
            $transitorio = in_array($estado, array(408,429,500,502,503,504), true) ||
                ($contenido === false && in_array($numeroError, array(6,7,28,52,55,56), true));
            if (!$transitorio || microtime(true) - $inicio >= 24) break;
        }
        curl_close($cnx);
        if ($contenido === false || $estado < 200 || $estado >= 300) {
            throw new RuntimeException(sprintf('Servicio %s: HTTP %d; cURL %d (%s)', $servicio, $estado, $numeroError, $detalleError));
        }
        $result = json_decode($contenido, true);
        if (!is_array($result) || !isset($result['list']) || !is_array($result['list'])) {
            throw new RuntimeException('Respuesta de catálogo inválida en ' . $servicio . ': ' . json_last_error_msg());
        }
        return $result;
    }
}
