'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { DescriptionList } from '@/components/description-list';
import { InlineNotice } from '@/components/inline-notice';
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
import { Skeleton } from '@/components/ui/skeleton';
import type {
  CatalogItem,
  RecurringOccurrence,
  RecurringOccurrenceEvidence,
} from '@/lib/api-client';
import {
  formatDateOnly,
  formatDateTime,
  formatHours,
  localDateInputValue,
  orDash,
} from '@/lib/format';
import { downloadEvidence, listEvidence } from '@/lib/recurring-activities';
import { dayDiff, hoursDifferenceText } from '@/lib/recurring-format';
import { activityTypeLabel, cadenceText } from '@/lib/status-labels';
import { formatFileSize } from '@/lib/task-evidence';
import { messageOf } from './occurrence-shared';

interface OccurrenceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence: RecurringOccurrence | null;
  activityTypes: CatalogItem[];
  onStart?: (occurrence: RecurringOccurrence) => void;
  onComplete?: (occurrence: RecurringOccurrence) => void;
}

type EvidenceState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: RecurringOccurrenceEvidence[] };

/**
 * Detalle de una ocurrencia: qué se hizo, quién y cuándo, horas reales frente
 * a las estimadas y adjuntos descargables (URL firmada). Avisos para
 * programada, cancelada y completada tarde.
 */
export function OccurrenceDetailDialog({
  open,
  onOpenChange,
  occurrence,
  activityTypes,
  onStart,
  onComplete,
}: OccurrenceDetailDialogProps): React.ReactElement {
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus();
  const [evidence, setEvidence] = React.useState<EvidenceState>({ status: 'loading' });
  const [retry, setRetry] = React.useState(0);

  const occurrenceId = occurrence?.id ?? null;
  React.useEffect(() => {
    if (!open || !occurrenceId) return;
    let cancelled = false;
    listEvidence(occurrenceId)
      .then((items) => {
        if (!cancelled) setEvidence({ status: 'ready', items });
      })
      .catch((err: unknown) => {
        if (!cancelled) setEvidence({ status: 'error', message: messageOf(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [open, occurrenceId, retry]);

  async function handleDownload(item: RecurringOccurrenceEvidence): Promise<void> {
    try {
      await downloadEvidence(item.occurrenceId, item.id);
    } catch (err) {
      toast.error(messageOf(err));
    }
  }

  const status = occurrence?.displayStatus;
  const completedLate =
    status === 'COMPLETADA_TARDE' && occurrence?.completedAt
      ? dayDiff(occurrence.targetDate, localDateInputValue(new Date(occurrence.completedAt)))
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" onOpenAutoFocus={captureTrigger} onCloseAutoFocus={handleCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{occurrence?.activityTitle ?? 'Detalle de la actividad'}</DialogTitle>
          <DialogDescription>
            {occurrence ? (
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <StatusBadge kind="occurrence" value={occurrence.displayStatus} />
                <span>
                  {activityTypeLabel(occurrence.activityType, activityTypes)} · Se repite{' '}
                  {cadenceText(occurrence.cadence, occurrence.intervalCount).toLowerCase()}
                  {occurrence.periodLabel ? ` · ${occurrence.periodLabel}` : ''}
                </span>
              </span>
            ) : (
              'Detalle de la ocurrencia.'
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-4">
          {occurrence ? (
            <>
              {status === 'PROGRAMADA' ? (
                <InlineNotice tone="info">
                  Aún no se puede tomar. Se habilita el {formatDateOnly(occurrence.opensOn)}.
                </InlineNotice>
              ) : null}
              {status === 'CANCELADA' ? (
                <InlineNotice tone="info">
                  {occurrence.cancelReason ?? 'Se canceló al pausar o editar la actividad.'}
                </InlineNotice>
              ) : null}
              {status === 'COMPLETADA_TARDE' ? (
                <InlineNotice tone="warning">
                  Se completó el {formatDateTime(occurrence.completedAt)}
                  {completedLate > 0 ? `, ${completedLate} ${completedLate === 1 ? 'día' : 'días'} después de la fecha objetivo` : ''}.
                </InlineNotice>
              ) : null}

              <DescriptionList
                columns={2}
                items={[
                  { term: 'Estado', value: <StatusBadge kind="occurrence" value={occurrence.displayStatus} /> },
                  { term: 'Fecha objetivo', value: formatDateOnly(occurrence.targetDate) },
                  { term: 'Se habilita desde', value: formatDateOnly(occurrence.opensOn) },
                  { term: 'Esfuerzo estimado', value: formatHours(occurrence.estimatedHours) },
                  { term: 'Responsable', value: orDash(occurrence.responsibleName) },
                  {
                    term: 'Tomada por',
                    value: occurrence.startedByName
                      ? `${occurrence.startedByName}${occurrence.startedAt ? ` · ${formatDateTime(occurrence.startedAt)}` : ''}`
                      : '—',
                  },
                  {
                    term: 'Completada por',
                    value: occurrence.completedByName
                      ? `${occurrence.completedByName}${occurrence.completedAt ? ` · ${formatDateTime(occurrence.completedAt)}` : ''}`
                      : '—',
                  },
                  {
                    term: 'Horas reales',
                    value:
                      occurrence.actualHours !== null ? (
                        <>
                          {formatHours(occurrence.actualHours)}
                          <span className="block text-meta text-muted-foreground">
                            {hoursDifferenceText(occurrence.actualHours, occurrence.estimatedHours)}
                          </span>
                        </>
                      ) : (
                        '—'
                      ),
                  },
                ]}
              />

              <section aria-labelledby="detail-done-title" className="grid gap-1">
                <h3 id="detail-done-title" className="text-sm font-semibold">
                  Qué se realizó
                </h3>
                <p className="whitespace-pre-wrap rounded-lg bg-surface-subtle p-3 text-sm">
                  {orDash(occurrence.completionComment)}
                </p>
              </section>

              <section aria-labelledby="detail-files-title" className="grid gap-2">
                <h3 id="detail-files-title" className="text-sm font-semibold">
                  Adjuntos
                  {evidence.status === 'ready' ? ` (${evidence.items.length})` : ''}
                </h3>
                {evidence.status === 'loading' ? (
                  <div aria-busy="true" className="grid gap-2">
                    <Skeleton className="h-8 rounded-lg" />
                    <Skeleton className="h-8 rounded-lg" />
                  </div>
                ) : null}
                {evidence.status === 'error' ? (
                  <InlineNotice
                    tone="danger"
                    action={
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEvidence({ status: 'loading' });
                          setRetry((n) => n + 1);
                        }}
                      >
                        Reintentar
                      </Button>
                    }
                  >
                    No se pudieron cargar los adjuntos. {evidence.message}
                  </InlineNotice>
                ) : null}
                {evidence.status === 'ready' && evidence.items.length === 0 ? (
                  occurrence.requiresEvidence && occurrence.completedAt ? (
                    <InlineNotice tone="warning">Esta actividad exigía adjuntos y no tiene ninguno.</InlineNotice>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin adjuntos.</p>
                  )
                ) : null}
                {evidence.status === 'ready' && evidence.items.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {evidence.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-subtle px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate" title={item.fileName}>
                          {item.fileName}
                        </span>
                        <span className="text-meta tabular-nums text-muted-foreground">
                          {formatFileSize(item.sizeBytes)} · {formatDateTime(item.createdAt)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-link"
                          aria-label={`Descargar ${item.fileName}`}
                          onClick={() => void handleDownload(item)}
                        >
                          <Download aria-hidden="true" />
                          Descargar
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {occurrence?.canStart && onStart ? (
            <Button type="button" variant="outline" onClick={() => onStart(occurrence)}>
              Tomar
            </Button>
          ) : null}
          {occurrence?.canComplete && onComplete ? (
            <Button type="button" onClick={() => onComplete(occurrence)}>
              Completar
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
