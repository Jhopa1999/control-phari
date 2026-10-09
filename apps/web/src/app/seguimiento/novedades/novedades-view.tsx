'use client';

import * as React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  CoordinationPerson,
  Issue,
  Process,
  RecordState,
} from '@/lib/api-client';
import {
  IssueError,
  createIssue,
  listIssues,
  transitionIssue,
  updateIssue,
} from '@/lib/issues';
import { listCoordinationPeople } from '@/lib/worklog';
import { listProcesses } from '@/lib/team';
import { nextStates, stateLabel } from '@/lib/record-state';
import {
  NovedadFormDialog,
  type NovedadFormValues,
} from './novedad-form-dialog';

type LoadState = 'loading' | 'success' | 'error';

function messageOf(err: unknown): string {
  return err instanceof IssueError
    ? err.message
    : 'Ocurrio un error inesperado.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

const TYPE_LABEL: Record<string, string> = {
  BLOQUEO: 'Bloqueo',
  INCIDENTE: 'Incidente',
  CALIDAD_DATOS: 'Calidad de datos',
  SOLICITUD_APOYO: 'Solicitud de apoyo',
};

export function NovedadesView(): React.ReactElement {
  const [issues, setIssues] = React.useState<Issue[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Issue | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [transitioning, setTransitioning] = React.useState(false);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [iss, procs, ppl] = await Promise.all([
        listIssues(),
        listProcesses().catch(() => [] as Process[]),
        listCoordinationPeople().catch(() => [] as CoordinationPerson[]),
      ]);
      setIssues(iss);
      setProcesses(procs);
      setPeople(ppl);
      setState('success');
      setSelectedId((prev) => {
        if (prev && iss.some((i) => i.id === prev)) return prev;
        return iss[0]?.id ?? null;
      });
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selected = React.useMemo(
    () => issues.find((i) => i.id === selectedId) ?? null,
    [issues, selectedId],
  );

  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? id,
    [processes],
  );
  const personName = React.useCallback(
    (id: string | null) =>
      id ? (people.find((p) => p.id === id)?.name ?? id) : '—',
    [people],
  );

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setOpen(true);
  }
  function openEdit(issue: Issue) {
    setEditing(issue);
    setFormError(null);
    setOpen(true);
  }

  async function handleSubmit(values: NovedadFormValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateIssue(editing.id, {
          title: values.title,
          typeCode: values.typeCode,
          detail: trimOrUndefined(values.detail),
          impact: trimOrUndefined(values.impact),
          resolverUserId: trimOrUndefined(values.resolverUserId),
          targetDate: trimOrUndefined(values.targetDate),
          resolution: trimOrUndefined(values.resolution),
        });
        toast.success('Novedad actualizada.');
      } else {
        const created = await createIssue({
          processId: values.processId,
          date: values.date,
          typeCode: values.typeCode,
          title: values.title,
          detail: trimOrUndefined(values.detail),
          impact: trimOrUndefined(values.impact),
          resolverUserId: trimOrUndefined(values.resolverUserId),
          targetDate: trimOrUndefined(values.targetDate),
          resolution: trimOrUndefined(values.resolution),
        });
        toast.success('Novedad creada.');
        setSelectedId(created.id);
      }
      setOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransition(issue: Issue, toState: RecordState) {
    setTransitioning(true);
    try {
      await transitionIssue(issue.id, { toState });
      toast.success(`Novedad movida a ${stateLabel(toState)}.`);
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Novedades</h1>
          <p className="text-sm text-muted-foreground">
            Bloqueos, incidentes y solicitudes de apoyo. Cada incidente es un
            solo registro que se actualiza hasta resolverlo.
          </p>
        </div>
        <Button onClick={openCreate} disabled={state === 'loading'}>
          <Plus aria-hidden="true" />
          Nueva novedad
        </Button>
      </header>

      {state === 'error' ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No fue posible cargar las novedades.
          </p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" />
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <section aria-labelledby="novedades-heading" className="flex flex-col gap-3">
            <h2
              id="novedades-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Lista
            </h2>
            <div className="rounded-lg border bg-card">
              {state === 'loading' ? (
                <div className="flex flex-col gap-3 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : issues.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <p className="text-sm font-medium">Aun no hay novedades.</p>
                  <Button variant="outline" size="sm" onClick={openCreate}>
                    <Plus aria-hidden="true" />
                    Nueva novedad
                  </Button>
                </div>
              ) : (
                <ul className="divide-y">
                  {issues.map((issue) => (
                    <li key={issue.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(issue.id)}
                        aria-current={issue.id === selectedId}
                        className={`flex w-full flex-col gap-1 p-3 text-left transition-colors hover:bg-muted/50 ${
                          issue.id === selectedId ? 'bg-muted' : ''
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium">{issue.title}</span>
                          <Badge variant="secondary">
                            {stateLabel(issue.state)}
                          </Badge>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {TYPE_LABEL[issue.typeCode] ?? issue.typeCode} ·{' '}
                          {processName(issue.processId)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-label="Ficha de novedad" className="flex flex-col gap-3">
            {!selected ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-10 text-center">
                <p className="text-sm font-medium">Selecciona una novedad.</p>
                <p className="text-sm text-muted-foreground">
                  O crea una nueva para registrar un bloqueo o incidente.
                </p>
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-1">
                      <CardTitle className="flex items-center gap-2">
                        {selected.title}
                        <Badge variant="secondary">
                          {stateLabel(selected.state)}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {TYPE_LABEL[selected.typeCode] ?? selected.typeCode} ·{' '}
                        {processName(selected.processId)} · {selected.date}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(selected)}
                    >
                      Editar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Responsable</dt>
                      <dd>{personName(selected.resolverUserId)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Fecha objetivo</dt>
                      <dd>{selected.targetDate ?? '—'}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Detalle</dt>
                      <dd className="whitespace-pre-wrap">
                        {selected.detail ?? '—'}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Impacto</dt>
                      <dd className="whitespace-pre-wrap">
                        {selected.impact ?? '—'}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-muted-foreground">Resolucion</dt>
                      <dd className="whitespace-pre-wrap">
                        {selected.resolution ?? '—'}
                      </dd>
                    </div>
                  </dl>

                  <Separator />

                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold">Cambiar estado</h3>
                    {nextStates(selected.state).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No hay transiciones disponibles desde este estado.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {nextStates(selected.state).map((to) => (
                          <Button
                            key={to}
                            variant="outline"
                            size="sm"
                            disabled={transitioning}
                            onClick={() => void handleTransition(selected, to)}
                          >
                            {stateLabel(to)}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      )}

      <NovedadFormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setEditing(null);
            setFormError(null);
          }
        }}
        editing={editing}
        processes={processes}
        people={people}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
