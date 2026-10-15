const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const raiz = path.resolve(__dirname, '..');

for (const nombre of ['carrito', 'resumen', 'kiosco', 'kiosco-ws', 'kiosco-sin-ws', 'ventas']) {
    const html = fs.readFileSync(path.join(raiz, 'lib/view', nombre + '.view.html'), 'utf8');
    assert.ok(html.includes('<base href="../../">'), nombre + ': base de rutas');
    assert.ok(html.indexOf('lib/js/utilidades.js') < html.indexOf('lib/js/' + (nombre.startsWith('kiosco') ? 'kiosco' : nombre === 'ventas' ? 'ventas-journal' : nombre) + '.js'));
    for (const match of html.matchAll(/(?:src|href)=["'](lib\/[^"']+)["']/g)) {
        assert.ok(fs.existsSync(path.join(raiz, match[1].split('?')[0])), nombre + ': ' + match[1]);
    }
}

const contexto = vm.createContext({URL, document: {baseURI: 'http://localhost/carro_compras/'}});
vm.runInContext(fs.readFileSync(path.join(raiz, 'lib/js/utilidades.js'), 'utf8'), contexto);
assert.equal(contexto.escaparHtml('<img src=x onerror="x">&\''), '&lt;img src=x onerror=&quot;x&quot;&gt;&amp;&#39;');
assert.equal(contexto.imagenSegura('javascript:alert(1)'), 'http://localhost/carro_compras/lib/img/imagenNoDisponible.jpg');
assert.equal(contexto.imagenSegura('data:text/html,<script>'), 'http://localhost/carro_compras/lib/img/imagenNoDisponible.jpg');
assert.equal(contexto.imagenSegura('https://test1.ingelan.cl/lib/img_items/a.jpg'), 'https://test1.ingelan.cl/lib/img_items/a.jpg');
assert.equal(contexto.imagenSegura('lib/img/logo.png'), 'http://localhost/carro_compras/lib/img/logo.png');
assert.equal(contexto.precioConBeneficio(3000, '13', [{id_item:'13', porcentaje:40}]), 1800);
assert.equal(contexto.precioConBeneficio(3000, '14', [{id_item:'13', porcentaje:40}]), 3000);
assert.equal(contexto.precioConBeneficio(3000, '13', [{id_item:'13', porcentaje:150}]), 3000);
assert.equal(contexto.precioConBeneficio(3000, '13', [{id_item:'13', porcentaje:-10}]), 3000);
assert.equal(contexto.precioConBeneficio(3000, '13', [{id_item:'13', porcentaje:40}, {id_item:'13', porcentaje:30}]), 1800);
assert.equal(contexto.precioConBeneficio(3000, '13', []), 3000);
console.log('OK: rutas de vistas, orden de scripts, escape HTML y protocolos de imágenes.');
