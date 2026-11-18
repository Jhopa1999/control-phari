'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { ChartGantt } from 'lucide-react';
import { toast } from 'sonner';
import { DataCardList } from '@/components/data-card-list';
import { CellTitle } from '@/components/data-table';
import { IdChip } from '@/components/id-chip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataView, type DataViewState } from '@/components/data-view';
import { InlineNotice } from '@/components/inline-notice';
import { RowActions, RowActionsCell, type RowAction } from '@/components/row-actions';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
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
import { focusTargetAfterRemoval, visibleContainer } from './row-focus';

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

  // Autorizar lleva la solicitud a En ejecución: pide confirmación (criterio común, PR-D).
  const [authorizing, setAuthorizing] = React.useState<{ row: PlanRow; index: number } | null>(null);
  const [devolver, setDevolver] = React.useState<PlanRow | null>(null);
  const [devolverError, setDevolverError] = React.useState<string | null>(null);
  const rowIndexRef = React.useRef(0);
  const bodyRef = React.useRef<HTMLTableSectionElement>(null);
  const cardsRef = React.useRef<HTMLUListElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const fetchPlans = React.useCallback(() => {
    // No existe un endpoint de «planes pendientes»: se derivan de las
    // solicitudes EN_PLANIFICACION en alcance y se filtra por estado del plan.
    return listRequests({ state: 'EN_PLANIFICACION' })
      .then((requests) =>
        Promise.allSettled(
          requests.map(async (request) => {
            const plan = await getPlan(request.id);
            return { plan, request };
          }),
        ),
      )
      .then((settled) => {
        const pending = settled
          .filter(
            (r): r is PromiseFulfilledResult<PlanRow> =>
              r.status === 'fulfilled' && r.value.plan.status === 'EN_AUTORIZACION',
          )
          .map((r) => r.value);
        setRows(pending);
        setState('success');
      })
      .catch(() => {
        setState('error');
      });
  }, []);
  const load = React.useCallback(() => {
    setState('loading');
    return fetchPlans();
  }, [fetchPlans]);

  // Al cambiar de usuario se vuelve a mostrar la carga.
  useResetOnChange([canReview, actorId], () => {
    if (canReview) setState('loading');
  });
  React.useEffect(() => {
    if (canReview) void fetchPlans();
  }, [canReview, fetchPlans, actorId]);

  const returnFocusTo = React.useCallback(
    () =>
      focusTargetAfterRemoval(
        visibleContainer(bodyRef.current, cardsRef.current),
        rowIndexRef.current,
        headingRef.current,
      ),
    [],
  );

  async function handleAuthorize(row: PlanRow, index: number): Promise<void> {
    setActingId(row.plan.id);
    setAuthorizingId(row.plan.id);
    try {
      await authorizePlan(row.request.id);
      toast.success('Plan autorizado. La solicitud pasa a En ejecución.');
      // La fila ya no está: el diálogo devuelve el foco a la fila siguiente (returnFocusTo).
      rowIndexRef.current = index;
      await load();
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
        variant: 'default',
        onSelect: () => {
          rowIndexRef.current = index;
          setAuthorizing({ row, index });
        },
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
    >
      <InlineNotice tone="info" className="py-2">
        Autorizar lleva la solicitud a En ejecución; devolver regresa el plan a edición con un motivo.
      </InlineNotice>
      <DataView
        state={viewState}
        loading={{ rows: 3, columns: 3 }}
        mobileCards={{ footer: true }}
        error={{
          title: 'No fue posible cargar los planes.',
          onRetry: () => void load(),
        }}
        empty={{
          icon: ChartGantt,
          size: 'inline',
          title: 'No hay planes pendientes de autorización.',
          description: 'Los planes enviados a autorización aparecerán aquí.',
        }}
      >
        <div className="hidden md:block">
        <Table scrollLabel="Tabla de planes por autorizar">
          <TableHeader>
            <TableRow>
              <TableHead>Solicitud</TableHead>
              <TableHead>Estado del plan</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody ref={bodyRef}>
            {/* eslint-disable-next-line react-hooks/refs -- falso positivo: la función solo lee el ref dentro de un manejador o callback, nunca durante el render. */}
            {rows.map((row, index) => (
              <TableRow key={row.plan.id}>
                <TableCell className="min-w-56 max-w-[28rem]">
                  <CellTitle href={planAllowed ? `/seguimiento/plan?requestId=${encodeURIComponent(row.request.id)}` : undefined} meta={<IdChip code={row.request.code} />}>
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
        </div>
        <DataCardList
          label="Planes por autorizar"
          listRef={cardsRef}
          rows={rows}
          getKey={(row) => row.plan.id}
          card={(row) => {
            const index = rows.indexOf(row);
            return {
              code: <IdChip code={row.request.code} />,
              title: (
                <CellTitle
                  touch
                  href={
                    planAllowed
                      ? `/seguimiento/plan?requestId=${encodeURIComponent(row.request.id)}`
                      : undefined
                  }
                >
                  {row.request.title}
                </CellTitle>
              ),
              badges: [<StatusBadge key="plan" kind="plan" value={row.plan.status} />],
              busy: actingId === row.plan.id,
              footer: <RowActions footer rowLabel={row.request.title} actions={rowActions(row, index)} />,
            };
          }}
        />
      </DataView>

      <ConfirmDialog
        open={authorizing !== null}
        onOpenChange={(open) => {
          if (!open) setAuthorizing(null);
        }}
        title={`¿Autorizar el plan de ${authorizing?.row.request.code ?? `«${authorizing?.row.request.title ?? ''}»`}?`}
        description="La solicitud pasará a En ejecución. Si hay que corregir algo, usa Devolver."
        confirmLabel="Autorizar plan"
        tone="default"
        returnFocusTo={returnFocusTo}
        onConfirm={async () => {
          if (authorizing) await handleAuthorize(authorizing.row, authorizing.index);
        }}
      >
        {authorizing ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-lg bg-muted/40 p-3 text-sm dark:ring-1 dark:ring-inset dark:ring-border">
            <dt className="text-muted-foreground">Solicitud</dt>
            <dd className="flex flex-wrap items-center gap-2 text-foreground wrap-break-word">
              <IdChip code={authorizing.row.request.code} copyable={false} />
              <span>{authorizing.row.request.title}</span>
            </dd>
          </dl>
        ) : null}
      </ConfirmDialog>

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
