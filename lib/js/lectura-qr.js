document.addEventListener('DOMContentLoaded', function () {
    var mensaje = document.getElementById('lectura-estado');
    var reintentar = document.getElementById('lectura-reintentar');
    function confirmarLectura() {
        reintentar.hidden = true;
        mensaje.textContent = 'Confirmando lectura del QR…';
        fetch('lib/controller/alianza.controller.php?accion=confirmarLectura', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({token: mensaje.dataset.token})
        }).then(function (r) {
            if (!r.ok) throw new Error('Lectura no disponible');
            return r.json();
        }).then(function (r) {
            mensaje.textContent = r.estado === 'confirmada'
                ? 'Lectura confirmada. Los beneficios de ' + r.empresa.nombre_empresa + ' se activarán en el kiosco. Puedes volver a tu pedido.'
                : 'Este código ya no está disponible. Genera otro QR en el kiosco.';
        }).catch(function () {
            mensaje.textContent = 'No se pudo confirmar la lectura. Comprueba la conexión y vuelve a intentarlo.';
            reintentar.hidden = false;
        });
    }
    reintentar.addEventListener('click', confirmarLectura);
    confirmarLectura();
});
