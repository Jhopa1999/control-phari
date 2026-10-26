/**
 * Transporte HTTP (Streamable HTTP) del servidor MCP.
 *
 * Mantiene el modelo de sesión del SDK (stateful: una `McpServer` + un
 * `StreamableHTTPServerTransport` por sesión, indexados por `Mcp-Session-Id`) y
 * añade autenticación POR PERSONA: cada petición debe traer
 * `Authorization: Bearer <token>`. El token se propaga a la sesión mediante el
 * `httpTokenStore` (AsyncLocalStorage), de forma que el api-client de esa
 * petición use exactamente ese token. Peticiones concurrentes de usuarios
 * distintos corren en frames ALS separados: nunca se mezclan identidades.
 *
 * El stdio NO se toca: este módulo solo se usa cuando MCP_TRANSPORT=http.
 *
 * stdout queda reservado; todo diagnóstico va a stderr y NUNCA incluye el token.
 */
import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpConfig } from '../config.js';
import { createHttpMcpApi } from '../api.js';
import { createServer } from '../server.js';
import { registerAll } from '../tools/index.js';
import { extractBearer, httpTokenStore } from './token-store.js';

/** Límite del cuerpo JSON aceptado (alineado con el default del SDK: 4 MiB). */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Código de error JSON-RPC para "no autorizado" (fuera del rango reservado). */
const JSONRPC_UNAUTHORIZED = -32001;

/** Una sesión HTTP activa: su server, su transporte y su api-client propio. */
interface HttpSession {
  readonly server: McpServer;
  readonly transport: StreamableHTTPServerTransport;
}

/** Handle para cerrar el listener y todas las sesiones de forma ordenada. */
export interface HttpTransportHandle {
  close(): Promise<void>;
}

/** Escribe a stderr (nunca a stdout, nunca el token). */
function logStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

/** Responde con un error JSON-RPC y un status HTTP dado. No incluye el token. */
function writeJsonRpcError(
  res: ServerResponse,
  httpStatus: number,
  code: number,
  message: string,
): void {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  });
  res.writeHead(httpStatus, { 'Content-Type': 'application/json' });
  res.end(body);
}

/** Lee el cuerpo de la petición con tope de tamaño; 413 si lo excede. */
async function readBody(req: IncomingMessage): Promise<Buffer | 'too-large'> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      return 'too-large';
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/**
 * Arranca el listener HTTP del MCP. Mantiene el proceso vivo hasta `close()`.
 */
export async function connectHttp(
  config: McpConfig,
): Promise<HttpTransportHandle> {
  if (config.http === undefined) {
    // Defensa: connectHttp solo se invoca con transport === 'http'.
    throw new Error('connectHttp requiere config.http definido.');
  }
  const { host, port } = config.http;
  const sessions = new Map<string, HttpSession>();

  /** Crea una sesión nueva con su propio server + transport + api-client. */
  async function createSession(sessionId: string): Promise<HttpSession> {
    const api = createHttpMcpApi(config);
    const ctx = createServer(api);
    registerAll(ctx);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      enableJsonResponse: false,
    });
    const cleanup = (): void => {
      sessions.delete(sessionId);
    };
    transport.onclose = cleanup;
    const session: HttpSession = { server: ctx.server, transport };
    await ctx.server.connect(transport);
    sessions.set(sessionId, session);
    return session;
  }

  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Requerir Bearer en TODA petición al endpoint MCP: sin identidad por red
    // no hay acceso. No se registra el valor del token.
    const token = extractBearer(req.headers.authorization);
    if (token === undefined) {
      logStderr('[mcp-http] 401: petición sin Authorization: Bearer válido.');
      writeJsonRpcError(
        res,
        401,
        JSONRPC_UNAUTHORIZED,
        'Unauthorized: missing or invalid Bearer token',
      );
      return;
    }

    // Leer el cuerpo una sola vez y pasarlo como parsedBody (uniforme).
    const raw = await readBody(req);
    if (raw === 'too-large') {
      writeJsonRpcError(res, 413, -32600, 'Request body too large');
      return;
    }

    let parsedBody: unknown;
    if (raw.length > 0) {
      try {
        parsedBody = JSON.parse(raw.toString('utf8'));
      } catch {
        writeJsonRpcError(res, 400, -32700, 'Parse error: invalid JSON body');
        return;
      }
    }

    // Resolver la sesión: por Mcp-Session-Id si existe; si no y es initialize,
    // crear una nueva. Si no hay sesión y no es initialize, dejar que el
    // transporte responda (400): no inventamos sesión.
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader)
      ? sessionIdHeader[0]
      : sessionIdHeader;

    let session: HttpSession | undefined;
    if (sessionId !== undefined && sessions.has(sessionId)) {
      session = sessions.get(sessionId);
    } else if (sessionId === undefined && isInitializeRequest(parsedBody)) {
      session = await createSession(randomUUID());
    }

    if (session === undefined) {
      // Sesión desconocida o petición no-initialize sin sesión: delega en un
      // transporte efímero para producir la respuesta de error estándar del SDK
      // (404/400). No crea estado persistente.
      const ephemeral = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      await httpTokenStore.run({ token }, () =>
        ephemeral.handleRequest(req, res, parsedBody),
      );
      await ephemeral.close();
      return;
    }

    // Ejecutar dentro del frame ALS con el token de ESTA petición. El callback
    // de la tool corre dentro de este frame síncrono (modelo del SDK), por lo
    // que el api-client usa exactamente este token y no el de otra sesión.
    await httpTokenStore.run({ token }, () =>
      session.transport.handleRequest(req, res, parsedBody),
    );
  }

  const httpServer: Server = createHttpServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      logStderr(`[mcp-http] Error no controlado: ${String(error)}`);
      if (!res.headersSent) {
        writeJsonRpcError(res, 500, -32603, 'Internal server error');
      } else {
        res.end();
      }
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, resolve);
  });

  async function close(): Promise<void> {
    for (const session of sessions.values()) {
      await session.transport.close();
    }
    sessions.clear();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  }

  return { close };
}
