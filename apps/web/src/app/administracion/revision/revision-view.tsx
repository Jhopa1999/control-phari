'use client';

import * as React from 'react';
import Link from 'next/link';
import { BadgeCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { CellTitle } from '@/components/data-table';
import { DataView, type DataViewState } from '@/components/data-view';
import { InlineNotice } from '@/components/inline-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { RowActions, RowActionsCell } from '@/components/row-actions';
import { Section } from '@/components/section';
import { PriorityBadge, PriorityLegend } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Request } from '@/lib/api-client';
import { useActor } from '@/lib/actor-context';
import { ApprovalError, createApproval, listPendingApproval } from '@/lib/approval';
import { formatDate } from '@/lib/format';
import { DevolverDialog } from './devolver-dialog';
import { PlanAuthorizationSection } from './plan-authorization-section';
import { PendingReviewsSections } from './pending-reviews-sections';
import { focusTargetAfterRemoval } from './row-focus';

type LoadState = 'loading' | 'success' | 'error' | 'forbidden';

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

  const [devolver, setDevolver] = React.useState<Request | null>(null);
  const [devolverError, setDevolverError] = React.useState<string | null>(null);
  const rowIndexRef = React.useRef(0);
  const bodyRef = React.useRef<HTMLTableSectionElement>(null);
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
    () => focusTargetAfterRemoval(bodyRef.current, rowIndexRef.current, headingRef.current),
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

  async function handleDevolver(reason: string): Promise<void> {
    if (!devolver) return;
    setActingId(devolver.id);
    setDevolverError(null);
    try {
      await createApproval(devolver.id, { decision: 'DEVOLVER', reason });
      toast.success('Solicitud devuelta a triage.');
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
        <InlineNotice
          tone="neutral"
          title="Esta pantalla no está disponible para tu rol."
          action={
            allowedModules.has('requests') ? (
              <Link
                href="/demanda/solicitudes"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Ir a Solicitudes
              </Link>
            ) : undefined
          }
        >
          <p className="text-muted-foreground">
            Aprobar compromisos es exclusivo del jefe de área; los líderes de proceso pueden
            consultar la cola y autorizar planes. El estado de cada solicitud se consulta en
            Solicitudes.
          </p>
        </InlineNotice>
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
      {header}

      <Section
        title="Compromisos por aprobar"
        count={state === 'success' ? queue.length : undefined}
        headingRef={headingRef}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" />
            Actualizar
          </Button>
        }
      >
        <InlineNotice tone="info" className="py-2">
          {canDecide
            ? 'Aprobar lleva la solicitud a Comprometida; devolver la regresa a triage con un motivo.'
            : 'Solo el jefe de área puede aprobar o devolver. Aquí puedes consultar las solicitudes priorizadas pendientes de decisión.'}
        </InlineNotice>
        <PriorityLegend />
        <DataView
          state={viewState}
          loading={{ rows: 3, columns: 4 }}
          error={{
            title: 'No fue posible cargar los compromisos por aprobar.',
            message: loadError,
            onRetry: () => void load(),
          }}
          empty={{
            icon: BadgeCheck,
            title: 'No hay solicitudes pendientes de aprobación.',
            description: 'Las solicitudes priorizadas aparecerán aquí para su revisión.',
          }}
        >
          <Table scrollLabel="Tabla de compromisos por aprobar">
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody ref={bodyRef}>
              {queue.map((req, index) => {
                const acting = actingId === req.id;
                return (
                  <TableRow key={req.id}>
                    <TableCell className="min-w-56 max-w-[28rem]">
                      <CellTitle href={allowedModules.has('requests') ? `/demanda/solicitudes/${encodeURIComponent(req.id)}` : undefined}>
                        {req.title}
                      </CellTitle>
                    </TableCell>
                    <TableCell>
                      <PriorityBadge variant="compact" score={req.currentScore} label={req.priorityLabel} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatDate(req.registeredAt)}
                    </TableCell>
                    <RowActionsCell>
                      {canDecide ? (
                        <RowActions
                          rowLabel={req.title}
                          actions={[
                            {
                              key: 'approve',
                              label: 'Aprobar',
                              onSelect: () => void handleApprove(req, index),
                              busy: approvingId === req.id,
                              busyLabel: 'Aprobando…',
                              disabled: acting,
                              placement: 'inline',
                            },
                            {
                              key: 'return',
                              label: 'Devolver',
                              onSelect: () => {
                                rowIndexRef.current = index;
                                setDevolverError(null);
                                setDevolver(req);
                              },
                              disabled: acting,
                              placement: 'inline',
                            },
                          ]}
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
        </DataView>
      </Section>

      {/* Autorización de planes: se añade a la cola de compromiso. Oculta para
          quien no tiene el módulo review. */}
      <PlanAuthorizationSection />

      {/* Documentación y cierres de proyecto por aprobar (APR-01 / CIE-01). */}
      <PendingReviewsSections />

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
