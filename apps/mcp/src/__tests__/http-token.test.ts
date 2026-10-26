/**
 * Unit tests del portador de token por petición del transporte HTTP (sin red).
 *
 * Cubren dos cosas críticas de seguridad:
 *  (1) extractBearer parsea cabeceras válidas y rechaza ausentes/malformadas.
 *  (2) La propagación del token por `httpTokenStore` NO mezcla identidades: dos
 *      frames ALS concurrentes (dos usuarios) usan cada uno su propio token y
 *      ninguno filtra al otro; y fuera de todo frame el middleware NO añade
 *      Authorization (camino que alimenta el 401 sin usuario por defecto).
 *
 * No hay red: se sustituye globalThis.fetch por un doble que captura la cabecera
 * Authorization de la Request saliente y devuelve una Response mínima. El doble
 * puede quedar "en espera" para forzar el solapamiento de dos peticiones.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpMcpApi } from '../api.js';
import {
  extractBearer,
  httpTokenStore,
} from '../http/token-store.js';
import type { McpConfig } from '../config.js';

const HTTP_CONFIG: McpConfig = {
  transport: 'http',
  baseUrl: 'http://api.local:3001',
  identity: { mode: 'http' },
  http: { host: '0.0.0.0', port: 3002 },
};

/** Respuesta JSON mínima, suficiente para que openapi-fetch resuelva. */
function fakeJsonResponse(): Response {
  return new Response('{}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Argumentos de globalThis.fetch sin depender de tipos DOM (RequestInfo). */
type FetchArgs = Parameters<typeof globalThis.fetch>;

/** Lee la cabecera Authorization de una Request/entrada de fetch. */
function authHeaderOf(input: FetchArgs[0], init?: FetchArgs[1]): string | null {
  const req = new Request(input, init);
  return req.headers.get('Authorization');
}

describe('extractBearer', () => {
  it('extrae el token de una cabecera Bearer bien formada', () => {
    assert.equal(extractBearer('Bearer abc.def.ghi'), 'abc.def.ghi');
  });

  it('es insensible a mayúsculas en el esquema y recorta espacios', () => {
    assert.equal(extractBearer('bearer   tok-1  '), 'tok-1');
    assert.equal(extractBearer('BEARER tok-2'), 'tok-2');
  });

  it('devuelve undefined si falta la cabecera', () => {
    assert.equal(extractBearer(undefined), undefined);
  });

  it('rechaza esquema Basic y cabeceras malformadas', () => {
    assert.equal(extractBearer('Basic dXNlcjpwYXNz'), undefined);
    assert.equal(extractBearer('Bearer'), undefined);
    assert.equal(extractBearer('Bearer   '), undefined);
    assert.equal(extractBearer('abc.def'), undefined);
  });
});

describe('createHttpMcpApi: propagación del token por petición', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('usa el token del frame ALS actual en Authorization', async () => {
    let captured: string | null = null;
    globalThis.fetch = (async (input: FetchArgs[0], init?: FetchArgs[1]) => {
      captured = authHeaderOf(input, init);
      return fakeJsonResponse();
    }) as typeof globalThis.fetch;

    const api = createHttpMcpApi(HTTP_CONFIG);
    await httpTokenStore.run({ token: 'token-A' }, async () => {
      await api.client.GET('/health');
    });

    assert.equal(captured, 'Bearer token-A');
  });

  it('NO añade Authorization fuera de todo frame (alimenta el 401)', async () => {
    let captured: string | null = 'sentinel';
    globalThis.fetch = (async (input: FetchArgs[0], init?: FetchArgs[1]) => {
      captured = authHeaderOf(input, init);
      return fakeJsonResponse();
    }) as typeof globalThis.fetch;

    const api = createHttpMcpApi(HTTP_CONFIG);
    // Sin httpTokenStore.run(...): no hay token en el frame.
    await api.client.GET('/health');

    assert.equal(captured, null);
  });

  it('dos sesiones concurrentes NO se mezclan los tokens', async () => {
    // Dobles de fetch que BLOQUEAN hasta que el test libere, forzando que las
    // dos peticiones estén "en vuelo" a la vez. Si el token se compartiera a
    // nivel de proceso, la segunda sobrescribiría a la primera y lo veríamos.
    const captured: Record<string, string | null> = {};
    let aEntered!: () => void;
    let bEntered!: () => void;
    const aHasEntered = new Promise<void>((r) => (aEntered = r));
    const bHasEntered = new Promise<void>((r) => (bEntered = r));

    globalThis.fetch = (async (input: FetchArgs[0], init?: FetchArgs[1]) => {
      const auth = authHeaderOf(input, init);
      if (auth === 'Bearer token-A') {
        captured.A = auth;
        aEntered(); // señala que A ya leyó su token
        await bHasEntered; // no resuelve hasta que B también entró
      } else if (auth === 'Bearer token-B') {
        captured.B = auth;
        bEntered(); // señala que B ya leyó su token
        await aHasEntered; // no resuelve hasta que A también entró
      }
      return fakeJsonResponse();
    }) as typeof globalThis.fetch;

    // Cada sesión tiene su PROPIA McpApi (como en producción, una por sesión).
    const apiA = createHttpMcpApi(HTTP_CONFIG);
    const apiB = createHttpMcpApi(HTTP_CONFIG);

    const callA = httpTokenStore.run({ token: 'token-A' }, async () => {
      await apiA.client.GET('/health');
    });
    const callB = httpTokenStore.run({ token: 'token-B' }, async () => {
      await apiB.client.GET('/health');
    });

    await Promise.all([callA, callB]);

    // Cada petición observó EXACTAMENTE su propio token, pese a solaparse.
    assert.equal(captured.A, 'Bearer token-A');
    assert.equal(captured.B, 'Bearer token-B');
  });

  it('frames ALS anidados aíslan el token de cada nivel', async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (input: FetchArgs[0], init?: FetchArgs[1]) => {
      seen.push(authHeaderOf(input, init) ?? '(none)');
      return fakeJsonResponse();
    }) as typeof globalThis.fetch;

    const api = createHttpMcpApi(HTTP_CONFIG);
    await httpTokenStore.run({ token: 'outer' }, async () => {
      await api.client.GET('/health');
      await httpTokenStore.run({ token: 'inner' }, async () => {
        await api.client.GET('/health');
      });
      await api.client.GET('/health');
    });

    assert.deepEqual(seen, ['Bearer outer', 'Bearer inner', 'Bearer outer']);
  });
});

