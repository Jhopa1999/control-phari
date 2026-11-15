import { ConflictException } from '@nestjs/common';
import { PlanStatus } from './plan-status';

/**
 * Bloqueo de edición del plan según su estado (decisión D5 del plan de mejora,
 * módulo 3.1). La API es la fuente de verdad: la web solo oculta o deshabilita.
 *
 * - `BORRADOR` y `DEVUELTO`: el plan se edita sin restricciones.
 * - `EN_AUTORIZACION`: no se edita nada (fases, tareas, dependencias,
 *   importación, datos del plan). Solo corren las acciones del propio flujo
 *   (autorizar y devolver).
 * - `AUTORIZADO`: la estructura queda congelada; solo se ajustan el
 *   responsable, las fechas y las horas de las tareas (y las fechas de las
 *   fases), con auditoría. Se mantiene así hasta que exista el control de
 *   cambios del plan autorizado (BL-052).
 *
 * Un estado desconocido o ausente no bloquea: la máquina de estados del plan ya
 * rechaza lo que no existe.
 */

export const PLAN_EN_AUTORIZACION_MESSAGE =
  'El plan está en autorización y no admite cambios. Espera la decisión; si hay que corregirlo, se devuelve con un motivo.';

export const PLAN_AUTORIZADO_MESSAGE =
  'El plan ya está autorizado: solo se pueden ajustar el responsable, las fechas y las horas de las tareas.';

/**
 * Exige que la estructura del plan sea editable (crear, borrar o renombrar
 * fases y tareas, dependencias, importación, datos del plan). 409 si está en
 * autorización o autorizado.
 */
export function assertPlanStructureEditable(planStatus: string | null | undefined): void {
  if (planStatus === PlanStatus.EN_AUTORIZACION) {
    throw new ConflictException(PLAN_EN_AUTORIZACION_MESSAGE);
  }
  if (planStatus === PlanStatus.AUTORIZADO) {
    throw new ConflictException(PLAN_AUTORIZADO_MESSAGE);
  }
}

/**
 * Exige que se puedan ajustar responsable, fechas y horas: solo se bloquea
 * mientras el plan está en autorización. Quien llama debe, con el plan
 * autorizado, restringir además los campos que cambia (ver
 * `assertOnlyAdjustableChanges`).
 */
export function assertPlanAdjustable(planStatus: string | null | undefined): void {
  if (planStatus === PlanStatus.EN_AUTORIZACION) {
    throw new ConflictException(PLAN_EN_AUTORIZACION_MESSAGE);
  }
}

/** Indica si el ajuste debe limitarse a responsable, fechas y horas. */
export function isAuthorizedPlan(planStatus: string | null | undefined): boolean {
  return planStatus === PlanStatus.AUTORIZADO;
}

/**
 * Con el plan autorizado, rechaza (409) los cambios a campos distintos de los
 * ajustables. `changedFields` lista los nombres legibles de lo que realmente
 * cambia respecto del valor actual (reenviar el mismo valor no cuenta).
 */
export function assertOnlyAdjustableChanges(changedFields: string[]): void {
  if (changedFields.length > 0) {
    throw new ConflictException(
      `${PLAN_AUTORIZADO_MESSAGE} No se puede cambiar: ${changedFields.join(', ')}.`,
    );
  }
}
