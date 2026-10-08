'use client';

import * as React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Process, Request } from '@/lib/api-client';
import {
  RequestError,
  createRequest,
  listRequests,
  updateRequest,
} from '@/lib/requests';
import { requestStateLabel, triageDecisionLabel } from '@/lib/request-state';
import { listProcesses } from '@/lib/team';
import {
  SolicitudFormDialog,
  type SolicitudFormValues,
} from './solicitud-form-dialog';

type LoadState = 'loading' | 'success' | 'error';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date);
}

function messageOf(err: unknown): string {
  return err instanceof RequestError
    ? err.message
    : 'Ocurrio un error inesperado.';
}

/** Convierte un valor de fecha (yyyy-mm-dd) a ISO para el backend, u omite. */
function toIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function SolicitudesView(): React.ReactElement {
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [processes, setProcesses] = React.useState<Process[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Request | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const [reqs, procs] = await Promise.all([
        listRequests(),
        listProcesses().catch(() => [] as Process[]),
      ]);
      setRequests(reqs);
      setProcesses(procs);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(request: Request) {
    setEditing(request);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleSubmit(values: SolicitudFormValues) {
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateRequest(editing.id, {
          title: values.title,
          participantProcessIds: values.participantProcessIds,
          requesterArea: trimOrUndefined(values.requesterArea),
          requesterName: trimOrUndefined(values.requesterName),
          functionalOwner: trimOrUndefined(values.functionalOwner),
          expectedResult: trimOrUndefined(values.expectedResult),
          targetDate: toIso(values.targetDate),
          referenceUrl: trimOrUndefined(values.referenceUrl),
          changeJustification: trimOrUndefined(values.changeJustification),
        });
        toast.success('Solicitud actualizada.');
      } else {
        await createRequest({
          title: values.title,
          mainProcessId: values.mainProcessId,
          participantProcessIds: values.participantProcessIds,
          requesterArea: trimOrUndefined(values.requesterArea),
          requesterName: trimOrUndefined(values.requesterName),
          functionalOwner: trimOrUndefined(values.functionalOwner),
          expectedResult: trimOrUndefined(values.expectedResult),
          targetDate: toIso(values.targetDate),
          referenceUrl: trimOrUndefined(values.referenceUrl),
        });
        toast.success('Solicitud registrada.');
      }
      // Reset solo en el camino de exito (AC-031).
      setDialogOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      // Fallo: conserva el dialog abierto y los valores (AC-031).
      const message = messageOf(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Solicitudes</h1>
          <p className="text-sm text-muted-foreground">
            Registra y edita las solicitudes de la demanda dentro de tu alcance.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus aria-hidden="true" />
          Nueva solicitud
        </Button>
      </header>

      <section aria-live="polite" className="rounded-lg border bg-card">
        {state === 'loading' ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No fue posible comunicarse con el servidor.
            </p>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-medium">No hay solicitudes todavia.</p>
            <p className="text-sm text-muted-foreground">
              Registra la primera solicitud de la demanda.
            </p>
            <Button onClick={openCreate}>
              <Plus aria-hidden="true" />
              Nueva solicitud
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titulo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Triage</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium">{req.title}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {requestStateLabel(req.operationalState)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {req.currentTriageDecision
                      ? triageDecisionLabel(req.currentTriageDecision)
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {req.currentScore !== null && req.currentScore !== undefined
                      ? `${req.currentScore}${
                          req.priorityLabel ? ` (${req.priorityLabel})` : ''
                        }`
                      : '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(req.registeredAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(req)}
                      >
                        Editar
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <SolicitudFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditing(null);
            setFormError(null);
          }
        }}
        editing={editing}
        processes={processes}
        submitting={submitting}
        errorMessage={formError}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
