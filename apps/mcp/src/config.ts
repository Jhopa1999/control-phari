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

export type Identity = DevHeaderIdentity | JwtTokenIdentity | JwtLoginIdentity;

/** Configuración tipada e inmutable del servidor MCP. */
export interface McpConfig {
  /** URL base de la API (sin credenciales). */
  readonly baseUrl: string;
  /** Identidad resuelta a partir del modo de autenticación. */
  readonly identity: Identity;
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
    return { baseUrl, identity: { mode: 'dev-header', actorId } };
  }

  // mode === 'jwt': exige UNA vía de credencial.
  const token = readEnv('MCP_API_TOKEN');
  if (token) {
    return { baseUrl, identity: { mode: 'jwt', kind: 'token', token } };
  }

  const identifier = readEnv('MCP_LOGIN_IDENTIFIER');
  const password = readEnv('MCP_LOGIN_PASSWORD');
  if (identifier && password) {
    return {
      baseUrl,
      identity: { mode: 'jwt', kind: 'login', identifier, password },
    };
  }

  return fatalConfigError(
    'en modo jwt falta una vía de credencial. Define MCP_API_TOKEN, ' +
      'o el par MCP_LOGIN_IDENTIFIER + MCP_LOGIN_PASSWORD.',
  );
}
