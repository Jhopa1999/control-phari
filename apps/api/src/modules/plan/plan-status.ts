import { ConflictException, InternalServerErrorException } from '@nestjs/common';

/**
 * Enum logico de los estados del plan (design §1.4, D8). Conjunto cerrado y
 * tipado; `06` marca los estados exactos como P, por lo que se implementa el
 * minimo documentado del flujo del brief. La columna `Plan.status` guarda el
 * `code` (texto); solo el helper de PlanStateService la escribe.
 */
export enum PlanStatus {
  BORRADOR = 'BORRADOR',
  EN_AUTORIZACION = 'EN_AUTORIZACION',
  AUTORIZADO = 'AUTORIZADO',
  DEVUELTO = 'DEVUELTO',
}

/** Todos los estados validos, util para validaciones y pruebas. */
export const PLAN_STATUSES: readonly PlanStatus[] = Object.values(PlanStatus);

/**
 * Transiciones del plan IMPLEMENTADAS (design §1.4). SOLO estas se admiten; lo
 * no listado -> ConflictException (precondicion de fase). El alta (-> BORRADOR)
 * no es una transicion aqui: la fija el default del schema al crear el plan.
 */
export const PLAN_TRANSITIONS: ReadonlyArray<readonly [PlanStatus, PlanStatus]> =
  [
    // Enviar a autorizacion (guia con cero pendientes).
    [PlanStatus.BORRADOR, PlanStatus.EN_AUTORIZACION],
    // Reenviar tras corregir una devolucion.
    [PlanStatus.DEVUELTO, PlanStatus.EN_AUTORIZACION],
    // Autorizar (lleva la Request a EN_EJECUCION, en el service).
    [PlanStatus.EN_AUTORIZACION, PlanStatus.AUTORIZADO],
    // Devolver con motivo (vuelve a edicion).
    [PlanStatus.EN_AUTORIZACION, PlanStatus.DEVUELTO],
  ];

/** Indica si `from -> to` es una transicion de plan permitida (design §1.4). */
export function isPlanTransitionAllowed(
  from: PlanStatus,
  to: PlanStatus,
): boolean {
  return PLAN_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** True si el valor es un miembro del enum PlanStatus. */
export function isPlanStatus(value: string): value is PlanStatus {
  return (PLAN_STATUSES as readonly string[]).includes(value);
}

/**
 * Valida que `from -> to` sea una transicion de plan implementada (design §1.4)
 * y devuelve el estado destino. Un `from` no tipado en BD es fallo de integridad
 * (500); una transicion no implementada es precondicion de fase (409).
 */
export function assertPlanTransition(
  from: string,
  to: PlanStatus,
): PlanStatus {
  if (!isPlanStatus(from)) {
    throw new InternalServerErrorException(
      `Estado de plan "${from}" no es un PlanStatus valido.`,
    );
  }
  if (!isPlanTransitionAllowed(from, to)) {
    throw new ConflictException(
      `No se puede pasar el plan de "${from}" a "${to}" en esta fase.`,
    );
  }
  return to;
}
