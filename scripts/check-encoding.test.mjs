import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarTexto, enAlcance } from './check-encoding.mjs';

const reglas = (t) => analizarTexto(t).map((h) => h.regla);

// Los textos corruptos se generan re-leyendo bytes UTF-8 con otra codificación,
// para no depender de cómo se guarde este archivo.
const comoCp1252 = (s) => Buffer.from(s, 'utf8').toString('latin1');
const CP850 = { 0xa1: 'í', 0xa9: '®', 0xad: '¡', 0xb3: '│', 0xba: '║', 0xb1: '▒', 0xbc: '╝' };
const comoCp850 = (s) =>
  [...Buffer.from(s, 'utf8')].map((b) => (b === 0xc3 ? '├' : CP850[b] ?? String.fromCharCode(b))).join('');

test('detecta UTF-8 leído como Latin-1/CP1252', () => {
  for (const palabra of ['acción', 'más', 'niño', 'está', 'último', 'Árbol']) {
    assert.notEqual(analizarTexto(comoCp1252(palabra)).length, 0, palabra);
  }
});

test('detecta comillas, guiones y espacio duro corruptos', () => {
  assert.ok(reglas('dijo \u00E2\u20AC\u0153hola\u00E2\u20AC\u009D').includes('cp1252-â'));
  assert.ok(reglas('a\u00C2\u00A0b').includes('cp1252-â-suelta'));
  assert.ok(reglas('\u00C2\u00BFqué?').includes('cp1252-â-suelta'));
});

test('detecta UTF-8 leído como CP850', () => {
  for (const palabra of ['acción', 'más', 'niño', 'está', 'Información', 'último']) {
    assert.ok(reglas(comoCp850(palabra)).includes('cp850-├'), palabra);
  }
});

test('detecta carácter de reemplazo y BOM', () => {
  assert.ok(reglas('texto \uFFFD roto').includes('reemplazo'));
  const h = analizarTexto('\uFEFF# Título');
  assert.equal(h[0].regla, 'bom');
  assert.equal(h[0].linea, 1);
});

test('informa el número de línea', () => {
  const h = analizarTexto('uno\ndos\n' + comoCp1252('tres ñ'));
  assert.equal(h[0].linea, 3);
});

test('no marca texto español correcto', () => {
  const ok = '¿Qué acción? Información: más, niño, está, último, ÁÉÍÓÚ Ñ ü, «comillas», “curvas” — guion… 5 °C';
  assert.deepEqual(analizarTexto(ok), []);
});

test('no marca árboles de directorio', () => {
  const arbol = [
    'apps/',
    '├── api/',
    '│   ├── src/',
    '│   └── test/',
    '└── web/',
    '    └── app/',
    '├─ a',
    '│ │ x',
    '┬──┐ ┌┬┐',
  ].join('\n');
  assert.deepEqual(analizarTexto(arbol), []);
});

test('alcance de archivos', () => {
  assert.ok(enAlcance('docs/aplicacion/changelog.json'));
  assert.ok(enAlcance('e2e/login.spec.ts'));
  assert.ok(enAlcance('apps/api/src/modules/request/x.ts'));
  assert.ok(enAlcance('.kiro/steering/00-estandar-portales.md'));
  assert.ok(enAlcance('README.md'));
  assert.ok(!enAlcance('apps/api/dist/x.js'));
  assert.ok(!enAlcance('docs/imagen.png'));
  assert.ok(!enAlcance('package-lock.json'));
});
