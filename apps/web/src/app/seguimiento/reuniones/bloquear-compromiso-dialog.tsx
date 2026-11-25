'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CommitmentError, transitionCommitment } from '@/lib/commitments';
import { BlockReasonDialog } from '../plan/block-reason-dialog';

/** Compromiso que se va a bloquear (lo mínimo que necesita el diálogo). */
export interface BlockTarget {
  id: string;
  title: string;
  /** Bloqueos ya escritos: el diálogo se abre con ese texto. */
  blockers: string | null;
}

/**
 * Diálogo del motivo al bloquear un compromiso (D17). Lo comparten el detalle
 * del compromiso y los compromisos del acta: pide el motivo (obligatorio en la
 * interfaz, hasta 500 caracteres) y lo envía junto con la transición.
 */
export function BlockCommitmentDialog({
  target,
  onClose,
  onDone,
  onClosedAfterSuccess,
  returnFocusTo,
}: {
  target: BlockTarget | null;
  onClose: () => void;
  /** Tras bloquear: recarga lo que haga falta. */
  onDone: () => Promise<void> | void;
  onClosedAfterSuccess?: () => void;
  returnFocusTo?: () => HTMLElement | null;
}): React.ReactElement {
  // Se conserva el último objetivo para que el diálogo no cambie de texto al cerrarse.
  const [shown, setShown] = React.useState<BlockTarget | null>(target);
  if (target && target !== shown) setShown(target);

  return (
    <BlockReasonDialog
      open={target !== null}
      taskTitle={shown?.title ?? ''}
      title="Marcar como bloqueado"
      description="Cuéntale al equipo qué lo detiene. El motivo es obligatorio."
      placeholder="Ej.: falta la aprobación del área financiera"
      confirmLabel="Marcar como bloqueado"
      prefill={shown?.blockers ?? ''}
      prefillHelp="Ya había un texto en Bloqueos. Déjalo o cámbialo."
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onClosedAfterSuccess={onClosedAfterSuccess}
      returnFocusTo={returnFocusTo}
      onConfirm={async (reason) => {
        if (!target) return null;
        try {
          await transitionCommitment(target.id, { toState: 'BLOQUEADO', blockedReason: reason });
        } catch (err) {
          return err instanceof CommitmentError
            ? err.message
            : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
        }
        toast.success('Compromiso marcado como bloqueado.');
        await onDone();
        return null;
      }}
    />
  );
}
