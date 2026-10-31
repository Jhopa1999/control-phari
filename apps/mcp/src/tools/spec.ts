/**
 * Tipos del CATÁLOGO DECLARATIVO de tools del MCP.
 *
 * Cada tool es una entrada de datos (`ToolSpec`) que apunta a UNA operación del
 * contrato OpenAPI. El motor genérico (openapi.ts + register.ts) deriva de ahí
 * el esquema de entrada, la llamada al api-client y las anotaciones MCP. Una
 * tool no contiene lógica: añadir una es añadir una entrada al catálogo.
 */

/** Métodos HTTP del contrato que el motor sabe invocar. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Tipo de acceso de la tool:
 * - `read`: no modifica datos (solo operaciones GET).
 * - `write`: crea o modifica datos.
 * - `destructive`: borra o reemplaza datos (DELETE, importaciones).
 */
export type ToolAccess = 'read' | 'write' | 'destructive';

/** Declaración de una tool del MCP mapeada a una operación del contrato. */
export interface ToolSpec {
  /** Nombre de la tool (p. ej. `catalog.get`). Es parte del contrato público. */
  readonly name: string;
  /** Operación del contrato: `'METHOD /path'` (p. ej. `'GET /catalog-items/{id}'`). */
  readonly operation: string;
  /** Descripción en español que ve el LLM en `tools/list`. */
  readonly description: string;
  /** Tipo de acceso; de él se derivan las anotaciones MCP. */
  readonly access: ToolAccess;
  /**
   * El `body` es opcional y, si falta, se envía `{}`. Solo para operaciones
   * cuyo DTO tiene todos los campos opcionales (p. ej. `AdvanceStageDto`).
   */
  readonly optionalBody?: true;
}

/** Separa `'METHOD /path'` en sus partes; lanza si el formato es inválido. */
export function parseOperation(operation: string): {
  readonly method: HttpMethod;
  readonly path: string;
} {
  const match = /^(GET|POST|PUT|PATCH|DELETE) (\/\S*)$/.exec(operation);
  if (!match) {
    throw new Error(`Operación con formato inválido: "${operation}".`);
  }
  return { method: match[1] as HttpMethod, path: match[2] };
}

/** Anotaciones MCP derivadas del acceso y del método HTTP. */
export interface DerivedAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
}

/**
 * Deriva las anotaciones MCP de una tool:
 * - readOnlyHint: solo si `access === 'read'`.
 * - destructiveHint: solo si `access === 'destructive'`.
 * - idempotentHint: GET/PATCH/PUT/DELETE; los POST no lo son.
 */
export function deriveAnnotations(
  access: ToolAccess,
  method: HttpMethod,
): DerivedAnnotations {
  return {
    readOnlyHint: access === 'read',
    destructiveHint: access === 'destructive',
    idempotentHint: method !== 'POST',
  };
}
