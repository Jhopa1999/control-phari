/**
 * Configuración del servidor MCP leída de variables de entorno (fail-fast).
 *
 * El MCP es una capa delgada: no hardcodea valores, no lee archivos .env reales
 * y solo valida la PRESENCIA de la configuración necesaria. No ejecuta login
 * aquí (el login es perezoso, ver api.ts). Si falta configuración obligatoria,
 * el proceso termina con código != 0 y un mensaje entendible a stderr,
 * remitiendo a apps/mcp/.env.example.
 */

/**
 * Modo de resolución de identidad del MCP. Igual que el frontend
 * (apps/web/src/lib/auth-mode.ts): solo 'jwt' activa autenticación real;
 * cualquier otro valor o su ausencia cae en 'dev-header' (default seguro).
 */
export type McpAuthMode = 'jwt' | 'dev-header';

/**
 * Transporte del servidor MCP. `stdio` (default) mantiene el comportamiento
 * actual byte-a-byte (identidad por entorno, un solo proceso local). `http`
 * añade un listener de red donde la identidad llega POR PETICIÓN en la cabecera
 * `Authorization: Bearer` (una persona por token). Solo el valor exacto `http`
 * selecciona HTTP; cualquier otro valor o su ausencia cae en `stdio`.
 */
export type McpTransport = 'stdio' | 'http';

/** Valores por defecto del listener HTTP (sin hardcodear en el código cliente). */
const DEFAULT_HTTP_HOST = '0.0.0.0';
const DEFAULT_HTTP_PORT = 3002;

/** Configuración del listener HTTP (solo presente en modo `http`). */
export interface HttpConfig {
  readonly host: string;
  readonly port: number;
}

/**
 * Identidad en modo HTTP: no hay identidad a nivel de proceso. El token Bearer
 * de cada petición es la identidad y se propaga por `httpTokenStore` (ver
 * http/token-store.ts). Este miembro existe para que el tipo `Identity` sea
 * total; el código de identidad stdio nunca hace match contra él.
 */
export interface HttpIdentity {
  readonly mode: 'http';
}

/** Identidad vía cabecera de desarrollo (X-Actor-Id). */
export interface DevHeaderIdentity {
  readonly mode: 'dev-header';
  /** Valor que se enviará en la cabecera X-Actor-Id. */
  readonly actorId: string;
}

/** Identidad JWT con token directo (vía a): no es recuperable ante 401. */
export interface JwtTokenIdentity {
  readonly mode: 'jwt';
  readonly kind: 'token';
  /** JWT ya emitido, provisto directamente por configuración. */
  readonly token: string;
}

/** Identidad JWT con credenciales de login (vía b): permite re-login reactivo. */
export interface JwtLoginIdentity {
  readonly mode: 'jwt';
  readonly kind: 'login';
  readonly identifier: string;
  readonly password: string;
}

export type Identity =
  | DevHeaderIdentity
  | JwtTokenIdentity
  | JwtLoginIdentity
  | HttpIdentity;

/** Configuración tipada e inmutable del servidor MCP. */
export interface McpConfig {
  /** Transporte seleccionado (`stdio` default | `http`). */
  readonly transport: McpTransport;
  /** URL base de la API (sin credenciales). */
  readonly baseUrl: string;
  /** Identidad resuelta a partir del modo de autenticación / transporte. */
  readonly identity: Identity;
  /** Configuración del listener HTTP (solo en modo `http`). */
  readonly http?: HttpConfig;
}

/**
 * Imprime el error de configuración a stderr y termina el proceso.
 * stdout está reservado al protocolo MCP, por eso el error va a stderr.
 */
function fatalConfigError(message: string): never {
  process.stderr.write(
    `[mcp] Error de configuración: ${message}\n` +
      '[mcp] Revisa apps/mcp/.env.example y define las variables requeridas.\n',
  );
  process.exit(1);
}

/** Lee una variable de entorno y devuelve su valor recortado o undefined si está vacía. */
function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Carga y valida la configuración del MCP. Solo valida presencia; nunca ejecuta
 * login ni contacta la API. Lanza (vía process.exit) si falta algo obligatorio.
 */
export function loadConfig(): McpConfig {
  const baseUrl = readEnv('MCP_API_BASE_URL');
  if (!baseUrl) {
    fatalConfigError('falta MCP_API_BASE_URL (URL base de la API).');
  }

  // Solo el valor exacto 'http' selecciona HTTP; lo demás cae en stdio.
  const transport: McpTransport =
    readEnv('MCP_TRANSPORT') === 'http' ? 'http' : 'stdio';

  if (transport === 'http') {
    return loadHttpConfig(baseUrl);
  }

  return loadStdioConfig(baseUrl);
}

/**
 * Carga la configuración del transporte HTTP. La identidad llega POR PETICIÓN
 * (Bearer), así que NO se exigen MCP_ACTOR_ID / MCP_API_TOKEN / credenciales de
 * login: se ignoran en http. Solo valida el host/puerto del listener.
 */
function loadHttpConfig(baseUrl: string): McpConfig {
  const host = readEnv('MCP_HTTP_HOST') ?? DEFAULT_HTTP_HOST;
  const port = parseHttpPort(readEnv('MCP_HTTP_PORT'));
  return {
    transport: 'http',
    baseUrl,
    identity: { mode: 'http' },
    http: { host, port },
  };
}

/**
 * Parsea y valida MCP_HTTP_PORT. Debe ser un entero en 1..65535; cualquier
 * valor no numérico o fuera de rango es fatal (fail-fast). Si está ausente usa
 * el default.
 */
function parseHttpPort(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_HTTP_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fatalConfigError(
      `MCP_HTTP_PORT inválido ("${raw}"): debe ser un entero entre 1 y 65535.`,
    );
  }
  return port;
}

/**
 * Carga la configuración del transporte stdio (comportamiento histórico, sin
 * cambios): identidad por entorno (dev-header o jwt) validada fail-fast.
 */
function loadStdioConfig(baseUrl: string): McpConfig {
  // Mismo criterio que el frontend: solo 'jwt' exacto activa JWT.
  const mode: McpAuthMode =
    readEnv('MCP_AUTH_MODE') === 'jwt' ? 'jwt' : 'dev-header';

  if (mode === 'dev-header') {
    const actorId = readEnv('MCP_ACTOR_ID');
    if (!actorId) {
      fatalConfigError(
        'en modo dev-header falta MCP_ACTOR_ID (identidad para la cabecera X-Actor-Id).',
      );
    }
    return {
      transport: 'stdio',
      baseUrl,
      identity: { mode: 'dev-header', actorId },
    };
  }

  // mode === 'jwt': exige UNA vía de credencial.
  const token = readEnv('MCP_API_TOKEN');
  if (token) {
    return {
      transport: 'stdio',
      baseUrl,
      identity: { mode: 'jwt', kind: 'token', token },
    };
  }

  const identifier = readEnv('MCP_LOGIN_IDENTIFIER');
  const password = readEnv('MCP_LOGIN_PASSWORD');
  if (identifier && password) {
    return {
      transport: 'stdio',
      baseUrl,
      identity: { mode: 'jwt', kind: 'login', identifier, password },
    };
  }

  return fatalConfigError(
    'en modo jwt falta una vía de credencial. Define MCP_API_TOKEN, ' +
      'o el par MCP_LOGIN_IDENTIFIER + MCP_LOGIN_PASSWORD.',
  );
}
