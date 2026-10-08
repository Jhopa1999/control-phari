/**
 * Helpers puros de normalizacion de mes (design §1.3). El contrato externo de la
 * API usa el string `YYYY-MM`; la columna `month` persiste la fecha del PRIMER
 * dia del mes en UTC (`@db.Date`, D2). El patron del string se valida en el DTO
 * con `@Matches(/^\d{4}-(0[1-9]|1[0-2])$/)` (entrada externa, 400 si no cumple);
 * estas funciones asumen un string ya validado y solo normalizan.
 */

/** Patron de mes aceptado por el contrato externo (`YYYY-MM`). */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Convierte `'YYYY-MM'` en la fecha del primer dia del mes en UTC
 * (`new Date(Date.UTC(yyyy, mm-1, 1))`), sin hora ni zona horaria arrastrada.
 */
export function monthStringToDate(month: string): Date {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  return new Date(Date.UTC(year, monthIndex, 1));
}

/** Formatea una fecha (de columna) como `'YYYY-MM'` en UTC. */
export function dateToMonthString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
