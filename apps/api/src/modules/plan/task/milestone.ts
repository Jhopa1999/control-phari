import { BadRequestException } from '@nestjs/common';

/**
 * Normaliza y valida la regla del hito (design §2.4, BR-010/AC-011): hito =>
 * estimateHours 0 (null se normaliza a 0; >0 -> 400) y una sola fecha efectiva
 * (dos fechas distintas -> 400; si llega una, se copia a ambas). Devuelve los
 * campos ya normalizados para persistir. Funcion pura compartida por
 * TaskService.create/update y PlanService.importPlan (design §6.3).
 */
export function applyMilestoneRule(input: {
  isMilestone: boolean;
  estimateHours?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
}): { estimateHours: number | null; startDate: Date | null; endDate: Date | null } {
  const { isMilestone } = input;
  let estimateHours = input.estimateHours ?? null;
  let startDate = input.startDate ?? null;
  let endDate = input.endDate ?? null;

  if (!isMilestone) {
    return { estimateHours, startDate, endDate };
  }

  if (estimateHours !== null && estimateHours > 0) {
    throw new BadRequestException('Un hito debe tener estimacion 0.');
  }
  estimateHours = 0;

  if (
    startDate !== null &&
    endDate !== null &&
    startDate.getTime() !== endDate.getTime()
  ) {
    throw new BadRequestException('Un hito usa una sola fecha.');
  }
  // Una sola fecha efectiva: copiar la informada a ambas columnas.
  if (startDate !== null && endDate === null) endDate = startDate;
  if (endDate !== null && startDate === null) startDate = endDate;

  return { estimateHours, startDate, endDate };
}
