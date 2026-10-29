/**
 * Enum logico de estados del Documento (design §4.2; maestra DOC_STATUS). La
 * columna `status` guarda el `code` (texto); solo el helper DocumentStateService
 * la valida, y el estado se mueve UNICAMENTE por los endpoints de estado
 * (crear version NO lo mueve, D6). El estado inicial es BORRADOR.
 *
 * Flujo de aprobacion documental: BORRADOR -> PENDIENTE_APROBACION (enviar) ->
 * VIGENTE (aprobado) o RECHAZADO (con motivo). VIGENTE representa el documento
 * aprobado/publicado; no se duplica un estado "APROBADO".
 */
export enum DocStatus {
  BORRADOR = 'BORRADOR',
  PENDIENTE_APROBACION = 'PENDIENTE_APROBACION',
  VIGENTE = 'VIGENTE',
  RECHAZADO = 'RECHAZADO',
  ARCHIVADA = 'ARCHIVADA',
}

/** Categoria de la documentacion de cierre de proyectos (maestra DOC_CATEGORY). */
export const CLOSURE_DOC_CATEGORY = 'CIERRE';

/** Todos los estados validos, util para validaciones y pruebas. */
export const DOC_STATUSES: readonly DocStatus[] = Object.values(DocStatus);

/**
 * Transiciones permitidas (design §4.2 + aprobacion documental). Lo no listado
 * -> 400 en el helper.
 */
export const DOC_STATUS_TRANSITIONS: ReadonlyArray<
  readonly [DocStatus, DocStatus]
> = [
  // Publicar un borrador directamente (documentos generales, no de cierre).
  [DocStatus.BORRADOR, DocStatus.VIGENTE],
  // Archivar un vigente.
  [DocStatus.VIGENTE, DocStatus.ARCHIVADA],
  // Reactivar un archivado (reversible).
  [DocStatus.ARCHIVADA, DocStatus.VIGENTE],
  // Despublicar un vigente (reversible).
  [DocStatus.VIGENTE, DocStatus.BORRADOR],
  // Aprobacion documental.
  [DocStatus.BORRADOR, DocStatus.PENDIENTE_APROBACION],
  [DocStatus.PENDIENTE_APROBACION, DocStatus.VIGENTE],
  [DocStatus.PENDIENTE_APROBACION, DocStatus.RECHAZADO],
  // Retirar el envio para corregir.
  [DocStatus.PENDIENTE_APROBACION, DocStatus.BORRADOR],
  // Subsanar un rechazo: volver a borrador o reenviar.
  [DocStatus.RECHAZADO, DocStatus.BORRADOR],
  [DocStatus.RECHAZADO, DocStatus.PENDIENTE_APROBACION],
];

/**
 * Indica si `from -> to` es una transicion permitida (design §4.2). Lo no
 * listado devuelve false (el service lo traduce a BadRequestException 400).
 */
export function isDocTransitionAllowed(from: DocStatus, to: DocStatus): boolean {
  return DOC_STATUS_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** True si el valor es un miembro del enum DocStatus. */
export function isDocStatus(value: string): value is DocStatus {
  return (DOC_STATUSES as readonly string[]).includes(value);
}
