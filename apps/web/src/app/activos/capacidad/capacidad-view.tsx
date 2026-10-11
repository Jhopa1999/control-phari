'use client';
import * as React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Assignment,
  Availability,
  CapacityPerson,
  CapacitySummaryRow,
  Process,
  Request,
} from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
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
import {
  DisponibilidadFormDialog,
  type DisponibilidadFormValues,
} from './disponibilidad-form-dialog';
import {
  AsignacionFormDialog,
  type AsignacionFormValues,
} from './asignacion-form-dialog';
type LoadState = 'loading' | 'success' | 'error';
/** Mes actual en formato YYYY-MM (UTC) para el valor inicial del selector. */
function currentMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
function messageOf(err: unknown): string {
  return err instanceof CapacityError
    ? err.message
    : 'Ocurrio un error inesperado.';
}
function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
function nullOrNumber(value: number | null): string {
  return value === null ? 'â€”' : String(value);
}
/** Porcentaje nullable (utilizacion / utilizacion plan): null -> guion. */
function nullOrPercent(value: number | null): string {
  return value === null ? 'â€”' : `${value}%`;
}
export function CapacidadView(): React.ReactElement {
  const { permissions } = useActor();
  // Un integrante "puro" solo tiene grants INTEGRANTE: puede registrar su
  // propia capacidad y nada mas (el backend reconfirma el alcance; design D8).
  const selfUserId = permissions?.userId ?? null;
  const lockPerson = React.useMemo(() => {
    const grants = permissions?.grants ?? [];
    if (grants.length === 0) return false;
    return grants.every((g) => g.roleCode === 'INTEGRANTE');
  }, [permissions]);
  const [month, setMonth] = React.useState<string>(() => currentMonth());
  const [summary, setSummary] = React.useState<CapacitySummaryRow[]>([]);
  const [availability, setAvailability] = React.useState<Availability[]>([]);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [people, setPeople] = React.useState<CapacityPerson[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  // Dialogos de disponibilidad.
  const [dispOpen, setDispOpen] = React.useState(false);
  const [dispEditing, setDispEditing] = React.useState<Availability | null>(null);
  const [dispSubmitting, setDispSubmitting] = React.useState(false);
  const [dispError, setDispError] = React.useState<string | null>(null);
  // Dialogos de asignacion.
  const [asigOpen, setAsigOpen] = React.useState(false);
  const [asigEditing, setAsigEditing] = React.useState<Assignment | null>(null);
  const [asigSubmitting, setAsigSubmitting] = React.useState(false);
  const [asigError, setAsigError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
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
    void load(month);
  }, [month, load]);
  const processName = React.useCallback(
    (id: string) => processes.find((p) => p.id === id)?.name ?? id,
    [processes],
  );
  const personName = React.useCallback(
    (id: string) => people.find((p) => p.id === id)?.name ?? id,
    [people],
  );
  const requestTitle = React.useCallback(
    (id: string | null) =>
      id ? (requests.find((r) => r.id === id)?.title ?? id) : 'â€”',
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
      // Reset solo en el camino de exito (AC-031).
      setDispOpen(false);
      setDispEditing(null);
      await load(month);
    } catch (err) {
      // Fallo: conserva el dialog abierto y los valores (AC-031).
      const message = messageOf(err);
      setDispError(message);
      toast.error(message);
      // Ante 409, ofrecer editar la existente (SCR-17).
      if (err instanceof CapacityError && err.status === 409 && !dispEditing) {
        const existing = availability.find((a) => a.userId === values.userId);
        if (existing) {
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
  // --- Asignacion ---
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
          // Al editar, "Sin solicitud" (vacio) envia null para DESLIGAR la
          // solicitud actual (design Â§2.2 set/clear), no undefined (que se omite).
          requestId: trimOrUndefined(values.requestId) ?? null,
          committedHours: Number(values.committedHours),
          description: trimOrUndefined(values.description),
        });
        toast.success('Asignacion actualizada.');
      } else {
        await createAssignment({
          userId: values.userId,
          month,
          processId: values.processId,
          requestId: trimOrUndefined(values.requestId),
          committedHours: Number(values.committedHours),
          description: trimOrUndefined(values.description),
        });
        toast.success('Asignacion creada.');
      }
      // Reset solo en el camino de exito (AC-031).
      setAsigOpen(false);
      setAsigEditing(null);
      await load(month);
    } catch (err) {
      // Fallo: conserva el dialog abierto y los valores (AC-031).
      const message = messageOf(err);
      setAsigError(message);
      toast.error(message);
    } finally {
      setAsigSubmitting(false);
    }
  }
  async function handleDeleteAsig(row: Assignment) {
    setDeletingId(row.id);
    try {
      await deleteAssignment(row.id);
      toast.success('Asignacion eliminada.');
      await load(month);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setDeletingId(null);
    }
  }
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Capacidad</h1>
          <p className="text-sm text-muted-foreground">
            Disponibilidad y carga del equipo por mes. Elige un mes para ver el
            resumen y gestionar la capacidad dentro de tu alcance.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="capacidad-month">Mes</Label>
          <Input
            id="capacidad-month"
            type="month"
            className="w-44"
            value={month}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </div>
      </header>
      {/* Explicacion en lenguaje llano (brief / design 4.2). */}
      <section
        aria-label="Como leer el resumen"
        className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground"
      >
        <p>
          La <strong>disponibilidad</strong> son las horas que una persona tiene
          en el mes y se registra una sola vez por persona y mes. Las{' '}
          <strong>asignaciones</strong> de distintos procesos se suman: eso es lo{' '}
          <strong>comprometido</strong>. La <strong>utilizacion</strong> es el
          porcentaje de las horas disponibles que ya estan comprometidas; mas de
          100% significa que hay mas horas asignadas que disponibles
          (sobrecarga). Lo <strong>libre</strong> es lo que queda sin comprometer.
        </p>
        <p className="mt-2">
          Lo <strong>planificado</strong> es una estimacion distinta: suma las
          horas estimadas de las tareas del plan asignadas a la persona ese mes.
          No es lo mismo que lo <strong>comprometido</strong> (horas que se
          registran a mano en asignaciones) y no cambia la senal de sobrecarga; es
          solo una referencia de la carga que proyecta el plan.
        </p>
      </section>
      {/* Resumen de carga por persona */}
      <section aria-labelledby="resumen-heading" className="flex flex-col gap-3">
        <h2 id="resumen-heading" className="text-lg font-semibold tracking-tight">
          Resumen de carga
        </h2>
        <div aria-live="polite" className="rounded-lg border bg-card">
          {state === 'loading' ? (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : state === 'error' ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No fue posible cargar el resumen de capacidad.
              </p>
              <Button variant="outline" onClick={() => void load(month)}>
                <RefreshCw aria-hidden="true" />
                Reintentar
              </Button>
            </div>
          ) : summary.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-sm font-medium">
                Aun no hay disponibilidad ni asignaciones este mes.
              </p>
              <p className="text-sm text-muted-foreground">
                Registra la disponibilidad del equipo y crea asignaciones para
                ver la carga.
              </p>
            </div>
          ) : (
            <Table>
              <caption className="sr-only">
                Resumen de carga por persona para el mes {month}. Incluye las
                horas comprometidas (asignaciones registradas a mano) y las horas
                planificadas (estimacion de las tareas del plan).
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Persona</TableHead>
                  <TableHead scope="col">Disponible</TableHead>
                  <TableHead scope="col">Comprometido</TableHead>
                  <TableHead scope="col">Utilizacion %</TableHead>
                  <TableHead scope="col">Libre</TableHead>
                  <TableHead scope="col">Planificado</TableHead>
                  <TableHead scope="col">Utilizacion plan %</TableHead>
                  <TableHead scope="col">Senal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">{row.userName}</TableCell>
                    <TableCell>{nullOrNumber(row.disponible)}</TableCell>
                    <TableCell>{row.comprometido}</TableCell>
                    <TableCell>{nullOrPercent(row.utilizacion)}</TableCell>
                    <TableCell>{nullOrNumber(row.libre)}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {row.planificado}
                        {row.planSobreDisponible ? (
                          <Badge
                            variant="outline"
                            aria-label="La carga planificada supera las horas disponibles de esta persona este mes; es informativo y no implica sobrecarga comprometida"
                          >
                            Plan &gt; disponible
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>{nullOrPercent(row.utilizacionPlan)}</TableCell>
                    <TableCell>
                      {row.estado === 'SOBRECARGA' ? (
                        <Badge
                          variant="destructive"
                          aria-label="Persona sobrecargada: hay mas horas asignadas que disponibles"
                        >
                          Sobrecarga
                        </Badge>
                      ) : row.estado === 'SIN_DISPONIBILIDAD' ? (
                        <Badge
                          variant="secondary"
                          aria-label="Sin disponibilidad registrada este mes"
                        >
                          Sin disponibilidad
                        </Badge>
                      ) : row.estado === 'CARGA_PARCIAL' ? (
                        <span className="flex flex-col gap-1">
                          <Badge
                            variant="outline"
                            aria-label="Carga parcial: esta persona tiene asignaciones fuera de tu alcance"
                          >
                            Carga parcial
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Esta persona tiene asignaciones en procesos fuera de
                            tu alcance; la carga total la ve el jefe de area.
                          </span>
                        </span>
                      ) : (
                        <Badge variant="secondary" aria-label="Carga dentro de lo disponible">
                          OK
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
      {/* Disponibilidad */}
      <section
        aria-labelledby="disponibilidad-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <h2
            id="disponibilidad-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Disponibilidad
          </h2>
          <Button size="sm" onClick={openCreateDisp} disabled={state === 'loading'}>
            <Plus aria-hidden="true" />
            Registrar disponibilidad
          </Button>
        </div>
        <div className="rounded-lg border bg-card">
          {state === 'success' && availability.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm font-medium">
                Aun no hay disponibilidad este mes.
              </p>
              <Button variant="outline" size="sm" onClick={openCreateDisp}>
                <Plus aria-hidden="true" />
                Registrar disponibilidad
              </Button>
            </div>
          ) : state === 'success' ? (
            <Table>
              <caption className="sr-only">
                Disponibilidad registrada para el mes {month}.
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Persona</TableHead>
                  <TableHead scope="col">Horas disponibles</TableHead>
                  <TableHead scope="col" className="text-right">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {availability.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {personName(row.userId)}
                    </TableCell>
                    <TableCell>{row.availableHours}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDisp(row)}
                        >
                          Editar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4">
              <Skeleton className="h-10 w-full" />
            </div>
          )}
        </div>
      </section>
      {/* Asignaciones */}
      <section aria-labelledby="asignaciones-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2
            id="asignaciones-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Asignaciones
          </h2>
          <Button size="sm" onClick={openCreateAsig} disabled={state === 'loading'}>
            <Plus aria-hidden="true" />
            Nueva asignacion
          </Button>
        </div>
        <div className="rounded-lg border bg-card">
          {state === 'success' && assignments.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm font-medium">
                Aun no hay asignaciones este mes.
              </p>
              <Button variant="outline" size="sm" onClick={openCreateAsig}>
                <Plus aria-hidden="true" />
                Nueva asignacion
              </Button>
            </div>
          ) : state === 'success' ? (
            <Table>
              <caption className="sr-only">
                Asignaciones de horas para el mes {month}.
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Persona</TableHead>
                  <TableHead scope="col">Proceso</TableHead>
                  <TableHead scope="col">Solicitud</TableHead>
                  <TableHead scope="col">Horas</TableHead>
                  <TableHead scope="col">Descripcion</TableHead>
                  <TableHead scope="col" className="text-right">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {personName(row.userId)}
                    </TableCell>
                    <TableCell>{processName(row.processId)}</TableCell>
                    <TableCell>{requestTitle(row.requestId)}</TableCell>
                    <TableCell>{row.committedHours}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {row.description ?? 'â€”'}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditAsig(row)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDeleteAsig(row)}
                          disabled={deletingId === row.id}
                        >
                          {deletingId === row.id ? 'Borrando...' : 'Borrar'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4">
              <Skeleton className="h-10 w-full" />
            </div>
          )}
        </div>
      </section>
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
    </div>
  );
}
