'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DescriptionList } from '@/components/description-list';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { MasterDetail, SelectableList } from '@/components/master-detail';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  CoordinationPerson,
  Issue,
  Process,
  RecordState,
} from '@/lib/api-client';
import { formatDateOnly } from '@/lib/format';
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
  ISSUE_TYPES,
  NovedadFormDialog,
  type NovedadFormValues,
} from './novedad-form-dialog';

type LoadState = 'loading' | 'success' | 'error';

function messageOf(err: unknown): string {
  return err instanceof IssueError
    ? err.message
    : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function typeLabel(code: string | null | undefined): string {
  return ISSUE_TYPES.find((t) => t.value === code)?.label ?? code ?? '—';
}

/** Id del rótulo del grupo de transiciones (aria-labelledby). */
const TRANSITIONS_LABEL_ID = 'nov-transiciones';

// Sin códigos internos visibles (design §13.1): si el proceso o la persona no
// vienen en las listas del alcance del actor, se nombra el caso en vez del id.
const OUT_OF_SCOPE_PROCESS = 'Proceso fuera de tu alcance';
const OUT_OF_SCOPE_PERSON = 'Persona fuera de tu alcance';

export function NovedadesView(): React.ReactElement {
  const [issues, setIssues] = React.useState<Issue[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [people, setPeople] = React.useState<CoordinationPerson[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Issue | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  // Destino en curso: su botón muestra el spinner y los demás se deshabilitan.
  const [transitioningTo, setTransitioningTo] = React.useState<RecordState | null>(null);

  // Destinos del foco: el encabezado del detalle (MasterDetail en <1024 px y
  // tras una transición, cuando el botón pulsado desaparece; NIT 4).
  const detailHeadingRef = React.useRef<HTMLHeadingElement>(null);

  const loadData = React.useCallback(() => {
    return Promise.all([
      listIssues(),
      listProcesses().catch(() => [] as Process[]),
      listCoordinationPeople().catch(() => [] as CoordinationPerson[]),
    ])
      .then(([iss, procs, ppl]) => {
        setIssues(iss);
        setProcesses(procs);
        setPeople(ppl);
        setLoadError(null);
        setState('success');
        // Mantiene la selección si sigue existiendo; si no, toma la primera.
        setSelectedId((prev) => {
          if (prev && iss.some((i) => i.id === prev)) return prev;
          return iss[0]?.id ?? null;
        });
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof IssueError ? err.message : null);
        setState('error');
      });
  }, []);
  const load = React.useCallback(async () => {
    setState('loading');
    await loadData();
  }, [loadData]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const selected = React.useMemo(
    () => issues.find((i) => i.id === selectedId) ?? null,
    [issues, selectedId],
  );

  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PROCESS,
    [processes],
  );
  const personName = React.useCallback(
    (id: string | null) =>
      id ? (people.find((p) => p.id === id)?.name ?? OUT_OF_SCOPE_PERSON) : null,
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
        // Al editar no se envían proceso ni fecha.
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
    setTransitioningTo(toState);
    try {
      await transitionIssue(issue.id, { toState });
      toast.success(`Novedad movida a ${stateLabel(toState)}.`);
      await load();
      // El botón pulsado ya no existe con el nuevo estado: el foco va al
      // encabezado del detalle si se perdió (NIT 4).
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!active || active === document.body) detailHeadingRef.current?.focus();
      });
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setTransitioningTo(null);
    }
  }

  function renderDetail(): React.ReactNode {
    if (state === 'loading' && !selected) {
      return (
        <Card aria-hidden="true" className="flex flex-col gap-4 p-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </Card>
      );
    }
    if (!selected) {
      return (
        <Card>
          <EmptyState
            title="Selecciona una novedad para ver su ficha."
            description="O crea una nueva para registrar un bloqueo o incidente."
          />
        </Card>
      );
    }
    const targets = nextStates(selected.state);
    return (
      <Card>
        <CardHeader className="gap-3 border-b sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                ref={detailHeadingRef}
                tabIndex={-1}
                className="rounded-sm text-lg font-semibold wrap-break-word focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {selected.title}
              </h2>
              <StatusBadge kind="record" value={selected.state} />
            </div>
            <p className="text-meta text-muted-foreground">
              {typeLabel(selected.typeCode)} · {processName(selected.processId)} ·{' '}
              {formatDateOnly(selected.date)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openEdit(selected)}
            >
              Editar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 pt-4">
          <DescriptionList
            columns={2}
            items={[
              { term: 'Responsable', value: personName(selected.resolverUserId) },
              {
                term: 'Fecha objetivo',
                value: selected.targetDate ? formatDateOnly(selected.targetDate) : null,
              },
              { term: 'Detalle', value: selected.detail, span: 2 },
              { term: 'Impacto', value: selected.impact, span: 2 },
              { term: 'Resolución', value: selected.resolution, span: 2 },
            ]}
          />

          <div className="flex flex-col gap-2 border-t pt-4">
            <h3 id={TRANSITIONS_LABEL_ID} className="text-sm font-semibold">
              Cambiar estado a:
            </h3>
            {targets.length === 0 ? (
              <p className="text-meta text-muted-foreground">
                No hay transiciones disponibles desde este estado.
              </p>
            ) : (
              <div
                role="group"
                aria-labelledby={TRANSITIONS_LABEL_ID}
                className="flex flex-wrap gap-2"
              >
                {targets.map((to) => (
                  <Button
                    key={to}
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={transitioningTo === to}
                    disabled={transitioningTo !== null}
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
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Novedades"
        description="Bloqueos, incidentes y solicitudes de apoyo. Cada incidente es un solo registro que se actualiza hasta resolverlo."
        actions={
          <Button type="button" onClick={openCreate} disabled={state === 'loading'}>
            <Plus aria-hidden="true" />
            Nueva novedad
          </Button>
        }
      />

      {state === 'error' ? (
        <div className="rounded-lg border bg-card">
          <ErrorState
            title="No fue posible cargar las novedades."
            message={loadError}
            onRetry={() => void load()}
          />
        </div>
      ) : (
        <MasterDetail
          listTitle="Novedades"
          detailHeadingRef={detailHeadingRef}
          list={
            <SelectableList
              label="Novedades"
              loading={state === 'loading' && issues.length === 0}
              selectedId={selectedId}
              onSelect={setSelectedId}
              items={issues.map((issue) => ({
                id: issue.id,
                title: issue.title,
                meta: `${typeLabel(issue.typeCode)} · ${processName(issue.processId)}`,
                badge: <StatusBadge kind="record" value={issue.state} />,
              }))}
              empty={{
                title: 'Aún no hay novedades.',
                description: 'Registra un bloqueo, un incidente o una solicitud de apoyo.',
                action: (
                  <Button type="button" variant="outline" size="sm" onClick={openCreate}>
                    <Plus aria-hidden="true" />
                    Nueva novedad
                  </Button>
                ),
              }}
            />
          }
          detail={renderDetail()}
        />
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
    </PageLayout>
  );
}
