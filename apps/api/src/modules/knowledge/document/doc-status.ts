/**
 * Enum logico de estados del Documento de Fase 6 (design §4.2; maestra
 * DOC_STATUS, ya sembrada en Fase 1). Conjunto cerrado y tipado: gobierna la
 * maquina minima reversible del documento. La columna `status` guarda el `code`
 * (texto); solo el helper DocumentStateService la escribe, y el estado se mueve
 * UNICAMENTE por POST /documents/:id/status (crear version NO lo mueve, D6). El
 * estado inicial es BORRADOR.
 */
export enum DocStatus {
  BORRADOR = 'BORRADOR',
  VIGENTE = 'VIGENTE',
  ARCHIVADA = 'ARCHIVADA',
}

/** Todos los estados validos, util para validaciones y pruebas. */
export const DOC_STATUSES: readonly DocStatus[] = Object.values(DocStatus);

/**
 * Transiciones permitidas de la maquina minima REVERSIBLE del documento
 * (design §4.2). SOLO estas aristas se admiten; lo no listado -> 400 en el
 * helper. Todas pasan por POST /documents/:id/status.
 */
export const DOC_STATUS_TRANSITIONS: ReadonlyArray<
  readonly [DocStatus, DocStatus]
> = [
  // Publicar un borrador.
  [DocStatus.BORRADOR, DocStatus.VIGENTE],
  // Archivar un vigente.
  [DocStatus.VIGENTE, DocStatus.ARCHIVADA],
  // Reactivar un archivado (reversible).
  [DocStatus.ARCHIVADA, DocStatus.VIGENTE],
  // Despublicar un vigente (reversible).
  [DocStatus.VIGENTE, DocStatus.BORRADOR],
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
