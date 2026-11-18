/**
 * Longitud minima de contrasena validada por los DTO (piso fijo de forma). El
 * servicio re-chequea `passwordMinLength()` (configurable por ambiente, con
 * default igual a este valor) como fuente de verdad de negocio.
 */
export const RESET_PASSWORD_MIN_LENGTH = 8;

/** Longitud minima efectiva (PASSWORD_MIN_LENGTH, con piso igual al del DTO). */
export function passwordMinLength(): number {
  const raw = process.env.PASSWORD_MIN_LENGTH?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : RESET_PASSWORD_MIN_LENGTH;
}
