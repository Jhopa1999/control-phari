'use client';

import * as React from 'react';
import { CheckCircle2, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { useActor } from '@/lib/actor-context';
import { InlineNotice } from '@/components/inline-notice';
import { ReasonDialog } from '@/components/reason-dialog';
import { IdChip } from '@/components/id-chip';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { DailyLog, DailyLogActivity, Process } from '@/lib/api-client';
import {
  formatDateOnly,
  formatDateOnlyWithWeekday,
  formatDateTime,
  formatHours,
  orDash,
} from '@/lib/format';
import {
  WorklogError,
  createActivity,
  deleteActivity,
  deleteDailyLog,
  getDailyLog,
  recallDailyLog,
  returnDailyLog,
  reviewDailyLog,
  submitDailyLog,
  updateActivity,
  updateDailyLog,
} from '@/lib/worklog';
import { ActividadFormDialog, CLASSIFICATIONS, type ActividadFormValues } from './actividad-form-dialog';
import { DiarioFormDialog, type DiarioFormValues } from './diario-form-dialog';

type LoadState = 'loading' | 'success' | 'error';

function messageOf(err: unknown): string {
  return err instanceof WorklogError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Convierte los valores del formulario de actividad al body del api-client. */
function activityBody(values: ActividadFormValues) {
  return {
    classificationCode: values.classificationCode,
    hours: values.hours.trim() === '' ? undefined : Number(values.hours),
    projectRequestId: trimOrUndefined(values.projectRequestId),
    taskId: trimOrUndefined(values.taskId),
    assetRef: trimOrUndefined(values.assetRef),
    requesterRef: trimOrUndefined(values.requesterRef),
    justification: trimOrUndefined(values.justification),
    description: trimOrUndefined(values.description),
    result: trimOrUndefined(values.result),
    evidenceUrl: trimOrUndefined(values.evidenceUrl),
  };
}

function classLabel(code: string): string {
  return CLASSIFICATIONS.find((c) => c.value === code)?.label ?? code;
}

/** Id DOM del botón «Editar» de una actividad: destino del foco tras eliminar otra. */
function activityEditId(activityId: string): string {
  return `act-edit-${activityId}`;
}

interface DetailRow {
  label: string;
  value: React.ReactNode;
}

/** ID visible (chip) seguido del título; sin código (dato antiguo), solo el título. */
function referenceValue(
  code: string | null | undefined,
  title: string | null | undefined,
  copyable: boolean,
): React.ReactNode {
  if (!title && !code) return null;
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <IdChip code={code} variant="full" copyable={copyable} />
      {title ? <span className="min-w-0 wrap-break-word">{title}</span> : null}
    </span>
  );
}

/** Los campos de una actividad que tienen valor, listos para la lista de detalle. */
function activityRows(act: DailyLogActivity): DetailRow[] {
  const rows: DetailRow[] = [];
  const add = (label: string, value: React.ReactNode | null | undefined) => {
    if (value !== null && value !== undefined && value !== '') rows.push({ label, value });
  };
  add('Proyecto', referenceValue(act.projectRequestCode, act.projectRequestTitle, true));
  add('Tarea', referenceValue(act.taskCode, act.taskTitle, true));
  add('Activo', act.assetRef);
  add('Solicitante', act.requesterRef);
  add('Justificación', act.justification);
  add('Resultado', act.result);
  add('Estado de la actividad', act.activityStatus);
  add(
    'Evidencia',
    act.evidenceUrl ? (
      <a
        href={act.evidenceUrl}
        target="_blank"
        rel="noreferrer"
        className="text-link underline underline-offset-2 break-all"
      >
        {act.evidenceUrl}
      </a>
    ) : null,
  );
  add('Próximo paso', act.nextStep);
  add('Fecha del próximo paso', act.nextStepDate ? formatDateOnly(act.nextStepDate) : null);
  return rows;
}

export interface BitacoraDetalleProps {
  logId: string;
  processes: Process[];
  /** Se llama tras cualquier cambio para que la lista y los indicadores se recarguen. */
  onChanged: () => void;
  onClose: () => void;
  /** Tras eliminar el diario: el foco vuelve a la lista. */
  returnFocusTo?: () => HTMLElement | null;
}

/**
 * Detalle de un diario en un panel lateral (se abre con ?diario=<id>). Muestra
 * quién lo hizo, su estado y la línea de tiempo, todas las actividades con su
 * información completa y las acciones que el servidor permite (`actions`).
 */
export function BitacoraDetalle({
  logId,
  processes,
  onChanged,
  onClose,
  returnFocusTo,
}: BitacoraDetalleProps): React.ReactElement {
  const [detail, setDetail] = React.useState<DailyLog | null>(null);
  const [state, setState] = React.useState<LoadState>('loading');
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [diarioOpen, setDiarioOpen] = React.useState(false);
  const [diarioSubmitting, setDiarioSubmitting] = React.useState(false);
  const [diarioError, setDiarioError] = React.useState<string | null>(null);

  const [actOpen, setActOpen] = React.useState(false);
  const [actEditing, setActEditing] = React.useState<DailyLogActivity | null>(null);
  const [actSubmitting, setActSubmitting] = React.useState(false);
  const [actError, setActError] = React.useState<string | null>(null);
  const [actToDelete, setActToDelete] = React.useState<DailyLogActivity | null>(null);
  const [deleteActOpen, setDeleteActOpen] = React.useState(false);

  const [busy, setBusy] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [recallOpen, setRecallOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [returnOpen, setReturnOpen] = React.useState(false);
  const [returnError, setReturnError] = React.useState<string | null>(null);

  const activitiesHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const titleRef = React.useRef<HTMLHeadingElement>(null);
  const focusAfterDeleteRef = React.useRef<string | null>(null);

  const fetchDetail = React.useCallback(
    () =>
      getDailyLog(logId)
        .then((d) => {
          setDetail(d);
          setLoadError(null);
          setState('success');
        })
        .catch((err: unknown) => {
          setLoadError(err instanceof WorklogError ? err.message : null);
          setState('error');
        }),
    [logId],
  );

  React.useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  /** Recarga el detalle sin pasar por el estado de carga y avisa a la lista. */
  const refresh = React.useCallback(async () => {
    await fetchDetail();
    onChanged();
  }, [fetchDetail, onChanged]);

  const actions = detail?.actions;
  const processName = detail
    ? detail.processName || processes.find((p) => p.id === detail.processId)?.name || ''
    : '';
  const { permissions } = useActor();
  const isJefe = (permissions?.grants ?? []).some((g) => g.roleCode === 'JEFE_AREA');

  // --- Acciones del diario ---
  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      return true;
    } catch (err) {
      toast.error(messageOf(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleNotes(values: DiarioFormValues) {
    if (!detail) return;
    setDiarioSubmitting(true);
    setDiarioError(null);
    try {
      await updateDailyLog(detail.id, { dayNotes: trimOrUndefined(values.dayNotes) });
      toast.success('Notas del diario actualizadas.');
      setDiarioOpen(false);
      await refresh();
    } catch (err) {
      const message = messageOf(err);
      setDiarioError(message);
      toast.error(message);
    } finally {
      setDiarioSubmitting(false);
    }
  }

  async function handleSend() {
    if (!detail) return;
    if (await run(() => submitDailyLog(detail.id), 'Diario enviado a revisión.')) await refresh();
  }

  async function handleRecall() {
    if (!detail) return;
    if (await run(() => recallDailyLog(detail.id), 'Retiraste el envío: el diario vuelve a borrador.')) {
      await refresh();
    }
  }

  async function handleReview() {
    if (!detail) return;
    if (await run(() => reviewDailyLog(detail.id), 'Diario marcado como revisado.')) await refresh();
  }

  async function handleReturn(reason: string) {
    if (!detail) return;
    setBusy(true);
    setReturnError(null);
    try {
      await returnDailyLog(detail.id, reason);
      toast.success('Diario devuelto. Se avisó al autor.');
      setReturnOpen(false);
      await refresh();
    } catch (err) {
      setReturnError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!detail) return;
    if (await run(() => deleteDailyLog(detail.id), 'Diario eliminado.')) {
      onChanged();
      onClose();
    }
  }

  // --- Actividades ---
  async function handleActSubmit(values: ActividadFormValues) {
    if (!detail) return;
    setActSubmitting(true);
    setActError(null);
    try {
      if (actEditing) {
        await updateActivity(actEditing.id, {
          ...activityBody(values),
          // Al editar, una tarea vaciada se envía como null: omitirla la conservaría.
          ...(actEditing.taskId && !values.taskId.trim() ? { taskId: null } : {}),
        });
        toast.success('Actividad actualizada.');
      } else {
        await createActivity(detail.id, activityBody(values));
        toast.success('Actividad agregada.');
      }
      setActOpen(false);
      setActEditing(null);
      await refresh();
    } catch (err) {
      // Fallo: conserva el diálogo abierto y los valores (AC-031).
      const message = messageOf(err);
      setActError(message);
      toast.error(message);
    } finally {
      setActSubmitting(false);
    }
  }

  function requestDeleteAct(row: DailyLogActivity) {
    const rows = detail?.activities ?? [];
    const index = rows.findIndex((a) => a.id === row.id);
    const neighbour = rows[index + 1] ?? rows[index - 1] ?? null;
    focusAfterDeleteRef.current = neighbour ? activityEditId(neighbour.id) : null;
    setActToDelete(row);
    setDeleteActOpen(true);
  }

  const returnFocusToActivities = React.useCallback((): HTMLElement | null => {
    const id = focusAfterDeleteRef.current;
    return (id ? document.getElementById(id) : null) ?? activitiesHeadingRef.current;
  }, []);

  const returnFocusToTitle = React.useCallback(
    (): HTMLElement | null => titleRef.current ?? returnFocusTo?.() ?? null,
    [returnFocusTo],
  );

  // --- Piezas de presentación ---
  function renderStatusNotice(d: DailyLog): React.ReactNode {
    if (d.returned) {
      return (
        <InlineNotice tone="warning" title="Devuelto para corregir">
          {d.returnedByName ? `${d.returnedByName} lo devolvió` : 'Lo devolvieron'}
          {d.returnedAt ? ` el ${formatDateTime(d.returnedAt)}` : ''}
          {d.returnReason ? `: «${d.returnReason}».` : '.'} Corrígelo y vuelve a enviarlo.
        </InlineNotice>
      );
    }
    if (d.status === 'ENVIADO') {
      return (
        <InlineNotice tone="info">
          Enviado a revisión
          {d.submittedAt ? ` el ${formatDateTime(d.submittedAt)}` : ''}. Mientras tanto no se puede
          editar.
          {d.actions.recall ? ' Si fue por error, puedes retirar el envío.' : ''}
        </InlineNotice>
      );
    }
    if (d.status === 'REVISADO') {
      return (
        <InlineNotice tone="success">
          Revisado{d.reviewedByName ? ` por ${d.reviewedByName}` : ''}
          {d.reviewedAt ? ` el ${formatDateTime(d.reviewedAt)}` : ''}. Ya no se puede modificar.
        </InlineNotice>
      );
    }
    return null;
  }

  function renderTimeline(d: DailyLog): React.ReactNode {
    const events: { key: string; when: string | null; text: string }[] = [
      { key: 'created', when: d.createdAt, text: `Creado por ${d.authorName}` },
    ];
    if (d.submittedAt) {
      events.push({ key: 'sent', when: d.submittedAt, text: `Enviado por ${d.authorName}` });
    }
    if (d.returnedAt) {
      events.push({
        key: 'returned',
        when: d.returnedAt,
        text: `Devuelto por ${d.returnedByName ?? 'un revisor'}${d.returnReason ? `: «${d.returnReason}»` : ''}`,
      });
    }
    if (d.reviewedAt) {
      events.push({
        key: 'reviewed',
        when: d.reviewedAt,
        text: `Revisado por ${d.reviewedByName ?? 'un revisor'}`,
      });
    }
    events.sort((a, b) => String(a.when).localeCompare(String(b.when)));
    return (
      <Section title="Historial" headingLevel={3}>
        <ol className="flex flex-col gap-2 border-l pl-4">
          {events.map((e) => (
            <li key={e.key} className="text-sm">
              <span className="block wrap-break-word">{e.text}</span>
              <span className="text-meta text-muted-foreground">{formatDateTime(e.when)}</span>
            </li>
          ))}
        </ol>
      </Section>
    );
  }

  function renderActivities(d: DailyLog): React.ReactNode {
    const canEdit = d.actions.edit;
    return (
      <Section
        title="Actividades"
        headingLevel={3}
        count={d.activities.length}
        headingRef={activitiesHeadingRef}
        actions={
          canEdit ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setActEditing(null);
                setActError(null);
                setActOpen(true);
              }}
            >
              <Plus aria-hidden="true" />
              Agregar actividad
            </Button>
          ) : null
        }
      >
        {d.activities.length === 0 ? (
          <div className="rounded-md border border-dashed">
            <EmptyState
              size="compact"
              title="Aún no hay actividades en este diario."
              description={
                canEdit ? 'Agrega lo que hiciste en el día con sus horas de dedicación.' : undefined
              }
            />
          </div>
        ) : (
          <ul aria-label="Actividades del diario" className="flex flex-col gap-2">
            {d.activities.map((act) => {
              const rows = activityRows(act);
              const label = classLabel(act.classificationCode);
              return (
                <li key={act.id} className="rounded-lg border bg-card">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      <Badge variant="outline" className="shrink-0">
                        {label}
                      </Badge>
                      <span className="min-w-0 flex-1 text-sm wrap-break-word group-open:whitespace-pre-wrap">
                        {act.description ? (
                          <span className="line-clamp-2 group-open:line-clamp-none">{act.description}</span>
                        ) : (
                          <span className="text-muted-foreground">Sin descripción</span>
                        )}
                        {act.projectRequestTitle || act.taskTitle ? (
                          <span className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                            {act.projectRequestTitle || act.projectRequestCode ? (
                              <span>{referenceValue(act.projectRequestCode, act.projectRequestTitle, false)}</span>
                            ) : null}
                            {act.taskTitle || act.taskCode ? (
                              <span>{referenceValue(act.taskCode, act.taskTitle, false)}</span>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {formatHours(act.hours)}
                      </span>
                    </summary>
                    <div className="flex flex-col gap-3 border-t px-3 py-3">
                      {rows.length > 0 ? (
                        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                          {rows.map((row) => (
                            <React.Fragment key={row.label}>
                              <dt className="text-meta text-muted-foreground">{row.label}</dt>
                              <dd className="wrap-break-word whitespace-pre-wrap">{row.value}</dd>
                            </React.Fragment>
                          ))}
                        </dl>
                      ) : (
                        <p className="text-meta text-muted-foreground">
                          Esta actividad no tiene más detalle registrado.
                        </p>
                      )}
                      {canEdit ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            id={activityEditId(act.id)}
                            onClick={() => {
                              setActEditing(act);
                              setActError(null);
                              setActOpen(true);
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost-destructive"
                            size="sm"
                            onClick={() => requestDeleteAct(act)}
                          >
                            Eliminar
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    );
  }

  function renderBody(): React.ReactNode {
    if (state === 'error') {
      return (
        <ErrorState
          size="compact"
          title="No fue posible cargar el diario."
          message={loadError}
          onRetry={() => {
            setState('loading');
            void fetchDetail();
          }}
        />
      );
    }
    if (state === 'loading' || !detail) {
      return (
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-5">
        {renderStatusNotice(detail)}

        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold">Notas del día</h3>
            {detail.actions.edit ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDiarioError(null);
                  setDiarioOpen(true);
                }}
              >
                Editar notas
              </Button>
            ) : null}
          </div>
          <p className="text-sm whitespace-pre-wrap wrap-break-word text-muted-foreground">
            {detail.dayNotes ? detail.dayNotes : 'Sin notas.'}
          </p>
        </div>

        <div className="flex flex-col gap-1 rounded-md border bg-muted/40 px-4 py-3">
          <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">Dedicación del día:</span>
            <span className="text-2xl font-semibold tabular-nums">{formatHours(detail.totalHours)}</span>
          </p>
          <p className="text-meta text-muted-foreground">
            Es la suma de las horas de las actividades y no cambia el avance de las tareas.
          </p>
        </div>

        {renderActivities(detail)}
        {renderTimeline(detail)}
      </div>
    );
  }

  function renderFooter(): React.ReactNode {
    if (!detail || !actions) return null;
    const any =
      actions.delete || actions.submit || actions.recall || actions.review || actions.return;
    if (!any) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-card px-4 py-3">
        <div>
          {actions.delete ? (
            <Button
              type="button"
              variant="ghost-destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              disabled={busy}
            >
              <Trash2 aria-hidden="true" />
              Eliminar
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {actions.recall ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setRecallOpen(true)} disabled={busy}>
              <Undo2 aria-hidden="true" />
              Retirar envío
            </Button>
          ) : null}
          {actions.return ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setReturnError(null);
                setReturnOpen(true);
              }}
              disabled={busy}
            >
              <Undo2 aria-hidden="true" />
              Devolver
            </Button>
          ) : null}
          {actions.review ? (
            <Button type="button" size="sm" onClick={() => void handleReview()} disabled={busy}>
              <CheckCircle2 aria-hidden="true" />
              {busy ? 'Guardando…' : 'Marcar como revisado'}
            </Button>
          ) : null}
          {actions.submit ? (
            <Button type="button" size="sm" onClick={() => setSendOpen(true)} disabled={busy}>
              <Send aria-hidden="true" />
              Enviar a revisión
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const dateLabel = detail ? formatDateOnlyWithWeekday(detail.date) : 'Diario';

  return (
    <>
      <Sheet open onOpenChange={(open) => (!open ? onClose() : undefined)}>
        <SheetContent side="right" closeLabel="Cerrar detalle" className="w-full sm:w-[42rem] sm:max-w-2xl">
          <div className="flex flex-col gap-1 border-b px-4 py-4 pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle
                ref={titleRef}
                tabIndex={-1}
                className="rounded-sm text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {dateLabel}
              </SheetTitle>
              {detail ? (
                <StatusBadge kind="log" value={detail.returned ? 'DEVUELTO' : detail.status} />
              ) : null}
            </div>
            <SheetDescription>
              {detail
                ? `${orDash(detail.authorName)} · ${orDash(processName)} · ${detail.activities.length} ${
                    detail.activities.length === 1 ? 'actividad' : 'actividades'
                  } · ${formatHours(detail.totalHours)}`
                : 'Cargando el diario…'}
            </SheetDescription>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">{renderBody()}</div>
          {renderFooter()}
        </SheetContent>
      </Sheet>

      <DiarioFormDialog
        open={diarioOpen}
        onOpenChange={(open) => {
          setDiarioOpen(open);
          if (!open) setDiarioError(null);
        }}
        editing={detail}
        processes={processes}
        submitting={diarioSubmitting}
        errorMessage={diarioError}
        onSubmit={handleNotes}
      />

      <ActividadFormDialog
        open={actOpen}
        onOpenChange={(open) => {
          setActOpen(open);
          if (!open) {
            setActEditing(null);
            setActError(null);
          }
        }}
        editing={actEditing}
        processId={detail?.processId ?? ''}
        date={detail?.date ?? ''}
        isJefe={isJefe}
        submitting={actSubmitting}
        errorMessage={actError}
        onSubmit={handleActSubmit}
      />

      <ConfirmDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        tone="default"
        title="¿Enviar el diario a revisión?"
        description="Después de enviarlo no podrás editar sus actividades, salvo que lo retires o te lo devuelvan."
        confirmLabel="Enviar a revisión"
        onConfirm={handleSend}
        returnFocusTo={returnFocusToTitle}
      />

      <ConfirmDialog
        open={recallOpen}
        onOpenChange={setRecallOpen}
        tone="default"
        title="¿Retirar el envío?"
        description="El diario vuelve a borrador para que lo corrijas. Tendrás que enviarlo de nuevo."
        confirmLabel="Retirar envío"
        onConfirm={handleRecall}
        returnFocusTo={returnFocusToTitle}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`¿Eliminar el diario del ${detail ? formatDateOnly(detail.date) : ''}?`}
        description="Se eliminan también sus actividades. Esta acción no se puede deshacer."
        confirmLabel="Eliminar diario"
        onConfirm={handleDelete}
        returnFocusTo={returnFocusTo}
      />

      <ConfirmDialog
        open={deleteActOpen}
        onOpenChange={(open) => {
          setDeleteActOpen(open);
          if (!open) setActToDelete(null);
        }}
        title="¿Eliminar esta actividad?"
        description="Sus horas dejarán de contar en la dedicación del día."
        confirmLabel="Eliminar actividad"
        onConfirm={async () => {
          if (!actToDelete) return;
          if (await run(() => deleteActivity(actToDelete.id), 'Actividad eliminada.')) await refresh();
        }}
        returnFocusTo={returnFocusToActivities}
      />

      <ReasonDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        title="Devolver el diario"
        description="El autor recibirá un aviso con tu motivo y podrá corregir el diario y volver a enviarlo."
        fieldId="devolver-reason"
        fieldLabel="Motivo de la devolución"
        placeholder="Por ejemplo: faltan las horas de soporte del jueves."
        confirmLabel="Devolver"
        busyLabel="Devolviendo…"
        tone="default"
        submitting={busy}
        errorMessage={returnError}
        requiredMessage="Escribe el motivo de la devolución (mínimo 10 caracteres)."
        onConfirm={(reason) => void handleReturn(reason)}
        returnFocusTo={returnFocusToTitle}
      />
    </>
  );
}
