'use client';

import * as React from 'react';
import { ChartGantt, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { CellTitle } from '@/components/data-table';
import { DataView, type DataViewState } from '@/components/data-view';
import { InlineNotice } from '@/components/inline-notice';
import { RowActions, RowActionsCell, type RowAction } from '@/components/row-actions';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
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
import { focusTargetAfterRemoval } from './row-focus';

type LoadState = 'loading' | 'success' | 'error';

interface PlanRow {
  plan: Plan;
  request: Request;
}

function messageOf(err: unknown): string {
  return err instanceof PlanError ? err.message : 'Ocurrió un error inesperado.';
}

/**
 * Planes por autorizar (design §11.8): planes EN_AUTORIZACION dentro del
 * alcance, derivados de las solicitudes EN_PLANIFICACION. Quien no tiene el
 * módulo `review` no ve la sección (filtrado cosmético; autorizar y devolver
 * exigen el rol en el servidor). Recarga al cambiar de actor.
 */
export function PlanAuthorizationSection(): React.ReactElement | null {
  const { allowedModules, actorId } = useActor();
  const canReview = allowedModules.has('review');
  const planAllowed = allowedModules.has('plan');

  const [rows, setRows] = React.useState<PlanRow[]>([]);
  const [state, setState] = React.useState<LoadState>('loading');
  const [actingId, setActingId] = React.useState<string | null>(null);
  const [authorizingId, setAuthorizingId] = React.useState<string | null>(null);

  const [devolver, setDevolver] = React.useState<PlanRow | null>(null);
  const [devolverError, setDevolverError] = React.useState<string | null>(null);
  const rowIndexRef = React.useRef(0);
  const bodyRef = React.useRef<HTMLTableSectionElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const load = React.useCallback(async () => {
    setState('loading');
    try {
      // No existe un endpoint de «planes pendientes»: se derivan de las
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
            r.status === 'fulfilled' && r.value.plan.status === 'EN_AUTORIZACION',
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

  const returnFocusTo = React.useCallback(
    () => focusTargetAfterRemoval(bodyRef.current, rowIndexRef.current, headingRef.current),
    [],
  );

  async function handleAuthorize(row: PlanRow, index: number): Promise<void> {
    setActingId(row.plan.id);
    setAuthorizingId(row.plan.id);
    try {
      await authorizePlan(row.request.id);
      toast.success('Plan autorizado. La solicitud pasa a En ejecución.');
      await load();
      // La fila ya no está: tras pintar la tabla, el foco pasa a la siguiente.
      rowIndexRef.current = index;
      requestAnimationFrame(() => requestAnimationFrame(() => returnFocusTo()?.focus()));
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setActingId(null);
      setAuthorizingId(null);
    }
  }

  async function handleReturn(reason: string): Promise<void> {
    if (!devolver) return;
    setActingId(devolver.plan.id);
    setDevolverError(null);
    try {
      await returnPlan(devolver.request.id, { reason });
      toast.success('Plan devuelto para corrección.');
      // Se recarga antes de cerrar para que el foco vaya a returnFocusTo.
      // Reset solo en éxito (AC-031).
      await load();
      setDevolver(null);
    } catch (err) {
      const message = messageOf(err);
      setDevolverError(message);
      toast.error(message);
    } finally {
      setActingId(null);
    }
  }

  if (!canReview) return null;

  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  else if (rows.length === 0) viewState = 'empty';
  else viewState = 'ready';

  function rowActions(row: PlanRow, index: number): RowAction[] {
    const acting = actingId === row.plan.id;
    const actions: RowAction[] = [
      {
        key: 'authorize',
        label: 'Autorizar',
        onSelect: () => void handleAuthorize(row, index),
        busy: authorizingId === row.plan.id,
        busyLabel: 'Autorizando…',
        disabled: acting,
        placement: 'inline',
      },
      {
        key: 'return',
        label: 'Devolver',
        onSelect: () => {
          rowIndexRef.current = index;
          setDevolverError(null);
          setDevolver(row);
        },
        disabled: acting,
        placement: 'inline',
      },
    ];
    if (planAllowed) {
      actions.push({
        key: 'plan',
        label: 'Ver plan',
        href: `/seguimiento/plan?requestId=${encodeURIComponent(row.request.id)}`,
        placement: 'menu',
      });
    }
    return actions;
  }

  return (
    <Section
      title="Planes por autorizar"
      count={state === 'success' ? rows.length : undefined}
      headingRef={headingRef}
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw aria-hidden="true" />
          Actualizar
        </Button>
      }
    >
      <InlineNotice tone="info" className="py-2">
        Autorizar lleva la solicitud a En ejecución; devolver regresa el plan a edición con un motivo.
      </InlineNotice>
      <DataView
        state={viewState}
        loading={{ rows: 3, columns: 3 }}
        error={{
          title: 'No fue posible cargar los planes.',
          onRetry: () => void load(),
        }}
        empty={{
          icon: ChartGantt,
          title: 'No hay planes pendientes de autorización.',
          description: 'Los planes enviados a autorización aparecerán aquí.',
        }}
      >
        <Table scrollLabel="Tabla de planes por autorizar">
          <TableHeader>
            <TableRow>
              <TableHead>Solicitud</TableHead>
              <TableHead>Estado del plan</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody ref={bodyRef}>
            {rows.map((row, index) => (
              <TableRow key={row.plan.id}>
                <TableCell className="min-w-56 max-w-[28rem]">
                  <CellTitle href={planAllowed ? `/seguimiento/plan?requestId=${encodeURIComponent(row.request.id)}` : undefined}>
                    {row.request.title}
                  </CellTitle>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <StatusBadge kind="plan" value={row.plan.status} />
                </TableCell>
                <RowActionsCell>
                  <RowActions rowLabel={row.request.title} actions={rowActions(row, index)} />
                </RowActionsCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataView>

      <DevolverDialog
        kind="plan"
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
        onConfirm={(reason) => void handleReturn(reason)}
        returnFocusTo={returnFocusTo}
      />
    </Section>
  );
}
