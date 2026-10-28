/**
 * Tipo de responsable de una actividad recurrente (design §2). Una definicion
 * la asume UNA persona (USER) o UN area (AREA), nunca ambas ni ninguna. La
 * columna `RecurringActivity.responsibleKind` guarda el `code` (texto).
 */
export enum ResponsibleKind {
  USER = 'USER',
  AREA = 'AREA',
}

/** Todos los tipos validos, util para validaciones y pruebas. */
export const RESPONSIBLE_KINDS: readonly ResponsibleKind[] =
  Object.values(ResponsibleKind);

/** True si el valor es un miembro del enum ResponsibleKind. */
export function isResponsibleKind(value: string): value is ResponsibleKind {
  return (RESPONSIBLE_KINDS as readonly string[]).includes(value);
}

/**
 * Valida la regla "exactamente un responsable" (design §2; espejo logico del
 * CHECK de BD): si kind=USER debe venir userId (y NO areaId); si kind=AREA debe
 * venir areaId (y NO userId). Devuelve true solo cuando el par kind/ids es
 * coherente. Las aplicaciones traducen false a un 400/validacion.
 */
export function isResponsibleAssignmentValid(
  kind: ResponsibleKind,
  responsibleUserId: string | null | undefined,
  responsibleAreaId: string | null | undefined,
): boolean {
  const hasUser = responsibleUserId != null;
  const hasArea = responsibleAreaId != null;
  if (kind === ResponsibleKind.USER) {
    return hasUser && !hasArea;
  }
  if (kind === ResponsibleKind.AREA) {
    return hasArea && !hasUser;
  }
  return false;
}
