/**
 * Utilidades compartidas por las pruebas del MCP: un McpApi falso (sin red) que
 * registra las llamadas y un par Client/Server conectado en memoria con TODAS
 * las tools registradas.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpApi } from '../api.js';
import { createServer } from '../server.js';
import { registerAll } from '../tools/index.js';

/** Llamada que una tool intenta hacer al api-client. */
export interface RecordedCall {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  options: unknown;
}

/** Construye un McpApi falso que devuelve 200 con data fija y registra llamadas. */
export function createMockApi(
  calls: RecordedCall[],
  status = 200,
): McpApi {
  const respond = (method: RecordedCall['method']) => (path: string, options?: unknown) => {
    calls.push({ method, path, options });
    return Promise.resolve({
      data: status < 300 ? { ok: true } : undefined,
      error: status < 300 ? undefined : { message: 'fallo simulado' },
      response: { status },
    });
  };
  const client = {
    GET: respond('GET'),
    POST: respond('POST'),
    PUT: respond('PUT'),
    PATCH: respond('PATCH'),
    DELETE: respond('DELETE'),
    use: () => {},
  };
  return {
    client: client as unknown as McpApi['client'],
    login: () => Promise.resolve(false),
    canRelogin: () => false,
  };
}

/** Server MCP real (todas las tools) + Client conectado por transporte en memoria. */
export async function connectInMemory(
  api: McpApi,
): Promise<{ client: Client }> {
  const ctx = createServer(api);
  registerAll(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await ctx.server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return { client };
}
