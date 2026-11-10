'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/error-state';
import { FormError } from '@/components/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { PlanParticipantProcess, PlanParticipants } from '@/lib/api-client';
import {
  PlanParticipantsError,
  getPlanParticipants,
  updatePlanParticipants,
} from '@/lib/plan-participants';

interface ParticipantsDialogProps {
  open: boolean;
  requestId: string;
  onOpenChange: (open: boolean) => void;
  /** Tras guardar con cambios: refresca los candidatos a responsable. */
  onSaved: () => void;
}

/** Id del formulario: el FormError lleva `participants-form-error`. */
const FORM_ID = 'participants-form';
type LoadState = 'loading' | 'ready' | 'error';

function messageOf(err: unknown): string {
  return err instanceof PlanParticipantsError ? err.message : 'Ocurrió un error inesperado.';
}

/** Por qué un proceso participante no se puede quitar (null si sí se puede). */
function blockedReason(process: PlanParticipantProcess): string | null {
  const tasks = process.removalBlockedBy;
  if (tasks.length === 0) return null;
  const shown = tasks
    .slice(0, 3)
    .map((t) => `«${t.title}» (${t.responsibleName})`)
    .join(', ');
  const more = tasks.length > 3 ? ` y ${tasks.length - 3} más` : '';
  const noun = tasks.length === 1 ? 'tarea asignada' : 'tareas asignadas';
  return `No se puede quitar: ${tasks.length} ${noun} a su gente: ${shown}${more}. Reasígnalas primero.`;
}

/**
 * Gestionar procesos que intervienen (solo jefe de área; el backend es el
 * control real). Corrige después del triage los procesos participantes: agregar
 * habilita al instante a su gente como responsables; quitar solo es posible si
 * ninguna tarea del plan depende de ese proceso. No reabre el triage.
 */
export function ParticipantsDialog({
  open,
  requestId,
  onOpenChange,
  onSaved,
}: ParticipantsDialogProps): React.ReactElement {
  const [state, setState] = React.useState<LoadState>('loading');
  const [data, setData] = React.useState<PlanParticipants | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [formError, setFormError] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  // Carga al abrir (y al reintentar): trae los procesos y las tareas que impiden quitar.
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el diálogo con el backend (sistema externo) al abrirse.
    setState('loading');
    setFormError(null);
    void getPlanParticipants(requestId)
      .then((result) => {
        if (!active) return;
        setData(result);
        setSelected(
          new Set(result.processes.filter((p) => p.isParticipant && !p.isMain).map((p) => p.processId)),
        );
        setState('ready');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(messageOf(err));
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [open, requestId, attempt]);

  const initial = React.useMemo(
    () =>
      new Set(
        (data?.processes ?? []).filter((p) => p.isParticipant && !p.isMain).map((p) => p.processId),
      ),
    [data],
  );
  const changed =
    selected.size !== initial.size || Array.from(selected).some((id) => !initial.has(id));

  function toggle(processId: string): void {
    setFormError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(processId)) next.delete(processId);
      else next.add(processId);
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (submitting || !changed) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await updatePlanParticipants(requestId, Array.from(selected));
      const added = result.addedProcessIds.length;
      const removed = result.removedProcessIds.length;
      toast.success(
        `Procesos actualizados: ${added} ${added === 1 ? 'agregado' : 'agregados'}, ${removed} ${removed === 1 ? 'quitado' : 'quitados'}.`,
      );
      onSaved();
      onOpenChange(false);
    } catch (err) {
      // Conserva la selección y muestra el motivo del backend.
      setFormError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Gestionar procesos que intervienen</DialogTitle>
          <DialogDescription>
            Los líderes y miembros de los procesos que agregues podrán asumir tareas de este plan de
            inmediato. No se repite el triage.
          </DialogDescription>
        </DialogHeader>

        <form id={FORM_ID} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            {state === 'loading' ? (
              <div aria-busy="true" className="grid gap-2">
                <Skeleton className="h-8 rounded-md" />
                <Skeleton className="h-8 rounded-md" />
                <Skeleton className="h-8 rounded-md" />
              </div>
            ) : null}
            {state === 'error' ? (
              <ErrorState
                title="No fue posible cargar los procesos."
                message={loadError}
                onRetry={() => setAttempt((n) => n + 1)}
              />
            ) : null}
            {state === 'ready' && data ? (
              <fieldset className="grid gap-1 rounded-md border p-3">
                <legend className="px-1 text-sm font-medium">Procesos que intervienen</legend>
                {data.processes.map((process) => {
                  const reason = process.isParticipant ? blockedReason(process) : null;
                  const checked = process.isMain || selected.has(process.processId);
                  const locked = process.isMain || (process.isParticipant && reason !== null);
                  const hintId = `participant-${process.processId}-hint`;
                  return (
                    <div key={process.processId} className="grid gap-0.5">
                      <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm has-disabled:cursor-not-allowed">
                        <Checkbox
                          id={`participant-${process.processId}`}
                          checked={checked}
                          disabled={locked || submitting}
                          aria-describedby={reason ? hintId : undefined}
                          onChange={() => toggle(process.processId)}
                        />
                        <span className={process.isMain ? 'font-medium' : undefined}>{process.name}</span>
                        {process.isMain ? <Badge variant="neutral">Principal · Líder</Badge> : null}
                      </label>
                      {reason ? (
                        <p id={hintId} className="pl-6 text-meta text-muted-foreground">
                          {reason}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </fieldset>
            ) : null}

            <FormError id={FORM_ID} message={formError} />
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={submitting} disabled={state !== 'ready' || !changed}>
              {submitting ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
