// Reglas de fechas del portal (únicas; corrige §19.2 y §19.5):
// 1) Mostrar una fecha de solo-fecha guardada: UTC (formatDateOnly, formatMonth). Se guardan como YYYY-MM-DD o como
//    `${día}T00:00:00.000Z`; leerlas en hora local corre el día en UTC−5.
// 2) Proponer un valor por defecto ("hoy", "mes actual", "lunes actual", "periodo del mes"): calendario LOCAL del usuario,
//    que es el día que tiene delante (local*InputValue, localMonthPeriod).
// 3) Pasar una fecha guardada a un <input type="date">: UTC, como hoy (toISOString().slice(0, 10)). No cambia.
// Ninguna regla cambia el formato enviado a la API ni lo que se almacena.

/**
 * Formato de fechas, horas, porcentajes y conteos del portal (design §7.9).
 *
 * Módulo puro (design §7.9.2): no importa nada, así que e2e/web-lib.spec.ts lo
 * carga en Node. Contrato común de las funciones de fecha: null, undefined o ''
 * devuelven '—'; un texto que no se puede interpretar como fecha se devuelve
 * tal cual.
 */

/** Valor vacío del portal (design §13.1). */
const EMPTY = '—';
/** Signo menos tipográfico (U+2212) para las horas negativas. */
const MINUS = '\u2212';
/** Espacio duro (U+00A0): la unidad nunca queda sola en otra línea. */
const NBSP = '\u00a0';

// Los formatos con zona fija (UTC) y los numéricos no dependen de la zona del
// proceso y se reutilizan. Los de zona local se crean en cada llamada, porque un
// Intl.DateTimeFormat fija la zona al construirse y las pruebas la cambian.
const DATE_ONLY_FORMAT = new Intl.DateTimeFormat('es', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});
const MONTH_FORMAT = new Intl.DateTimeFormat('es', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const HOURS_FORMAT = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
const COUNT_FORMAT = new Intl.NumberFormat('es');

type DateValue = string | null | undefined;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 'YYYY-MM-DD' de una fecha según el calendario local. */
function toLocalDateInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  return `${year}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Hoy en el calendario local, como valor de <input type="date">. */
export function localDateInputValue(now: Date = new Date()): string {
  return toLocalDateInputValue(now);
}

/** Mes actual en el calendario local, como valor de <input type="month">. */
export function localMonthInputValue(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  return `${year}-${pad2(now.getMonth() + 1)}`;
}

/**
 * Lunes de la semana actual en el calendario local ('YYYY-MM-DD'). Misma regla
 * que hasta ahora: el domingo pasa al lunes anterior.
 */
export function localWeekMondayInputValue(now: Date = new Date()): string {
  const day = now.getDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day;
  return toLocalDateInputValue(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff),
  );
}

/**
 * Periodo del mes actual en el calendario local: `from` es el día 1 del mes y
 * `to` el día 1 del mes siguiente (límite exclusivo, como hasta ahora), con
 * cambio de año en diciembre.
 */
export function localMonthPeriod(now: Date = new Date()): {
  from: string;
  to: string;
} {
  return {
    from: toLocalDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toLocalDateInputValue(
      new Date(now.getFullYear(), now.getMonth() + 1, 1),
    ),
  };
}

/** Aplica el contrato común: vacío -> '—'; no es fecha -> el texto original. */
function formatDateValue(
  value: DateValue,
  format: (date: Date) => string,
): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : format(date);
}

/** Marca de tiempo en la zona local: "10 oct 2026". */
export function formatDate(iso: DateValue): string {
  return formatDateValue(iso, (date) =>
    new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date),
  );
}

/** Marca de tiempo con hora en la zona local: "10 oct 2026, 14:30". */
export function formatDateTime(iso: DateValue): string {
  return formatDateValue(iso, (date) =>
    new Intl.DateTimeFormat('es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date),
  );
}

/**
 * Fecha de calendario guardada (regla 1): acepta 'YYYY-MM-DD' o ISO y la
 * formatea en UTC, para que no se corra un día en UTC−5: "15 jul 2027".
 */
export function formatDateOnly(value: DateValue): string {
  return formatDateValue(value, (date) => DATE_ONLY_FORMAT.format(date));
}

/** Mes 'YYYY-MM' (regla 1, en UTC): "octubre de 2026". */
export function formatMonth(value: DateValue): string {
  return formatDateValue(value, (date) => MONTH_FORMAT.format(date));
}

/**
 * Horas con un decimal como máximo: "40 h", "37,5 h", "−10 h". El signo es
 * U+2212 y la unidad va tras un espacio duro; -0 (o un negativo que redondea a
 * 0) da "0 h".
 */
export function formatHours(n: number): string {
  const digits = HOURS_FORMAT.format(Math.abs(n));
  const sign = n < 0 && digits !== '0' ? MINUS : '';
  return `${sign}${digits}${NBSP}h`;
}

/** Porcentaje ya expresado en 0–100: "45 %". */
export function formatPercent(n: number): string {
  return `${Math.round(n)}${NBSP}%`;
}

/** '—' para null, undefined o ''; cualquier otro valor, como texto. */
export function orDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  return String(value);
}

/**
 * Número variable junto a su sustantivo, en singular o plural: "1 pendiente",
 * "0 pendientes", "12.345 pendientes" (design §13.1).
 */
export function formatCount(
  n: number,
  noun: { one: string; other: string },
): string {
  return `${COUNT_FORMAT.format(n)} ${n === 1 ? noun.one : noun.other}`;
}
