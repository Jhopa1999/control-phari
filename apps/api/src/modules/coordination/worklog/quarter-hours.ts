import { BadRequestException } from '@nestjs/common';
import { isMultipleOf } from '../is-multiple-of';

/** Paso de las horas de la Bitacora (0,25 h = 15 min). */
export const HOURS_STEP = 0.25;
export const MIN_ACTIVITY_HOURS = 0.25;
export const MAX_ACTIVITY_HOURS = 24;
export const QUARTER_HOURS_MESSAGE =
  'Las horas deben ir de 0,25 a 24 en pasos de 0,25.';

/** Redondea al multiplo de 0,25 mas cercano, acotado a 0,25..24. */
export function roundToQuarter(hours: number): number {
  const rounded = Math.round(hours / HOURS_STEP) * HOURS_STEP;
  return Math.min(MAX_ACTIVITY_HOURS, Math.max(MIN_ACTIVITY_HOURS, rounded));
}

/** `true` si `hours` esta en 0,25..24 en pasos de 0,25. */
export function isValidQuarterHours(hours: unknown): hours is number {
  return (
    typeof hours === 'number' &&
    Number.isFinite(hours) &&
    hours >= MIN_ACTIVITY_HOURS &&
    hours <= MAX_ACTIVITY_HOURS &&
    isMultipleOf(hours, HOURS_STEP)
  );
}

/** Validacion de servicio (la ruta de sugerencias no pasa por el DTO). */
export function assertQuarterHours(hours: unknown): asserts hours is number {
  if (!isValidQuarterHours(hours)) {
    throw new BadRequestException(QUARTER_HOURS_MESSAGE);
  }
}
