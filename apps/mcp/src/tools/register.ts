/**
 * Motor genérico de registro: convierte una `ToolSpec` del catálogo en una tool
 * MCP real. Deriva del contrato OpenAPI el esquema de entrada y llama al
 * api-client de forma dinámica, reutilizando `runApiTool` (re-login reactivo
 * ante 401 y traducción de errores).
 *
 * No hay lógica de negocio aquí: los argumentos se reenvían tal cual a la API.
 */
import type { McpContext } from '../server.js';
import type { McpApi } from '../api.js';
import { runApiTool } from './shared.js';
import {
  buildInputShape,
  listOperations,
  loadOpenApi,
  pathParamNames,
} from './openapi.js';
import type { OpenApiDocument, OpenApiOperation } from './openapi.js';
import { deriveAnnotations, parseOperation } from './spec.js';
import type { HttpMethod, ToolSpec } from './spec.js';

/** Argumentos planos que recibe el handler (ya validados por zod). */
type ToolArgs = Record<string, unknown>;

/** Opciones de la petición dinámica al api-client. */
interface DynamicRequestInit {
  params?: {
    path?: Record<string, string>;
    query?: Record<string, unknown>;
  };
  body?: unknown;
}

/** Resultado de openapi-fetch que `runApiTool` necesita. */
interface DynamicResult {
  readonly data?: unknown;
  readonly error?: unknown;
  readonly response: { readonly status: number };
}

/** Vista dinámica del cliente tipado: método HTTP + ruta literal del contrato. */
type DynamicClient = Record<
  HttpMethod,
  (path: string, init?: DynamicRequestInit) => Promise<DynamicResult>
>;

/**
 * Valida que la spec sea coherente con el contrato y devuelve su operación.
 * Lanza (fail-fast al arrancar) si la operación no existe o si el acceso no
 * corresponde al método HTTP.
 */
export function resolveOperation(
  operations: Map<string, OpenApiOperation>,
  spec: ToolSpec,
): OpenApiOperation {
  const { method } = parseOperation(spec.operation);
  const operation = operations.get(spec.operation);
  if (operation === undefined) {
    throw new Error(
      `La tool "${spec.name}" apunta a una operación inexistente en el contrato: ${spec.operation}`,
    );
  }
  if ((method === 'GET') !== (spec.access === 'read')) {
    throw new Error(
      `La tool "${spec.name}" (${spec.operation}) tiene un acceso "${spec.access}" incoherente con su método.`,
    );
  }
  return operation;
}

/** Separa los argumentos planos en path params, query params y body. */
function splitArgs(
  operation: OpenApiOperation,
  args: ToolArgs,
  optionalBody: boolean,
): DynamicRequestInit {
  const path: Record<string, string> = {};
  const query: Record<string, unknown> = {};
  for (const param of operation.parameters ?? []) {
    if (param.in === 'path') {
      path[param.name] = String(args[param.name]);
    } else if (param.in === 'query') {
      query[param.name] = args[param.name];
    }
  }

  const init: DynamicRequestInit = {};
  if (Object.keys(path).length > 0 || Object.keys(query).length > 0) {
    init.params = {};
    if (Object.keys(path).length > 0) init.params.path = path;
    if (Object.keys(query).length > 0) init.params.query = query;
  }
  if (operation.requestBody !== undefined) {
    init.body = args.body ?? (optionalBody ? {} : undefined);
  }
  return init;
}

/** Registra una tool del catálogo en el server MCP. */
export function registerSpecTool(
  ctx: McpContext,
  doc: OpenApiDocument,
  operations: Map<string, OpenApiOperation>,
  spec: ToolSpec,
): void {
  const operation = resolveOperation(operations, spec);
  const { method, path } = parseOperation(spec.operation);
  const optionalBody = spec.optionalBody === true;
  const inputSchema = buildInputShape(doc, operation, { optionalBody });
  const firstPathParam = pathParamNames(path)[0];
  const { api } = ctx;

  ctx.server.registerTool(
    spec.name,
    {
      description: spec.description,
      inputSchema,
      annotations: deriveAnnotations(spec.access, method),
    },
    async (args: ToolArgs) => {
      const init = splitArgs(operation, args, optionalBody);
      const client = api.client as unknown as DynamicClient;
      const resourceId =
        firstPathParam === undefined ? undefined : String(args[firstPathParam]);
      return runApiTool(
        api as McpApi,
        () => client[method](path, init),
        resourceId === undefined ? {} : { resourceId },
      );
    },
  );
}

/** Registra todas las tools de un catálogo (lista de specs). */
export function registerSpecTools(
  ctx: McpContext,
  specs: ReadonlyArray<ToolSpec>,
): void {
  const doc = loadOpenApi();
  const operations = listOperations(doc);
  for (const spec of specs) {
    registerSpecTool(ctx, doc, operations, spec);
  }
}
