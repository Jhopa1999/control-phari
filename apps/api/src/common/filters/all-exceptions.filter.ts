import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
/** Subconjunto de Express que usa el filtro (el proyecto no instala @types/express). */
interface HttpResponseLike {
  headersSent: boolean;
  status(code: number): { json(body: unknown): unknown };
}
interface HttpRequestLike {
  method?: string;
  url?: string;
}

/** Mensaje genérico de un fallo interno: sin stack ni texto de Prisma. */
export const INTERNAL_ERROR_MESSAGE =
  'Ocurrió un error interno. Inténtalo de nuevo; si continúa, avisa al administrador.';

/** Mensajes por defecto de Nest (en inglés) y su equivalente en español. */
const DEFAULT_MESSAGES_ES: Record<string, string> = {
  'Forbidden resource': 'No tienes permiso para realizar esta acción.',
  Forbidden: 'No tienes permiso para realizar esta acción.',
  Unauthorized: 'Tu sesión no es válida o caducó. Inicia sesión de nuevo.',
  'Not Found': 'No se encontró lo que buscas.',
  'Bad Request': 'Revisa los datos ingresados.',
  Conflict: 'La operación entra en conflicto con el estado actual.',
  'Too Many Requests': 'Demasiados intentos. Inténtalo de nuevo en unos minutos.',
  'Payload Too Large': 'El contenido enviado es demasiado grande.',
  'Request Entity Too Large': 'El contenido enviado es demasiado grande.',
  'Unsupported Media Type': 'El tipo de contenido enviado no es compatible.',
  'Unprocessable Entity': 'No se pudo procesar la información enviada.',
  'Internal Server Error': INTERNAL_ERROR_MESSAGE,
  'Service Unavailable': 'El servicio no está disponible en este momento. Inténtalo de nuevo.',
  'Bad Gateway': 'El servicio no está disponible en este momento. Inténtalo de nuevo.',
  'Gateway Timeout': 'El servicio tardó demasiado en responder. Inténtalo de nuevo.',
  'Method Not Allowed': 'La operación no está permitida.',
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** Rutas de archivo del servidor (Windows o POSIX) y trazas «at fn (archivo:línea)». */
const PATH_RE = /(?:[A-Za-z]:\\[^\s"'`)]+|\/(?:app|usr|home|var|opt|node_modules|src)\/[^\s"'`)]+)/g;

/**
 * Quita de un mensaje lo que no debe llegar al usuario: UUID (con las comillas
 * que los rodean) y rutas internas del servidor. No añade tildes: el texto de
 * origen ya está en español.
 */
export function sanitizeMessage(message: string): string {
  const cleaned = message
    .replace(new RegExp(`["'«“]?${UUID_RE.source}["'»”]?`, 'gi'), '')
    .replace(PATH_RE, '')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
  return DEFAULT_MESSAGES_ES[cleaned] ?? cleaned;
}

function sanitizeMessages(message: unknown): string | string[] | undefined {
  if (typeof message === 'string') return sanitizeMessage(message);
  if (Array.isArray(message)) {
    return message.filter((m): m is string => typeof m === 'string').map(sanitizeMessage);
  }
  return undefined;
}

/**
 * Filtro global de excepciones. Conserva el código HTTP y la forma
 * `{ statusCode, message, error }` que leen la web y el MCP; traduce los
 * mensajes por defecto de Nest, quita UUID y rutas internas y convierte
 * cualquier error no HTTP (p. ej. Prisma) en un 500 genérico, registrando el
 * detalle solo en el log.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      throw exception;
    }
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<HttpResponseLike>();
    const req = ctx.getRequest<HttpRequestLike>();
    if (res.headersSent) return;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (status >= 500) {
        this.logger.error(
          `${req?.method ?? ''} ${req?.url ?? ''} -> ${status}: ${exception.message}`,
          exception.stack,
        );
      }
      const base: Record<string, unknown> =
        typeof raw === 'object' && raw !== null ? { ...(raw as Record<string, unknown>) } : {};
      const source = typeof raw === 'string' ? raw : base.message ?? exception.message;
      const message = sanitizeMessages(source) ?? INTERNAL_ERROR_MESSAGE;
      const body: Record<string, unknown> = { ...base, statusCode: status, message };
      if (typeof base.error !== 'string') delete body.error;
      res.status(status).json(body);
      return;
    }

    this.logger.error(
      `${req?.method ?? ''} ${req?.url ?? ''} -> 500: ${
        exception instanceof Error ? exception.message : String(exception)
      }`,
      exception instanceof Error ? exception.stack : undefined,
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
      error: 'Internal Server Error',
    });
  }
}