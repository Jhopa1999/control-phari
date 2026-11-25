import { BadRequestException } from '@nestjs/common';

/**
 * Límites de la fecha de vencimiento de un compromiso (decisión D5, plan 4.3-1):
 * por defecto un año hacia atrás y cinco hacia adelante, contados desde hoy. Los
 * valores viven en la maestra COMMITMENT_PARAM (el número va en `label`) y el
 * código lleva un valor seguro por defecto por si el parámetro falta.
 */
export const COMMITMENT_PARAM_CATALOG = 'COMMITMENT_PARAM';
export const COMMITMENT_PARAM_CODES = {
  dueYearsBack: 'DUE_YEARS_BACK',
  dueYearsAhead: 'DUE_YEARS_AHEAD',
} as const;
export const COMMITMENT_DUE_DEFAULTS = { yearsBack: 1, yearsAhead: 5 } as const;
/** Tope de cualquiera de los dos parámetros (años). */
const MAX_YEARS = 50;

/** Años del parámetro: entero de 0 al tope; si falta o no es válido, el valor por defecto. */
export function parseYearsParam(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const text = raw.trim();
  if (!/^\d{1,2}$/.test(text)) return fallback;
  const value = Number(text);
  return value <= MAX_YEARS ? value : fallback;
}

export interface DueDateRange {
  /** Primer día aceptado (medianoche UTC). */
  min: Date;
  /** Último día aceptado (medianoche UTC). */
  max: Date;
}

/** Rango aceptado a partir de hoy (día anclado a medianoche UTC). */
export function dueDateRangeOf(
  today: Date,
  yearsBack: number = COMMITMENT_DUE_DEFAULTS.yearsBack,
  yearsAhead: number = COMMITMENT_DUE_DEFAULTS.yearsAhead,
): DueDateRange {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();
  return {
    min: new Date(Date.UTC(year - yearsBack, month, day)),
    max: new Date(Date.UTC(year + yearsAhead, month, day)),
  };
}

function formatDay(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/** 400 en español si la fecha cae fuera del rango. */
export function assertDueDateInRange(dueDate: Date, range: DueDateRange): void {
  if (dueDate.getTime() < range.min.getTime() || dueDate.getTime() > range.max.getTime()) {
    throw new BadRequestException(
      `La fecha límite debe estar entre ${formatDay(range.min)} y ${formatDay(range.max)}.`,
    );
  }
}
