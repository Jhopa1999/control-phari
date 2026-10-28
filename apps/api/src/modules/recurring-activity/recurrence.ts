/**
 * Cadencia logica de una actividad recurrente (design §2, D5). Conjunto cerrado
 * y tipado, como TaskStatus/RoleCode: la columna `RecurringActivity.cadence`
 * guarda el `code` (texto) y solo el helper del modulo lo interpreta. NUNCA es
 * editable por campo libre.
 */
export enum Recurrence {
  SEMANAL = 'SEMANAL',
  MENSUAL = 'MENSUAL',
  TRIMESTRAL = 'TRIMESTRAL',
  SEMESTRAL = 'SEMESTRAL',
  ANUAL = 'ANUAL',
}

/** Todas las cadencias validas, util para validaciones y pruebas. */
export const RECURRENCES: readonly Recurrence[] = Object.values(Recurrence);

/** True si el valor es un miembro del enum Recurrence. */
export function isRecurrence(value: string): value is Recurrence {
  return (RECURRENCES as readonly string[]).includes(value);
}

/**
 * Terna de fecha local (ano, mes 1-12, dia 1-31) SIN hora ni zona: es la
 * representacion canonica D13 de una fecha "de calendario". Las columnas
 * `@db.Date` guardan dias, no instantes; para operar con ellas trabajamos con
 * esta terna y la materializamos a medianoche UTC (ver toUtcDate), de modo que
 * el dia NO se corre por la zona horaria del proceso.
 */
interface LocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const DATE_PARTS_FORMAT_CACHE = new Map<string, Intl.DateTimeFormat>();

function dateFormatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = DATE_PARTS_FORMAT_CACHE.get(timeZone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  DATE_PARTS_FORMAT_CACHE.set(timeZone, formatter);
  return formatter;
}

/**
 * Proyecta un instante `Date` al DIA LOCAL de `timeZone` (receta canonica D13):
 * usa Intl.DateTimeFormat con `timeZone` para obtener la terna (y,m,d) del
 * calendario local. Resuelve el cruce de medianoche UTC: un instante que en UTC
 * ya es el dia siguiente pero en America/Lima (UTC-5) aun es el anterior
 * devuelve el dia local correcto.
 */
export function toLocalDate(instant: Date, timeZone: string): LocalDate {
  const parts = dateFormatterFor(timeZone).formatToParts(instant);
  let year = NaN;
  let month = NaN;
  let day = NaN;
  for (const part of parts) {
    if (part.type === 'year') {
      year = Number(part.value);
    } else if (part.type === 'month') {
      month = Number(part.value);
    } else if (part.type === 'day') {
      day = Number(part.value);
    }
  }
  return { year, month, day };
}

/**
 * Materializa una terna (y,m,d) a un `Date` anclado a medianoche UTC
 * (Date.UTC): es el valor con que se persisten/comparan las columnas @db.Date
 * sin que la zona del proceso corra el dia.
 */
export function toUtcDate(date: LocalDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

/**
 * Terna de calendario de un `@db.Date`. Prisma materializa una columna
 * `@db.Date` como un `Date` anclado a MEDIANOCHE UTC del dia almacenado, de modo
 * que el dia correcto es su terna UTC (NO la proyeccion a una zona horaria, que
 * lo correria). La proyeccion con `timeZone` (toLocalDate) es solo para instantes
 * de reloj ("ahora"), no para dias de calendario ya persistidos.
 */
function utcLocalDate(instant: Date): LocalDate {
  return {
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
  };
}

/** Numero de dias del mes (1-12) de un ano dado; respeta bisiestos. */
function daysInMonth(year: number, month: number): number {
  // Dia 0 del mes siguiente = ultimo dia del mes actual.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Dia de la semana (0=domingo..6=sabado) de una fecha de calendario. */
function weekdayOf(date: LocalDate): number {
  return toUtcDate(date).getUTCDay();
}

/** Compara dos ternas: negativo si a<b, 0 si iguales, positivo si a>b. */
function compareLocalDate(a: LocalDate, b: LocalDate): number {
  return toUtcDate(a).getTime() - toUtcDate(b).getTime();
}

/**
 * Avanza `date` en `months` meses conservando el "dia ancla" (design §2, D5):
 * si el mes destino no tiene ese dia (p. ej. 31 en meses de 30, o 29/30/31 en
 * febrero) se ancla al ULTIMO dia del mes destino. `anchorDay` es el dia
 * ORIGINAL de la definicion (startDate), no el posiblemente recortado del paso
 * previo, para que el 31 de enero -> 28/feb -> 31/mar, no 28/mar.
 */
function addMonthsAnchored(
  date: LocalDate,
  months: number,
  anchorDay: number,
): LocalDate {
  const zeroBased = date.month - 1 + months;
  const year = date.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12 + 1;
  const day = Math.min(anchorDay, daysInMonth(year, month));
  return { year, month, day };
}

/** Avanza `date` en `weeks` semanas (7*weeks dias) por aritmetica UTC. */
function addWeeks(date: LocalDate, weeks: number): LocalDate {
  const base = toUtcDate(date);
  base.setUTCDate(base.getUTCDate() + weeks * 7);
  return utcLocalDate(base);
}

/** Cuantos meses avanza cada paso de la cadencia mensual-familia. */
function monthsPerStep(cadence: Recurrence): number {
  switch (cadence) {
    case Recurrence.MENSUAL:
      return 1;
    case Recurrence.TRIMESTRAL:
      return 3;
    case Recurrence.SEMESTRAL:
      return 6;
    case Recurrence.ANUAL:
      return 12;
    case Recurrence.SEMANAL:
      // SEMANAL no usa meses; nunca deberia llamarse con esta cadencia.
      return 0;
    default: {
      const exhaustive: never = cadence;
      throw new Error(`Cadencia no soportada: ${String(exhaustive)}`);
    }
  }
}

/**
 * Funcion PURA central (design §2, D5/D13). Calcula las fechas objetivo (dias de
 * calendario) de una actividad recurrente que caen en el rango inclusivo
 * [from, to], a partir de su `startDate`.
 *
 * - `cadence`: periodicidad (SEMANAL, MENSUAL, TRIMESTRAL, SEMESTRAL, ANUAL).
 * - `intervalCount`: cada cuantos periodos se repite (>=1). SEMANAL avanza en
 *   bloques de `intervalCount` semanas conservando el mismo dia de semana que
 *   `startDate`; la familia mensual avanza `intervalCount * mesesPorPaso` meses
 *   anclando al dia de `startDate` (ultimo dia del mes si no existe).
 * - `startDate`, `from`, `to`: DIAS DE CALENDARIO (@db.Date), es decir `Date`
 *   anclados a medianoche UTC del dia que representan. Se leen por su terna UTC
 *   (receta canonica D13: el dia de un @db.Date es su terna UTC, nunca una
 *   proyeccion a zona que lo correria). El resultado son `Date` a medianoche UTC.
 * La conversion instante->dia local (cruce de medianoche UTC, receta D13) la
 * hace el service al calcular "hoy" sobre el reloj con toLocalDate(now, tz);
 * esta funcion pura ya recibe dias de calendario y no necesita la zona.
 *
 * Determinista y sin efectos: misma entrada, misma salida. No toca BD ni reloj.
 */
export function nextTargetDatesFrom(
  cadence: Recurrence,
  intervalCount: number,
  startDate: Date,
  from: Date,
  to: Date,
): Date[] {
  if (!Number.isInteger(intervalCount) || intervalCount < 1) {
    throw new Error(
      `intervalCount debe ser un entero >= 1 (recibido: ${String(intervalCount)}).`,
    );
  }

  const start = utcLocalDate(startDate);
  const windowStart = utcLocalDate(from);
  const windowEnd = utcLocalDate(to);

  if (compareLocalDate(windowEnd, windowStart) < 0) {
    return [];
  }

  const results: Date[] = [];
  // Tope de seguridad: evita un bucle no acotado ante datos corruptos. Una
  // ventana de generacion real (dias/semanas) nunca se acerca a este limite.
  const MAX_ITERATIONS = 10_000;

  if (cadence === Recurrence.SEMANAL) {
    const startWeekday = weekdayOf(start);
    let occurrence = start;
    for (let i = 0; i < MAX_ITERATIONS; i += 1) {
      if (compareLocalDate(occurrence, windowEnd) > 0) {
        break;
      }
      if (compareLocalDate(occurrence, windowStart) >= 0) {
        // Invariante: el dia de semana se conserva igual al de startDate.
        if (weekdayOf(occurrence) !== startWeekday) {
          throw new Error('Invariante SEMANAL roto: dia de semana desalineado.');
        }
        results.push(toUtcDate(occurrence));
      }
      occurrence = addWeeks(occurrence, intervalCount);
    }
    return results;
  }

  const stepMonths = monthsPerStep(cadence) * intervalCount;
  const anchorDay = start.day;
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const occurrence = addMonthsAnchored(start, stepMonths * i, anchorDay);
    if (compareLocalDate(occurrence, windowEnd) > 0) {
      break;
    }
    if (compareLocalDate(occurrence, windowStart) >= 0) {
      results.push(toUtcDate(occurrence));
    }
  }
  return results;
}
