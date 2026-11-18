/**
 * Error de dominio con un mensaje ya entendible para el usuario.
 * Nunca contiene stack traces, JSON crudo ni errores internos de Prisma.
 * Reutilizable por los wrappers tipados (me, team, audit, dev-actors), con el
 * mismo criterio que lib/catalog.ts.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Segundos de espera que informó la API en `Retry-After` (solo en el 429). */
    readonly retryAfterSeconds?: number,
    /**
     * Mensajes de negocio del servidor en un 400/409 (uno por regla incumplida).
     * Permiten marcar el campo exacto; nunca se interpreta texto libre.
     */
    readonly messages?: readonly string[],
    /** Cuerpo JSON de un 409 con datos extra (p. ej. `requiresConfirmation`). */
    readonly body?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Lee `Retry-After` en segundos; ignora fechas HTTP y valores no válidos. */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  const seconds = Number(value.trim());
  return seconds > 0 ? seconds : undefined;
}

/**
 * Traduce un codigo HTTP a un mensaje de negocio entendible, sin exponer
 * detalles internos. 403/404 se comunican como falta de acceso o inexistencia
 * sin revelar datos (design 5.5).
 */
export function messageForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'Revisa los datos ingresados.';
    case 401:
      return 'No hay un usuario actual. Selecciona un usuario para continuar.';
    case 403:
      return 'No tienes acceso a esta acción.';
    case 404:
      return 'No existe o fue removido.';
    case 409:
      return 'Ya existe un registro con esos datos.';
    case 429:
      return 'Demasiados intentos. Inténtalo de nuevo en unos minutos.';
    default:
      return 'Ocurrió un error al procesar la solicitud. Inténtalo de nuevo.';
  }
}

/**
 * Normaliza cualquier fallo (HTTP o de red) a un ApiError entendible.
 */
export function toApiError(
  status: number | undefined,
  retryAfterSeconds?: number,
): ApiError {
  if (status === undefined) {
    return new ApiError(
      'No fue posible comunicarse con el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }
  return new ApiError(messageForStatus(status), status, retryAfterSeconds);
}

/**
 * Mensaje accionable del cuerpo de error de la API ({ message }). Si el cuerpo
 * trae un arreglo (400 de validación) se unen los mensajes con salto de línea.
 * Devuelve `undefined` si no hay texto utilizable.
 */
export function messageFromBody(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const message = (body as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim() !== '') return message;
  if (Array.isArray(message)) {
    const texts = message.filter((m): m is string => typeof m === 'string' && m.trim() !== '');
    if (texts.length > 0) return texts.join('\n');
  }
  return undefined;
}

/**
 * Como toApiError, pero usa el mensaje de negocio del backend (ya en español y
 * sin UUID gracias al filtro global de la API) cuando el cuerpo lo trae, para
 * que el usuario sepa qué ocurrió y cómo continuar.
 */
export function apiErrorFrom(status: number | undefined, body: unknown): ApiError {
  const message = messageFromBody(body);
  if (status !== undefined && message !== undefined) {
    return new ApiError(message, status);
  }
  return toApiError(status);
}

export type ErrorKind = 'forbidden' | 'network' | 'server' | 'notFound' | 'unauthorized';

export interface ClassifiedError {
  kind: ErrorKind;
  /** Texto del servidor si lo hay; si no, el de `messageForStatus`. Vacío en red. */
  message: string;
  status?: number;
}

/**
 * Clasifica un fallo para pintarlo (ErrorState, avisos del asistente, toasts).
 * 403 → forbidden; sin `status` (sin respuesta, timeout, aborto) → network;
 * 404 → notFound; 401 → unauthorized (sesión caducada); el resto → server.
 * Acepta cualquier error con `status` numérico (ApiError y los errores de
 * dominio de `lib/*.ts`).
 */
export function classifyError(error: unknown): ClassifiedError {
  const status =
    typeof error === 'object' && error !== null && typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : undefined;
  const text =
    error instanceof Error && error.message.trim() !== '' ? error.message : undefined;
  if (status === undefined) return { kind: 'network', message: '' };
  const message = text ?? messageForStatus(status);
  if (status === 403) return { kind: 'forbidden', message, status };
  if (status === 404) return { kind: 'notFound', message, status };
  if (status === 401) return { kind: 'unauthorized', message, status };
  return { kind: 'server', message, status };
}

/**
 * Como `apiErrorFrom`, pero conserva TODOS los mensajes del servidor (el 400 de
 * validación trae `message` como arreglo, uno por campo) y el cuerpo de un 409
 * para formularios que marcan el campo con el error. El texto principal es el
 * de la primera regla; sin mensaje del servidor cae a `apiErrorFrom`.
 */
export function apiFormErrorFrom(status: number | undefined, body: unknown): ApiError {
  if ((status === 400 || status === 409) && typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    const raw = record.message;
    const messages = (Array.isArray(raw) ? raw : [raw]).filter(
      (m): m is string => typeof m === 'string' && m.trim() !== '',
    );
    if (messages.length > 0) {
      return new ApiError(messages[0], status, undefined, messages, record);
    }
  }
  return apiErrorFrom(status, body);
}
