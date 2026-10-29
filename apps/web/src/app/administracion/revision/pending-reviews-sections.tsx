'use client';

import * as React from 'react';
import { FileCheck2, Lock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { CellTitle } from '@/components/data-table';
import { DataView, type DataViewState } from '@/components/data-view';
import { ReasonDialog } from '@/components/reason-dialog';
import { RowActions, RowActionsCell } from '@/components/row-actions';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
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

type LoadState = 'loading' | 'success' | 'error';

function messageOf(err: unknown): string {
  if (err instanceof ApiError || err instanceof DocumentError) return err.message;
  return 'Ocurrió un error inesperado.';
}

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
  const [rejecting, setRejecting] = React.useState<Rejecting | null>(null);
  const [rejectError, setRejectError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setDocState('loading');
    setClosureState('loading');
    const [d, c] = await Promise.allSettled([listPendingDocuments(), listPendingClosures()]);
    if (d.status === 'fulfilled') {
      setDocs(d.value);
      setDocState('success');
    } else setDocState('error');
    if (c.status === 'fulfilled') {
      setClosures(c.value);
      setClosureState('success');
    } else setClosureState('error');
  }, []);

  React.useEffect(() => {
    if (canReview) void load();
  }, [canReview, load, actorId]);

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
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" />
            Actualizar
          </Button>
        }
      >
        <DataView
          state={stateOf(docState, docs.length)}
          loading={{ rows: 2, columns: 3 }}
          error={{ title: 'No fue posible cargar la documentación por aprobar.', onRetry: () => void load() }}
          empty={{
            icon: FileCheck2,
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
                              void act(
                                doc.id,
                                () => reviewDocument(doc.id, { decision: 'APROBAR' }),
                                'Documento aprobado.',
                              ),
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
                      meta={c.requestedByName ? `Solicitado por ${c.requestedByName}` : undefined}
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
                              void act(
                                c.closureId,
                                () => decideClosure(c.requestId, { decision: 'APROBAR' }),
                                'Cierre aprobado. El proyecto quedó cerrado.',
                              ),
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
