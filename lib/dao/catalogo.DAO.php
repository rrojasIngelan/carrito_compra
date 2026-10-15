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
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => array('Accept: application/json')
        ));
        $contenido = curl_exec($cnx);
        $estado = curl_getinfo($cnx, CURLINFO_HTTP_CODE);
        curl_close($cnx);
        if ($contenido === false || $estado < 200 || $estado >= 300) {
            throw new RuntimeException('No se pudo consultar el servicio');
        }
        $result = json_decode($contenido, true);
        if (!is_array($result) || !isset($result['list']) || !is_array($result['list'])) {
            throw new RuntimeException('Respuesta de catálogo inválida');
        }
        return $result;
    }
}
