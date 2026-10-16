// variables
let productos;
let carrito = [];
let imgResource = "";

// variables paginacion
let inicio = 0;
let fin = 6;

// leer configuración cliente
consultarCatalogo('listConfiguracion')
	.then(response => {
		const cliente = {
			"cliente":response.parametros.cliente,
			"sucursal":response.parametros.sucursal,
			"centro":response.parametros.centro
		};
		// console.log(cliente);
		localStorage.setItem("cliente", JSON.stringify(cliente));
		imgResource = response.parametros.urlImg || "";
		localStorage.setItem("imgResource",JSON.stringify(imgResource));
		getProductosYCategorias();
	}).catch(function (error) {
        console.error('Error cargando configuración:', error);
        contenedor.textContent = 'No se pudo cargar la configuración.';
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

function getProductosYCategorias() {
    Promise.all([consultarCatalogo('listProductos'), consultarCatalogo('listCategorias')])
      .then(function (respuestas) { retorno_productos(respuestas[0], respuestas[1]); })
      .catch(function (error) {
        console.error('Error cargando el menú:', error);
        contenedor.textContent = 'No se pudo cargar el menú.';
    });
}

function retorno_productos(data, dataCategorias) {
    if (!data || !Array.isArray(data.list)) throw new Error('Listado inválido');
    const categorias = dataCategorias && Array.isArray(dataCategorias.list) ? dataCategorias.list : [];
    const categoriasVisibles = new Set(categorias.map(cat => Number.parseInt(cat.id_categoria, 10)).filter(Number.isFinite));
    const ordenCategorias = new Map(categorias.map((cat, indice) => [Number.parseInt(cat.id_categoria, 10), indice]));
    productos = data.list.filter(prod => categoriasVisibles.has(Number.parseInt(prod.id_categoria, 10)))
      .map((prod, indice) => ({prod, indice}))
      .sort((a, b) => ordenCategorias.get(Number.parseInt(a.prod.id_categoria, 10)) - ordenCategorias.get(Number.parseInt(b.prod.id_categoria, 10)) || a.indice - b.indice)
      .map(item => item.prod);
    const idsProductos = new Set(productos.map(prod => String(prod.id_item)));
    const cantidadAnterior = carrito.length;
    carrito = carrito.filter(prod => idsProductos.has(String(prod.id_item)));
    if (carrito.length !== cantidadAnterior) {
      guardarStorage();
      const aviso = document.createElement('div');
      aviso.className = 'alert alert-warning container';
      aviso.setAttribute('role', 'status');
      aviso.textContent = 'Se quitaron del carrito productos que ya no están disponibles en el menú.';
      contenedor.parentNode.insertBefore(aviso, contenedor);
      mostrarCarrito();
    }
    paginacion(productos, inicio, fin);
}

function urlImagen(ruta) {
	if (!ruta) return './lib/img/imagenNoDisponible.jpg';
	try { return imagenSegura(new URL(String(ruta), imgResource || document.baseURI).href); }
	catch (error) { return './lib/img/imagenNoDisponible.jpg'; }
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

function mostrarCarrito() {
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
					<img class="img-fluid img-carrito" src="${escaparHtml(urlImagen(url_imagen_item))}" onerror="this.onerror=null;
					this.src='./lib/img/imagenNoDisponible.jpg'" />
				</div>
			
				<div>
				<p><b>Producto:</b> ${escaparHtml(nombre_producto)}</p>
				<p><b>Precio:</b> ${escaparHtml(precio_unitario)}</p>
				<p><b>Cantidad:</b> ${escaparHtml(cantidad)}</p>

				<button onclick="eliminarProducto(${Number(id_item)})" class="btn btn-danger"><i class="bi bi-trash-fill"></i> Eliminar producto </button>
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

	const prod = productos.slice(inicio, fin);

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
						<img src="${escaparHtml(urlImagen(url_imagen_item))}" alt="" srcset="" onerror="this.onerror=null;
						this.src='./lib/img/imagenNoDisponible.jpg'">
				</div>
				<p class="prod-titulo">
					${escaparHtml(nombre_producto)}
				</p>
				<p class="prod-desc">
					${escaparHtml(descripcion)}
				</p>
				<p class="prod-precio">
					$${escaparHtml(precio_unitario)}
				</p>
				<div class="cont-btn">
						<button id="btn-${Number(id_item)}" onclick="agregarProducto(${Number(id_item)})" class="btn-agregar ${btnAgregarHide}">Agregar</button>
						<div id="btn-cant-${Number(id_item)}" class="cont-cantidad ${btnCantidadHide}">
								<button onclick="disminuirProducto(${Number(id_item)})" class="btn-cantidad btn-left">-</button><div id="cantidad-${Number(id_item)}" class="div-cantidad">${cantidadActual}</div><button onclick="aumentarProducto(${Number(id_item)})" class="btn-cantidad btn-right">+</button>
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
	navegar('resumen');
}
