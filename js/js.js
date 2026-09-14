// variables
let productos;
let carrito = [];

// variables paginacion
let inicio = 0;
let fin = 6;

// leer configuración cliente
fetch('./config/data.json')
	.then((res) => res.json())
	.then(response => {
		const cliente = {
			"cliente":response.parametros.cliente,
			"sucursal":response.parametros.sucursal,
			"centro":response.parametros.centro
		};
		// console.log(cliente);
		localStorage.setItem("cliente", JSON.stringify(cliente));
		localStorage.setItem("imgResource",JSON.stringify(response.parametros.urlImg));
		setUrl(response.parametros); 
	});

// constantes
const contenedor = document.querySelector('#container');
const itemsCarrito = document.querySelector('#items-carrito');
const vaciarCarrito = document.querySelector('#vaciarCarrito');
const precioTotal = document.querySelector('#precioTotal');
const btnPagar = document.querySelector('#btn-ir-pagar')

document.addEventListener('DOMContentLoaded', () => {
	carrito = JSON.parse(localStorage.getItem('carrito')) || [];
	mostrarCarrito();
});

// formatear url
function setUrl(data){
	myUrl = `${data.url}?cliente=${data.cliente}&sucursal=${data.sucursal}&cod=${data.cod}`;
	getProductos(myUrl);
} 

/*function getProductos(url){

  fetch(url)
  .then((response) => response.json())
  .then((data) => {

		productos = data['list'];

		// prueba for
		paginacion(productos,inicio, fin);

	});
}*/

function getProductos(url) {
  fetch(url)
    .then(async (response) => {
      const rawText = await response.text();
      console.log('--- RAW SERVER RESPONSE START ---');
      console.log(rawText);
      console.log('--- RAW SERVER RESPONSE END ---');

      // Check for empty body
      if (!rawText.trim()) {
        throw new Error('Received an empty response from server.');
      }

      // Try parsing manually
      try {
        return JSON.parse(rawText);
      } catch (err) {
        throw new Error(`Failed to parse JSON. First 50 chars: "${rawText.slice(0, 50)}"`);
      }
    })
    .then((data) => {
      if (!data || !data['list']) {
        console.warn('Response parsed, but "list" property is missing:', data);
        return;
      }

      productos = data['list'];
      paginacion(productos, inicio, fin);
    })
    .catch((error) => {
      console.error('Error fetching productos:', error.message);
    });
}

vaciarCarrito.addEventListener('click', () => {
	carrito = [];
	const nodeAgregar = document.querySelectorAll('.btn-agregar');
	const nodeCantidad = document.querySelectorAll('.cont-cantidad');
	nodeAgregar.forEach((btn) => btn.classList.remove('btn-hide'));
	nodeCantidad.forEach((btn) => btn.classList.add('btn-hide'));
	// document.querySelector('.cont-cantidad').classList.add('btn-hide');
	mostrarCarrito();
});

function agregarProducto(id) {

	// ocultar btn agregar asociado al producto
	document.querySelector(`#btn-${id}`).classList.add("btn-hide");
	document.querySelector(`#btn-cant-${id}`).classList.remove("btn-hide");

	const existe = carrito.some(prod => prod.id_item == id);

	if(existe){
		const prod = carrito.map(prod => {
			if(prod.id_item == id){
				prod.cantidad++;
			}
		})
	}else{
		const item = productos.find((prod) => prod.id_item == id);
		item.cantidad = 1;
		document.querySelector(`#cantidad-${id}`).textContent = item.cantidad;
		carrito.push(item);
	}

	mostrarCarrito();
}

// aumentar la cantidad de un producto
function aumentarProducto(id){

	const prod = carrito.map(prod =>{
		if(prod.id_item == id){
			prod.cantidad++;
			//modificar cantidad
			document.querySelector(`#cantidad-${id}`).textContent = prod.cantidad;
		}
	})

	mostrarCarrito();
}

// disminuir la cantidad de un producto
function disminuirProducto(id){

	const prod = carrito.map(prod =>{
		if(prod.id_item == id){
			if(prod.cantidad > 1){
				prod.cantidad--;	
			}else{
				prod.cantidad = 0;
				// ocultar btn agregar asociado al producto
				document.querySelector(`#btn-${id}`).classList.remove("btn-hide");
				document.querySelector(`#btn-cant-${id}`).classList.add("btn-hide");
				eliminarProducto(id);
			}			
			//modificar cantidad
			document.querySelector(`#cantidad-${id}`).textContent = prod.cantidad;
		}
	})

	mostrarCarrito();
}


function eliminarProducto(id){
	const productoId = id;
	carrito = carrito.filter(prod => prod.id_item != productoId)
	// ocultar btn agregar asociado al producto
	if(document.querySelector(`#btn-${id}`) != null){
		// alert("existe!");
		document.querySelector(`#btn-${id}`).classList.remove("btn-hide");
		document.querySelector(`#btn-cant-${id}`).classList.add("btn-hide");
	}else{
		// alert("no existe!");
	}

	mostrarCarrito();
}

function guardarStorage(){
	localStorage.setItem("carrito", JSON.stringify(carrito));
}

const mostrarCarrito = () => {
	const modalBody = document.querySelector('.modal-body');
	
	//obtener ruta img
	imgResource = JSON.parse(localStorage.getItem('imgResource')) || "";
	//limpiar modal
	modalBody.innerHTML ='';

	//habilitar btn pagar del modal
	btnPagar.classList.remove("disabled");

	carrito.forEach((prod) => {

		const {id_item, nombre_producto, descripcion, url_imagen_item, precio_unitario, cantidad} = prod;


// https://m.media-amazon.com/images/I/71gm8v4uPBL._SX679_.jpg

		modalBody.innerHTML += `
			<div class="modal-contenedor">
				<div class="modal-cont-img">
					<img class="img-fluid img-carrito" src="${imgResource}${url_imagen_item}" onerror="this.onerror=null; 
					this.src='./img/imagenNoDisponible.jpg'" />
				</div>
			
				<div>
				<p><b>Producto:</b> ${nombre_producto}</p>
				<p><b>Precio:</b> ${precio_unitario}</p>
				<p><b>Cantidad:</b> ${cantidad}</p>

				<button onclick="eliminarProducto(${id_item})" class="btn btn-danger"><i class="bi bi-trash-fill"></i> Eliminar producto </button>
				</div>
			</div>
		`;
	});

	if(carrito.length === 0){
		
		btnPagar.classList.add("disabled");
		modalBody.innerHTML = `
			<p class="carrito-vacio text-center text-primary">
			<i class="bi bi-emoji-frown"></i> El carrito está vacío.
			</p>
		`;
	}

	itemsCarrito.textContent = carrito.length;
	//calcular total
	precioTotal.textContent = "$"+carrito.reduce((ac, prod)=> ac + prod.cantidad * prod.precio_unitario,0);
	guardarStorage();

	console.log(carrito);
}

function paginacion(productos, inicio, fin){
	
	//limpiar contenedor productos
	imgResource = JSON.parse(localStorage.getItem('imgResource')) || "";

	console.log(`mostrando desde ${inicio} hasta ${fin}`);

	contenedor.innerHTML='';

	prod = productos.slice(inicio, fin);

	let contRow = 0;
	prod.forEach(prod => {

		const {id_item, nombre_producto, descripcion, url_imagen_item, precio_unitario} = prod;

		if(contRow % 3 == 0){
			var divRow = document.createElement("div");
			divRow.classList.add("row");
			divRow.classList.add(`r${contRow}`);
			contenedor.append(divRow);
			contRow++;
		}else{
			// console.log(contRow);
			var divRow = document.querySelector(`.r${contRow-1}`);
		}

		//recuperar cantidad agregada en el carrito
		let cantidadActual=0;
		let btnAgregarHide="";
		let btnCantidadHide="btn-hide";
		const cantProd = carrito.map(prod => {
			if(prod.id_item == id_item){
				cantidadActual = prod.cantidad;
				btnAgregarHide="btn-hide";
				btnCantidadHide="";
		}
	})

	

		divRow.innerHTML += `
		<div class="col-6 col-md-4">
			<div class="cont-producto">
				<div class="producto">
						<img src="${imgResource}${url_imagen_item}" alt="" srcset="" onerror="this.onerror=null; 
						this.src='./img/imagenNoDisponible.jpg'">
				</div>
				<p class="prod-titulo">
					${nombre_producto}
				</p>
				<p class="prod-desc">
					${descripcion}
				</p>
				<p class="prod-precio">
					$${precio_unitario}
				</p>
				<div class="cont-btn">
						<button id="btn-${id_item}" onclick="agregarProducto(${id_item})" class="btn-agregar ${btnAgregarHide}">Agregar</button>
						<div id="btn-cant-${id_item}" class="cont-cantidad ${btnCantidadHide}">
								<button onclick="disminuirProducto(${id_item})" class="btn-cantidad btn-left">-</button><div id="cantidad-${id_item}" class="div-cantidad">${cantidadActual}</div><button onclick="aumentarProducto(${id_item})" class="btn-cantidad btn-right">+</button>
						</div>
				</div>
			</div>
		</div>
		`;
	});
	// console.log(productos.slice(inicio, fin));
}

// comando paginación
function prevPage(){
	if(inicio <= 0){
		inicio = 0;
	}else{
		inicio-=6;
		fin=inicio+6;
	}
	paginacion(productos,inicio, fin);
}
function nextPage(){
	if(fin >= productos.length){
		fin = productos.length;
	}else{
		inicio+=6;
		fin+=6;
	}

	paginacion(productos,inicio, fin);
}

function totNumPages()
{
    return Math.ceil(productos.length / objPorPag);
}

function irAPagar(){
	//location.replace('http://localhost:5500/resumen.html');
	location.replace('http://localhost/resumen.html');
}