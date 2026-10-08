'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
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
import type { Request } from '@/lib/api-client';
import {
  ApprovalError,
  createApproval,
  listPendingApproval,
} from '@/lib/approval';
import { Separator } from '@/components/ui/separator';
import { DevolverDialog } from './devolver-dialog';
import { PlanAuthorizationSection } from './plan-authorization-section';

type LoadState = 'loading' | 'success' | 'error';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date);
}

function messageOf(err: unknown): string {
  return err instanceof ApprovalError
    ? err.message
    : 'Ocurrio un error inesperado.';
}

export function RevisionView(): React.ReactElement {
  const [queue, setQueue] = React.useState<Request[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [actingId, setActingId] = React.useState<string | null>(null);

  const [devolver, setDevolver] = React.useState<Request | null>(null);
  const [devolverError, setDevolverError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      const data = await listPendingApproval();
      setQueue(data);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleApprove(request: Request) {
    setActingId(request.id);
    try {
      await createApproval(request.id, { decision: 'APROBAR' });
      toast.success('Solicitud aprobada. Pasa a Comprometida.');
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setActingId(null);
    }
  }

  async function handleDevolver(reason: string) {
    if (!devolver) return;
    setActingId(devolver.id);
    setDevolverError(null);
    try {
      await createApproval(devolver.id, { decision: 'DEVOLVER', reason });
      toast.success('Solicitud devuelta a triage.');
      // Reset solo en exito (AC-031).
      setDevolver(null);
      await load();
    } catch (err) {
      // Fallo (p. ej. 400 motivo faltante): conserva el dialog y los valores.
      const message = messageOf(err);
      setDevolverError(message);
      toast.error(message);
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Revision</h1>
          <p className="text-sm text-muted-foreground">
            Cola de solicitudes priorizadas pendientes de aprobacion del
            compromiso.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw aria-hidden="true" />
          Actualizar
        </Button>
      </header>

      <p className="rounded-md bg-muted p-3 text-sm">
        La decision de compromiso es independiente del guardado de la evaluacion
        (BR-006): aprobar lleva la solicitud a Comprometida; devolver la regresa
        a triage con un motivo.
      </p>

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
        ) : queue.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-medium">
              No hay solicitudes pendientes de aprobacion.
            </p>
            <p className="text-sm text-muted-foreground">
              Las solicitudes priorizadas apareceran aqui para su revision.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titulo</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium">{req.title}</TableCell>
                  <TableCell>
                    {req.currentScore !== null &&
                    req.currentScore !== undefined
                      ? req.currentScore
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {req.priorityLabel ? (
                      <Badge variant="secondary">{req.priorityLabel}</Badge>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(req.registeredAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        disabled={actingId === req.id}
                        onClick={() => void handleApprove(req)}
                      >
                        Aprobar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actingId === req.id}
                        onClick={() => {
                          setDevolverError(null);
                          setDevolver(req);
                        }}
                      >
                        Devolver
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <Separator />

      {/* Fase 3: autorizacion de planes (AÑADIDA; no reemplaza la cola de
          compromiso de arriba). Oculta para quien no tiene capacidad review. */}
      <PlanAuthorizationSection />

      <DevolverDialog
        open={devolver !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDevolver(null);
            setDevolverError(null);
          }
        }}
        requestTitle={devolver?.title ?? ''}
        submitting={actingId !== null && actingId === devolver?.id}
        errorMessage={devolverError}
        onConfirm={handleDevolver}
      />
    </div>
  );
}
