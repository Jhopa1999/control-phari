'use client';

import * as React from 'react';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { DescriptionList } from '@/components/description-list';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { RecurringOccurrence } from '@/lib/api-client';
import { formatDateOnly, formatDateTime, orDash } from '@/lib/format';
import { recurrenceLabel } from '@/lib/status-labels';

interface OccurrenceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence: RecurringOccurrence | null;
  /** Mapa id -> nombre para resolver quién completó. */
  userNameById: Map<string, string>;
}

/**
 * Detalle de SOLO LECTURA de una ocurrencia (típicamente una completada):
 * muestra cuándo se completó, quién y el comentario. El estado se comunica con
 * texto además del color (StatusBadge con etiqueta).
 */
export function OccurrenceDetailDialog({
  open,
  onOpenChange,
  occurrence,
  userNameById,
}: OccurrenceDetailDialogProps): React.ReactElement {
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();

  const completedBy =
    occurrence?.completedByUserId != null
      ? (userNameById.get(occurrence.completedByUserId) ?? occurrence.completedByUserId)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="md"
        onOpenAutoFocus={captureTrigger}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{occurrence?.activityTitle ?? 'Detalle de la actividad'}</DialogTitle>
          <DialogDescription>Detalle de la ocurrencia.</DialogDescription>
        </DialogHeader>

        <DialogBody>
          {occurrence ? (
            <DescriptionList
              columns={2}
              items={[
                { term: 'Estado', value: <StatusBadge kind="occurrence" value={occurrence.status} /> },
                { term: 'Cadencia', value: recurrenceLabel(occurrence.cadence) },
                { term: 'Tipo', value: occurrence.activityType },
                { term: 'Periodo', value: orDash(occurrence.periodLabel) },
                { term: 'Fecha objetivo', value: formatDateOnly(occurrence.targetDate) },
                {
                  term: 'Completada el',
                  value: occurrence.completedAt ? formatDateTime(occurrence.completedAt) : '—',
                },
                { term: 'Completada por', value: orDash(completedBy) },
                {
                  term: 'Comentario',
                  value: orDash(occurrence.completionComment),
                  span: 2,
                },
              ]}
            />
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
