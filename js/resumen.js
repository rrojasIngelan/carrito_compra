//variables
let carrito = [];

const cliente = JSON.parse(localStorage.getItem('cliente')) || [];
const contenedor = document.querySelector('#container');
const precioTotal = document.querySelector('#total-resumen');
const salir = document.querySelector('#img-salir');
let total = 0;


//recuperar el carrito de compras
document.addEventListener('DOMContentLoaded', () => {
	carrito = JSON.parse(localStorage.getItem('carrito')) || [];
    setResumen(carrito);
});

function setResumen(carrito) {

    imgResource = JSON.parse(localStorage.getItem('imgResource')) || "";
    carrito.forEach(prod => {
        // console.log(prod.nombre_producto);

        const {id_item, nombre_producto, descripcion, url_imagen_item, precio_unitario, cantidad} = prod;

        //crear fila
        let row = document.createElement("div");
        row.classList.add("row");
        contenedor.append(row);

        //pintar resumen
        row.innerHTML += `
        <div class="col">
            <div class="cont-producto cont-resumen">
                <div class="producto-resumen">
                        <img src="${imgResource}${url_imagen_item}" alt="" srcset="" onerror="this.onerror=null; 
                        this.src='./img/imagenNoDisponible.jpg'">
                </div>
                <div class="detalle-producto">
                    <div class="titulo-resumen">
                            <span>${nombre_producto}</span>
                    </div>
                    <div class="desc-resumen">
                            <span>${descripcion}</span>
                    </div>
                    <div class="pu-resumen">
                        <span><p>Precio unitario: $${precio_unitario}</p></span>
                    </div>
                    <div class="cantidad-resumen">
                        <span><p>Cantidad: ${cantidad}</p></span>
                    </div>
                </div>
                <div class="total-producto">
                    <div class="precio-resumen">
                        <span>$${precio_unitario*cantidad}</span>
                    </div>
                </div>
            </div>
        </div>
        `;
        prod.subTotal = precio_unitario*cantidad;
    });

    //total
    total = carrito.reduce((ac, prod)=> ac + prod.cantidad * prod.precio_unitario,0)
    precioTotal.textContent = "$" + total;

}

function volver(){
    location= "http://localhost";
}

function pagar(){
    // const cliente = JSON.parse(localStorage.getItem('cliente')) || [];
    carrito.total = total;

    //se arma json para enviar detalle de compra
    //datos del cliente
    let data = {
        "suc": cliente.sucursal,
        "cen": cliente.centro,
        "monto": carrito.total
    };

    //detalle de compra
    let detalle_items = [];

    carrito.forEach(item =>{
        detalle_items.push(
            {
                "codigo":item.cod_item,
                "descripcion":item.descripcion,
                "preciouni":item.precio_unitario,
                "cantidad":item.cantidad,
                "total":item.subTotal
            }
        )
    });

    data.detalle=detalle_items;
    // console.log(data);
    enviarDetalleCompra(data);
    // se envia el detalle al ws

}

// pendiente de revisar, de momento se emula un resultado
function enviarDetalleCompra(data) {
fetch('http://localhost:5500/controller/pagoTbk.controller.php', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data)
})
  .then((response) => response)
  .then((data) => {
    // console.log('Success:', data);
    let resp = {
        "codigo": "1",
        "descripcion": "descripcion respuesta tbk"
    };

    getRespuesta(resp)
  })
  .catch((error) => {
    console.error('Error:', error);
  });

}

function getRespuesta(resp){
    if(resp.codigo == 0){
        document.querySelector('#modal-body-tbk').innerHTML = `¡El pago ha sido realizado con éxito!`;
        //insertVenta();
        carrito = [];

        // se limpia el carrito y se redirige a la pagina principal
        localStorage.removeItem('carrito');
        //location.replace('http://localhost:5500/');
		location.replace('http://localhost/');
    }else{
        document.querySelector('#modal-body-tbk').innerHTML = `
            No se pudo procesar el pago, codigo de error: ${resp.codigo}, ${resp.descripcion}`;
    }
    var modal = new bootstrap.Modal(document.getElementById("modalTbk"), {});
    modal.show();
}

// falta revisar por qué falla el post (en postman igual falló)
function insertVenta(){
    cantTotal = carrito.reduce((ac, prod)=> ac + prod.cantidad ,0)
    carrito.cantidadTotal = cantTotal;
    // console.log(carrito);
    let datos = [{
        "idCliente":cliente.cliente,
        "idSucursal":cliente.sucursal,
        "idCentroAtencion":cliente.centro,
        "fechaVenta":"28-11-2022",
        "cantidad":carrito.cantidadTotal,
        "total":carrito.total,
        "voucherTbk":010100002,
        "estatus":"001",
        "idLogVenta":"1",
        "detalle":""
    }];

        //detalle de compra
        let detalleProd = [];

        carrito.forEach(item =>{
            detalleProd.push(
                {
                    "idItem":item.cod_item,
                    "descripcion":item.descripcion,
                    "precioUnitario":item.precio_unitario,
                    "nombreProducto":item.nombre_producto,
                    "cantidad":item.cantidad,
                    "subTotal":item.subTotal
                }
            )
        });
    
        datos[0].detalle=detalleProd;

        // console.log(JSON.stringify(datos));

        fetch('http://test1.ingelan.cl/lib/controller/ventas_ws_tbk.controller.php', {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            },
            body: JSON.stringify(datos)
        })
            .then((response) => response)
            .then((data) => {
            console.log('Success:', data);
            })
            .catch((error) => {
            console.error('Error:', error);
            });
            

        // console.log(datos);
}

// cuando se haga click sobre la imagen salir, se ejecutará la funcion carritoSalir
salir.addEventListener('click', () =>carritoSalir());

function carritoSalir(){
    carrito = [];
	const nodeAgregar = document.querySelectorAll('.btn-agregar');
	const nodeCantidad = document.querySelectorAll('.cont-cantidad');
	nodeAgregar.forEach((btn) => btn.classList.remove('btn-hide'));
	nodeCantidad.forEach((btn) => btn.classList.add('btn-hide'));

    carrito = [];

    // se limpia el carrito y se redirige a la pagina principal
    localStorage.removeItem('carrito');
    location.replace('http://localhost:5500/');
}