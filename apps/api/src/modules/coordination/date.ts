import { BadRequestException } from '@nestjs/common';

/**
 * Helpers puros de fecha de dia/semana (design §3.4, §11 D8), generalizados del
 * `month.ts` de Fase 4. El contrato externo usa el string `YYYY-MM-DD`; las
 * columnas `@db.Date` persisten la fecha en UTC, sin hora ni zona arrastrada.
 * El patron del string se valida en el DTO con `@Matches(DATE_PATTERN)`; estas
 * funciones REVALIDAN con round-trip (Finding 6): un regex por si solo acepta
 * fechas irreales (2025-13-40, 2025-02-30, 2025-00-10), de modo que
 * `dateStringToDate` lanza 400 si `dateToString(dateStringToDate(x)) !== x`.
 */

/** Patron de fecha aceptado por el contrato externo (`YYYY-MM-DD`). */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Milisegundos por dia (para aritmetica UTC sin arrastrar zona horaria). */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Convierte `'YYYY-MM-DD'` en la fecha de ese dia en UTC
 * (`new Date(Date.UTC(yyyy, mm-1, dd))`), revalidando que la fecha sea real:
 * si el round-trip `dateToString(resultado) !== input` (mes 13-99, 30 de
 * febrero, dia 00, etc.) lanza `BadRequestException` (400).
 */
export function dateStringToDate(value: string): Date {
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (dateToString(date) !== value) {
    throw new BadRequestException(
      `La fecha "${value}" no es una fecha valida (formato YYYY-MM-DD).`,
    );
  }
  return date;
}

/** Formatea una fecha (de columna) como `'YYYY-MM-DD'` en UTC. */
export function dateToString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Suma `n` dias (puede ser negativo) a una fecha, en UTC. */
export function addDaysUTC(date: Date, n: number): Date {
  return new Date(date.getTime() + n * MS_PER_DAY);
}

/**
 * Lunes ISO de la semana de `date`, en UTC. ISO: la semana empieza en lunes
 * (`getUTCDay()` devuelve 0=domingo..6=sabado). Normaliza cualquier dia al lunes
 * de su semana (p. ej. un miercoles -> el lunes anterior), de modo que
 * `weekStart` del semanal es idempotente y nunca responde 400 por no-lunes (§D8).
 */
export function mondayOf(date: Date): Date {
  const dayOfWeek = date.getUTCDay(); // 0=domingo, 1=lunes, ... 6=sabado
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDaysUTC(date, diffToMonday);
}
