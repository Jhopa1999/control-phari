/**
 * Unit tests del inputSchema y del motor genérico de tools, SIN red.
 *
 * Se arma un McpServer real con TODAS las tools registradas (catálogo
 * declarativo), pero el api-client está MOCKEADO (no hay HTTP). Un Client del
 * SDK se conecta por transporte en memoria y ejerce el camino público
 * (initialize + tools/list + tools/call), de modo que la validación de
 * inputSchema que aplica el SDK en servidor se prueba de verdad.
 *
 * Objetivo: comprobar FORMA de entrada (zod derivado del contrato) y que los
 * argumentos planos se traducen a la llamada correcta; no reglas de negocio.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { connectInMemory, createMockApi } from './helpers.js';
import type { RecordedCall } from './helpers.js';

let client: Client;
let calls: RecordedCall[];

beforeEach(async () => {
  calls = [];
  ({ client } = await connectInMemory(createMockApi(calls)));
});

afterEach(async () => {
  await client.close();
});

/** Invoca una tool y devuelve el resultado tipado. */
async function call(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

describe('tools/list expone inputSchema', () => {
  it('cada tool declara un inputSchema de tipo object', async () => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const name of ['catalog.get', 'catalog.create', 'user.create', 'user.list']) {
      const tool = byName.get(name);
      assert.ok(tool, `falta la tool ${name}`);
      assert.equal(tool.inputSchema.type, 'object');
    }
  });

  it('expone enums y descripciones derivados del contrato', async () => {
    const { tools } = await client.listTools();
    const audit = tools.find((t) => t.name === 'audit.events.list');
    const props = audit?.inputSchema.properties as Record<string, { enum?: string[]; description?: string }>;
    assert.ok(props.objectType.enum?.includes('REQUEST'));
    assert.deepEqual(props.action.enum, ['CREATE', 'UPDATE', 'DELETE', 'REVOKE']);
    assert.ok(props.objectType.description);

    const process = tools.find((t) => t.name === 'process.list');
    const kind = (process?.inputSchema.properties as Record<string, { enum?: string[] }>).kind;
    assert.deepEqual(kind.enum, ['PROCESS', 'COORDINATION']);
  });
});

describe('catalog.get inputSchema (requiere id: string)', () => {
  it('acepta un id string válido y llega al handler', async () => {
    const res = await call('catalog.get', { id: 'c-1' });
    assert.notEqual(res.isError, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].path, '/catalog-items/{id}');
    assert.deepEqual(calls[0].options, { params: { path: { id: 'c-1' } } });
  });

  it('rechaza id ausente sin llamar al api-client', async () => {
    const res = await call('catalog.get', {});
    assert.equal(res.isError, true);
    assert.equal(calls.length, 0);
  });

  it('rechaza id de tipo incorrecto (number) sin llamar al api-client', async () => {
    const res = await call('catalog.get', { id: 123 });
    assert.equal(res.isError, true);
    assert.equal(calls.length, 0);
  });
});

describe('user.create inputSchema (requiere body: objeto del DTO)', () => {
  it('acepta un body objeto válido y llega al handler', async () => {
    const res = await call('user.create', {
      body: { identifier: 'a@demo.local', name: 'Ana' },
    });
    assert.notEqual(res.isError, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/users');
    assert.deepEqual(calls[0].options, {
      body: { identifier: 'a@demo.local', name: 'Ana' },
    });
  });

  it('rechaza body de tipo incorrecto (string) sin llamar al api-client', async () => {
    const res = await call('user.create', { body: 'no-soy-objeto' });
    assert.equal(res.isError, true);
    assert.equal(calls.length, 0);
  });

  it('rechaza propiedades que no están en el DTO y campos requeridos ausentes', async () => {
    assert.equal((await call('user.create', { body: { identifier: 'x', name: 'y', extra: 1 } })).isError, true);
    assert.equal((await call('user.create', { body: { identifier: 'x' } })).isError, true);
    assert.equal(calls.length, 0);
  });
});

describe('argumentos planos (query y ruta)', () => {
  it('catalog.list reenvía los filtros planos como query', async () => {
    await call('catalog.list', { active: true, catalog: 'AREA' });
    assert.equal(calls[0].path, '/catalog-items');
    assert.deepEqual(calls[0].options, {
      params: { query: { active: true, catalog: 'AREA' } },
    });
  });

  it('audit.events.list valida el enum de objectType', async () => {
    assert.notEqual((await call('audit.events.list', { objectType: 'REQUEST' })).isError, true);
    assert.equal((await call('audit.events.list', { objectType: 'NO_EXISTE' })).isError, true);
    assert.equal(calls.length, 1);
  });

  it('plan.get usa el nombre de parámetro requestId', async () => {
    await call('plan.get', { requestId: 'r-1' });
    assert.equal(calls[0].path, '/requests/{requestId}/plan');
    assert.deepEqual(calls[0].options, { params: { path: { requestId: 'r-1' } } });
  });

  it('governance.gate.approve combina id, gateCode y body', async () => {
    await call('governance.gate.approve', {
      id: 'r-1',
      gateCode: 'GC4',
      body: { authorityNote: 'ok' },
    });
    assert.equal(calls[0].path, '/requests/{id}/gates/{gateCode}/approve');
    assert.deepEqual(calls[0].options, {
      params: { path: { id: 'r-1', gateCode: 'GC4' } },
      body: { authorityNote: 'ok' },
    });
  });
});

describe('body opcional con {} por defecto', () => {
  for (const [name, args] of [
    ['plan.submit', { requestId: 'r-1' }],
    ['plan.authorize', { requestId: 'r-1' }],
    ['governance.gc4.request-validation', { id: 'r-1' }],
    ['governance.gc4.mark-ready', { id: 'r-1' }],
    ['governance.gc5.confirm-stabilization', { id: 'r-1' }],
    ['governance.gate.approve', { id: 'r-1', gateCode: 'GC5' }],
  ] as const) {
    it(`${name} envía {} si no se indica body`, async () => {
      const res = await call(name, args);
      assert.notEqual(res.isError, true);
      assert.deepEqual((calls[0].options as { body: unknown }).body, {});
    });
  }

  it('plan.return mantiene el body obligatorio', async () => {
    assert.equal((await call('plan.return', { requestId: 'r-1' })).isError, true);
    assert.equal(calls.length, 0);
  });
});

describe('errores de la API', () => {
  it('un 404 menciona el primer parámetro de ruta como recurso', async () => {
    await client.close();
    calls = [];
    ({ client } = await connectInMemory(createMockApi(calls, 404)));
    const res = await call('task.get', { id: 'no-existe' });
    assert.equal(res.isError, true);
    assert.match(JSON.stringify(res.content), /no-existe/);
  });
});
