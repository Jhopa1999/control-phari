/**
 * Unit tests de config.ts (sin red). Cubren cada combinación de variables de
 * entorno por modo: éxito dev-header, éxito jwt (token y login), y todos los
 * caminos fail-fast (que en producción llaman a process.exit).
 *
 * loadConfig() termina el proceso con process.exit(1) si falta configuración.
 * Para poder afirmar sobre ese camino sin matar al runner, se parchea
 * process.exit para que LANCE en vez de salir, y se silencia process.stderr.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../config.js';

/** Variables que config.ts lee; se limpian antes de cada test para aislarlas. */
const CONFIG_ENV_VARS = [
  'MCP_API_BASE_URL',
  'MCP_AUTH_MODE',
  'MCP_ACTOR_ID',
  'MCP_API_TOKEN',
  'MCP_LOGIN_IDENTIFIER',
  'MCP_LOGIN_PASSWORD',
] as const;

/** Error que sustituye a process.exit para capturar el fail-fast en tests. */
class ExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

let savedEnv: Record<string, string | undefined>;
let originalExit: typeof process.exit;
let originalWrite: typeof process.stderr.write;

beforeEach(() => {
  savedEnv = {};
  for (const name of CONFIG_ENV_VARS) {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  }
  originalExit = process.exit;
  originalWrite = process.stderr.write;
  // process.exit lanza para que el test observe el fail-fast sin terminar.
  process.exit = ((code?: number): never => {
    throw new ExitError(code ?? 0);
  }) as typeof process.exit;
  // Silencia los mensajes de error de configuración durante los tests.
  process.stderr.write = (() => true) as typeof process.stderr.write;
});

afterEach(() => {
  for (const name of CONFIG_ENV_VARS) {
    if (savedEnv[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = savedEnv[name];
    }
  }
  process.exit = originalExit;
  process.stderr.write = originalWrite;
});

describe('loadConfig', () => {
  it('falla (exit 1) si falta MCP_API_BASE_URL', () => {
    assert.throws(() => loadConfig(), (e: unknown) => e instanceof ExitError && e.code === 1);
  });

  it('trata un MCP_API_BASE_URL en blanco como ausente', () => {
    process.env.MCP_API_BASE_URL = '   ';
    process.env.MCP_ACTOR_ID = 'alguien';
    assert.throws(() => loadConfig(), (e: unknown) => e instanceof ExitError);
  });

  it('resuelve dev-header por defecto (sin MCP_AUTH_MODE)', () => {
    process.env.MCP_API_BASE_URL = 'http://localhost:3001';
    process.env.MCP_ACTOR_ID = 'jefe@demo.local';
    const config = loadConfig();
    assert.equal(config.baseUrl, 'http://localhost:3001');
    assert.deepEqual(config.identity, { mode: 'dev-header', actorId: 'jefe@demo.local' });
  });

  it('trata cualquier modo distinto de "jwt" como dev-header', () => {
    process.env.MCP_API_BASE_URL = 'http://localhost:3001';
    process.env.MCP_AUTH_MODE = 'otro';
    process.env.MCP_ACTOR_ID = 'actor';
    const config = loadConfig();
    assert.equal(config.identity.mode, 'dev-header');
  });

  it('falla (exit 1) en dev-header si falta MCP_ACTOR_ID', () => {
    process.env.MCP_API_BASE_URL = 'http://localhost:3001';
    assert.throws(() => loadConfig(), (e: unknown) => e instanceof ExitError && e.code === 1);
  });

  it('recorta el valor de MCP_ACTOR_ID', () => {
    process.env.MCP_API_BASE_URL = 'http://localhost:3001';
    process.env.MCP_ACTOR_ID = '  actor  ';
    const config = loadConfig();
    assert.deepEqual(config.identity, { mode: 'dev-header', actorId: 'actor' });
  });

  it('resuelve jwt con token directo (vía a)', () => {
    process.env.MCP_API_BASE_URL = 'http://localhost:3001';
    process.env.MCP_AUTH_MODE = 'jwt';
    process.env.MCP_API_TOKEN = 'tok-123';
    const config = loadConfig();
    assert.deepEqual(config.identity, { mode: 'jwt', kind: 'token', token: 'tok-123' });
  });

  it('resuelve jwt con credenciales de login (vía b)', () => {
    process.env.MCP_API_BASE_URL = 'http://localhost:3001';
    process.env.MCP_AUTH_MODE = 'jwt';
    process.env.MCP_LOGIN_IDENTIFIER = 'user@demo';
    process.env.MCP_LOGIN_PASSWORD = 'secreto';
    const config = loadConfig();
    assert.deepEqual(config.identity, {
      mode: 'jwt',
      kind: 'login',
      identifier: 'user@demo',
      password: 'secreto',
    });
  });

  it('prefiere el token sobre las credenciales de login si están ambos', () => {
    process.env.MCP_API_BASE_URL = 'http://localhost:3001';
    process.env.MCP_AUTH_MODE = 'jwt';
    process.env.MCP_API_TOKEN = 'tok-123';
    process.env.MCP_LOGIN_IDENTIFIER = 'user@demo';
    process.env.MCP_LOGIN_PASSWORD = 'secreto';
    const config = loadConfig();
    assert.equal(config.identity.mode === 'jwt' && config.identity.kind, 'token');
  });

  it('falla (exit 1) en jwt sin ninguna vía de credencial', () => {
    process.env.MCP_API_BASE_URL = 'http://localhost:3001';
    process.env.MCP_AUTH_MODE = 'jwt';
    assert.throws(() => loadConfig(), (e: unknown) => e instanceof ExitError && e.code === 1);
  });

  it('falla (exit 1) en jwt si solo hay identifier sin password', () => {
    process.env.MCP_API_BASE_URL = 'http://localhost:3001';
    process.env.MCP_AUTH_MODE = 'jwt';
    process.env.MCP_LOGIN_IDENTIFIER = 'user@demo';
    assert.throws(() => loadConfig(), (e: unknown) => e instanceof ExitError && e.code === 1);
  });
});
