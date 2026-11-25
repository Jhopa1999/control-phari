/**
 * Traducción pura de los fallos de POST /auth/change-password y de
 * POST /users/force-password-change. Sin alias `@/` (la carga e2e/web-lib.spec.ts).
 */

/** Textos exactos del servidor que se reconocen para marcar el campo. */
export const WRONG_CURRENT_MESSAGE = 'La contraseña actual no es correcta.';
export const SAME_PASSWORD_MESSAGE = 'La contraseña nueva debe ser distinta de la actual.';

/** La API informa el mínimo vigente: «La contraseña debe tener al menos N caracteres.» */
export const PASSWORD_TOO_SHORT_PREFIX = 'La contraseña debe tener al menos ';
export const PASSWORD_COMMON_MESSAGE = 'Esa contraseña es muy común y fácil de adivinar. Elige otra.';
const REQUIREMENTS_MESSAGE = 'La contraseña no cumple los requisitos. Elige otra.';
const GENERIC_CHANGE_MESSAGE = 'No fue posible cambiar la contraseña. Inténtalo de nuevo.';

/** Indica si el texto es un rechazo de la política de contraseñas (mínimo o común). */
export function isPasswordPolicyMessage(message: string | undefined): message is string {
  return (
    message !== undefined &&
    (message === PASSWORD_COMMON_MESSAGE || message.startsWith(PASSWORD_TOO_SHORT_PREFIX))
  );
}

export interface ChangePasswordFailure {
  /** Campo al que pertenece el error; sin campo va al aviso del formulario. */
  field?: 'currentPassword' | 'newPassword';
  message: string;
}

function minutesLabel(seconds: number | undefined): string | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  return `${Math.max(1, Math.ceil(seconds / 60))} min`;
}

function bodyMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const message = (body as { message?: unknown }).message;
  if (typeof message === 'string' && message.trim() !== '') return message;
  if (Array.isArray(message)) {
    const texts = message.filter((m): m is string => typeof m === 'string' && m.trim() !== '');
    if (texts.length > 0) return texts.join(' ');
  }
  return undefined;
}

/** Traduce un fallo del cambio de contraseña a texto y campo. Nunca JSON crudo ni códigos. */
export function describeChangePasswordFailure(
  status: number | undefined,
  body: unknown,
  retryAfterSeconds?: number,
): ChangePasswordFailure {
  if (status === 400) {
    const message = bodyMessage(body);
    if (message === WRONG_CURRENT_MESSAGE) return { field: 'currentPassword', message };
    if (message === SAME_PASSWORD_MESSAGE || isPasswordPolicyMessage(message)) {
      return { field: 'newPassword', message };
    }
    return { message: message ?? REQUIREMENTS_MESSAGE };
  }
  if (status === 429) {
    const wait = minutesLabel(retryAfterSeconds);
    return {
      message: wait
        ? `Espera ${wait} e inténtalo de nuevo.`
        : 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    };
  }
  return { message: GENERIC_CHANGE_MESSAGE };
}

export interface ForceResult {
  updated: number;
  skipped: number;
}

function plural(n: number): string {
  return n === 1 ? 'persona' : 'personas';
}

/** Resultado de exigir o retirar el cambio, para el toast. `info` si nadie cambió. */
export function describeForceResult(
  result: ForceResult,
  enabled: boolean,
): { tone: 'success' | 'info'; message: string; detail?: string } {
  if (!enabled) {
    return {
      tone: 'success',
      message: `Se retiró la exigencia a ${result.updated} ${plural(result.updated)}.`,
    };
  }
  if (result.updated > 0) {
    return {
      tone: 'success',
      message: `Se exigió el cambio de contraseña a ${result.updated} ${plural(result.updated)}.`,
      detail:
        result.skipped > 0
          ? `${result.skipped} no se modificaron: no tienen contraseña o ya estaban pendientes.`
          : undefined,
    };
  }
  return {
    tone: 'info',
    message: `Nadie cambió: las ${result.skipped} personas indicadas no tienen contraseña o ya estaban pendientes.`,
  };
}

/** Error al exigir o retirar el cambio masivo, según el estado HTTP. */
export function describeForceFailure(status: number | undefined): string {
  if (status === 404) {
    return 'Alguna de las personas ya no existe. Recarga la lista e inténtalo de nuevo. No se marcó a nadie.';
  }
  if (status === 403) return 'Solo el jefe de área puede exigir el cambio de contraseña.';
  return 'No se pudo exigir el cambio de contraseña. No se marcó a nadie. Inténtalo de nuevo.';
}
