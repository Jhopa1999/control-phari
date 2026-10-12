'use client';

import * as React from 'react';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { Field, FormError, RequiredHint } from '@/components/field';
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
import { Textarea } from '@/components/ui/textarea';

export interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  /** Id del Textarea: 'devolver-reason' (se conserva) | 'waive-reason'. */
  fieldId: string;
  /** Por defecto «Motivo». */
  fieldLabel?: string;
  placeholder?: string;
  /** «Devolver» | «Marcar como no aplica». */
  confirmLabel: string;
  /** «Devolviendo…» | «Guardando…». */
  busyLabel: string;
  /** Por defecto 'danger'. */
  tone?: 'danger' | 'default';
  submitting: boolean;
  /** Error del backend, en línea; el texto escrito se conserva. */
  errorMessage: string | null;
  /** Recibe el motivo recortado. */
  onConfirm: (reason: string) => void;
  /** Destino del foco si el disparador ya no está en el DOM al cerrar (NIT 4). */
  returnFocusTo?: () => HTMLElement | null;
  /**
   * Mensaje del motivo vacío (NIT 6c); por defecto «Escribe el motivo.». Al
   * devolver: «El motivo es obligatorio para devolver.»; en «No aplica»:
   * «Escribe por qué este control no aplica.».
   */
  requiredMessage?: string;
}

/**
 * Motivo obligatorio (design §7.5): reemplaza window.prompt y unifica
 * DevolverDialog. Validación al enviar: un motivo vacío o solo con espacios
 * muestra el error en el campo; la vista recibe el motivo recortado.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  fieldId,
  fieldLabel = 'Motivo',
  placeholder,
  confirmLabel,
  busyLabel,
  tone = 'danger',
  submitting,
  errorMessage,
  onConfirm,
  returnFocusTo,
  requiredMessage = 'Escribe el motivo.',
}: ReasonDialogProps): React.ReactElement {
  const [reason, setReason] = React.useState('');
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [wasOpen, setWasOpen] = React.useState(open);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus(returnFocusTo);

  // Cada apertura empieza vacía (ajuste durante el render, sin un efecto que
  // llegue a pintar el texto anterior). Ante un error del backend el diálogo
  // sigue abierto y conserva lo escrito.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason('');
      setFieldError(null);
    }
  }

  function handleOpenChange(next: boolean): void {
    if (!next && submitting) return;
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitting) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setFieldError(requiredMessage);
      textareaRef.current?.focus();
      return;
    }
    onConfirm(trimmed);
  }

  const formId = `${fieldId}-form`;
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="sm"
        // El foco inicial va al Textarea (equivale a autoFocus) desde aquí: con
        // el atributo autoFocus el foco ya estaría dentro al montar, Radix no
        // emitiría onOpenAutoFocus y no se sabría a qué control devolverlo.
        onOpenAutoFocus={(event) => {
          captureTrigger();
          event.preventDefault();
          textareaRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (submitting) event.preventDefault();
        }}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form id={formId} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-4">
            <RequiredHint />
            <Field id={fieldId} label={fieldLabel} required error={fieldError}>
              <Textarea
                ref={textareaRef}
                value={reason}
                placeholder={placeholder}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (fieldError) setFieldError(null);
                }}
              />
            </Field>
            <FormError id={formId} message={errorMessage} />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant={tone === 'danger' ? 'destructive' : 'default'}
              loading={submitting}
            >
              {submitting ? busyLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
