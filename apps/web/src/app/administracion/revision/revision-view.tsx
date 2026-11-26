'use client';

import * as React from 'react';
import { BadgeCheck, Check, Info, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataCardList } from '@/components/data-card-list';
import { CellTitle, DataTablePagination } from '@/components/data-table';
import { DataView, type DataViewState } from '@/components/data-view';
import { DescriptionList } from '@/components/description-list';
import { IdChip } from '@/components/id-chip';
import { InlineNotice } from '@/components/inline-notice';
import { NoAccessNotice, NO_ACCESS_COPY } from '@/components/no-access-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RowActions, RowActionsCell, type RowAction } from '@/components/row-actions';
import { Section } from '@/components/section';
import { PriorityBadge, PriorityLegend } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { BatchApprovalResult, Request } from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { ApprovalError, batchApprove, createApproval, listPendingApproval } from '@/lib/approval';
import { formatDate } from '@/lib/format';
import { compareDate, type Comparator } from '@/lib/table-sort';
import { useClientTable } from '@/lib/use-client-table';
import { DevolverDialog } from './devolver-dialog';
import { PlanAuthorizationSection } from './plan-authorization-section';
import { PendingReviewsSections } from './pending-reviews-sections';
import { focusTargetAfterRemoval, visibleContainer } from './row-focus';

const QUEUE_NOUN = { one: 'solicitud por aprobar', other: 'solicitudes por aprobar' };
const QUEUE_COMPARATORS: Record<'registered', Comparator<Request>> = {
  registered: (a, b, d) => compareDate(a.registeredAt, b.registeredAt, d),
};

type LoadState = 'loading' | 'success' | 'error' | 'forbidden';

/** Tope del lote: coincide con el contrato (`BatchApprovalDto`); el servidor lo valida igual. */
const MAX_BATCH = 25;

function messageOf(err: unknown): string {
  return err instanceof ApprovalError ? err.message : 'Ocurrió un error inesperado.';
}

/**
 * Aprobaciones (design §11.8, patrón A): cola de compromisos por aprobar y,
 * para quien tiene `review`, planes por autorizar. Aprobar, autorizar y
 * devolver retiran la fila; el foco pasa a la fila siguiente o al encabezado
 * de la sección (NIT 4).
 */
export function RevisionView(): React.ReactElement {
  const { permissions, allowedModules } = useActor();
  const permissionsLoaded = permissions !== null;
  const reviewAllowed = allowedModules.has('review');
  // La DECISION de aprobar/devolver es exclusiva del jefe de área (el backend
  // exige @Roles(JEFE_AREA) en POST :id/approval). Los líderes conservan la
  // visibilidad de la cola pero no ven las acciones. Gating cosmético: el
  // backend es el control real (403 ante un líder). Mismo patrón que
  // documentos-view.tsx.
  const canDecide = React.useMemo(
    () => (permissions?.grants ?? []).some((g) => g.roleCode === 'JEFE_AREA'),
    [permissions],
  );
  const [queue, setQueue] = React.useState<Request[]>([]);
  const [loadedState, setState] = React.useState<LoadState>('loading');
  const state: LoadState = permissionsLoaded && !reviewAllowed ? 'forbidden' : loadedState;
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actingId, setActingId] = React.useState<string | null>(null);
  const [approvingId, setApprovingId] = React.useState<string | null>(null);
  // Solicitud cuya aprobación espera confirmación (diálogo con resumen).
  const [approveTarget, setApproveTarget] = React.useState<{ request: Request; index: number } | null>(null);
  // Cambiar la clave remonta las secciones de planes y de documentación/cierres,
  // que cargan sus datos al montarse: un único «Actualizar» en la cabecera.
  const [refreshKey, setRefreshKey] = React.useState(0);

  const [devolver, setDevolver] = React.useState<Request | null>(null);
  const [devolverError, setDevolverError] = React.useState<string | null>(null);
  const rowIndexRef = React.useRef(0);
  // Aprobación en lote: ids marcados (solo cuentan los que siguen en la cola),
  // diálogo de confirmación y resultado del último lote.
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [batchBusy, setBatchBusy] = React.useState(false);
  const [batchResult, setBatchResult] = React.useState<BatchApprovalResult | null>(null);
  // Orden de la API (el más antiguo primero); el comparador solo habilita la paginación.
  const queueTable = useClientTable({
    rows: queue,
    comparators: QUEUE_COMPARATORS,
    defaultSort: null,
    pageSize: 25,
  });
  const resultRef = React.useRef<HTMLDivElement>(null);
  const batchButtonRef = React.useRef<HTMLButtonElement>(null);
  const selectAllRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTableSectionElement>(null);
  const cardsRef = React.useRef<HTMLUListElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const loadData = React.useCallback(() => {
    return listPendingApproval()
      .then((data) => {
        setQueue(data);
        setState('success');
      })
      .catch((err: unknown) => {
        if (err instanceof ApprovalError && err.status === 403) {
          setState('forbidden');
          return;
        }
        setLoadError(messageOf(err));
        setState('error');
      });
  }, []);
  const load = React.useCallback(async () => {
    setState('loading');
    await loadData();
  }, [loadData]);

  // Gating cosmético, como en Indicadores: sin el módulo review no se llama al
  // backend (respondería 403) y se muestra el aviso; un 403 lleva al mismo aviso.
  React.useEffect(() => {
    if (!permissionsLoaded) return;
    if (!reviewAllowed) return;
    void loadData();
  }, [permissionsLoaded, reviewAllowed, loadData]);

  const returnFocusTo = React.useCallback(
    () =>
      focusTargetAfterRemoval(
        visibleContainer(bodyRef.current, cardsRef.current),
        rowIndexRef.current,
        headingRef.current,
      ),
    [],
  );

  async function handleApprove(request: Request, index: number): Promise<void> {
    setActingId(request.id);
    setApprovingId(request.id);
    try {
      await createApproval(request.id, { decision: 'APROBAR' });
      toast.success('Solicitud aprobada. Pasa a Comprometida.');
      await load();
      // La fila ya no está: tras pintar la tabla, el foco pasa a la siguiente.
      rowIndexRef.current = index;
      requestAnimationFrame(() => requestAnimationFrame(() => returnFocusTo()?.focus()));
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setActingId(null);
      setApprovingId(null);
    }
  }

  // Selección vigente, en el orden de la cola.
  const selectedRequests = queue.filter((req) => selected.has(req.id));
  const selectedCount = selectedRequests.length;
  const atLimit = selectedCount >= MAX_BATCH;
  const allSelected = queue.length > 0 && selectedCount === Math.min(queue.length, MAX_BATCH);

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedCount > 0 && !allSelected;
    }
  }, [selectedCount, allSelected]);

  function toggleSelected(id: string, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean): void {
    setSelected(checked ? new Set(queue.slice(0, MAX_BATCH).map((req) => req.id)) : new Set());
  }

  async function handleBatchApprove(): Promise<void> {
    const ids = selectedRequests.map((req) => req.id);
    if (ids.length === 0) return;
    setBatchBusy(true);
    setBatchResult(null);
    try {
      const result = await batchApprove(ids);
      setSelected(new Set());
      setBatchResult(result);
      if (result.approved === 0) {
        toast.warning('No se aprobó ninguna solicitud.');
      } else if (result.skipped > 0) {
        toast.warning(
          `${result.approved} ${result.approved === 1 ? 'solicitud aprobada' : 'solicitudes aprobadas'}; ${result.skipped} omitida(s).`,
        );
      } else {
        toast.success(
          `${result.approved} ${result.approved === 1 ? 'solicitud aprobada. Pasa' : 'solicitudes aprobadas. Pasan'} a Comprometida.`,
        );
      }
      await load();
      requestAnimationFrame(() => requestAnimationFrame(() => resultRef.current?.focus()));
    } catch (err) {
      // La selección se conserva para reintentar.
      toast.error(messageOf(err));
      requestAnimationFrame(() => batchButtonRef.current?.focus());
    } finally {
      setBatchBusy(false);
    }
  }

  async function handleDevolver(reason: string): Promise<void> {
    if (!devolver) return;
    setActingId(devolver.id);
    setDevolverError(null);
    try {
      await createApproval(devolver.id, { decision: 'DEVOLVER', reason });
      toast.success('Solicitud devuelta a Priorización.');
      // Se recarga antes de cerrar: al cerrarse, la fila ya no está y el foco
      // va a returnFocusTo. Reset solo en éxito (AC-031).
      await load();
      setDevolver(null);
    } catch (err) {
      // Fallo (p. ej. 400 motivo faltante): conserva el diálogo y lo escrito.
      const message = messageOf(err);
      setDevolverError(message);
      toast.error(message);
    } finally {
      setActingId(null);
    }
  }

  function handleRefresh(): void {
    setBatchResult(null);
    void load();
    setRefreshKey((key) => key + 1);
  }

  // Aprobar y Devolver: las mismas acciones en la tabla y en el pie de la tarjeta.
  function decisionActions(req: Request, index: number, acting: boolean): RowAction[] {
    return [
      {
        key: 'approve',
        label: 'Aprobar',
        icon: Check,
        variant: 'default',
        onSelect: () => {
          rowIndexRef.current = index;
          setApproveTarget({ request: req, index });
        },
        busy: approvingId === req.id,
        busyLabel: 'Aprobando…',
        disabled: acting,
        placement: 'inline',
      },
      {
        key: 'return',
        label: 'Devolver',
        variant: 'outline',
        onSelect: () => {
          rowIndexRef.current = index;
          setDevolverError(null);
          setDevolver(req);
        },
        disabled: acting,
        placement: 'inline',
      },
    ];
  }

  const header = (
    <PageHeader
      title="Aprobaciones"
      description="Decide el compromiso de las solicitudes priorizadas y autoriza los planes enviados."
    />
  );

  if (state === 'forbidden') {
    return (
      <PageLayout>
        {header}
        <NoAccessNotice {...NO_ACCESS_COPY.review} />
      </PageLayout>
    );
  }

  let viewState: DataViewState;
  if (state === 'loading') viewState = 'loading';
  else if (state === 'error') viewState = 'error';
  else if (queue.length === 0) viewState = 'empty';
  else viewState = 'ready';

  return (
    <PageLayout>
      <PageHeader
        title="Aprobaciones"
        description="Decide el compromiso de las solicitudes priorizadas y autoriza los planes enviados."
        actions={
          <Button type="button" variant="outline" onClick={handleRefresh}>
            <RefreshCw aria-hidden="true" />
            Actualizar
          </Button>
        }
      />

      <Section
        title="Compromisos por aprobar"
        count={state === 'success' ? queue.length : undefined}
        headingRef={headingRef}
      >
        <InlineNotice tone="info" className="py-2">
          {canDecide
            ? 'Aprobar pide confirmación y lleva la solicitud a Comprometida. Puedes marcar varias y aprobarlas juntas (hasta 25). Devolver se hace de una en una, con un motivo (el triage ya registrado se conserva).'
            : 'Solo el jefe de área puede aprobar o devolver. Aquí puedes consultar las solicitudes priorizadas pendientes de decisión.'}
        </InlineNotice>
        <PriorityLegend />
        {canDecide && batchResult ? (
          <div ref={resultRef} tabIndex={-1} className="outline-none" data-testid="approve-batch-result">
            <InlineNotice
              tone={batchResult.skipped === 0 ? 'success' : 'warning'}
              role="status"
              title={`${batchResult.approved} ${batchResult.approved === 1 ? 'solicitud aprobada' : 'solicitudes aprobadas'}${batchResult.skipped > 0 ? ` · ${batchResult.skipped} omitida(s)` : ''}`}
              action={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Cerrar resultado del lote"
                  onClick={() => setBatchResult(null)}
                >
                  Cerrar aviso
                </Button>
              }
            >
              {batchResult.skipped > 0 ? (
                <ul className="mt-2 grid gap-1.5 text-sm">
                  {batchResult.results
                    .filter((item) => item.status === 'OMITIDA')
                    .map((item) => (
                      <li key={item.id} className="flex flex-wrap items-baseline gap-x-2">
                        {item.code ? <IdChip code={item.code} /> : null}
                        <span>{item.reason}</span>
                      </li>
                    ))}
                </ul>
              ) : null}
            </InlineNotice>
          </div>
        ) : null}
        {canDecide && state === 'success' && selectedCount > 0 ? (
          <div
            role="region"
            aria-label="Acciones sobre la selección"
            className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-xl border border-primary/30 bg-card px-4 py-3 shadow-card sm:flex-row sm:items-center sm:justify-between md:static md:bottom-auto"
          >
            <div className="text-sm font-medium" aria-live="polite" aria-atomic="true">
              <p>
                {selectedCount} {selectedCount === 1 ? 'solicitud seleccionada' : 'solicitudes seleccionadas'}
                <span className="font-normal text-muted-foreground"> · máximo {MAX_BATCH}</span>
              </p>
              {atLimit ? (
                <p id="tope-lote" className="mt-1 flex items-center gap-1.5 text-warning">
                  <Info className="size-4 shrink-0" aria-hidden="true" />
                  Llegaste al máximo de {MAX_BATCH}. Aprueba este lote y selecciona el resto.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto"
                disabled={batchBusy}
                onClick={() => {
                  setSelected(new Set());
                  requestAnimationFrame(() => (selectAllRef.current ?? headingRef.current)?.focus());
                }}
              >
                Limpiar selección
              </Button>
              <Button
                ref={batchButtonRef}
                type="button"
                variant="default"
                className="w-full sm:w-auto"
                disabled={batchBusy}
                onClick={() => setBatchOpen(true)}
              >
                <Check aria-hidden="true" />
                Aprobar {selectedCount} {selectedCount === 1 ? 'solicitud' : 'solicitudes'}
              </Button>
            </div>
          </div>
        ) : null}
        <DataView
          state={viewState}
          loading={{ rows: 3, columns: 4 }}
          mobileCards={{ footer: true }}
          error={{
            title: 'No fue posible cargar los compromisos por aprobar.',
            message: loadError,
            onRetry: () => void load(),
          }}
          empty={{
            icon: BadgeCheck,
            size: 'inline',
            title: 'No hay solicitudes pendientes de aprobación.',
            description: 'Las solicitudes priorizadas aparecerán aquí para su revisión.',
          }}
        >
          <div className="hidden md:block">
          <Table scrollLabel="Tabla de compromisos por aprobar">
            <TableHeader>
              <TableRow>
                {canDecide ? (
                  <TableHead className="w-10 pr-0">
                    <label className="flex min-h-8 min-w-8 cursor-pointer items-center justify-center">
                      <Checkbox
                        ref={selectAllRef}
                        checked={allSelected}
                        disabled={batchBusy}
                        aria-label={`Seleccionar todas las solicitudes (hasta ${MAX_BATCH})`}
                        onChange={(event) => toggleAll(event.target.checked)}
                      />
                    </label>
                  </TableHead>
                ) : null}
                <TableHead>Título</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead className="hidden @4xl:table-cell">Registro</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody ref={bodyRef}>
              {queueTable.pageRows.map((req) => {
                const index = queue.indexOf(req);
                const acting = actingId === req.id || batchBusy;
                const isSelected = selected.has(req.id);
                return (
                  <TableRow key={req.id} className={isSelected ? 'bg-primary-subtle/60' : undefined}>
                    {canDecide ? (
                      <TableCell className="w-10 pr-0">
                        <label className="flex min-h-8 min-w-8 cursor-pointer items-center justify-center">
                          <Checkbox
                            checked={isSelected}
                            disabled={batchBusy || (atLimit && !isSelected)}
                            aria-describedby={atLimit && !isSelected ? 'tope-lote' : undefined}
                            aria-label={`Seleccionar ${req.code}: ${req.title}`}
                            onChange={(event) => toggleSelected(req.id, event.target.checked)}
                          />
                        </label>
                      </TableCell>
                    ) : null}
                    <TableCell className="min-w-56 max-w-[28rem]">
                      {/* Código delante del título, en la misma línea (design §3.1). */}
                      <div className="flex items-center gap-2">
                        <IdChip code={req.code} />
                        <CellTitle href={allowedModules.has('requests') ? `/demanda/solicitudes/${encodeURIComponent(req.id)}` : undefined}>
                          {req.title}
                        </CellTitle>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PriorityBadge variant="compact" score={req.currentScore} label={req.priorityLabel} />
                    </TableCell>
                    <TableCell className="hidden @4xl:table-cell whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatDate(req.registeredAt)}
                    </TableCell>
                    <RowActionsCell>
                      {canDecide ? (
                        <RowActions
                          rowLabel={req.title}
                          actions={decisionActions(req, index, acting)}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">Solo lectura</span>
                      )}
                    </RowActionsCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          <DataCardList
            label="Compromisos por aprobar"
            listRef={cardsRef}
            rows={queueTable.pageRows}
            getKey={(req) => req.id}
            card={(req) => {
              const index = queue.indexOf(req);
              const acting = actingId === req.id || batchBusy;
              const isSelected = selected.has(req.id);
              return {
                code: <IdChip code={req.code} />,
                title: (
                  <CellTitle
                    touch
                    href={
                      allowedModules.has('requests')
                        ? `/demanda/solicitudes/${encodeURIComponent(req.id)}`
                        : undefined
                    }
                  >
                    {req.title}
                  </CellTitle>
                ),
                badges: [
                  <PriorityBadge
                    key="priority"
                    variant="compact"
                    score={req.currentScore}
                    label={req.priorityLabel}
                  />,
                ],
                meta: [{ label: 'Registro', value: formatDate(req.registeredAt) }],
                busy: acting,
                footer: canDecide ? (
                  <div className="flex w-full items-center justify-between gap-3">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        className="size-5"
                        checked={isSelected}
                        disabled={batchBusy || (atLimit && !isSelected)}
                        aria-describedby={atLimit && !isSelected ? 'tope-lote' : undefined}
                        aria-label={`Seleccionar ${req.code}`}
                        onChange={(event) => toggleSelected(req.id, event.target.checked)}
                      />
                      Seleccionar
                    </label>
                    <RowActions
                      footer
                      rowLabel={req.title}
                      actions={decisionActions(req, index, acting)}
                    />
                  </div>
                ) : (
                  <span className="flex items-center text-sm text-muted-foreground">Solo lectura</span>
                ),
              };
            }}
          />
          <DataTablePagination
            id="apr-paginacion"
            page={queueTable.page}
            pageCount={queueTable.pageCount}
            from={queueTable.from}
            to={queueTable.to}
            filtered={queueTable.filtered}
            pageSize={queueTable.pageSize ?? 25}
            onPageChange={queueTable.setPage}
            onPageSizeChange={queueTable.setPageSize}
            noun={QUEUE_NOUN}
          />
        </DataView>
      </Section>

      {/* Autorización de planes: se añade a la cola de compromiso. Oculta para
          quien no tiene el módulo review. */}
      <PlanAuthorizationSection key={`plans-${refreshKey}`} />

      {/* Documentación y cierres de proyecto por aprobar (APR-01 / CIE-01). */}
      <PendingReviewsSections key={`reviews-${refreshKey}`} />

      <ConfirmDialog
        open={approveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setApproveTarget(null);
        }}
        title="¿Aprobar el compromiso?"
        description="La solicitud pasará a Comprometida."
        confirmLabel="Aprobar compromiso"
        tone="default"
        onConfirm={() =>
          approveTarget ? handleApprove(approveTarget.request, approveTarget.index) : undefined
        }
        returnFocusTo={returnFocusTo}
      >
        {approveTarget ? (
          <div className="grid min-w-0 gap-2 rounded-lg bg-muted/50 p-3" data-testid="approve-summary">
            <div className="flex flex-wrap items-center gap-2">
              <IdChip code={approveTarget.request.code} />
              <PriorityBadge
                variant="full"
                score={approveTarget.request.currentScore}
                label={approveTarget.request.priorityLabel}
              />
            </div>
            <p className="line-clamp-3 break-words text-sm font-medium">
              {approveTarget.request.title}
            </p>
            <DescriptionList
              columns={1}
              items={[
                {
                  term: 'Score',
                  value:
                    approveTarget.request.currentScore !== null &&
                    approveTarget.request.currentScore !== undefined
                      ? `${approveTarget.request.currentScore}${approveTarget.request.priorityLabel ? ` · ${approveTarget.request.priorityLabel}` : ''}`
                      : null,
                },
                { term: 'Registrada', value: formatDate(approveTarget.request.registeredAt) },
              ]}
            />
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        title={`¿Aprobar ${selectedCount} ${selectedCount === 1 ? 'solicitud' : 'solicitudes'}?`}
        description="Pasarán a Comprometida. Cada una se aprueba por separado: si alguna ya cambió de estado, se omite y las demás sí se aprueban."
        confirmLabel={`Aprobar ${selectedCount} ${selectedCount === 1 ? 'solicitud' : 'solicitudes'}`}
        tone="default"
        busy={batchBusy}
        onConfirm={handleBatchApprove}
        returnFocusTo={() => batchButtonRef.current ?? headingRef.current}
      >
        <ul
          aria-label="Solicitudes que se aprobarán"
          className="grid max-h-64 min-w-0 gap-2 overflow-y-auto rounded-lg bg-muted/50 p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          data-testid="approve-batch-summary"
          tabIndex={0}
        >
          {selectedRequests.map((req) => (
            <li key={req.id} className="grid min-w-0 gap-1 rounded-md bg-card p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <IdChip code={req.code} />
                <PriorityBadge variant="full" score={req.currentScore} label={req.priorityLabel} />
              </div>
              <p className="line-clamp-2 break-words text-sm font-medium">{req.title}</p>
            </li>
          ))}
        </ul>
      </ConfirmDialog>

      <DevolverDialog
        kind="solicitud"
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
        onConfirm={(reason) => void handleDevolver(reason)}
        returnFocusTo={returnFocusTo}
      />
    </PageLayout>
  );
}
