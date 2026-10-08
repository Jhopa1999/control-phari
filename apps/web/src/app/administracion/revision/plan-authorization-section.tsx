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
import type { Plan, Request } from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { PlanError, authorizePlan, getPlan, returnPlan } from '@/lib/plan';
import { listRequests } from '@/lib/requests';
import { DevolverDialog } from './devolver-dialog';

type LoadState = 'loading' | 'success' | 'error';

interface PlanRow {
  plan: Plan;
  request: Request;
}

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrio un error inesperado.';
}

/**
 * Seccion de autorizacion de planes en EN_AUTORIZACION dentro del alcance.
 * Se AÑADE a la pantalla de revision sin tocar la cola de compromiso de Fase 2.
 * El usuario sin capacidad `review` no ve la seccion (filtrado cosmetico; el
 * control real es server-side: autorizar/devolver exige rol review).
 */
export function PlanAuthorizationSection(): React.ReactElement | null {
  const { permissions, actorId } = useActor();
  const canReview = React.useMemo(
    () => new Set(permissions?.allowedModules ?? []).has('review'),
    [permissions],
  );

  const [rows, setRows] = React.useState<PlanRow[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [actingId, setActingId] = React.useState<string | null>(null);

  const [devolver, setDevolver] = React.useState<PlanRow | null>(null);
  const [devolverError, setDevolverError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      // No existe un endpoint de "planes pendientes"; se derivan de las
      // solicitudes EN_PLANIFICACION en alcance y se filtra por estado del plan.
      const requests = await listRequests({ state: 'EN_PLANIFICACION' });
      const settled = await Promise.allSettled(
        requests.map(async (request) => {
          const plan = await getPlan(request.id);
          return { plan, request };
        }),
      );
      const pending = settled
        .filter(
          (r): r is PromiseFulfilledResult<PlanRow> =>
            r.status === 'fulfilled' &&
            r.value.plan.status === 'EN_AUTORIZACION',
        )
        .map((r) => r.value);
      setRows(pending);
      setState('success');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => {
    if (canReview) void load();
  }, [canReview, load, actorId]);

  async function handleAuthorize(row: PlanRow) {
    setActingId(row.plan.id);
    try {
      await authorizePlan(row.request.id);
      toast.success('Plan autorizado. La solicitud pasa a En ejecucion.');
      await load();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setActingId(null);
    }
  }

  async function handleReturn(reason: string) {
    if (!devolver) return;
    setActingId(devolver.plan.id);
    setDevolverError(null);
    try {
      await returnPlan(devolver.request.id, { reason });
      toast.success('Plan devuelto para correccion.');
      // Reset solo en exito (AC-031).
      setDevolver(null);
      await load();
    } catch (err) {
      const message = messageOf(err);
      setDevolverError(message);
      toast.error(message);
    } finally {
      setActingId(null);
    }
  }

  if (!canReview) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Autorizacion de planes</h2>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw aria-hidden="true" />
          Actualizar
        </Button>
      </div>
      <p className="rounded-md bg-muted p-3 text-sm">
        Planes enviados a autorizacion. Autorizar lleva la solicitud a En
        ejecucion; devolver la regresa a edicion con un motivo.
      </p>

      <div aria-live="polite" className="rounded-lg border bg-card">
        {state === 'loading' ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : state === 'error' ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No fue posible cargar los planes.
            </p>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm font-medium">
              No hay planes pendientes de autorizacion.
            </p>
            <p className="text-sm text-muted-foreground">
              Los planes enviados a autorizacion apareceran aqui.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Solicitud</TableHead>
                <TableHead>Estado del plan</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.plan.id}>
                  <TableCell className="font-medium">
                    {row.request.title}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">En autorizacion</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        disabled={actingId === row.plan.id}
                        onClick={() => void handleAuthorize(row)}
                      >
                        Autorizar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actingId === row.plan.id}
                        onClick={() => {
                          setDevolverError(null);
                          setDevolver(row);
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
      </div>

      <DevolverDialog
        open={devolver !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDevolver(null);
            setDevolverError(null);
          }
        }}
        requestTitle={devolver?.request.title ?? ''}
        submitting={actingId !== null && actingId === devolver?.plan.id}
        errorMessage={devolverError}
        onConfirm={handleReturn}
      />
    </section>
  );
}
