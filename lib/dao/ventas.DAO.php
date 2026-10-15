<?php

class ventasDAO {
    private $cnx;

    public function __construct($archivo = null) {
        $archivo = $archivo ?: __DIR__ . '/../db/sales-journal.sqlite';
        $this->cnx = new PDO('sqlite:' . $archivo, null, null, array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION));
        $this->cnx->exec('PRAGMA busy_timeout=5000');
        $this->cnx->exec('CREATE TABLE IF NOT EXISTS ventas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            venta_id TEXT NOT NULL UNIQUE, fecha TEXT NOT NULL, fecha_hora TEXT NOT NULL,
            medio TEXT NOT NULL, total INTEGER NOT NULL, descuento INTEGER NOT NULL,
            huella TEXT NOT NULL, datos TEXT NOT NULL)');
        $this->cnx->exec('CREATE INDEX IF NOT EXISTS ventas_fecha ON ventas(fecha)');
        $this->cnx->exec("CREATE TABLE IF NOT EXISTS ventas_envio (
            venta_id TEXT PRIMARY KEY, estado TEXT NOT NULL, intentos INTEGER NOT NULL,
            proximo INTEGER NOT NULL, pedido TEXT)");
    }

    public function registrarVenta($venta) {
        $this->validarVenta($venta);
        $json = json_encode($venta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $huella = hash('sha256', $json);
        $ahora = new DateTimeImmutable('now', new DateTimeZone('America/Santiago'));
        $consulta = $this->cnx->prepare('INSERT INTO ventas(venta_id,fecha,fecha_hora,medio,total,descuento,huella,datos)
            VALUES(:venta_id,:fecha,:fecha_hora,:medio,:total,:descuento,:huella,:datos)
            ON CONFLICT(venta_id) DO NOTHING');
        $consulta->execute(array(':venta_id'=>$venta['venta_id'], ':fecha'=>$ahora->format('Y-m-d'),
            ':fecha_hora'=>$ahora->format(DateTimeInterface::ATOM), ':medio'=>$venta['pago']['medio'],
            ':total'=>$venta['totales']['total'], ':descuento'=>$venta['totales']['descuento_total'], ':huella'=>$huella, ':datos'=>$json));
        $consulta = $this->cnx->prepare('SELECT * FROM ventas WHERE venta_id=:venta_id');
        $consulta->execute(array(':venta_id'=>$venta['venta_id']));
        $fila = $consulta->fetch(PDO::FETCH_ASSOC);
        if (!hash_equals($fila['huella'], $huella)) throw new DomainException('Identificador de venta ya utilizado con otros datos');
        return $this->describirVenta($fila);
    }

    private function describirVenta($fila) {
        $venta = json_decode($fila['datos'], true);
        $venta['numero_pedido'] = (int)$fila['id'];
        $venta['fecha'] = $fila['fecha'];
        $venta['fecha_hora'] = $fila['fecha_hora'];
        $venta['zona_horaria'] = 'America/Santiago';
        $consulta = $this->cnx->prepare('SELECT * FROM ventas_envio WHERE venta_id=:id');
        $consulta->execute(array(':id'=>$venta['venta_id']));
        if ($envio = $consulta->fetch(PDO::FETCH_ASSOC)) {
            $venta['envio'] = array('estado'=>$envio['estado'],'intentos'=>(int)$envio['intentos']);
            if ($envio['pedido']) $venta['envio']['pedido'] = json_decode($envio['pedido'],true,64,JSON_THROW_ON_ERROR);
        }
        return $venta;
    }

    public function listarPendientes() {
        $q = $this->cnx->prepare("SELECT v.* FROM ventas v LEFT JOIN ventas_envio e ON e.venta_id=v.venta_id
            WHERE COALESCE(e.estado,'pendiente')='pendiente' AND COALESCE(e.proximo,0)<=:ahora ORDER BY v.id LIMIT 20");
        $q->bindValue(':ahora',(int)floor(microtime(true)*1000),PDO::PARAM_INT);
        $q->execute();
        $list = array();
        foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $fila) $list[] = $this->describirVenta($fila);
        return array('list'=>$list);
    }

    public function guardarEnvio($form) {
        if (!is_array($form) || !is_string($form['venta_id'] ?? null) ||
            !in_array($form['estado'] ?? '',array('enviado','pendiente'),true)) throw new InvalidArgumentException('Envío inválido');
        $intentos = $form['intentos'] ?? null;
        if (!is_int($intentos) || $intentos<0 || $intentos>100000000) throw new InvalidArgumentException('Intentos inválidos');
        $pedido = null;
        if ($form['estado']==='enviado') {
            $pedido = $form['pedido'] ?? null;
            if (!is_array($pedido) || filter_var($pedido['id_pedido'] ?? null,FILTER_VALIDATE_INT,
                array('options'=>array('min_range'=>1)))===false || filter_var($pedido['numero_pedido'] ?? null,
                FILTER_VALIDATE_INT,array('options'=>array('min_range'=>1)))===false) throw new InvalidArgumentException('Respuesta de pedido inválida');
        }
        $esperas = array(2000,5000,15000,30000,60000);
        $proximo = (int)floor(microtime(true)*1000) + $esperas[min(max(0,$intentos-1),4)];
        // Nunca degradar un envío confirmado por una respuesta tardía de otra pantalla.
        $q = $this->cnx->prepare("INSERT INTO ventas_envio(venta_id,estado,intentos,proximo,pedido)
            SELECT venta_id,:estado,:intentos,:proximo,:pedido FROM ventas WHERE venta_id=:id
            ON CONFLICT(venta_id) DO UPDATE SET estado=excluded.estado,
            intentos=MAX(ventas_envio.intentos,excluded.intentos),proximo=excluded.proximo,pedido=excluded.pedido
            WHERE ventas_envio.estado<>'enviado'");
        $q->execute(array(':id'=>$form['venta_id'],':estado'=>$form['estado'],':intentos'=>$intentos,
            ':proximo'=>$proximo,':pedido'=>$pedido ? json_encode($pedido,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR) : null));
        return array('estado'=>1);
    }

    public function listarVentas($desde, $hasta, $limite = 1000, $offset = 0) {
        foreach (array($desde,$hasta) as $fecha) {
            $dia = DateTimeImmutable::createFromFormat('!Y-m-d', $fecha);
            if (!$dia || $dia->format('Y-m-d') !== $fecha) throw new InvalidArgumentException('Fecha inválida');
        }
        if ($desde > $hasta) throw new InvalidArgumentException('Rango inválido');
        $consulta = $this->cnx->prepare('SELECT * FROM ventas WHERE fecha BETWEEN :desde AND :hasta ORDER BY id DESC LIMIT :limite OFFSET :offset');
        $consulta->bindValue(':desde',$desde); $consulta->bindValue(':hasta',$hasta);
        $consulta->bindValue(':limite',(int)$limite,PDO::PARAM_INT); $consulta->bindValue(':offset',(int)$offset,PDO::PARAM_INT);
        $consulta->execute();
        $result = array();
        while ($fila = $consulta->fetch(PDO::FETCH_ASSOC)) $result[] = $this->describirVenta($fila);
        $consulta = $this->cnx->prepare('SELECT medio,COUNT(*) AS pedidos,SUM(total) AS total,SUM(descuento) AS descuentos FROM ventas WHERE fecha BETWEEN :desde AND :hasta GROUP BY medio');
        $consulta->execute(array(':desde'=>$desde,':hasta'=>$hasta));
        return array('list'=>$result,'resumen'=>$consulta->fetchAll(PDO::FETCH_ASSOC), 'limite'=>(int)$limite, 'offset'=>(int)$offset);
    }

    private function entero($valor) {
        return is_int($valor) && $valor >= 0 && $valor <= 1000000000000;
    }

    private function validarVenta($v) {
        if (!is_array($v) || !isset($v['venta_id']) || !is_string($v['venta_id']) || !preg_match('/^[a-zA-Z0-9-]{20,80}$/D',$v['venta_id'])) throw new InvalidArgumentException('Venta inválida');
        if (($v['version'] ?? null) !== 1 || ($v['modo'] ?? '') !== 'pmv' || ($v['moneda'] ?? '') !== 'CLP' || ($v['estado'] ?? '') !== 'pedido_confirmado') throw new InvalidArgumentException('Contrato de venta inválido');
        foreach (array('cliente','sucursal','centro') as $campo) {
            if (filter_var($v[$campo] ?? null,FILTER_VALIDATE_INT,array('options'=>array('min_range'=>1))) === false) throw new InvalidArgumentException('Parámetros del kiosco inválidos');
        }
        if (!in_array($v['tipo_orden'] ?? '',array('Para servir','Para llevar'),true)) throw new InvalidArgumentException('Tipo de orden inválido');
        if (!is_string($v['fecha_hora_cliente'] ?? null) || strlen($v['fecha_hora_cliente']) > 40 || strtotime($v['fecha_hora_cliente']) === false) throw new InvalidArgumentException('Fecha de venta inválida');
        if (!in_array($v['pago']['medio'] ?? '',array('tarjeta','efectivo','rutpay','machbank'),true)) throw new InvalidArgumentException('Medio de pago inválido');
        $estadoPago = $v['pago']['medio'] === 'efectivo' ? 'pendiente_caja' : 'simulado';
        if (($v['pago']['estado'] ?? '') !== $estadoPago || ($v['envio']['estado'] ?? '') !== 'pendiente') throw new InvalidArgumentException('Estado de venta inválido');
        if (!isset($v['detalle']) || !is_array($v['detalle']) || count($v['detalle']) < 1 || count($v['detalle']) > 1000) throw new InvalidArgumentException('Detalle inválido');
        $original = 0; $alianza = 0; $cupon = 0; $total = 0; $unidades = 0;
        foreach ($v['detalle'] as $l) {
            if (!is_array($l) || !in_array($l['tipo'] ?? '',array('producto','extra','combo'),true) || !is_string($l['nombre'] ?? null) || strlen($l['nombre']) > 1000) throw new InvalidArgumentException('Producto inválido');
            foreach (array('cantidad','precio_unitario_original','precio_unitario_con_beneficio','subtotal_original','descuento_alianza','subtotal_con_beneficio','descuento_cupon','total') as $campo) {
                if (!isset($l[$campo]) || !$this->entero($l[$campo])) throw new InvalidArgumentException('Importe inválido');
            }
            if ($l['cantidad'] < 1 || $l['cantidad'] > 10000 ||
                $l['precio_unitario_original'] * $l['cantidad'] !== $l['subtotal_original'] ||
                $l['precio_unitario_con_beneficio'] * $l['cantidad'] !== $l['subtotal_con_beneficio'] ||
                $l['subtotal_original'] - $l['subtotal_con_beneficio'] !== $l['descuento_alianza'] ||
                $l['subtotal_con_beneficio'] - $l['descuento_cupon'] !== $l['total']) throw new InvalidArgumentException('El detalle no cuadra');
            $original += $l['subtotal_original']; $alianza += $l['descuento_alianza']; $cupon += $l['descuento_cupon']; $total += $l['total'];
            if ($l['tipo'] !== 'combo') $unidades += $l['cantidad'];
        }
        $esperados = array('subtotal_original'=>$original,'descuento_alianza'=>$alianza,'descuento_cupon'=>$cupon,'descuento_total'=>$alianza+$cupon,'total'=>$total,'unidades'=>$unidades);
        foreach ($esperados as $campo=>$valor) {
            if (!isset($v['totales'][$campo]) || !$this->entero($v['totales'][$campo]) || $v['totales'][$campo] !== $valor) throw new InvalidArgumentException('Los totales no cuadran');
        }
        $porcentaje = $v['cupon_porcentaje'] ?? null;
        if (!is_numeric($porcentaje) || $porcentaje < 0 || $porcentaje > 100 || (int)round(($original-$alianza)*$porcentaje/100) !== $cupon) throw new InvalidArgumentException('Cupón inválido');
    }
}
