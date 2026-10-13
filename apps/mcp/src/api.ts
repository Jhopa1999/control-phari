/**
 * Cliente de API del MCP: construye el cliente tipado generado desde OpenAPI,
 * registra el middleware de identidad (UNA sola cabecera por request) y expone
 * un helper de login PEREZOSO. El login nunca se ejecuta al arrancar.
 *
 * Replica el patrón de identidad del frontend (apps/web/src/lib/api-client.ts),
 * pero sin localStorage: en el MCP el token vive SOLO en memoria del proceso,
 * nunca en disco ni en logs.
 */
import { createApiClient } from '@plantilla-portales/api-client';
import type { components } from '@plantilla-portales/api-client';
import type { Client, Middleware } from 'openapi-fetch';
import type { paths } from '@plantilla-portales/api-client';
import type { Identity, McpConfig } from './config.js';

/** Respuesta de POST /auth/login, derivada del contrato OpenAPI. */
type LoginResponse = components['schemas']['LoginResponseDto'];

/**
 * Cuerpo de POST /auth/login. ÚNICA excepción documentada en la que se tipa un
 * body a mano: el contrato OpenAPI no expone el requestBody de /auth/login
 * (ver apps/api/src/modules/auth/dto/login-request.dto.ts, cuyos campos son
 * `identifier` y `password`).
 */
interface LoginBody {
  identifier: string;
  password: string;
}

/**
 * API del MCP: el cliente tipado, el helper de login perezoso y utilidades para
 * el re-login reactivo ante 401 (ver más abajo).
 */
export interface McpApi {
  /** Cliente HTTP tipado del contrato. */
  readonly client: Client<paths>;
  /**
   * Ejecuta el login contra POST /auth/login y guarda el accessToken en memoria.
   * Perezoso: solo se invoca cuando hace falta un token (no al arrancar).
   * Éxito = result.error == null (el backend responde 200, no 201). `expiresIn`
   * se recibe pero NO se parsea: la caducidad se maneja de forma reactiva (401).
   * Devuelve true si obtuvo token; false si el login falló.
   */
  login(): Promise<boolean>;
  /**
   * Indica si la identidad admite re-login reactivo (solo la vía b: credenciales
   * de login en memoria). Con token directo, dev-header o sin credenciales, un
   * 401 no es recuperable.
   */
  canRelogin(): boolean;
}

/**
 * Construye la API del MCP: crea el cliente, registra el middleware de identidad
 * y conecta el re-login reactivo ante 401.
 */
export function createMcpApi(config: McpConfig): McpApi {
  const client = createApiClient({ baseUrl: config.baseUrl });
  const identity = config.identity;

  // Token JWT vivo SOLO en memoria del proceso. Para la vía 'token' arranca con
  // el token directo; para la vía 'login' empieza vacío y se puebla con login().
  let accessToken: string | undefined =
    identity.mode === 'jwt' && identity.kind === 'token'
      ? identity.token
      : undefined;

  /**
   * Resuelve el valor de la cabecera de identidad para una request, según el
   * modo. Nunca devuelve ambas cabeceras; en jwt sin token no añade cabecera (el
   * backend responderá 401 y el re-login reactivo lo gestiona).
   */
  function applyIdentity(request: Request): void {
    if (identity.mode === 'jwt') {
      if (accessToken) {
        request.headers.set('Authorization', `Bearer ${accessToken}`);
      }
      return;
    }
    // dev-header
    request.headers.set('X-Actor-Id', identity.actorId);
  }

  const identityMiddleware: Middleware = {
    onRequest({ request }) {
      applyIdentity(request);
      return request;
    },
  };
  client.use(identityMiddleware);

  async function login(): Promise<boolean> {
    if (identity.mode !== 'jwt' || identity.kind !== 'login') {
      return false;
    }
    const body: LoginBody = {
      identifier: identity.identifier,
      password: identity.password,
    };
    // El contrato no tipa el body de /auth/login; se castea el body local.
    const result = await client.POST('/auth/login', {
      body: body as never,
    });
    if (result.error != null || result.data == null) {
      return false;
    }
    const data = result.data as LoginResponse;
    // expiresIn se recibe pero NO se parsea (caducidad reactiva por 401).
    accessToken = data.accessToken;
    return true;
  }

  function canRelogin(): boolean {
    return identity.mode === 'jwt' && identity.kind === 'login';
  }

  return { client, login, canRelogin };
}

/**
 * Forma mínima de un resultado de openapi-fetch que necesita el re-login
 * reactivo (solo el status de la respuesta).
 */
interface StatusResult {
  readonly response: { readonly status: number };
}

/**
 * Ejecuta una llamada a la API con RE-LOGIN REACTIVO ante 401: UN solo reintento
 * y solo si la identidad admite re-login (vía b, credenciales en memoria). Con
 * token directo, dev-header o sin credenciales, el 401 no es recuperable y se
 * devuelve el resultado tal cual.
 *
 * `call` debe ser un thunk que repite la misma petición (el middleware de
 * identidad reinyecta el token actualizado en el reintento). Esta función no
 * traduce el error; eso lo hace toMcpError sobre el resultado devuelto.
 */
export async function callWithRelogin<R extends StatusResult>(
  api: McpApi,
  call: () => Promise<R>,
): Promise<R> {
  const result = await call();
  if (result.response.status !== 401 || !api.canRelogin()) {
    return result;
  }
  const reauthenticated = await api.login();
  if (!reauthenticated) {
    return result;
  }
  return call();
}

/**
 * Comprueba si una identidad es de la vía 'login' (credenciales en memoria), la
 * única que admite re-login reactivo ante 401. Útil para quien orqueste el
 * reintento sin acoplarse a la implementación interna.
 */
export function identityAllowsRelogin(identity: Identity): boolean {
  return identity.mode === 'jwt' && identity.kind === 'login';
}
