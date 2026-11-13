'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import type { RecurringOccurrence } from '@/lib/api-client';
import { toast } from 'sonner';
import { ApiError, startOccurrence } from '@/lib/recurring-activities';

/** Mensaje entendible de un fallo (los 409 de la API traen su propio texto). */
export function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Ocurrió un error inesperado.';
}

/**
 * Toma una ocurrencia (POST .../start) con aviso al usuario. Devuelve true si
 * tuvo éxito. La ventana y la transición las decide la API (409 con motivo).
 */
export async function takeOccurrence(occurrence: RecurringOccurrence): Promise<boolean> {
  try {
    await startOccurrence(occurrence.id);
    toast.success('Actividad tomada.');
    return true;
  } catch (err) {
    toast.error(messageOf(err));
    return false;
  }
}

export interface OccurrenceActionButtonsProps {
  occurrence: RecurringOccurrence;
  onStart: (occurrence: RecurringOccurrence) => void;
  onComplete: (occurrence: RecurringOccurrence) => void;
  onDetail: (occurrence: RecurringOccurrence) => void;
  /** Botones a ancho completo (tarjetas móviles). */
  block?: boolean;
}

/**
 * Acciones según las banderas de la API (canStart / canComplete). Una
 * ocurrencia Programada, Completada o Cancelada no muestra Tomar ni Completar:
 * solo «Ver detalle». El web no decide estados.
 */
export function OccurrenceActionButtons({
  occurrence,
  onStart,
  onComplete,
  onDetail,
  block = false,
}: OccurrenceActionButtonsProps): React.ReactElement {
  const width = block ? 'w-full pointer-coarse:min-h-11' : '';
  const title = occurrence.activityTitle;
  return (
    <div className={block ? 'flex flex-col gap-2' : 'flex flex-wrap justify-end gap-2'}>
      {occurrence.canStart ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={width}
          aria-label={`Tomar ${title}`}
          onClick={() => onStart(occurrence)}
        >
          Tomar
        </Button>
      ) : null}
      {occurrence.canComplete ? (
        <Button
          type="button"
          size="sm"
          className={width}
          aria-label={`Completar ${title}`}
          onClick={() => onComplete(occurrence)}
        >
          Completar
        </Button>
      ) : null}
      {!occurrence.canStart && !occurrence.canComplete ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={width}
          aria-label={`Ver detalle de ${title}`}
          onClick={() => onDetail(occurrence)}
        >
          Ver detalle
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Fichas del calendario por estado: fondo subtle, borde izquierdo de 3 px y
 * texto foreground (contrastes medidos en la spec visual §4.3).
 */
export const CHIP_CLASSES: Record<string, string> = {
  PROGRAMADA: 'border-dashed border-l-neutral bg-neutral-subtle',
  PENDIENTE: 'border-l-info bg-info-subtle',
  EN_CURSO: 'border-l-primary bg-primary-subtle font-medium',
  VENCE_HOY: 'border-l-warning bg-warning-subtle',
  VENCIDA: 'border-l-danger bg-danger-subtle',
  COMPLETADA: 'border-l-success bg-success-subtle',
  COMPLETADA_TARDE: 'border-l-warning bg-success-subtle',
  CANCELADA: 'border-l-neutral bg-neutral-subtle line-through decoration-1',
};

/** Orden de la leyenda de estados. */
export const DISPLAY_STATUS_ORDER = [
  'PROGRAMADA',
  'PENDIENTE',
  'EN_CURSO',
  'VENCE_HOY',
  'VENCIDA',
  'COMPLETADA',
  'COMPLETADA_TARDE',
  'CANCELADA',
] as const;
