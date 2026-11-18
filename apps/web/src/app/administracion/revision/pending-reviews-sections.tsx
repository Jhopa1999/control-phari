'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { FileCheck2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { CellTitle } from '@/components/data-table';
import { IdChip } from '@/components/id-chip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataView, type DataViewState } from '@/components/data-view';
import { ReasonDialog } from '@/components/reason-dialog';
import { RowActions, RowActionsCell } from '@/components/row-actions';
import { Section } from '@/components/section';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useActor } from '@/lib/actor-context';
import type { Document, PendingClosure } from '@/lib/api-client';
import { ApiError, decideClosure, listPendingClosures } from '@/lib/closure';
import { DocumentError, listPendingDocuments, reviewDocument } from '@/lib/documents';
import { formatDateTime } from '@/lib/format';
import { getStatus } from '@/lib/status-presentation';

type LoadState = 'loading' | 'success' | 'error';

function messageOf(err: unknown): string {
  if (err instanceof ApiError || err instanceof DocumentError) return err.message;
  return 'Ocurrió un error inesperado.';
}

/** Aprobación pendiente de confirmar (criterio común, oleada 3 PR-D). */
type Approving =
  | { kind: 'document'; id: string; title: string; code?: string | null; targetLabel: string }
  | { kind: 'closure'; id: string; busyId: string; title: string; code?: string | null };
type Rejecting =
  | { kind: 'document'; id: string; title: string }
  | { kind: 'closure'; id: string; title: string };

/**
 * Colas de Aprobaciones para documentación y cierres de proyecto (APR-01).
 * El título de cada fila navega al documento o al resumen del proyecto. Solo el
 * jefe de área decide (el backend lo exige); el líder consulta.
 */
export function PendingReviewsSections(): React.ReactElement | null {
  const { permissions, allowedModules, actorId } = useActor();
  const canReview = allowedModules.has('review');
  const isJefe = React.useMemo(
    () => (permissions?.grants ?? []).some((g) => g.roleCode === 'JEFE_AREA'),
    [permissions],
  );

  const [docs, setDocs] = React.useState<Document[]>([]);
  const [closures, setClosures] = React.useState<PendingClosure[]>([]);
  const [docState, setDocState] = React.useState<LoadState>('loading');
  const [closureState, setClosureState] = React.useState<LoadState>('loading');
  const [actingId, setActingId] = React.useState<string | null>(null);
  const [approving, setApproving] = React.useState<Approving | null>(null);
  const [rejecting, setRejecting] = React.useState<Rejecting | null>(null);
  const [rejectError, setRejectError] = React.useState<string | null>(null);

  const fetchPending = React.useCallback(() => {
    return Promise.allSettled([listPendingDocuments(), listPendingClosures()]).then(([d, c]) => {
      if (d.status === 'fulfilled') {
        setDocs(d.value);
        setDocState('success');
      } else setDocState('error');
      if (c.status === 'fulfilled') {
        setClosures(c.value);
        setClosureState('success');
      } else setClosureState('error');
    });
  }, []);
  const load = React.useCallback(() => {
    setDocState('loading');
    setClosureState('loading');
    return fetchPending();
  }, [fetchPending]);

  // Al cambiar de usuario se vuelve a mostrar la carga.
  useResetOnChange([canReview, actorId], () => {
    if (!canReview) return;
    setDocState('loading');
    setClosureState('loading');
  });
  React.useEffect(() => {
    if (canReview) void fetchPending();
  }, [canReview, fetchPending, actorId]);

  if (!canReview) return null;

  async function act(id: string, action: () => Promise<unknown>, success: string): Promise<boolean> {
    setActingId(id);
    try {
      await action();
      toast.success(success);
      await load();
      return true;
    } catch (err) {
      const message = messageOf(err);
      setRejectError(message);
      toast.error(message);
      return false;
    } finally {
      setActingId(null);
    }
  }

  const stateOf = (s: LoadState, n: number): DataViewState =>
    s === 'loading' ? 'loading' : s === 'error' ? 'error' : n === 0 ? 'empty' : 'ready';

  return (
    <>
      <Section
        title="Documentación por aprobar"
        count={docState === 'success' ? docs.length : undefined}
      >
        <DataView
          state={stateOf(docState, docs.length)}
          loading={{ rows: 2, columns: 3 }}
          error={{ title: 'No fue posible cargar la documentación por aprobar.', onRetry: () => void load() }}
          empty={{
            icon: FileCheck2,
            size: 'inline',
            title: 'No hay documentación pendiente de aprobación.',
            description: 'Los documentos enviados a aprobación aparecerán aquí.',
          }}
        >
          <Table scrollLabel="Tabla de documentación por aprobar">
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Enviado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="min-w-56 max-w-[28rem]">
                    <CellTitle
                      href={`/activos/documentos?documentId=${encodeURIComponent(doc.id)}`}
                      meta={doc.categoryCode === 'CIERRE' ? 'Documentación de cierre' : undefined}
                    >
                      {doc.title}
                    </CellTitle>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(doc.submittedAt)}
                  </TableCell>
                  <RowActionsCell>
                    {isJefe ? (
                      <RowActions
                        rowLabel={doc.title}
                        actions={[
                          {
                            key: 'approve',
                            label: 'Aprobar',
                            placement: 'inline',
                            busy: actingId === doc.id,
                            busyLabel: 'Aprobando…',
                            onSelect: () =>
                              setApproving({
                                kind: 'document',
                                id: doc.id,
                                title: doc.title,
                                code: doc.code,
                                targetLabel: getStatus('document', 'VIGENTE').label,
                              }),
                          },
                          {
                            key: 'reject',
                            label: 'Rechazar',
                            placement: 'inline',
                            disabled: actingId === doc.id,
                            onSelect: () => {
                              setRejectError(null);
                              setRejecting({ kind: 'document', id: doc.id, title: doc.title });
                            },
                          },
                        ]}
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">Solo lectura</span>
                    )}
                  </RowActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataView>
      </Section>

      <Section title="Cierres de proyecto por aprobar" count={closureState === 'success' ? closures.length : undefined}>
        <DataView
          state={stateOf(closureState, closures.length)}
          loading={{ rows: 2, columns: 3 }}
          error={{ title: 'No fue posible cargar los cierres por aprobar.', onRetry: () => void load() }}
          empty={{
            icon: Lock,
            size: 'inline',
            title: 'No hay cierres pendientes de aprobación.',
            description: 'Las solicitudes de cierre de proyecto aparecerán aquí.',
          }}
        >
          <Table scrollLabel="Tabla de cierres por aprobar">
            <TableHeader>
              <TableRow>
                <TableHead>Proyecto</TableHead>
                <TableHead>Solicitado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {closures.map((c) => (
                <TableRow key={c.closureId}>
                  <TableCell className="min-w-56 max-w-[28rem]">
                    <CellTitle
                      href={`/demanda/solicitudes/${encodeURIComponent(c.requestId)}`}
                      meta={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <IdChip code={c.requestCode} />
                    {c.requestedByName ? `Solicitado por ${c.requestedByName}` : null}
                  </span>
                }
                    >
                      {c.requestTitle}
                    </CellTitle>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(c.requestedAt)}
                  </TableCell>
                  <RowActionsCell>
                    {isJefe ? (
                      <RowActions
                        rowLabel={c.requestTitle}
                        actions={[
                          {
                            key: 'approve',
                            label: 'Aprobar cierre',
                            placement: 'inline',
                            busy: actingId === c.closureId,
                            busyLabel: 'Aprobando…',
                            onSelect: () =>
                              setApproving({
                                kind: 'closure',
                                id: c.requestId,
                                busyId: c.closureId,
                                title: c.requestTitle,
                                code: c.requestCode,
                              }),
                          },
                          {
                            key: 'reject',
                            label: 'Rechazar',
                            placement: 'inline',
                            disabled: actingId === c.closureId,
                            onSelect: () => {
                              setRejectError(null);
                              setRejecting({ kind: 'closure', id: c.requestId, title: c.requestTitle });
                            },
                          },
                        ]}
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground">Solo lectura</span>
                    )}
                  </RowActionsCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataView>
      </Section>

      <ConfirmDialog
        open={approving !== null}
        onOpenChange={(open) => {
          if (!open) setApproving(null);
        }}
        title={
          approving?.kind === 'closure'
            ? `¿Aprobar el cierre de ${approving.code ?? `«${approving.title}»`}?`
            : `¿Aprobar «${approving?.title ?? ''}»?`
        }
        description={
          approving?.kind === 'closure'
            ? 'El proyecto quedará cerrado. Si hace falta, se puede reabrir con un motivo.'
            : `El documento pasará a ${approving?.kind === 'document' ? approving.targetLabel : ''}.`
        }
        confirmLabel={approving?.kind === 'closure' ? 'Aprobar cierre' : 'Aprobar documento'}
        tone="default"
        returnFocusTo={() => document.querySelector<HTMLElement>('h1')}
        onConfirm={async () => {
          if (!approving) return;
          const target = approving;
          await act(
            target.kind === 'closure' ? target.busyId : target.id,
            () =>
              target.kind === 'document'
                ? reviewDocument(target.id, { decision: 'APROBAR' })
                : decideClosure(target.id, { decision: 'APROBAR' }),
            target.kind === 'document'
              ? 'Documento aprobado.'
              : 'Cierre aprobado. El proyecto quedó cerrado.',
          );
        }}
      >
        {approving ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-lg bg-muted/40 p-3 text-sm dark:ring-1 dark:ring-inset dark:ring-border">
            <dt className="text-muted-foreground">
              {approving.kind === 'closure' ? 'Proyecto' : 'Documento'}
            </dt>
            <dd className="flex flex-wrap items-center gap-2 text-foreground wrap-break-word">
              <IdChip code={approving.code} copyable={false} />
              <span>{approving.title}</span>
            </dd>
          </dl>
        ) : null}
      </ConfirmDialog>
      <ReasonDialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejecting(null);
            setRejectError(null);
          }
        }}
        title={
          rejecting?.kind === 'closure'
            ? `¿Rechazar el cierre de «${rejecting.title}»?`
            : `¿Rechazar «${rejecting?.title ?? ''}»?`
        }
        description="Indica qué debe corregirse. Se notificará a quien lo envió para que pueda subsanarlo."
        fieldId="review-reject-reason"
        fieldLabel="Motivo del rechazo"
        confirmLabel="Rechazar"
        busyLabel="Rechazando…"
        tone="danger"
        submitting={actingId !== null}
        errorMessage={rejectError}
        requiredMessage="Indica el motivo del rechazo."
        onConfirm={(reason) => {
          if (!rejecting) return;
          const target = rejecting;
          void act(
            target.id,
            () =>
              target.kind === 'document'
                ? reviewDocument(target.id, { decision: 'RECHAZAR', reason })
                : decideClosure(target.id, { decision: 'RECHAZAR', reason }),
            target.kind === 'document' ? 'Documento rechazado.' : 'Cierre rechazado.',
          ).then((ok) => ok && setRejecting(null));
        }}
      />
    </>
  );
}
