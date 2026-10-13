'use client';

import * as React from 'react';
import { CalendarClock, ChevronRight, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SortableTableHead } from '@/components/data-table';
import { DataView, type DataViewState } from '@/components/data-view';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RowActions, RowActionsCell } from '@/components/row-actions';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Toolbar } from '@/components/toolbar';
import { UtilizationBar } from '@/components/utilization-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Assignment,
  Availability,
  CapacityPerson,
  CapacitySummaryRow,
  Process,
  Request,
} from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { formatHours, formatMonth, localMonthInputValue, orDash } from '@/lib/format';
import {
  CapacityError,
  createAssignment,
  createAvailability,
  deleteAssignment,
  listAssignments,
  listAvailability,
  listCapacityPeople,
  listCapacitySummary,
  updateAssignment,
  updateAvailability,
} from '@/lib/capacity';
import { listProcesses } from '@/lib/team';
import { listRequests } from '@/lib/requests';
import { compareNumber, compareText, type Comparator } from '@/lib/table-sort';
import { useClientTable } from '@/lib/use-client-table';
import { cn } from '@/lib/utils';
import {
  DisponibilidadFormDialog,
  type DisponibilidadFormValues,
} from './disponibilidad-form-dialog';
import {
  AsignacionFormDialog,
  type AsignacionFormValues,
} from './asignacion-form-dialog';

type LoadState = 'loading' | 'success' | 'error';
type SummarySortKey = 'person' | 'utilization' | 'planUtilization';

const SUMMARY_COMPARATORS: Record<SummarySortKey, Comparator<CapacitySummaryRow>> = {
  person: (a, b, direction) => compareText(a.userName, b.userName, direction),
  utilization: (a, b, direction) => compareNumber(a.utilizacion, b.utilizacion, direction),
  planUtilization: (a, b, direction) =>
    compareNumber(a.utilizacionPlan, b.utilizacionPlan, direction),
};

/** Explicación de la señal para lectores de pantalla (Carga parcial ya la muestra visible). */
const SIGNAL_DESCRIPTIONS: Record<CapacitySummaryRow['estado'], string | undefined> = {
  OK: 'la carga comprometida está dentro de lo disponible',
  SOBRECARGA: 'hay más horas asignadas que disponibles',
  SIN_DISPONIBILIDAD: 'no hay disponibilidad registrada este mes',
  CARGA_PARCIAL: undefined,
};

function messageOf(err: unknown): string {
  return err instanceof CapacityError ? err.message : 'Ocurrió un error inesperado.';
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function hoursOrDash(value: number | null): string {
  return value === null ? orDash(value) : formatHours(value);
}

function assignmentActionId(id: string): string {
  return `asig-editar-${id}`;
}

export function CapacidadView(): React.ReactElement {
  const { permissions } = useActor();

  // Un integrante "puro" solo tiene grants INTEGRANTE: puede registrar su
  // propia capacidad y nada más (el backend reconfirma el alcance; design D8).
  const selfUserId = permissions?.userId ?? null;
  const lockPerson = React.useMemo(() => {
    const grants = permissions?.grants ?? [];
    if (grants.length === 0) return false;
    return grants.every((g) => g.roleCode === 'INTEGRANTE');
  }, [permissions]);

  // Mes local del usuario (design §7.9, regla 2), calculado tras el montaje: el
  // inicializador de useState también corre al prerenderizar en el servidor y
  // dejaría el mes del build y la zona del servidor. Mientras vale '' no se
  // carga nada y el campo muestra un Skeleton.
  const [month, setMonth] = React.useState<string>('');
  React.useEffect(() => {
    setMonth((v) => v || localMonthInputValue());
  }, []);

  const [summary, setSummary] = React.useState<CapacitySummaryRow[]>([]);
  const [availability, setAvailability] = React.useState<Availability[]>([]);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [people, setPeople] = React.useState<CapacityPerson[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');

  // Diálogos de disponibilidad.
  const [dispOpen, setDispOpen] = React.useState(false);
  const [dispEditing, setDispEditing] = React.useState<Availability | null>(null);
  const [dispSubmitting, setDispSubmitting] = React.useState(false);
  const [dispError, setDispError] = React.useState<string | null>(null);

  // Diálogos de asignación.
  const [asigOpen, setAsigOpen] = React.useState(false);
  const [asigEditing, setAsigEditing] = React.useState<Assignment | null>(null);
  const [asigSubmitting, setAsigSubmitting] = React.useState(false);
  const [asigError, setAsigError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // Confirmación de «Eliminar» y destino del foco si la fila desaparece (NIT 4).
  // El destino se conserva al cerrar para que el título no se vacíe durante la
  // animación de salida.
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmTarget, setConfirmTarget] = React.useState<Assignment | null>(null);
  const focusAfterDeleteRef = React.useRef<string | null>(null);
  const assignmentsHeadingRef = React.useRef<HTMLHeadingElement>(null);

  const load = React.useCallback(async (targetMonth: string) => {
    setState('loading');
    try {
      const [sum, avail, asig, ppl, procs, reqs] = await Promise.all([
        listCapacitySummary(targetMonth),
        listAvailability(targetMonth),
        listAssignments(targetMonth),
        listCapacityPeople().catch(() => [] as CapacityPerson[]),
        listProcesses().catch(() => [] as Process[]),
        listRequests().catch(() => [] as Request[]),
      ]);
      setSummary(sum);
      setAvailability(avail);
      setAssignments(asig);
      setPeople(ppl);
      setProcesses(procs);
      setRequests(reqs);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    if (!month) return;
    void load(month);
  }, [month, load]);

  // Resumen: todas las personas (pageSize null, §24.1), orden de la API por defecto.
  const summaryTable = useClientTable({
    rows: summary,
    comparators: SUMMARY_COMPARATORS,
    defaultSort: null,
    pageSize: null,
  });

  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? id,
    [processes],
  );
  const personName = React.useCallback(
    (id: string) => people.find((p) => p.id === id)?.name ?? id,
    [people],
  );
  const requestTitle = React.useCallback(
    (id: string | null) => (id ? (requests.find((r) => r.id === id)?.title ?? id) : orDash(id)),
    [requests],
  );

  // --- Disponibilidad ---
  function openCreateDisp() {
    setDispEditing(null);
    setDispError(null);
    setDispOpen(true);
  }
  function openEditDisp(row: Availability) {
    setDispEditing(row);
    setDispError(null);
    setDispOpen(true);
  }

  async function handleDispSubmit(values: DisponibilidadFormValues) {
    setDispSubmitting(true);
    setDispError(null);
    try {
      if (dispEditing) {
        await updateAvailability(dispEditing.id, {
          availableHours: Number(values.availableHours),
        });
        toast.success('Disponibilidad actualizada.');
      } else {
        await createAvailability({
          userId: values.userId,
          month,
          availableHours: Number(values.availableHours),
        });
        toast.success('Disponibilidad registrada.');
      }
      // Reset solo en el camino de éxito (AC-031).
      setDispOpen(false);
      setDispEditing(null);
      await load(month);
    } catch (err) {
      // Fallo: conserva el diálogo abierto y los valores (AC-031).
      const message = messageOf(err);
      setDispError(message);
      toast.error(message);
      // Ante 409, ofrecer editar la existente (SCR-17). Se cierra el diálogo de
      // alta: su overlay modal taparía la acción del toast y dos diálogos a la
      // vez rompen la reconciliación. El toast explica el motivo y la acción
      // reabre el diálogo ya en modo edición.
      if (err instanceof CapacityError && err.status === 409 && !dispEditing) {
        const existing = availability.find((a) => a.userId === values.userId);
        if (existing) {
          setDispOpen(false);
          setDispEditing(null);
          toast('Ya hay disponibilidad para esa persona y mes.', {
            action: {
              label: 'Editar la existente',
              onClick: () => openEditDisp(existing),
            },
          });
        }
      }
    } finally {
      setDispSubmitting(false);
    }
  }

  // --- Asignación ---
  function openCreateAsig() {
    setAsigEditing(null);
    setAsigError(null);
    setAsigOpen(true);
  }
  function openEditAsig(row: Assignment) {
    setAsigEditing(row);
    setAsigError(null);
    setAsigOpen(true);
  }

  async function handleAsigSubmit(values: AsignacionFormValues) {
    setAsigSubmitting(true);
    setAsigError(null);
    try {
      if (asigEditing) {
        await updateAssignment(asigEditing.id, {
          processId: values.processId,
          // Al editar, "Sin solicitud" (vacío) envía null para DESLIGAR la
          // solicitud actual (design §2.2 set/clear), no undefined (que se omite).
          requestId: trimOrUndefined(values.requestId) ?? null,
          committedHours: Number(values.committedHours),
          description: trimOrUndefined(values.description),
        });
        toast.success('Asignación actualizada.');
      } else {
        await createAssignment({
          userId: values.userId,
          month,
          processId: values.processId,
          requestId: trimOrUndefined(values.requestId),
          committedHours: Number(values.committedHours),
          description: trimOrUndefined(values.description),
        });
        toast.success('Asignación creada.');
      }
      // Reset solo en el camino de éxito (AC-031).
      setAsigOpen(false);
      setAsigEditing(null);
      await load(month);
    } catch (err) {
      // Fallo: conserva el diálogo abierto y los valores (AC-031).
      const message = messageOf(err);
      setAsigError(message);
      toast.error(message);
    } finally {
      setAsigSubmitting(false);
    }
  }

  function requestDeleteAsig(row: Assignment) {
    // Si la fila desaparece, el foco pasa a la fila siguiente (o a la anterior
    // si era la última) y, sin filas, al encabezado de la sección (NIT 4).
    const index = assignments.findIndex((a) => a.id === row.id);
    const neighbour = assignments[index + 1] ?? assignments[index - 1] ?? null;
    focusAfterDeleteRef.current = neighbour?.id ?? null;
    setConfirmTarget(row);
    setConfirmOpen(true);
  }

  async function handleDeleteAsig(row: Assignment) {
    setDeletingId(row.id);
    try {
      await deleteAssignment(row.id);
      toast.success('Asignación eliminada.');
      await load(month);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setDeletingId(null);
    }
  }

  const returnFocusAfterDelete = React.useCallback((): HTMLElement | null => {
    const neighbourId = focusAfterDeleteRef.current;
    const neighbour = neighbourId ? document.getElementById(assignmentActionId(neighbourId)) : null;
    return neighbour ?? assignmentsHeadingRef.current;
  }, []);

  function sectionState(isEmpty: boolean): DataViewState {
    if (state === 'loading') return 'loading';
    if (state === 'error') return 'error';
    return isEmpty ? 'empty' : 'ready';
  }

  const retry = () => void load(month);

  return (
    <PageLayout>
      <PageHeader
        title="Capacidad"
        description="Disponibilidad y carga del equipo por mes, dentro de tu alcance."
      />

      <Toolbar label="Mes de capacidad">
        <div className="grid w-full gap-1.5 sm:w-auto">
          <Label htmlFor="capacidad-month">Mes</Label>
          {month ? (
            <Input
              id="capacidad-month"
              type="month"
              className="w-full sm:w-44"
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
              }}
            />
          ) : (
            <Skeleton className="h-9 w-full sm:w-44" />
          )}
        </div>
      </Toolbar>

      {/* Explicación en lenguaje llano (design §11.11), cerrada por defecto. */}
      <details className="group rounded-lg border bg-card text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
            aria-hidden="true"
          />
          ¿Cómo se calcula?
        </summary>
        <div className="flex max-w-prose flex-col gap-2 px-4 pb-4 text-muted-foreground">
          <p>
            La <strong className="text-foreground">disponibilidad</strong> son las horas que una
            persona tiene en el mes y se registra una sola vez por persona y mes. Las{' '}
            <strong className="text-foreground">asignaciones</strong> de distintos procesos se
            suman: eso es lo <strong className="text-foreground">comprometido</strong>. La{' '}
            <strong className="text-foreground">utilización</strong> es el porcentaje de las horas
            disponibles que ya están comprometidas; más de 100&nbsp;% significa que hay más horas
            asignadas que disponibles (sobrecarga). Lo{' '}
            <strong className="text-foreground">libre</strong> es lo que queda sin comprometer.
          </p>
          <p>
            Lo <strong className="text-foreground">planificado</strong> es una estimación
            distinta: suma las horas estimadas de las tareas del plan asignadas a la persona ese
            mes. No es lo mismo que lo <strong className="text-foreground">comprometido</strong>{' '}
            (horas que se registran a mano en asignaciones) y no cambia la señal de sobrecarga; es
            solo una referencia de la carga que proyecta el plan.
          </p>
        </div>
      </details>

      <Section title="Resumen de carga">
        <DataView
          state={sectionState(summary.length === 0)}
          loading={{ rows: 4, columns: 8 }}
          error={{
            title: 'No fue posible cargar el resumen de capacidad.',
            onRetry: retry,
          }}
          empty={{
            icon: Users,
            title: 'Aún no hay disponibilidad ni asignaciones este mes.',
            description:
              'Registra la disponibilidad del equipo y crea asignaciones para ver la carga.',
          }}
        >
          <Table scrollLabel="Tabla del resumen de carga">
            <TableCaption>
              {`Resumen de carga por persona para ${month ? formatMonth(month) : 'el mes elegido'}. Incluye las horas comprometidas (asignaciones registradas a mano) y las horas planificadas (estimación de las tareas del plan).`}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  label="Persona"
                  sortKey="person"
                  sort={summaryTable.sort}
                  onSort={summaryTable.toggleSort}
                />
                <TableHead scope="col" className="text-right tabular-nums">
                  Disponible
                </TableHead>
                <TableHead scope="col" className="text-right tabular-nums">
                  Comprometido
                </TableHead>
                <SortableTableHead
                  label="Utilización"
                  sortKey="utilization"
                  sort={summaryTable.sort}
                  onSort={summaryTable.toggleSort}
                />
                <TableHead scope="col" className="text-right tabular-nums">
                  Libre
                </TableHead>
                <TableHead scope="col" className="text-right tabular-nums">
                  Planificado
                </TableHead>
                <SortableTableHead
                  label="Utilización plan"
                  sortKey="planUtilization"
                  sort={summaryTable.sort}
                  onSort={summaryTable.toggleSort}
                />
                <TableHead scope="col">Señal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryTable.pageRows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell className="min-w-40 font-medium">{row.userName}</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {hoursOrDash(row.disponible)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatHours(row.comprometido)}
                  </TableCell>
                  <TableCell>
                    <UtilizationBar
                      value={row.utilizacion}
                      tone={row.sobrecargado ? 'danger' : 'default'}
                      label="Utilización"
                    />
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right whitespace-nowrap tabular-nums',
                      row.libre !== null && row.libre < 0 && 'text-danger',
                    )}
                  >
                    {hoursOrDash(row.libre)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    <span className="inline-flex items-center justify-end gap-2">
                      {formatHours(row.planificado)}
                      {row.planSobreDisponible ? (
                        <>
                          <Badge variant="warning">Plan supera lo disponible</Badge>
                          <span className="sr-only">
                            : la carga planificada supera las horas disponibles de esta persona
                            este mes; es informativo y no implica sobrecarga comprometida
                          </span>
                        </>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    <UtilizationBar
                      value={row.utilizacionPlan}
                      tone={row.planSobreDisponible ? 'warning' : 'default'}
                      label="Utilización plan"
                    />
                  </TableCell>
                  <TableCell className="min-w-36">
                    {row.estado === 'CARGA_PARCIAL' ? (
                      <span className="flex flex-col items-start gap-1 py-1">
                        <StatusBadge kind="capacity" value={row.estado} />
                        <span className="max-w-64 text-meta text-muted-foreground">
                          Esta persona tiene asignaciones en procesos fuera de tu alcance; la
                          carga total la ve el jefe de área.
                        </span>
                      </span>
                    ) : (
                      <StatusBadge
                        kind="capacity"
                        value={row.estado}
                        srDescription={SIGNAL_DESCRIPTIONS[row.estado]}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataView>
      </Section>

      <Section
        title="Disponibilidad"
        actions={
          <Button size="sm" onClick={openCreateDisp} disabled={state === 'loading'}>
            <Plus aria-hidden="true" />
            Registrar disponibilidad
          </Button>
        }
      >
        <DataView
          state={sectionState(availability.length === 0)}
          loading={{ rows: 2, columns: 3 }}
          error={{
            title: 'No fue posible cargar la disponibilidad.',
            onRetry: retry,
            size: 'compact',
          }}
          empty={{
            icon: CalendarClock,
            title: 'Aún no hay disponibilidad este mes.',
            description: 'Registra las horas que cada persona tiene en el mes.',
            size: 'compact',
            action: (
              <Button variant="outline" size="sm" onClick={openCreateDisp}>
                <Plus aria-hidden="true" />
                Registrar disponibilidad
              </Button>
            ),
          }}
        >
          <Table scrollLabel="Tabla de disponibilidad">
            <TableCaption>
              {`Disponibilidad registrada para ${month ? formatMonth(month) : 'el mes elegido'}.`}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Persona</TableHead>
                <TableHead scope="col" className="text-right tabular-nums">
                  Horas disponibles
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {availability.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="min-w-40 font-medium">{personName(row.userId)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatHours(row.availableHours)}
                  </TableCell>
                  <RowActionsCell>
                    <RowActions
                      rowLabel={personName(row.userId)}
                      actions={[
                        { key: 'edit', label: 'Editar', onSelect: () => openEditDisp(row) },
                      ]}
                    />
                  </RowActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataView>
      </Section>

      <Section
        title="Asignaciones"
        headingRef={assignmentsHeadingRef}
        actions={
          <Button size="sm" onClick={openCreateAsig} disabled={state === 'loading'}>
            <Plus aria-hidden="true" />
            Nueva asignación
          </Button>
        }
      >
        <DataView
          state={sectionState(assignments.length === 0)}
          loading={{ rows: 3, columns: 6 }}
          error={{
            title: 'No fue posible cargar las asignaciones.',
            onRetry: retry,
            size: 'compact',
          }}
          empty={{
            icon: CalendarClock,
            title: 'Aún no hay asignaciones este mes.',
            description: 'Asigna horas de una persona a un proceso o a una solicitud.',
            size: 'compact',
            action: (
              <Button variant="outline" size="sm" onClick={openCreateAsig}>
                <Plus aria-hidden="true" />
                Nueva asignación
              </Button>
            ),
          }}
        >
          <Table scrollLabel="Tabla de asignaciones">
            <TableCaption>
              {`Asignaciones de horas para ${month ? formatMonth(month) : 'el mes elegido'}.`}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Persona</TableHead>
                <TableHead scope="col">Proceso</TableHead>
                <TableHead scope="col">Solicitud</TableHead>
                <TableHead scope="col" className="text-right tabular-nums">
                  Horas
                </TableHead>
                <TableHead scope="col">Descripción</TableHead>
                <TableHead scope="col" className="text-right">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="min-w-40 font-medium">{personName(row.userId)}</TableCell>
                  <TableCell className="min-w-32">{processName(row.processId)}</TableCell>
                  <TableCell className="min-w-48 max-w-[24rem]">
                    <span className="line-clamp-2" title={requestTitle(row.requestId)}>
                      {requestTitle(row.requestId)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatHours(row.committedHours)}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    <span title={row.description ?? undefined}>{orDash(row.description)}</span>
                  </TableCell>
                  <RowActionsCell>
                    <RowActions
                      rowLabel={personName(row.userId)}
                      actions={[
                        {
                          key: 'edit',
                          id: assignmentActionId(row.id),
                          label: 'Editar',
                          onSelect: () => openEditAsig(row),
                        },
                        {
                          key: 'delete',
                          label: 'Eliminar',
                          tone: 'danger',
                          busy: deletingId === row.id,
                          busyLabel: 'Eliminando…',
                          onSelect: () => requestDeleteAsig(row),
                        },
                      ]}
                    />
                  </RowActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataView>
      </Section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          confirmTarget
            ? `¿Eliminar la asignación de ${personName(confirmTarget.userId)} (${formatHours(confirmTarget.committedHours)})?`
            : ''
        }
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar asignación"
        busy={confirmTarget !== null && deletingId === confirmTarget.id}
        onConfirm={async () => {
          if (confirmTarget) await handleDeleteAsig(confirmTarget);
        }}
        returnFocusTo={returnFocusAfterDelete}
      />

      <DisponibilidadFormDialog
        open={dispOpen}
        onOpenChange={(open) => {
          setDispOpen(open);
          if (!open) {
            setDispEditing(null);
            setDispError(null);
          }
        }}
        month={month}
        editing={dispEditing}
        people={people}
        lockPerson={lockPerson}
        selfUserId={selfUserId}
        submitting={dispSubmitting}
        errorMessage={dispError}
        onSubmit={handleDispSubmit}
      />

      <AsignacionFormDialog
        open={asigOpen}
        onOpenChange={(open) => {
          setAsigOpen(open);
          if (!open) {
            setAsigEditing(null);
            setAsigError(null);
          }
        }}
        month={month}
        editing={asigEditing}
        people={people}
        processes={processes}
        requests={requests}
        lockPerson={lockPerson}
        selfUserId={selfUserId}
        submitting={asigSubmitting}
        errorMessage={asigError}
        onSubmit={handleAsigSubmit}
      />
    </PageLayout>
  );
}
