'use client';

import * as React from 'react';
import { ReasonDialog } from '@/components/reason-dialog';

interface DevolverDialogProps {
  /** 'solicitud' vuelve a triage; 'plan' vuelve a edición (design §13.3). */
  kind: 'solicitud' | 'plan';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestTitle: string;
  submitting: boolean;
  /** Error del backend en línea; se conserva lo escrito (AC-031). */
  errorMessage: string | null;
  onConfirm: (reason: string) => void;
  /** La fila desaparece al devolver: destino del foco al cerrar (NIT 4). */
  returnFocusTo?: () => HTMLElement | null;
}

/**
 * Devolución con motivo obligatorio, compartida por las dos colas de
 * Aprobaciones. Envoltorio de ReasonDialog con los textos de §13.3; si falta el
 * motivo, el backend responde 400 y el diálogo conserva lo escrito.
 */
export function DevolverDialog({
  kind,
  open,
  onOpenChange,
  requestTitle,
  submitting,
  errorMessage,
  onConfirm,
  returnFocusTo,
}: DevolverDialogProps): React.ReactElement {
  const isPlan = kind === 'plan';
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isPlan ? 'Devolver plan' : 'Devolver solicitud'}
      description={
        isPlan
          ? `El plan de «${requestTitle}» volverá a edición con el motivo que indiques.`
          : `«${requestTitle}» volverá a triage con el motivo que indiques.`
      }
      fieldId="devolver-reason"
      confirmLabel="Devolver"
      busyLabel="Devolviendo…"
      tone="danger"
      submitting={submitting}
      errorMessage={errorMessage}
      onConfirm={onConfirm}
      returnFocusTo={returnFocusTo}
      requiredMessage="El motivo es obligatorio para devolver."
    />
  );
}
