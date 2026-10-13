/**
 * Utilidades compartidas por los módulos de tools del MCP.
 *
 * Centralizan el patrón común de cada tool para que los módulos de dominio sean
 * capas finas 1:1 con el contrato:
 *   1. ejecutar la llamada tipada al api-client con re-login reactivo ante 401,
 *   2. traducir cualquier error de la API con toMcpError (función pura),
 *   3. en éxito, serializar result.data como texto JSON,
 *   4. ante una excepción (red, zod, inesperado), traducir con exceptionToMcpError.
 *
 * Las tools NO contienen lógica de negocio ni validación de dominio: solo mapean
 * entrada/salida. El contrato es la fuente de verdad de rutas y tipos.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpApi } from '../api.js';
import { callWithRelogin } from '../api.js';
import type { ApiResultLike, ErrorContext } from '../errors.js';
import { toMcpError, exceptionToMcpError } from '../errors.js';

/** Resultado de una llamada de openapi-fetch que estas utilidades necesitan. */
type ApiCallResult = ApiResultLike & { readonly response: { readonly status: number } };

/** Construye un CallToolResult de éxito con la data serializada como JSON. */
export function okJson(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data ?? null, null, 2) }],
  };
}

/**
 * Ejecuta una llamada al api-client aplicando el patrón común de las tools:
 * re-login reactivo ante 401, traducción de errores de API y de excepciones, y
 * serialización de la respuesta en éxito. `call` debe ser un thunk que repita la
 * MISMA petición (para que el re-login reinyecte el token nuevo).
 */
export async function runApiTool(
  api: McpApi,
  call: () => Promise<ApiCallResult>,
  context: ErrorContext = {},
): Promise<CallToolResult> {
  try {
    const result = await callWithRelogin(api, call);
    const error = toMcpError(result, context);
    if (error) {
      return error;
    }
    return okJson(result.data);
  } catch (error: unknown) {
    return exceptionToMcpError(error, context);
  }
}
