import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';

/**
 * Configuracion de observabilidad del backend (logging estructurado +
 * correlacion de peticiones) centralizada para `nestjs-pino`.
 *
 * - Nivel configurable por `LOG_LEVEL` (default `info`), sin hardcodear.
 * - Salida legible (pino-pretty) solo si `LOG_PRETTY === 'true'`; JSON en
 *   cualquier otro caso (produccion).
 * - Correlacion `x-request-id`: se reutiliza la cabecera entrante si viene; si
 *   no, se genera un UUID. El id se devuelve en la respuesta como cabecera
 *   `x-request-id`.
 * - Seguridad: se censuran cabeceras sensibles (`authorization`, `cookie`) y NO
 *   se loguea el cuerpo de la peticion (comportamiento por defecto de
 *   pino-http, que se mantiene).
 */

const DEFAULT_LOG_LEVEL = 'info';
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Lee el header `x-request-id` entrante de forma robusta (puede llegar como
 * string o como array de strings segun el cliente/proxy) y devuelve el primer
 * valor no vacio, o `undefined` si no hay ninguno utilizable.
 */
function readIncomingRequestId(
  header: string | string[] | undefined,
): string | undefined {
  if (typeof header === 'string') {
    const trimmed = header.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(header)) {
    for (const value of header) {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

/**
 * Genera (o propaga) el identificador de correlacion de una peticion.
 *
 * - Si la peticion trae `x-request-id` con un valor no vacio, se reutiliza.
 * - En caso contrario, se genera un UUID v4.
 *
 * Ademas, fija la cabecera `x-request-id` en la respuesta para que el cliente
 * pueda correlacionar. No se expone ningun dato sensible.
 *
 * Exportada para poder testearla de forma aislada.
 */
export function genReqId(
  req: IncomingMessage,
  res: ServerResponse,
): string {
  const incoming = readIncomingRequestId(req.headers[REQUEST_ID_HEADER]);
  const requestId = incoming ?? randomUUID();
  if (typeof res.setHeader === 'function' && !res.headersSent) {
    res.setHeader(REQUEST_ID_HEADER, requestId);
  }
  return requestId;
}

/**
 * Construye los parametros de `LoggerModule.forRoot`. Solo registra la
 * configuracion de pino/pino-http; no corre middleware por si mismo, de modo
 * que es seguro para la generacion determinista del contrato OpenAPI (el
 * generador no llama a `app.init()`/`listen()`).
 */
export function buildLoggerModuleOptions(): Params {
  const level = process.env.LOG_LEVEL ?? DEFAULT_LOG_LEVEL;
  const pretty = process.env.LOG_PRETTY === 'true';

  return {
    pinoHttp: {
      level,
      genReqId,
      // Censura de cabeceras sensibles. El cuerpo de la peticion NO se loguea
      // (comportamiento por defecto de pino-http, que no se altera).
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        censor: '[redacted]',
      },
      // Salida legible solo en desarrollo (LOG_PRETTY=true); JSON en otro caso.
      transport: pretty
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:standard',
            },
          }
        : undefined,
    },
  };
}
