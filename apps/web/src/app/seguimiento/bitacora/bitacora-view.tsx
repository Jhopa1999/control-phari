'use client';

import * as React from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { InlineNotice } from '@/components/inline-notice';
import { MasterDetail, SelectableList } from '@/components/master-detail';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RowActions, RowActionsCell } from '@/components/row-actions';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  DailyLog,
  DailyLogActivity,
  Issue,
  MyWorkItem,
  Process,
  Request,
} from '@/lib/api-client';
import { formatDateOnly, formatHours, orDash } from '@/lib/format';
import {
  WorklogError,
  createActivity,
  createDailyLog,
  deleteActivity,
  deleteDailyLog,
  getDailyLog,
  listDailyLogs,
  submitDailyLog,
  updateActivity,
  updateDailyLog,
} from '@/lib/worklog';
import { listIssues } from '@/lib/issues';
import { listProcesses } from '@/lib/team';
import { listRequests } from '@/lib/requests';
import { listMyWork } from '@/lib/my-work';
import { DiarioFormDialog, type DiarioFormValues } from './diario-form-dialog';
import {
  ActividadFormDialog,
  CLASSIFICATIONS,
  type ActividadFormValues,
} from './actividad-form-dialog';

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
    relatedIssueId: trimOrUndefined(values.relatedIssueId),
    assetRef: trimOrUndefined(values.assetRef),
    requesterRef: trimOrUndefined(values.requesterRef),
    justification: trimOrUndefined(values.justification),
    description: trimOrUndefined(values.description),
    result: trimOrUndefined(values.result),
    nextStep: trimOrUndefined(values.nextStep),
    nextStepDate: trimOrUndefined(values.nextStepDate),
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

export function BitacoraView(): React.ReactElement {
  const [logs, setLogs] = React.useState<DailyLog[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [tasks, setTasks] = React.useState<MyWorkItem[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<DailyLog | null>(null);
  const [detailState, setDetailState] = React.useState<LoadState>('loading');
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [issues, setIssues] = React.useState<Issue[]>([]);
  const latestDetailIdRef = React.useRef<string | null>(null);

  // Diálogo de cabecera de diario (crear/editar notas).
  const [diarioOpen, setDiarioOpen] = React.useState(false);
  const [diarioEditing, setDiarioEditing] = React.useState<DailyLog | null>(null);
  const [diarioSubmitting, setDiarioSubmitting] = React.useState(false);
  const [diarioError, setDiarioError] = React.useState<string | null>(null);

  // Diálogo de actividad (crear/editar).
  const [actOpen, setActOpen] = React.useState(false);
  const [actEditing, setActEditing] = React.useState<DailyLogActivity | null>(null);
  const [actSubmitting, setActSubmitting] = React.useState(false);
  const [actError, setActError] = React.useState<string | null>(null);
  const [deletingActId, setDeletingActId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Confirmaciones (design §13.3).
  const [sendOpen, setSendOpen] = React.useState(false);
  const [deleteDiarioOpen, setDeleteDiarioOpen] = React.useState(false);
  // Fecha del diario a eliminar, fijada al abrir: el título no cambia mientras
  // el diálogo se cierra y la selección pasa a otro diario.
  const [deleteDiarioDate, setDeleteDiarioDate] = React.useState('');
  const [actToDelete, setActToDelete] = React.useState<DailyLogActivity | null>(null);
  const [deleteActOpen, setDeleteActOpen] = React.useState(false);

  // Destinos del foco (NIT 4).
  const listHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const detailHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const activitiesHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const focusAfterDeleteRef = React.useRef<string | null>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [lgs, procs, reqs, mw] = await Promise.all([
        listDailyLogs(),
        listProcesses().catch(() => [] as Process[]),
        listRequests().catch(() => [] as Request[]),
        listMyWork().catch(() => [] as MyWorkItem[]),
      ]);
      setLogs(lgs);
      setProcesses(procs);
      setRequests(reqs);
      setTasks(mw);
      setLoadError(null);
      setState('success');
      // Mantiene la selección si sigue existiendo; si no, toma el primero.
      setSelectedId((prev) => {
        if (prev && lgs.some((l) => l.id === prev)) return prev;
        return lgs[0]?.id ?? null;
      });
    } catch (err) {
      setLoadError(err instanceof WorklogError ? err.message : null);
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  /**
   * Carga el detalle. `silent` (tras guardar o eliminar) no pasa por el estado
   * de carga: las filas siguen montadas y el foco puede volver a ellas.
   */
  const loadDetail = React.useCallback(async (id: string, silent = false) => {
    latestDetailIdRef.current = id;
    if (!silent) setDetailState('loading');
    try {
      const [d, iss] = await Promise.all([
        getDailyLog(id),
        listIssues().catch(() => [] as Issue[]),
      ]);
      if (latestDetailIdRef.current !== id) return;
      setDetail(d);
      // Novedades del mismo proceso del diario (relación opcional).
      setIssues(iss.filter((i) => i.processId === d.processId));
      setDetailError(null);
      setDetailState('success');
    } catch (err) {
      if (latestDetailIdRef.current !== id) return;
      setDetail(null);
      setDetailError(err instanceof WorklogError ? err.message : null);
      setDetailState('error');
    }
  }, []);

  React.useEffect(() => {
    if (!selectedId) {
      latestDetailIdRef.current = null;
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? id,
    [processes],
  );

  // La cabecera del detalle sale del ítem de la lista mientras carga el detalle,
  // para que el encabezado siga montado (y con el foco) al cambiar de diario.
  const selectedLog = logs.find((l) => l.id === selectedId) ?? null;
  const detailReady = detailState === 'success' && detail !== null && detail.id === selectedId;
  const current = detailReady ? detail : selectedLog;
  const isDraft = detailReady && detail.status === 'BORRADOR';

  // --- Diario (cabecera) ---
  function openCreateDiario() {
    setDiarioEditing(null);
    setDiarioError(null);
    setDiarioOpen(true);
  }
  function openEditDiario() {
    if (!detail) return;
    setDiarioEditing(detail);
    setDiarioError(null);
    setDiarioOpen(true);
  }

  async function handleDiarioSubmit(values: DiarioFormValues) {
    setDiarioSubmitting(true);
    setDiarioError(null);
    try {
      if (diarioEditing) {
        await updateDailyLog(diarioEditing.id, {
          dayNotes: trimOrUndefined(values.dayNotes),
        });
        toast.success('Notas del diario actualizadas.');
        await loadDetail(diarioEditing.id, true);
      } else {
        const created = await createDailyLog({
          processId: values.processId,
          date: values.date,
          dayNotes: trimOrUndefined(values.dayNotes),
        });
        toast.success('Diario creado.');
        setSelectedId(created.id);
      }
      setDiarioOpen(false);
      setDiarioEditing(null);
      await load();
    } catch (err) {
      const message = messageOf(err);
      setDiarioError(message);
      toast.error(message);
    } finally {
      setDiarioSubmitting(false);
    }
  }

  async function handleDeleteDiario() {
    if (!detail) return;
    setSubmitting(true);
    try {
      await deleteDailyLog(detail.id);
      toast.success('Diario eliminado.');
      // load() selecciona el primero que quede (el eliminado ya no existe).
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitForReview() {
    if (!detail) return;
    setSubmitting(true);
    try {
      await submitDailyLog(detail.id);
      toast.success('Diario enviado a revisión.');
      await Promise.all([load(), loadDetail(detail.id, true)]);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  // Tras eliminar el diario o enviarlo, el botón pulsado ya no existe: el foco
  // va al encabezado del detalle que quede seleccionado o, si no queda ninguno,
  // al título de la lista (NIT 4).
  const returnFocusToDetail = React.useCallback(
    (): HTMLElement | null => detailHeadingRef.current ?? listHeadingRef.current,
    [],
  );

  // --- Actividades ---
  function openCreateAct() {
    setActEditing(null);
    setActError(null);
    setActOpen(true);
  }
  function openEditAct(row: DailyLogActivity) {
    setActEditing(row);
    setActError(null);
    setActOpen(true);
  }

  async function handleActSubmit(values: ActividadFormValues) {
    if (!detail) return;
    setActSubmitting(true);
    setActError(null);
    try {
      if (actEditing) {
        await updateActivity(actEditing.id, activityBody(values));
        toast.success('Actividad actualizada.');
      } else {
        await createActivity(detail.id, activityBody(values));
        toast.success('Actividad agregada.');
      }
      setActOpen(false);
      setActEditing(null);
      await loadDetail(detail.id, true);
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

  async function handleDeleteAct(row: DailyLogActivity) {
    setDeletingActId(row.id);
    try {
      await deleteActivity(row.id);
      toast.success('Actividad eliminada.');
      if (detail) await loadDetail(detail.id, true);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setDeletingActId(null);
    }
  }

  // La fila eliminada desaparece: el foco pasa a la fila siguiente (o la
  // anterior) o, si no queda ninguna, al encabezado de la sección (NIT 4).
  const returnFocusToActivities = React.useCallback((): HTMLElement | null => {
    const id = focusAfterDeleteRef.current;
    return (id ? document.getElementById(id) : null) ?? activitiesHeadingRef.current;
  }, []);

  function renderDetailBody(): React.ReactNode {
    if (detailState === 'error') {
      return (
        <ErrorState
          size="compact"
          title="No fue posible cargar el diario."
          message={detailError}
          onRetry={() => selectedId && void loadDetail(selectedId)}
        />
      );
    }
    if (!detailReady || !detail) {
      return (
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      );
    }
    const activities = detail.activities;
    return (
      <>
        {detail.dayNotes ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">Notas del día</h3>
            <p className="text-sm whitespace-pre-wrap wrap-break-word text-muted-foreground">
              {detail.dayNotes}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-1 rounded-md border bg-muted/40 px-4 py-3">
          <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">Dedicación del día:</span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatHours(detail.totalHours)}
            </span>
          </p>
          <p className="text-meta text-muted-foreground">
            La dedicación es la suma de las horas de las actividades y no cambia el avance de las
            tareas.
          </p>
        </div>

        <Section
          title="Actividades"
          headingLevel={3}
          count={activities.length}
          headingRef={activitiesHeadingRef}
          actions={
            isDraft ? (
              <Button type="button" variant="secondary" size="sm" onClick={openCreateAct}>
                <Plus aria-hidden="true" />
                Agregar actividad
              </Button>
            ) : null
          }
        >
          {!isDraft ? (
            <InlineNotice tone="neutral">
              El diario se envió a revisión; las actividades ya no se pueden editar.
            </InlineNotice>
          ) : null}

          {activities.length === 0 ? (
            <div className="rounded-md border border-dashed">
              <EmptyState
                size="compact"
                title="Aún no hay actividades en este diario."
                description={
                  isDraft ? 'Agrega lo que hiciste en el día con sus horas de dedicación.' : undefined
                }
                action={
                  isDraft ? (
                    <Button type="button" variant="outline" size="sm" onClick={openCreateAct}>
                      <Plus aria-hidden="true" />
                      Agregar actividad
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table scrollLabel="Tabla de actividades del diario">
                <TableCaption>
                  {`Actividades del diario del ${formatDateOnly(detail.date)}.`}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Clasificación</TableHead>
                    <TableHead scope="col">Descripción</TableHead>
                    <TableHead scope="col" className="text-right">
                      Horas
                    </TableHead>
                    {isDraft ? (
                      <TableHead scope="col" className="text-right">
                        Acciones
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((act) => {
                    const label = classLabel(act.classificationCode);
                    return (
                      <TableRow key={act.id}>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline">{label}</Badge>
                        </TableCell>
                        <TableCell className="min-w-48">
                          <span
                            className="line-clamp-2 wrap-break-word text-muted-foreground"
                            title={act.description ?? undefined}
                          >
                            {orDash(act.description)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {formatHours(act.hours)}
                        </TableCell>
                        {isDraft ? (
                          <RowActionsCell>
                            <RowActions
                              rowLabel={act.description ? act.description : label}
                              actions={[
                                {
                                  key: 'edit',
                                  id: activityEditId(act.id),
                                  label: 'Editar',
                                  onSelect: () => openEditAct(act),
                                  disabled: deletingActId === act.id,
                                },
                                {
                                  key: 'delete',
                                  label: 'Eliminar',
                                  tone: 'danger',
                                  busy: deletingActId === act.id,
                                  busyLabel: 'Eliminando…',
                                  onSelect: () => requestDeleteAct(act),
                                },
                              ]}
                            />
                          </RowActionsCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>
      </>
    );
  }

  function renderDetail(): React.ReactNode {
    if (state === 'loading' && !current) {
      return (
        <Card aria-hidden="true" className="flex flex-col gap-4 p-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </Card>
      );
    }
    if (!current) {
      return (
        <Card>
          <EmptyState
            title="Selecciona un diario para ver sus actividades."
            description="O crea uno nuevo para empezar a registrar la jornada."
          />
        </Card>
      );
    }
    return (
      <Card>
        <CardHeader className="gap-3 border-b sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                ref={detailHeadingRef}
                tabIndex={-1}
                className="rounded-sm text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {formatDateOnly(current.date)}
              </h2>
              <StatusBadge kind="log" value={current.status} />
            </div>
            <p className="text-meta text-muted-foreground">{processName(current.processId)}</p>
          </div>
          {isDraft ? (
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
              <Button
                type="button"
                variant="ghost-destructive"
                size="sm"
                onClick={() => {
                  setDeleteDiarioDate(formatDateOnly(current.date));
                  setDeleteDiarioOpen(true);
                }}
                disabled={submitting}
              >
                <Trash2 aria-hidden="true" />
                Eliminar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openEditDiario}
                disabled={submitting}
              >
                Editar notas
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => setSendOpen(true)}
                disabled={submitting}
              >
                <Send aria-hidden="true" />
                Enviar a revisión
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-4">{renderDetailBody()}</CardContent>
      </Card>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Bitácora"
        description="Registro diario de actividades por proceso. Las horas son dedicación del día y no cambian el avance de las tareas."
        actions={
          <Button type="button" onClick={openCreateDiario} disabled={state === 'loading'}>
            <Plus aria-hidden="true" />
            Nuevo diario
          </Button>
        }
      />

      {state === 'error' ? (
        <div className="rounded-lg border bg-card">
          <ErrorState
            title="No fue posible cargar la bitácora."
            message={loadError}
            onRetry={() => void load()}
          />
        </div>
      ) : (
        <MasterDetail
          listTitle="Mis diarios"
          listHeadingRef={listHeadingRef}
          detailHeadingRef={detailHeadingRef}
          list={
            <SelectableList
              label="Mis diarios"
              loading={state === 'loading' && logs.length === 0}
              selectedId={selectedId}
              onSelect={setSelectedId}
              items={logs.map((log) => ({
                id: log.id,
                title: formatDateOnly(log.date),
                meta: processName(log.processId),
                badge: <StatusBadge kind="log" value={log.status} />,
              }))}
              empty={{
                title: 'Aún no hay diarios.',
                description: 'Crea un diario para registrar las actividades de tu jornada.',
                action: (
                  <Button type="button" variant="outline" size="sm" onClick={openCreateDiario}>
                    <Plus aria-hidden="true" />
                    Nuevo diario
                  </Button>
                ),
              }}
            />
          }
          detail={renderDetail()}
        />
      )}

      <DiarioFormDialog
        open={diarioOpen}
        onOpenChange={(open) => {
          setDiarioOpen(open);
          if (!open) {
            setDiarioEditing(null);
            setDiarioError(null);
          }
        }}
        editing={diarioEditing}
        processes={processes}
        submitting={diarioSubmitting}
        errorMessage={diarioError}
        onSubmit={handleDiarioSubmit}
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
        requests={requests}
        tasks={tasks}
        issues={issues}
        submitting={actSubmitting}
        errorMessage={actError}
        onSubmit={handleActSubmit}
      />

      <ConfirmDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        tone="default"
        title="¿Enviar el diario a revisión?"
        description="Después de enviarlo no podrás editar sus actividades."
        confirmLabel="Enviar a revisión"
        onConfirm={handleSubmitForReview}
        returnFocusTo={returnFocusToDetail}
      />

      <ConfirmDialog
        open={deleteDiarioOpen}
        onOpenChange={setDeleteDiarioOpen}
        title={`¿Eliminar el diario del ${deleteDiarioDate}?`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar diario"
        onConfirm={handleDeleteDiario}
        returnFocusTo={returnFocusToDetail}
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
          if (actToDelete) await handleDeleteAct(actToDelete);
        }}
        returnFocusTo={returnFocusToActivities}
      />
    </PageLayout>
  );
}
