'use client';

import * as React from 'react';
import { CircleAlert } from 'lucide-react';
import { useDialogReturnFocus } from '@/components/confirm-dialog';
import { FormError } from '@/components/field';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BLOCK_REASON_MAX, BLOCK_REASON_WARN_AT, validateBlockReason } from '@/lib/block-reason';
import { cn } from '@/lib/utils';

export interface BlockReasonDialogProps {
  open: boolean;
  /** Título de la tarea (o compromiso) que se va a bloquear. */
  taskTitle: string;
  /** Textos propios (compromisos). Sin ellos, los de una tarea. */
  title?: string;
  description?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Texto con el que se abre (p. ej. bloqueos ya escritos). */
  prefill?: string;
  /** Línea de ayuda bajo el campo, solo si hay `prefill`. */
  prefillHelp?: string;
  /** Cierra sin cambiar nada (Esc, Cancelar, cierre). */
  onOpenChange: (open: boolean) => void;
  /**
   * Envía el cambio de estado con el motivo (ya recortado). Devuelve null si salió
   * bien (el diálogo se cierra) o el mensaje del servidor (el diálogo se queda
   * abierto y conserva lo escrito).
   */
  onConfirm: (reason: string) => Promise<string | null>;
  /** Tras cerrar por éxito: quien llama decide dónde queda el foco (la tarjeta cambia de sitio). */
  onClosedAfterSuccess?: () => void;
  /** Destino del foco al cancelar si el disparador (un menú) ya no está en el DOM. */
  returnFocusTo?: () => HTMLElement | null;
}

/**
 * Motivo de bloqueo: un solo diálogo para Mi trabajo, Planificación y el detalle.
 * Obligatorio en la interfaz (la API lo admite opcional), máximo 500 con contador.
 * Se valida al enviar, no al abrir ni al escribir.
 */
export function BlockReasonDialog({
  open,
  taskTitle,
  title = 'Marcar como bloqueada',
  description = 'Cuéntale al equipo qué la detiene.',
  placeholder = 'Ej.: falta el acceso al servidor de pruebas',
  confirmLabel = 'Marcar como bloqueada',
  prefill = '',
  prefillHelp,
  onOpenChange,
  onConfirm,
  onClosedAfterSuccess,
  returnFocusTo,
}: BlockReasonDialogProps): React.ReactElement {
  const [reason, setReason] = React.useState('');
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const succeededRef = React.useRef(false);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus(returnFocusTo);
  const fieldId = React.useId();
  const errorId = `${fieldId}-error`;
  const counterId = `${fieldId}-count`;
  const helpId = `${fieldId}-help`;

  // Cada apertura empieza vacía (ajuste durante el render).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason(prefill);
      setFieldError(null);
      setServerError(null);
      setSubmitting(false);
    }
  }

  const length = reason.length;
  const atLimit = length >= BLOCK_REASON_MAX;
  const nearLimit = length >= BLOCK_REASON_WARN_AT;
  // Texto constante dentro de cada tramo: la región solo anuncia al cruzar 450 y 500.
  const liveNote = atLimit
    ? `Límite de ${BLOCK_REASON_MAX} caracteres alcanzado.`
    : nearLimit
      ? `Quedan ${BLOCK_REASON_MAX - BLOCK_REASON_WARN_AT} caracteres.`
      : '';

  function handleOpenChange(next: boolean): void {
    if (!next && submitting) return;
    onOpenChange(next);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const result = validateBlockReason(reason);
    if (!result.ok) {
      setFieldError(result.error);
      textareaRef.current?.focus();
      return;
    }
    setServerError(null);
    setSubmitting(true);
    const error = await onConfirm(result.reason);
    setSubmitting(false);
    if (error === null) {
      succeededRef.current = true;
      onOpenChange(false);
    } else {
      setServerError(error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="sm"
        onOpenAutoFocus={(event) => {
          succeededRef.current = false;
          captureTrigger();
          event.preventDefault();
          textareaRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault();
        }}
        // Con texto escrito, un clic fuera no cierra: no se pierde un párrafo por accidente.
        onInteractOutside={(event) => {
          if (submitting || reason.trim() !== '') event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (succeededRef.current) {
            succeededRef.current = false;
            event.preventDefault();
            onClosedAfterSuccess?.();
            return;
          }
          handleCloseAutoFocus(event);
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            <span className="mb-1 block line-clamp-2 wrap-break-word">“{taskTitle}”</span>
            {description}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={fieldId}>Motivo del bloqueo (obligatorio)</Label>
              <Textarea
                ref={textareaRef}
                id={fieldId}
                rows={4}
                maxLength={BLOCK_REASON_MAX}
                value={reason}
                placeholder={placeholder}
                aria-required="true"
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={cn(fieldError && errorId, prefill && prefillHelp && helpId, counterId)}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (fieldError) setFieldError(null);
                }}
              />
              {prefill && prefillHelp ? (
                <p id={helpId} className="text-meta text-muted-foreground">
                  {prefillHelp}
                </p>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                {fieldError ? (
                  <p id={errorId} className="flex gap-1 text-meta text-danger">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span>{fieldError}</span>
                  </p>
                ) : (
                  <span />
                )}
                <span
                  id={counterId}
                  className={cn(
                    'ml-auto shrink-0 text-meta tabular-nums text-muted-foreground',
                    nearLimit && !atLimit && 'text-warning',
                    atLimit && 'text-danger',
                  )}
                >
                  {atLimit ? 'Límite alcanzado · ' : null}
                  {length}/{BLOCK_REASON_MAX}
                </span>
              </div>
              <p role="status" className="sr-only">
                {liveNote}
              </p>
            </div>
            <FormError id={fieldId} message={serverError} />
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="max-sm:min-h-11"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="max-sm:min-h-11" loading={submitting}>
              {submitting ? 'Guardando…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
