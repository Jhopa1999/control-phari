/**
 * Enum logico de estados del Activo de Fase 6 (design §4.1). Conjunto cerrado y
 * tipado (como RecordState/TaskStatus): gobierna la maquina minima reversible
 * del activo. La columna `status` guarda el `code` (texto); solo el helper
 * AssetStateService la escribe, nunca un DTO libre. El estado inicial es
 * BORRADOR.
 */
export enum AssetStatus {
  BORRADOR = 'BORRADOR',
  ACTIVO = 'ACTIVO',
  RETIRADO = 'RETIRADO',
}

/** Todos los estados validos, util para validaciones y pruebas. */
export const ASSET_STATUSES: readonly AssetStatus[] = Object.values(AssetStatus);

/**
 * Transiciones permitidas de la maquina minima del activo (design §4.1). SOLO
 * estas aristas se admiten; lo no listado -> 400 en el helper. Se incluyen
 * exclusivamente las tres que `specs/06` nombra (alta/retiro/recuperacion):
 * NO se incluye ACTIVO->BORRADOR (MEDIUM-2, no confirmada por el Site). El
 * retiro es un cambio de estado reversible (recuperar), nunca borrado fisico.
 */
export const ASSET_STATUS_TRANSITIONS: ReadonlyArray<
  readonly [AssetStatus, AssetStatus]
> = [
  // Activar un borrador.
  [AssetStatus.BORRADOR, AssetStatus.ACTIVO],
  // Retirar un activo.
  [AssetStatus.ACTIVO, AssetStatus.RETIRADO],
  // Recuperar un retirado (reversible).
  [AssetStatus.RETIRADO, AssetStatus.ACTIVO],
];

/**
 * Indica si `from -> to` es una transicion permitida (design §4.1). Lo no
 * listado devuelve false (el service lo traduce a BadRequestException 400).
 */
export function isAssetTransitionAllowed(
  from: AssetStatus,
  to: AssetStatus,
): boolean {
  return ASSET_STATUS_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** True si el valor es un miembro del enum AssetStatus. */
export function isAssetStatus(value: string): value is AssetStatus {
  return (ASSET_STATUSES as readonly string[]).includes(value);
}
