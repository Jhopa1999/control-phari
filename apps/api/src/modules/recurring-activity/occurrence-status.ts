/**
 * Enum logico de los 4 estados de una OCURRENCIA de actividad recurrente
 * (design §2, D6). Conjunto cerrado y tipado, como TaskStatus: la columna
 * `RecurringActivityOccurrence.status` guarda el `code` (texto) y solo el helper
 * del modulo lo escribe. NUNCA es editable por campo libre.
 */
export enum OccurrenceStatus {
  PENDIENTE = 'PENDIENTE',
  EN_CURSO = 'EN_CURSO',
  COMPLETADA = 'COMPLETADA',
  VENCIDA = 'VENCIDA',
}

/** Todos los estados validos, util para validaciones y pruebas. */
export const OCCURRENCE_STATUSES: readonly OccurrenceStatus[] =
  Object.values(OccurrenceStatus);

/**
 * Transiciones permitidas de la maquina de estados de una ocurrencia (design
 * §2, D6). SOLO estas aristas se admiten; lo no listado NO se permite. De
 * COMPLETADA no se sale (estado terminal). VENCIDA puede completarse tarde.
 */
export const OCCURRENCE_TRANSITIONS: ReadonlyArray<
  readonly [OccurrenceStatus, OccurrenceStatus]
> = [
  // Tomar la actividad.
  [OccurrenceStatus.PENDIENTE, OccurrenceStatus.EN_CURSO],
  // Completar directo o tras iniciar.
  [OccurrenceStatus.PENDIENTE, OccurrenceStatus.COMPLETADA],
  [OccurrenceStatus.EN_CURSO, OccurrenceStatus.COMPLETADA],
  // Vencimiento automatico del scheduler (targetDate < hoy).
  [OccurrenceStatus.PENDIENTE, OccurrenceStatus.VENCIDA],
  [OccurrenceStatus.EN_CURSO, OccurrenceStatus.VENCIDA],
  // Completar una ocurrencia vencida (cierre tardio).
  [OccurrenceStatus.VENCIDA, OccurrenceStatus.COMPLETADA],
];

/**
 * Indica si `from -> to` es una transicion de ocurrencia permitida (design §2,
 * D6). Lo no listado devuelve false.
 */
export function isOccurrenceTransitionAllowed(
  from: OccurrenceStatus,
  to: OccurrenceStatus,
): boolean {
  return OCCURRENCE_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** True si el valor es un miembro del enum OccurrenceStatus. */
export function isOccurrenceStatus(value: string): value is OccurrenceStatus {
  return (OCCURRENCE_STATUSES as readonly string[]).includes(value);
}
