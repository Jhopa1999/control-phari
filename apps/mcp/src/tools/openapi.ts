/**
 * Lectura del contrato OpenAPI y construcción del esquema de entrada (zod) de
 * cada tool a partir de él.
 *
 * El contrato llega al MCP en runtime desde `@plantilla-portales/api-client`
 * (export `./openapi.json`): los Dockerfiles de mcp y web solo copian ese
 * paquete, no `apps/api`. El MCP no copia ni reescribe el contrato; solo lo
 * traduce a zod con `z.fromJSONSchema` (sin dependencias nuevas).
 *
 * Reglas de traducción (el MCP valida la FORMA; el dominio lo valida la API):
 * - `$ref` a `#/components/schemas/X` pasa a `#/$defs/X` (se incluyen solo los
 *   esquemas alcanzables).
 * - `nullable: true` (OpenAPI 3.0) pasa a `anyOf` con `null`.
 * - Los objetos con `properties` (DTO) llevan `additionalProperties: false`.
 * - `format` se retira del esquema (uuid/date/date-time los valida la API con
 *   más tolerancia que zod) y se añade a la descripción como pista para el LLM.
 * - `default` y `example` se retiran: el valor por defecto lo aplica la API.
 */
import { createRequire } from 'node:module';
import { z } from 'zod';
import type { HttpMethod } from './spec.js';

/** Objeto JSON genérico (nodo de esquema). */
export type JsonObject = Record<string, unknown>;

/** Parámetro de una operación (path, query...). */
export interface OpenApiParameter {
  readonly name: string;
  readonly in: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly schema?: JsonObject;
}

/** Cuerpo de una operación. */
export interface OpenApiRequestBody {
  readonly required?: boolean;
  readonly content: Record<string, { readonly schema?: JsonObject }>;
}

/** Operación del contrato (solo los campos que el MCP usa). */
export interface OpenApiOperation {
  readonly operationId?: string;
  readonly summary?: string;
  readonly parameters?: ReadonlyArray<OpenApiParameter>;
  readonly requestBody?: OpenApiRequestBody;
}

/** Documento OpenAPI (solo los campos que el MCP usa). */
export interface OpenApiDocument {
  readonly paths: Record<string, Record<string, OpenApiOperation>>;
  readonly components?: { readonly schemas?: Record<string, JsonObject> };
}

const HTTP_METHODS: ReadonlyArray<HttpMethod> = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
];

let cachedDocument: OpenApiDocument | undefined;

/** Carga (una sola vez) el contrato OpenAPI que entrega el api-client. */
export function loadOpenApi(): OpenApiDocument {
  if (cachedDocument === undefined) {
    const require = createRequire(import.meta.url);
    cachedDocument = require(
      '@plantilla-portales/api-client/openapi.json',
    ) as OpenApiDocument;
  }
  return cachedDocument;
}

/** Lista las operaciones del contrato indexadas por `'METHOD /path'`. */
export function listOperations(
  doc: OpenApiDocument,
): Map<string, OpenApiOperation> {
  const operations = new Map<string, OpenApiOperation>();
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method.toLowerCase()];
      if (operation !== undefined) {
        operations.set(`${method} ${path}`, operation);
      }
    }
  }
  return operations;
}

/** Nombres de los parámetros de ruta, en orden de aparición en la plantilla. */
export function pathParamNames(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

const SCHEMA_REF_PREFIX = '#/components/schemas/';

/** Convierte un nodo de esquema OpenAPI 3.0 a JSON Schema (ver reglas arriba). */
function convertNode(node: unknown, referenced: Set<string>): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => convertNode(item, referenced));
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }

  const source = node as JsonObject;
  const result: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'properties' && value !== null && typeof value === 'object') {
      // Los nombres de propiedad no son palabras clave: se convierten sus valores.
      result.properties = Object.fromEntries(
        Object.entries(value as JsonObject).map(([name, child]) => [
          name,
          convertNode(child, referenced),
        ]),
      );
    } else if (key === '$ref' && typeof value === 'string') {
      if (!value.startsWith(SCHEMA_REF_PREFIX)) {
        throw new Error(`Referencia no soportada en el contrato: ${value}`);
      }
      const name = value.slice(SCHEMA_REF_PREFIX.length);
      referenced.add(name);
      result.$ref = `#/$defs/${name}`;
    } else if (
      key === 'nullable' ||
      key === 'format' ||
      key === 'default' ||
      key === 'example'
    ) {
      // Se tratan abajo (nullable/format) o se descartan (default/example).
    } else {
      result[key] = convertNode(value, referenced);
    }
  }

  if (typeof source.format === 'string') {
    const hint = `Formato: ${source.format}.`;
    result.description =
      typeof result.description === 'string'
        ? `${result.description} ${hint}`
        : hint;
  }

  if (result.properties !== undefined && result.additionalProperties === undefined) {
    result.additionalProperties = false;
  }

  if (source.nullable === true) {
    const { description, ...inner } = result;
    const wrapped: JsonObject = { anyOf: [inner, { type: 'null' }] };
    if (description !== undefined) {
      wrapped.description = description;
    }
    return wrapped;
  }
  return result;
}

/**
 * Convierte un nodo del contrato a un JSON Schema autocontenido: incluye en
 * `$defs` todos los esquemas alcanzables desde él (resolviendo transitivamente).
 */
export function toStandaloneJsonSchema(
  doc: OpenApiDocument,
  node: JsonObject,
): JsonObject {
  const referenced = new Set<string>();
  const root = convertNode(node, referenced) as JsonObject;

  const defs: JsonObject = {};
  const pending = [...referenced];
  while (pending.length > 0) {
    const name = pending.pop() as string;
    if (name in defs) continue;
    const definition = doc.components?.schemas?.[name];
    if (definition === undefined) {
      throw new Error(`Esquema inexistente en el contrato: ${name}`);
    }
    const nested = new Set<string>();
    defs[name] = convertNode(definition, nested);
    for (const child of nested) {
      if (!(child in defs)) pending.push(child);
    }
  }

  return Object.keys(defs).length > 0 ? { ...root, $defs: defs } : root;
}

/** ¿El nodo de esquema no restringe nada (p. ej. `{}`)? */
function isUnconstrained(schema: JsonObject): boolean {
  return !['type', 'enum', 'anyOf', 'oneOf', 'allOf', '$ref'].some(
    (key) => key in schema,
  );
}

/** Construye el tipo zod de un parámetro (path o query) desde el contrato. */
function buildParamType(
  doc: OpenApiDocument,
  param: OpenApiParameter,
): z.ZodType {
  let schema: JsonObject = { ...(param.schema ?? {}) };
  if (isUnconstrained(schema)) {
    // Parámetro sin tipo en el contrato (p. ej. un filtro de texto libre).
    schema = { ...schema, type: 'string' };
  }
  if (param.description !== undefined) {
    schema.description = param.description;
  }
  const converted = toStandaloneJsonSchema(doc, schema);
  // Las rutas se pasan tal cual a la API: el id solo se valida como texto.
  const type = z.fromJSONSchema(converted);
  return param.required === true ? type : type.optional();
}

/** Nombre del DTO del cuerpo (para la descripción), si es un `$ref`. */
function bodyDtoName(schema: JsonObject): string | undefined {
  const ref = schema.$ref;
  return typeof ref === 'string' && ref.startsWith(SCHEMA_REF_PREFIX)
    ? ref.slice(SCHEMA_REF_PREFIX.length)
    : undefined;
}

/** Cuerpo JSON de la operación (application/json), si lo tiene. */
export function jsonBodySchema(
  operation: OpenApiOperation,
): JsonObject | undefined {
  return operation.requestBody?.content['application/json']?.schema;
}

/** Forma del esquema de entrada: argumentos PLANOS de la tool. */
export type InputShape = Record<string, z.ZodType>;

/** Opciones de construcción del esquema de entrada. */
export interface InputShapeOptions {
  /** Hace opcional el `body` (se enviará `{}` si falta). */
  readonly optionalBody?: boolean;
}

/**
 * Construye el esquema de entrada PLANO de una tool:
 * - un argumento por parámetro de ruta (con su nombre, p. ej. `id`),
 * - un argumento por parámetro de query (con su nombre, p. ej. `active`),
 * - `body` de primer nivel si la operación tiene cuerpo JSON.
 * Lanza si dos argumentos comparten nombre.
 */
export function buildInputShape(
  doc: OpenApiDocument,
  operation: OpenApiOperation,
  options: InputShapeOptions = {},
): InputShape {
  const shape: InputShape = {};
  const add = (name: string, type: z.ZodType): void => {
    if (name in shape) {
      throw new Error(`Argumento duplicado en la tool: "${name}".`);
    }
    shape[name] = type;
  };

  for (const param of operation.parameters ?? []) {
    if (param.in === 'path' || param.in === 'query') {
      add(param.name, buildParamType(doc, param));
    }
  }

  const body = jsonBodySchema(operation);
  if (body !== undefined) {
    const converted = toStandaloneJsonSchema(doc, body);
    const dto = bodyDtoName(body);
    const described = z
      .fromJSONSchema(converted)
      .describe(
        dto
          ? `Cuerpo de la petición (${dto}).`
          : 'Cuerpo de la petición.',
      );
    add('body', options.optionalBody === true ? described.optional() : described);
  }

  return shape;
}
