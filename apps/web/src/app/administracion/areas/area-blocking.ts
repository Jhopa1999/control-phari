import type { Area } from '@/lib/api-client';

/**
 * Motivo por el que un área activa no se puede desactivar: tiene procesos
 * activos (`processCount` cuenta solo los activos). La API aplica la regla con
 * un 409; esto solo anticipa el motivo en la interfaz. `null` si se puede.
 */
export function areaDeactivationBlockReason(
  area: Pick<Area, 'active' | 'processCount'>,
): string | null {
  if (!area.active || area.processCount <= 0) return null;
  const tiene =
    area.processCount === 1 ? 'tiene 1 proceso activo' : `tiene ${area.processCount} procesos activos`;
  return `No se puede desactivar el área: ${tiene}. Desactiva o reasigna esos procesos primero.`;
}
