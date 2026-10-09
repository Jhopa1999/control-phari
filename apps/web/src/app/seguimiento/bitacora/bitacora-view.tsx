'use client';

import * as React from 'react';
import { Plus, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
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
  type ActividadFormValues,
} from './actividad-form-dialog';

type LoadState = 'loading' | 'success' | 'error';

function messageOf(err: unknown): string {
  return err instanceof WorklogError
    ? err.message
    : 'Ocurrio un error inesperado.';
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

const CLASS_LABEL: Record<string, string> = {
  PLANIFICADA: 'Planificada',
  SOPORTE: 'Soporte',
  INTERNA: 'Interna',
  EXTRAORDINARIA: 'Extraordinaria',
};

export function BitacoraView(): React.ReactElement {
  const [logs, setLogs] = React.useState<DailyLog[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [tasks, setTasks] = React.useState<MyWorkItem[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<DailyLog | null>(null);
  const [detailState, setDetailState] = React.useState<LoadState>('loading');
  const [issues, setIssues] = React.useState<Issue[]>([]);

  // Dialogo de cabecera de diario (crear/editar notas).
  const [diarioOpen, setDiarioOpen] = React.useState(false);
  const [diarioEditing, setDiarioEditing] = React.useState<DailyLog | null>(
    null,
  );
  const [diarioSubmitting, setDiarioSubmitting] = React.useState(false);
  const [diarioError, setDiarioError] = React.useState<string | null>(null);

  // Dialogo de actividad (crear/editar).
  const [actOpen, setActOpen] = React.useState(false);
  const [actEditing, setActEditing] = React.useState<DailyLogActivity | null>(
    null,
  );
  const [actSubmitting, setActSubmitting] = React.useState(false);
  const [actError, setActError] = React.useState<string | null>(null);
  const [deletingActId, setDeletingActId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

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
      setState('success');
      // Mantiene la seleccion si sigue existiendo; si no, toma el primero.
      setSelectedId((prev) => {
        if (prev && lgs.some((l) => l.id === prev)) return prev;
        return lgs[0]?.id ?? null;
      });
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = React.useCallback(async (id: string) => {
    setDetailState('loading');
    try {
      const [d, iss] = await Promise.all([
        getDailyLog(id),
        listIssues().catch(() => [] as Issue[]),
      ]);
      setDetail(d);
      // Novedades del mismo proceso del diario (relacion opcional).
      setIssues(iss.filter((i) => i.processId === d.processId));
      setDetailState('success');
    } catch {
      setDetail(null);
      setDetailState('error');
    }
  }, []);

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? id,
    [processes],
  );

  const isDraft = detail?.status === 'BORRADOR';

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
        await loadDetail(diarioEditing.id);
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
      setSelectedId(null);
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
      toast.success('Diario enviado a revision.');
      await Promise.all([load(), loadDetail(detail.id)]);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

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
      await loadDetail(detail.id);
    } catch (err) {
      // Fallo: conserva el dialog abierto y los valores (AC-031).
      const message = messageOf(err);
      setActError(message);
      toast.error(message);
    } finally {
      setActSubmitting(false);
    }
  }

  async function handleDeleteAct(row: DailyLogActivity) {
    setDeletingActId(row.id);
    try {
      await deleteActivity(row.id);
      toast.success('Actividad eliminada.');
      if (detail) await loadDetail(detail.id);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setDeletingActId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Bitacora</h1>
          <p className="text-sm text-muted-foreground">
            Registro diario de actividades por proceso. Las horas son
            dedicacion del dia y no afectan el avance de las tareas.
          </p>
        </div>
        <Button onClick={openCreateDiario} disabled={state === 'loading'}>
          <Plus aria-hidden="true" />
          Nuevo diario
        </Button>
      </header>

      {state === 'error' ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No fue posible cargar la bitacora.
          </p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Lista de diarios */}
          <section aria-labelledby="diarios-heading" className="flex flex-col gap-3">
            <h2
              id="diarios-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Mis diarios
            </h2>
            <div className="rounded-lg border bg-card">
              {state === 'loading' ? (
                <div className="flex flex-col gap-3 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <p className="text-sm font-medium">Aun no hay diarios.</p>
                  <Button variant="outline" size="sm" onClick={openCreateDiario}>
                    <Plus aria-hidden="true" />
                    Nuevo diario
                  </Button>
                </div>
              ) : (
                <ul className="divide-y">
                  {logs.map((log) => (
                    <li key={log.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(log.id)}
                        aria-current={log.id === selectedId}
                        className={`flex w-full flex-col gap-1 p-3 text-left transition-colors hover:bg-muted/50 ${
                          log.id === selectedId ? 'bg-muted' : ''
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium">{log.date}</span>
                          <Badge
                            variant={
                              log.status === 'BORRADOR' ? 'outline' : 'secondary'
                            }
                          >
                            {log.status === 'BORRADOR' ? 'Borrador' : 'Enviado'}
                          </Badge>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {processName(log.processId)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Detalle del diario seleccionado */}
          <section aria-label="Detalle del diario" className="flex flex-col gap-3">
            {!selectedId ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-10 text-center">
                <p className="text-sm font-medium">
                  Selecciona un diario para ver sus actividades.
                </p>
                <p className="text-sm text-muted-foreground">
                  O crea uno nuevo para empezar a registrar la jornada.
                </p>
              </div>
            ) : detailState === 'loading' ? (
              <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
                <Skeleton className="h-8 w-1/2" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : detailState === 'error' || !detail ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No fue posible cargar el diario.
                </p>
                <Button
                  variant="outline"
                  onClick={() => selectedId && void loadDetail(selectedId)}
                >
                  <RefreshCw aria-hidden="true" />
                  Reintentar
                </Button>
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <CardTitle className="flex items-center gap-2">
                        {detail.date}
                        <Badge
                          variant={isDraft ? 'outline' : 'secondary'}
                        >
                          {isDraft ? 'Borrador' : 'Enviado'}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {processName(detail.processId)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isDraft ? (
                        <Button
                          size="sm"
                          onClick={() => void handleSubmitForReview()}
                          disabled={submitting}
                        >
                          <Send aria-hidden="true" />
                          Enviar a revision
                        </Button>
                      ) : null}
                      {isDraft ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={openEditDiario}
                          disabled={submitting}
                        >
                          Editar notas
                        </Button>
                      ) : null}
                      {isDraft ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDeleteDiario()}
                          disabled={submitting}
                        >
                          Borrar
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {detail.dayNotes ? (
                    <p className="text-sm text-muted-foreground">
                      {detail.dayNotes}
                    </p>
                  ) : null}

                  <div
                    className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-2"
                    aria-live="polite"
                  >
                    <span className="text-sm font-medium">
                      Dedicacion del dia
                    </span>
                    <span className="text-sm">
                      {detail.totalHours} h
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    La dedicacion es la suma de horas de las actividades. No
                    afecta el avance de las tareas (BR-013).
                  </p>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">Actividades</h3>
                    {isDraft ? (
                      <Button size="sm" onClick={openCreateAct}>
                        <Plus aria-hidden="true" />
                        Agregar actividad
                      </Button>
                    ) : null}
                  </div>

                  {!isDraft ? (
                    <p className="text-xs text-muted-foreground">
                      El diario fue enviado a revision; las actividades ya no se
                      editan.
                    </p>
                  ) : null}

                  {detail.activities.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-8 text-center">
                      <p className="text-sm font-medium">
                        Aun no hay actividades en este diario.
                      </p>
                      {isDraft ? (
                        <Button variant="outline" size="sm" onClick={openCreateAct}>
                          <Plus aria-hidden="true" />
                          Agregar actividad
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <Table>
                      <caption className="sr-only">
                        Actividades del diario {detail.date}.
                      </caption>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Clasificacion</TableHead>
                          <TableHead scope="col">Descripcion</TableHead>
                          <TableHead scope="col">Horas</TableHead>
                          {isDraft ? (
                            <TableHead scope="col" className="text-right">
                              Acciones
                            </TableHead>
                          ) : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.activities.map((act) => (
                          <TableRow key={act.id}>
                            <TableCell>
                              <Badge variant="outline">
                                {CLASS_LABEL[act.classificationCode] ??
                                  act.classificationCode}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-muted-foreground">
                              {act.description ?? '—'}
                            </TableCell>
                            <TableCell>{act.hours}</TableCell>
                            {isDraft ? (
                              <TableCell>
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditAct(act)}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleDeleteAct(act)}
                                    disabled={deletingActId === act.id}
                                  >
                                    {deletingActId === act.id
                                      ? 'Borrando...'
                                      : 'Borrar'}
                                  </Button>
                                </div>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}
          </section>
        </div>
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
    </div>
  );
}
