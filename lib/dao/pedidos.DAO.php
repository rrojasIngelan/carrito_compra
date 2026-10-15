<?php
require_once __DIR__ . '/ventas.DAO.php';

class pedidosDAO {
    private $cnx;
    public function __construct($archivo = null) {
        $archivo = $archivo ?: __DIR__ . '/../db/sales-journal.sqlite';
        new ventasDAO($archivo);
        $this->cnx = new PDO('sqlite:' . $archivo,null,null,array(PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION));
        $this->cnx->exec('PRAGMA busy_timeout=5000');
        $this->cnx->exec("CREATE TABLE IF NOT EXISTS pedidos_estado (
            pedido INTEGER PRIMARY KEY, estado TEXT NOT NULL, actualizado TEXT NOT NULL)");
    }
    public function listarPedidos($cocina = false) {
        $hoy = (new DateTimeImmutable('now',new DateTimeZone('America/Santiago')))->format('Y-m-d');
        $q = $this->cnx->prepare("SELECT v.id,v.fecha_hora,v.datos,
            COALESCE(p.estado,'pendiente') AS proceso,p.actualizado
            FROM ventas v LEFT JOIN pedidos_estado p ON p.pedido=v.id
            WHERE COALESCE(p.estado,'pendiente') <> 'entregado' OR v.fecha=:hoy ORDER BY v.id ASC");
        $q->execute(array(':hoy'=>$hoy));
        $list = array();
        while ($fila = $q->fetch(PDO::FETCH_ASSOC)) {
            $pedido = array('numero_pedido'=>(int)$fila['id'],'fecha_hora'=>$fila['fecha_hora'],
                'estado'=>$fila['proceso'],'actualizado'=>$fila['actualizado']);
            if ($cocina) {
                $venta = json_decode($fila['datos'],true,64,JSON_THROW_ON_ERROR);
                $pedido['tipo_orden'] = $venta['tipo_orden'];
                $pedido['sucursal'] = $venta['sucursal'];
                $pedido['centro'] = $venta['centro'];
                $pedido['pago_estado'] = $venta['pago']['estado'];
                $pedido['detalle'] = array_map(function ($l) {
                    return array('nombre'=>$l['nombre'],'cantidad'=>$l['cantidad'],
                        'ingredientes_quitados'=>$l['ingredientes_quitados'] ?? array());
                },$venta['detalle']);
            }
            $list[] = $pedido;
        }
        return $list;
    }
    public function cambiarEstado($pedido,$anterior,$nuevo) {
        $flujo = array('pendiente'=>'preparacion','preparacion'=>'listo','listo'=>'entregado');
        if (!is_int($pedido) || $pedido < 1 || !is_string($anterior) || !is_string($nuevo) ||
            ($flujo[$anterior] ?? null) !== $nuevo) throw new InvalidArgumentException('Transición inválida');
        $this->cnx->exec('BEGIN IMMEDIATE');
        try {
            $q = $this->cnx->prepare("SELECT COALESCE(p.estado,'pendiente') FROM ventas v
                LEFT JOIN pedidos_estado p ON p.pedido=v.id WHERE v.id=:id");
            $q->execute(array(':id'=>$pedido));
            $actual = $q->fetchColumn();
            if ($actual === false) throw new OutOfBoundsException('Pedido no encontrado');
            if ($actual !== $anterior) throw new DomainException('El pedido fue actualizado en otra pantalla. Actualiza e intenta nuevamente.');
            $q = $this->cnx->prepare('INSERT INTO pedidos_estado(pedido,estado,actualizado) VALUES(:id,:estado,:fecha)
                ON CONFLICT(pedido) DO UPDATE SET estado=excluded.estado,actualizado=excluded.actualizado');
            $q->execute(array(':id'=>$pedido,':estado'=>$nuevo,':fecha'=>(new DateTimeImmutable('now',
                new DateTimeZone('America/Santiago')))->format(DateTimeInterface::ATOM)));
            $this->cnx->exec('COMMIT');
        } catch (Throwable $e) { $this->cnx->exec('ROLLBACK'); throw $e; }
    }
}
