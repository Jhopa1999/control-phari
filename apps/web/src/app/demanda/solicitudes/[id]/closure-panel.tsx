'use client';

import * as React from 'react';
import Link from 'next/link';
import { CircleCheck, CircleDashed, FilePlus2, Lock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DisabledReason } from '@/components/disabled-reason';
import { Field, FormError, RequiredHint } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { ReasonDialog } from '@/components/reason-dialog';
import { Section } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useActor } from '@/lib/actor-context';
import type { ClosureStatus, Request } from '@/lib/api-client';
import {
  ApiError,
  CLOSURE_PHASE_LABELS,
  CLOSURE_RECORD_LABELS,
  decideClosure,
  getClosureStatus,
  reopenProject,
  requestClosure,
} from '@/lib/closure';
import {
  DocumentError,
  createDocument,
  submitDocumentForApproval,
} from '@/lib/documents';
import { formatDateTime } from '@/lib/format';

const CLOSURE_CATEGORY = 'CIERRE';

function messageOf(err: unknown): string {
  if (err instanceof ApiError || err instanceof DocumentError) return err.message;
  return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

/**
 * Cierre formal del proyecto (CIE-01) dentro de la ficha de la solicitud:
 * muestra el estado funcional, las validaciones (tareas y documentación de
 * cierre), permite cargar y enviar a aprobación la documentación, solicitar el
 * cierre, decidirlo (jefe) y reabrir (jefe). El backend valida todo.
 */
export function ClosurePanel({
  request,
  onChanged,
}: {
  request: Request;
  onChanged: () => void;
}): React.ReactElement | null {
  const { permissions } = useActor();
  const roles = React.useMemo(
    () => new Set((permissions?.grants ?? []).map((g) => g.roleCode)),
    [permissions],
  );
  const isJefe = roles.has('JEFE_AREA');
  const isManager = isJefe || roles.has('LIDER_PROCESO');

  const [status, setStatus] = React.useState<ClosureStatus | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [reopenOpen, setReopenOpen] = React.useState(false);
  const [dialogError, setDialogError] = React.useState<string | null>(null);
  const [docOpen, setDocOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setStatus(await getClosureStatus(request.id));
      setLoadError(null);
    } catch (err) {
      setLoadError(messageOf(err));
    }
  }, [request.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await load();
      onChanged();
      return true;
    } catch (err) {
      const message = messageOf(err);
      setDialogError(message);
      toast.error(message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <Section title="Cierre del proyecto">
        <InlineNotice tone="warning">{loadError}</InlineNotice>
      </Section>
    );
  }
  if (!status) {
    return (
      <Section title="Cierre del proyecto">
        <Skeleton className="h-32 rounded-lg" />
      </Section>
    );
  }
  if (status.phase === 'NO_APLICA') return null;

  const closed = status.phase === 'CERRADO';
  const allTasksDone = status.tasksTotal > 0 && status.tasksCompleted === status.tasksTotal;
  const docApproved = status.documents.some((d) => d.status === 'VIGENTE');
  const docPending = status.documents.some((d) => d.status === 'PENDIENTE_APROBACION');
  const pending = status.pending;

  const checks = [
    {
      ok: allTasksDone,
      label: `Tareas terminadas: ${status.tasksCompleted} de ${status.tasksTotal}`,
    },
    {
      ok: docApproved && !docPending,
      label:
        status.documents.length === 0
          ? 'Documentación de cierre: no cargada'
          : docPending
            ? 'Documentación de cierre: pendiente de aprobación'
            : docApproved
              ? 'Documentación de cierre: aprobada'
              : 'Documentación de cierre: sin aprobar',
    },
  ];

  return (
    <Section
      title="Cierre del proyecto"
      actions={<Badge variant={closed ? 'success' : 'outline'}>{CLOSURE_PHASE_LABELS[status.phase] ?? status.phase}</Badge>}
    >
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
        {closed ? (
          <InlineNotice tone="success" title="Proyecto cerrado">
            <p>
              {`Cerrado el ${formatDateTime(status.closedAt)}${status.closedByName ? ` por ${status.closedByName}` : ''}. `}
              La documentación y las aprobaciones se conservan como evidencia; el plan, las tareas y la ficha ya no se pueden modificar.
            </p>
          </InlineNotice>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Condiciones para el cierre">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-sm">
                {c.ok ? (
                  <CircleCheck aria-hidden="true" className="size-4 text-success" />
                ) : (
                  <CircleDashed aria-hidden="true" className="size-4 text-muted-foreground" />
                )}
                <span>{c.label}</span>
                <span className="sr-only">{c.ok ? '(cumplida)' : '(pendiente)'}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Documentación de cierre</h3>
            {!closed && isManager ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setDocOpen(true)}>
                <FilePlus2 aria-hidden="true" />
                Cargar documento de cierre
              </Button>
            ) : null}
          </div>
          {status.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay documentos de cierre.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {status.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Link
                    href={`/activos/documentos?documentId=${encodeURIComponent(d.id)}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {d.title}
                  </Link>
                  <StatusBadge kind="document" value={d.status} />
                  {d.status === 'RECHAZADO' && d.reviewReason ? (
                    <span className="text-meta text-muted-foreground">{`Motivo: ${d.reviewReason}`}</span>
                  ) : null}
                  {!closed && isManager && (d.status === 'BORRADOR' || d.status === 'RECHAZADO') ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      disabled={busy}
                      onClick={() =>
                        void run(() => submitDocumentForApproval(d.id), 'Documento enviado a aprobación.')
                      }
                    >
                      Enviar a aprobación
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {status.documents.some((d) => d.status === 'RECHAZADO') && !closed ? (
            <p className="text-meta text-muted-foreground">
              Para subsanar un rechazo, edita el documento en Documentos (se guarda una versión nueva) y vuelve a enviarlo.
            </p>
          ) : null}
        </div>

        {pending ? (
          <InlineNotice tone="info" title="Cierre pendiente de aprobación">
            <p>
              {`Solicitado el ${formatDateTime(pending.requestedAt)}${pending.requestedByName ? ` por ${pending.requestedByName}` : ''}.`}
            </p>
          </InlineNotice>
        ) : null}

        <div className="flex flex-wrap items-start gap-2">
          {!closed && !pending && isManager ? (
            <div className="flex flex-col items-start gap-1">
              <Button
                type="button"
                unavailable={!status.canRequestClosure}
                disabled={status.canRequestClosure && busy}
                aria-describedby={!status.canRequestClosure ? 'closure-blockers' : undefined}
                onClick={() => setConfirmOpen(true)}
              >
                <Lock aria-hidden="true" />
                Solicitar cierre
              </Button>
              {!status.canRequestClosure ? (
                <DisabledReason id="closure-blockers">{status.blockers.join(' ')}</DisabledReason>
              ) : null}
            </div>
          ) : null}
          {pending && isJefe ? (
            <>
              <Button
                type="button"
                loading={busy}
                onClick={() =>
                  void run(
                    () => decideClosure(request.id, { decision: 'APROBAR' }),
                    'Cierre aprobado. El proyecto quedó cerrado.',
                  )
                }
              >
                Aprobar cierre
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setDialogError(null);
                  setRejectOpen(true);
                }}
              >
                Rechazar cierre
              </Button>
            </>
          ) : null}
          {closed && isJefe ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDialogError(null);
                setReopenOpen(true);
              }}
            >
              <RotateCcw aria-hidden="true" />
              Reabrir proyecto
            </Button>
          ) : null}
        </div>

        {status.history.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Historial de cierre</h3>
            <ul className="flex flex-col gap-2">
              {status.history.map((h) => (
                <li key={h.id} className="flex flex-col gap-0.5 rounded-md border px-3 py-2 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant={h.status === 'APROBADO' ? 'success' : h.status === 'RECHAZADO' ? 'warning' : 'neutral'}>
                      {CLOSURE_RECORD_LABELS[h.status] ?? h.status}
                    </Badge>
                    <span className="text-meta text-muted-foreground">
                      {`Solicitado ${formatDateTime(h.requestedAt)}${h.requestedByName ? ` por ${h.requestedByName}` : ''}`}
                    </span>
                    {h.decidedAt ? (
                      <span className="text-meta text-muted-foreground">
                        {`· Decidido ${formatDateTime(h.decidedAt)}${h.decidedByName ? ` por ${h.decidedByName}` : ''}`}
                      </span>
                    ) : null}
                  </span>
                  {h.decisionReason ? (
                    <span className="wrap-break-word">{`Observaciones: ${h.decisionReason}`}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!isManager && !closed ? (
          <p className="text-meta text-muted-foreground">
            El cierre lo solicita el líder del proceso o el jefe de área, y lo aprueba el jefe de área.
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="default"
        title="¿Solicitar el cierre del proyecto?"
        description="Se enviará la solicitud de cierre al jefe de área para su aprobación."
        confirmLabel="Solicitar cierre"
        onConfirm={async () => {
          await run(() => requestClosure(request.id), 'Cierre solicitado. Se notificó al jefe de área.');
        }}
      />

      <ReasonDialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) setDialogError(null);
        }}
        title="¿Rechazar el cierre?"
        description="Indica qué debe subsanarse. El responsable podrá corregirlo y solicitar el cierre de nuevo."
        fieldId="closure-reject-reason"
        fieldLabel="Observaciones"
        confirmLabel="Rechazar cierre"
        busyLabel="Rechazando…"
        tone="danger"
        submitting={busy}
        errorMessage={dialogError}
        requiredMessage="Indica las observaciones del rechazo."
        onConfirm={(reason) =>
          void run(
            () => decideClosure(request.id, { decision: 'RECHAZAR', reason }),
            'Cierre rechazado. Se notificó al solicitante.',
          ).then((ok) => ok && setRejectOpen(false))
        }
      />

      <ReasonDialog
        open={reopenOpen}
        onOpenChange={(open) => {
          setReopenOpen(open);
          if (!open) setDialogError(null);
        }}
        title="¿Reabrir el proyecto?"
        description="El proyecto vuelve a En ejecución y se podrán modificar su plan y tareas. Queda registrado en el historial."
        fieldId="closure-reopen-reason"
        fieldLabel="Motivo de la reapertura"
        confirmLabel="Reabrir proyecto"
        busyLabel="Reabriendo…"
        submitting={busy}
        errorMessage={dialogError}
        requiredMessage="Indica el motivo de la reapertura."
        onConfirm={(reason) =>
          void run(() => reopenProject(request.id, reason), 'Proyecto reabierto.').then(
            (ok) => ok && setReopenOpen(false),
          )
        }
      />

      <ClosureDocumentDialog
        open={docOpen}
        onOpenChange={setDocOpen}
        request={request}
        onCreated={() => {
          setDocOpen(false);
          void load();
        }}
      />
    </Section>
  );
}

/** Alta de un documento de cierre (categoría CIERRE) ligado al proyecto. */
function ClosureDocumentDialog({
  open,
  onOpenChange,
  request,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: Request;
  onCreated: () => void;
}): React.ReactElement {
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [errors, setErrors] = React.useState<{ title?: string; content?: string }>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(`Acta de cierre · ${request.title}`.slice(0, 300));
    setContent('');
    setErrors({});
    setFormError(null);
  }, [open, request.title]);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const next: { title?: string; content?: string } = {};
    if (!title.trim()) next.title = 'El título es obligatorio.';
    if (!content.trim()) next.content = 'Escribe el contenido del documento de cierre.';
    setErrors(next);
    if (next.title || next.content) return;
    if (!request.assetId) {
      setFormError('La solicitud no tiene un activo base asociado. Asócialo en el triage para cargar documentación.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createDocument({
        assetId: request.assetId,
        title: title.trim(),
        categoryCode: CLOSURE_CATEGORY,
        requestId: request.id,
        content,
      });
      toast.success('Documento de cierre creado. Envíalo a aprobación cuando esté listo.');
      onCreated();
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Cargar documento de cierre</DialogTitle>
          <DialogDescription>
            Se guarda como documento del activo base del proyecto, en la categoría «Cierre de proyecto».
          </DialogDescription>
        </DialogHeader>
        <form id="closure-doc-form" noValidate onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field id="closure-doc-title" label="Título" required error={errors.title}>
              <Input value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field
              id="closure-doc-content"
              label="Contenido (Markdown)"
              required
              error={errors.content}
              help="Incluye resultados, entregables, lecciones aprendidas y aceptación del cliente."
            >
              <Textarea
                rows={12}
                value={content}
                maxLength={200000}
                onChange={(e) => setContent(e.target.value)}
              />
            </Field>
            {!request.assetId ? (
              <InlineNotice tone="warning">
                La solicitud no tiene un activo base. Asócialo en el triage para poder cargar la documentación de cierre.
              </InlineNotice>
            ) : null}
            <FormError id="closure-doc-form" message={formError} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? 'Guardando…' : 'Crear documento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
