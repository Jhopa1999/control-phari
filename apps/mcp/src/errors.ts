/**
 * Traductor de errores del MCP (función PURA, unit-testeable, sin red).
 *
 * Mapea resultados de openapi-fetch ({ data?, error?, response }) y excepciones
 * a resultados MCP con isError: true y content de texto, siguiendo la tabla de
 * errores del diseño. NUNCA filtra stack traces, secretos ni la URL con
 * credenciales. El logging a stderr se hace fuera de esta función pura; aquí
 * solo se construye el resultado.
 *
 * El re-login reactivo ante 401 vive en api.ts/el orquestador (withApiCall más
 * abajo), no dentro de esta función pura.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Forma mínima de un resultado de openapi-fetch que toMcpError necesita leer. */
export interface ApiResultLike {
  readonly data?: unknown;
  readonly error?: unknown;
  readonly response: { readonly status: number };
}

/** Contexto para enriquecer el mensaje de error sin filtrar datos sensibles. */
export interface ErrorContext {
  /** URL base de la API (SIN credenciales), para errores de red. */
  readonly baseUrl?: string;
  /** Identificador del recurso solicitado, para 404. */
  readonly resourceId?: string;
  /** Campo que falló la validación zod, para errores de validación. */
  readonly field?: string;
}

/** Construye un CallToolResult de error con un único bloque de texto. */
function errorResult(text: string): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

/**
 * Extrae un `message` legible del cuerpo de error del backend sin asumir su
 * forma (el contrato no tipa los cuerpos de error). Devuelve undefined si no
 * hay un mensaje de texto utilizable. Nunca serializa el objeto completo (podría
 * contener datos sensibles o stack traces).
 */
function extractMessage(error: unknown): string | undefined {
  if (typeof error === 'string') {
    return error.length > 0 ? error : undefined;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
    // Nest a veces devuelve message como arreglo de strings de validación.
    if (
      Array.isArray(message) &&
      message.every((m) => typeof m === 'string') &&
      message.length > 0
    ) {
      return (message as string[]).join('; ');
    }
  }
  return undefined;
}

/** Añade `: <message>` solo si hay mensaje; evita dejar un ": " colgando. */
function withMessage(base: string, message: string | undefined): string {
  return message ? `${base}: ${message}` : base;
}

/**
 * Mapea un resultado de openapi-fetch a un CallToolResult.
 * - 2xx (sin error) devuelve null: NO es un error, la tool debe formatear data.
 * - El resto produce un resultado de error según la tabla del diseño.
 */
export function toMcpError(
  result: ApiResultLike,
  context: ErrorContext = {},
): CallToolResult | null {
  const status = result.response.status;

  if (result.error == null && status >= 200 && status < 300) {
    return null;
  }

  const message = extractMessage(result.error);

  switch (status) {
    case 400:
      return errorResult(withMessage('Solicitud inválida', message));
    case 401:
      return errorResult('No autenticado o no autorizado.');
    case 403:
      return errorResult('No tienes permiso para realizar esta operación.');
    case 404:
      return errorResult(
        context.resourceId
          ? `Recurso no encontrado: ${context.resourceId}`
          : 'Recurso no encontrado.',
      );
    case 409:
    case 422:
      // 409/422: se devuelve el message del backend tal cual (es seguro y útil).
      return errorResult(message ?? 'La operación no se pudo completar.');
    default:
      if (status >= 500) {
        // 5xx: genérico, sin exponer el cuerpo de la respuesta del backend.
        return errorResult(
          'La API respondió con un error interno. Inténtalo de nuevo más tarde.',
        );
      }
      return errorResult(withMessage('La operación falló', message));
  }
}

/**
 * Mapea una excepción (no un resultado de openapi-fetch) a un CallToolResult.
 * Distingue fallo de red, fallo de validación zod y error inesperado. Nunca
 * incluye el stack trace ni serializa el error completo.
 */
export function exceptionToMcpError(
  error: unknown,
  context: ErrorContext = {},
): CallToolResult {
  // Fallo de validación de entrada (zod): se nombra el campo si se conoce.
  if (isZodLikeError(error)) {
    const field = context.field ?? zodFirstPath(error);
    return errorResult(
      field
        ? `Entrada inválida en el campo "${field}".`
        : 'Entrada inválida.',
    );
  }

  // Fallo de red (fetch lanza TypeError): se indica la base URL sin credenciales.
  if (isNetworkError(error)) {
    return errorResult(
      context.baseUrl
        ? `No se pudo contactar la API en ${context.baseUrl}.`
        : 'No se pudo contactar la API.',
    );
  }

  // Error inesperado: mensaje genérico, nunca el detalle interno.
  return errorResult('Error interno del MCP.');
}

/** Detecta un error de red de fetch sin acoplarse a una implementación. */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return (
      code === 'ECONNREFUSED' ||
      code === 'ENOTFOUND' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET'
    );
  }
  return false;
}

/** Detecta un error con forma de ZodError (issues[].path) sin importar zod aquí. */
function isZodLikeError(error: unknown): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

/** Devuelve el primer campo con problema de un ZodError, si lo hay. */
function zodFirstPath(error: unknown): string | undefined {
  if (!isZodLikeError(error)) return undefined;
  const issues = (error as { issues: Array<{ path?: unknown }> }).issues;
  const first = issues[0];
  if (first && Array.isArray(first.path) && first.path.length > 0) {
    return first.path.map((p) => String(p)).join('.');
  }
  return undefined;
}
