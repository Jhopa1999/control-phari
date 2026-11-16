import type { UpdateRequest } from '@/lib/api-client';
import type { SolicitudFormValues } from './solicitud-form-dialog';

/** Convierte un valor de fecha (yyyy-mm-dd) a ISO para el backend, u omite. */
export function toIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Cuerpo de PATCH /requests/:id y de POST /requests/:id/resubmit desde el formulario de la ficha. */
export function solicitudUpdatePayload(values: SolicitudFormValues): UpdateRequest {
  return {
    title: values.title,
    requesterId: values.requesterId || undefined,
    functionalOwner: trimOrUndefined(values.functionalOwner),
    expectedResult: trimOrUndefined(values.expectedResult),
    targetDate: toIso(values.targetDate),
    changeJustification: trimOrUndefined(values.changeJustification),
  };
}
