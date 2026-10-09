import { BadRequestException } from '@nestjs/common';

/**
 * Helper puro de periodo semiabierto `[from, to)` (design §2 "Convencion de
 * periodo"). Toma de `capacity/month.ts` SOLO la convencion UTC/primer-dia; no
 * reutiliza una funcion de rango (month.ts normaliza un mes, no calcula
 * `[from, to)`). `from` inclusivo, `to` exclusivo; ambos en UTC 00:00:00.000Z.
 */

/** Patron de fecha aceptado por el contrato externo (`YYYY-MM-DD`). */
export const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Convierte `'YYYY-MM-DD'` (ya validado) en la fecha UTC 00:00:00.000Z de ese
 * dia. Valida que los componentes formen una fecha real (p. ej. descarta
 * `2025-02-31`), lanzando 400 si no.
 */
function parseDateUtc(value: string): Date {
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, monthIndex, day));
  const isReal =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === monthIndex &&
    date.getUTCDate() === day;
  if (!isReal) {
    throw new BadRequestException('Revisa el rango de fechas.');
  }
  return date;
}

/** Primer dia del mes en curso, UTC 00:00:00.000Z (inclusivo). */
function startOfCurrentMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Primer dia del mes siguiente, UTC 00:00:00.000Z (exclusivo). */
function startOfNextMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Resuelve el periodo `[from, to)` (design §2). Sin `from`/`to` -> mes natural
 * en curso UTC (primer dia inclusivo -> primer dia del mes siguiente
 * exclusivo). Valida formato `YYYY-MM-DD`; `from > to` -> 400. Si llega solo
 * uno, el otro se completa con el limite del mes en curso. `now` inyectable
 * para pruebas deterministas.
 */
export function resolvePeriod(
  from?: string,
  to?: string,
  now: Date = new Date(),
): { from: Date; to: Date } {
  if (from !== undefined && !DATE_PATTERN.test(from)) {
    throw new BadRequestException('Revisa el rango de fechas.');
  }
  if (to !== undefined && !DATE_PATTERN.test(to)) {
    throw new BadRequestException('Revisa el rango de fechas.');
  }

  const resolvedFrom =
    from !== undefined ? parseDateUtc(from) : startOfCurrentMonthUtc(now);
  const resolvedTo =
    to !== undefined ? parseDateUtc(to) : startOfNextMonthUtc(now);

  if (resolvedFrom.getTime() > resolvedTo.getTime()) {
    throw new BadRequestException('Revisa el rango de fechas.');
  }

  return { from: resolvedFrom, to: resolvedTo };
}

/** Eco de una fecha de periodo como `'YYYY-MM-DD'` en UTC. */
export function dateToIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
