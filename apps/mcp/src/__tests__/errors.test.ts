/**
 * Unit tests de errors.ts (funciones puras, sin red). Cubren:
 *   - toMcpError para 2xx (no es error -> null) y cada código de la tabla,
 *   - que no se filtran cuerpos de error en 5xx,
 *   - exceptionToMcpError para zod, red y error inesperado.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ApiResultLike } from '../errors.js';
import { toMcpError, exceptionToMcpError } from '../errors.js';

/** Helper para construir un resultado de openapi-fetch mínimo. */
function result(status: number, error?: unknown, data?: unknown): ApiResultLike {
  return { response: { status }, error, data };
}

/** Extrae el texto del primer bloque de un CallToolResult de error. */
function errorText(r: ReturnType<typeof toMcpError>): string {
  assert.ok(r, 'se esperaba un resultado de error, no null');
  assert.equal(r.isError, true);
  const block = r.content[0];
  assert.equal(block.type, 'text');
  return (block as { text: string }).text;
}

describe('toMcpError', () => {
  it('devuelve null para 2xx sin error (no es un error)', () => {
    assert.equal(toMcpError(result(200, null, { ok: true })), null);
    assert.equal(toMcpError(result(204, null)), null);
  });

  it('mapea 400 a solicitud inválida e incluye el message del backend', () => {
    const text = errorText(toMcpError(result(400, { message: 'campo X requerido' })));
    assert.match(text, /Solicitud inválida/);
    assert.match(text, /campo X requerido/);
  });

  it('une un message de validación en arreglo (estilo Nest)', () => {
    const text = errorText(toMcpError(result(400, { message: ['a inválido', 'b inválido'] })));
    assert.match(text, /a inválido; b inválido/);
  });

  it('mapea 401 a mensaje de no autenticado', () => {
    const text = errorText(toMcpError(result(401, { message: 'secreto interno' })));
    assert.match(text, /No autenticado/);
    assert.doesNotMatch(text, /secreto interno/);
  });

  it('mapea 403 a sin permiso', () => {
    assert.match(errorText(toMcpError(result(403, {}))), /No tienes permiso/);
  });

  it('mapea 404 genérico y con resourceId', () => {
    assert.match(errorText(toMcpError(result(404, {}))), /Recurso no encontrado\.$/);
    assert.match(
      errorText(toMcpError(result(404, {}), { resourceId: 'abc-1' })),
      /Recurso no encontrado: abc-1/,
    );
  });

  it('devuelve el message del backend tal cual en 409 y 422', () => {
    assert.match(errorText(toMcpError(result(409, { message: 'conflicto X' })), ), /conflicto X/);
    assert.match(errorText(toMcpError(result(422, { message: 'no procesable Y' }))), /no procesable Y/);
  });

  it('no filtra el cuerpo del backend en 5xx (mensaje genérico)', () => {
    const text = errorText(toMcpError(result(500, { message: 'stack trace interno' })));
    assert.match(text, /error interno/i);
    assert.doesNotMatch(text, /stack trace interno/);
  });

  it('mapea un status desconocido (p. ej. 418) a fallo genérico con message', () => {
    const text = errorText(toMcpError(result(418, { message: 'raro' })));
    assert.match(text, /La operación falló/);
    assert.match(text, /raro/);
  });
});

describe('exceptionToMcpError', () => {
  it('mapea un error con forma de ZodError nombrando el campo', () => {
    const zodLike = { issues: [{ path: ['body', 'name'] }] };
    const text = errorText(exceptionToMcpError(zodLike));
    assert.match(text, /Entrada inválida/);
    assert.match(text, /body\.name/);
  });

  it('usa el campo del contexto si se provee', () => {
    const zodLike = { issues: [{ path: ['x'] }] };
    const text = errorText(exceptionToMcpError(zodLike, { field: 'id' }));
    assert.match(text, /"id"/);
  });

  it('mapea un fallo de red (TypeError) con la base URL', () => {
    const text = errorText(
      exceptionToMcpError(new TypeError('fetch failed'), { baseUrl: 'http://localhost:3001' }),
    );
    assert.match(text, /No se pudo contactar la API en http:\/\/localhost:3001/);
  });

  it('mapea un fallo de red por código (ECONNREFUSED)', () => {
    const text = errorText(exceptionToMcpError({ code: 'ECONNREFUSED' }));
    assert.match(text, /No se pudo contactar la API/);
  });

  it('mapea un error inesperado a mensaje genérico interno', () => {
    const text = errorText(exceptionToMcpError(new Error('boom')));
    assert.match(text, /Error interno del MCP/);
    assert.doesNotMatch(text, /boom/);
  });
});
