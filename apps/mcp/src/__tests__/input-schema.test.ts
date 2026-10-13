/**
 * Unit tests del inputSchema de tools representativas, SIN red.
 *
 * Se arma un McpServer real con las tools registradas, pero el api-client está
 * MOCKEADO (no hay HTTP). Un Client del SDK se conecta por transporte en memoria
 * y ejerce el camino público (initialize + tools/list + tools/call), de modo que
 * la validación de inputSchema que aplica el SDK en servidor se prueba de verdad.
 *
 * Objetivo: comprobar FORMA de entrada (zod), no reglas de negocio. Se eligen dos
 * tools representativas:
 *   - catalog.get   (requiere `id: string`)
 *   - user.create   (requiere `body: object`)
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpApi } from '../api.js';
import { createServer, connectStdio } from '../server.js';
import { registerCatalogTools } from '../tools/catalog.js';
import { registerUserTools } from '../tools/user.js';

// Evita el aviso del linter de test sobre import sin usar; connectStdio no se usa
// aquí porque el transporte es en memoria.
void connectStdio;

/** Registra las llamadas que las tools intentan hacer al api-client. */
interface RecordedCall {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  options: unknown;
}

/** Construye un McpApi falso que devuelve 200 con data fija y registra llamadas. */
function createMockApi(calls: RecordedCall[]): McpApi {
  const ok = (data: unknown) =>
    Promise.resolve({ data, error: undefined, response: { status: 200 } });
  const record = (method: RecordedCall['method'], data: unknown) =>
    (path: string, options?: unknown) => {
      calls.push({ method, path, options });
      return ok(data);
    };
  const client = {
    GET: record('GET', { id: 'c-1', name: 'Item' }),
    POST: record('POST', { id: 'u-1' }),
    PATCH: record('PATCH', {}),
    DELETE: record('DELETE', {}),
    use: () => {},
  };
  return {
    client: client as unknown as McpApi['client'],
    login: () => Promise.resolve(false),
    canRelogin: () => false,
  };
}

let client: Client;
let calls: RecordedCall[];

beforeEach(async () => {
  calls = [];
  const api = createMockApi(calls);
  const ctx = createServer(api);
  registerCatalogTools(ctx);
  registerUserTools(ctx);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await ctx.server.connect(serverTransport);

  client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
});

afterEach(async () => {
  await client.close();
});

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
});

describe('catalog.get inputSchema (requiere id: string)', () => {
  it('acepta un id string válido y llega al handler', async () => {
    const res = (await client.callTool({
      name: 'catalog.get',
      arguments: { id: 'c-1' },
    })) as CallToolResult;
    assert.notEqual(res.isError, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, '/catalog-items/{id}');
  });

  it('rechaza id ausente sin llamar al api-client', async () => {
    const res = (await client.callTool({
      name: 'catalog.get',
      arguments: {},
    })) as CallToolResult;
    assert.equal(res.isError, true);
    assert.equal(calls.length, 0);
  });

  it('rechaza id de tipo incorrecto (number) sin llamar al api-client', async () => {
    const res = (await client.callTool({
      name: 'catalog.get',
      arguments: { id: 123 },
    })) as CallToolResult;
    assert.equal(res.isError, true);
    assert.equal(calls.length, 0);
  });
});

describe('user.create inputSchema (requiere body: object)', () => {
  it('acepta un body objeto y llega al handler', async () => {
    const res = (await client.callTool({
      name: 'user.create',
      arguments: { body: { email: 'a@demo.local' } },
    })) as CallToolResult;
    assert.notEqual(res.isError, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path, '/users');
  });

  it('rechaza body de tipo incorrecto (string) sin llamar al api-client', async () => {
    const res = (await client.callTool({
      name: 'user.create',
      arguments: { body: 'no-soy-objeto' },
    })) as CallToolResult;
    assert.equal(res.isError, true);
    assert.equal(calls.length, 0);
  });
});
