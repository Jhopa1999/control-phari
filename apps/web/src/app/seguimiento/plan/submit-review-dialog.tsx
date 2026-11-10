'use client';

import * as React from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
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
import { formatPercent } from '@/lib/format';
import {
  EVIDENCE_NOTE_MAX,
  missingRequirementsText,
  reviewRequirementsOf,
} from '@/lib/review-requirements';
import { cn } from '@/lib/utils';

/** Datos que viajan en el mismo PATCH de estado al enviar a revisión. */
export interface SubmitReviewExtra {
  /** Solo si el usuario puso el avance en 100 % en el diálogo. */
  progress?: number;
  /** Solo si el usuario escribió una nota o enlace de evidencia. */
  evidenceUrl?: string;
}

export interface SubmitReviewDialogProps {
  open: boolean;
  /** Título de la tarea que se va a enviar. */
  taskTitle: string;
  /** Avance actual de la tarea. */
  progress: number;
  /** La tarea exige evidencia (bandera que calcula la API). */
  evidenceRequired: boolean;
  /** La tarea ya tiene evidencia (nota o enlace guardado, o archivo). */
  hasEvidence: boolean;
  /** Nota ya escrita (p. ej. en el formulario del detalle): llega precargada. */
  initialNote?: string;
  /** Cierra sin cambiar nada (Esc, Cancelar). */
  onOpenChange: (open: boolean) => void;
  /**
   * Envía el cambio de estado con lo completado aquí. Devuelve null si salió bien
   * (el diálogo se cierra) o el mensaje del servidor (se queda abierto y conserva lo escrito).
   */
  onConfirm: (extra: SubmitReviewExtra) => Promise<string | null>;
  /** Tras cerrar por éxito: quien llama decide dónde queda el foco (la tarjeta cambia de sitio). */
  onClosedAfterSuccess?: () => void;
  /** Destino del foco al cancelar si el disparador (un menú) ya no está en el DOM. */
  returnFocusTo?: () => HTMLElement | null;
  /** Lleva al usuario a la pestaña Evidencia del detalle para subir un archivo. */
  onUploadFile?: () => void;
}

interface RequirementRowProps {
  done: boolean;
  title: string;
  children: React.ReactNode;
}

/** Fila de requisito: nunca solo color (icono, palabra «Falta»/«Listo» y texto). */
function RequirementRow({ done, title, children }: RequirementRowProps): React.ReactElement {
  const Icon = done ? CircleCheck : CircleAlert;
  return (
    <div
      data-requirement-state={done ? 'done' : 'pending'}
      className={cn('grid gap-2 rounded-lg p-3', done ? 'bg-success-subtle' : 'bg-warning-subtle')}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Icon className={cn('size-4 shrink-0', done ? 'text-success' : 'text-warning')} aria-hidden="true" />
          {title}
        </span>
        <span className={cn('text-sm font-medium', done ? 'text-success' : 'text-warning')}>
          {done ? 'Listo' : 'Falta'}
        </span>
      </div>
      {children}
    </div>
  );
}

/**
 * «Antes de enviar a revisión»: muestra qué falta (avance al 100 %, evidencia) y
 * deja cumplirlo sin salir del flujo; todo viaja en UN solo PATCH de estado. Un
 * solo diálogo para Mi trabajo y el detalle (Planificación no lo monta: allí el
 * error del servidor se muestra como toast). Se valida al enviar, no al abrir ni
 * al escribir. La regla vive en el backend: aquí solo se anticipa con sus banderas.
 */
export function SubmitReviewDialog({
  open,
  taskTitle,
  progress,
  evidenceRequired,
  hasEvidence,
  initialNote = '',
  onOpenChange,
  onConfirm,
  onClosedAfterSuccess,
  returnFocusTo,
  onUploadFile,
}: SubmitReviewDialogProps): React.ReactElement {
  const [note, setNote] = React.useState(initialNote);
  const [setTo100, setSetTo100] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  const progressButtonRef = React.useRef<HTMLButtonElement>(null);
  const noteRef = React.useRef<HTMLTextAreaElement>(null);
  const succeededRef = React.useRef(false);
  const { captureTrigger, handleCloseAutoFocus } = useDialogReturnFocus(returnFocusTo);
  const fieldId = React.useId();
  const helpId = `${fieldId}-help`;

  // Cada apertura empieza limpia (ajuste durante el render).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setNote(initialNote);
      setSetTo100(false);
      setValidationError(null);
      setServerError(null);
      setSubmitting(false);
    }
  }

  const req = reviewRequirementsOf({ progress, evidenceRequired, hasEvidence });
  const hasNote = note.trim() !== '';
  const progressPending = req.needsProgress && !setTo100;
  const evidencePending = req.needsEvidence && !hasNote;

  function focusFirstPending(): void {
    if (progressPending) progressButtonRef.current?.focus();
    else if (evidencePending) noteRef.current?.focus();
  }

  function handleOpenChange(next: boolean): void {
    if (!next && submitting) return;
    onOpenChange(next);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    if (progressPending || evidencePending) {
      const missing = missingRequirementsText({ needsProgress: progressPending, needsEvidence: evidencePending });
      setValidationError(`Completa lo que falta para enviar a revisión: ${missing}.`);
      focusFirstPending();
      return;
    }
    setValidationError(null);
    setServerError(null);
    setSubmitting(true);
    const extra: SubmitReviewExtra = {};
    if (req.needsProgress && setTo100) extra.progress = 100;
    if (hasNote) extra.evidenceUrl = note.trim();
    const error = await onConfirm(extra);
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
          // Foco en el primer control sin cumplir.
          if (req.needsProgress) progressButtonRef.current?.focus();
          else noteRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault();
        }}
        // Con algo ya completado, un clic fuera no cierra: no se pierde lo escrito por accidente.
        onInteractOutside={(event) => {
          if (submitting || hasNote || setTo100) event.preventDefault();
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
          <DialogTitle>Antes de enviar a revisión</DialogTitle>
          <DialogDescription>
            <span className="mb-1 block line-clamp-2 wrap-break-word">“{taskTitle}”</span>
            Para revisarla necesita lo siguiente.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="grid gap-3">
            {req.needsProgress ? (
              <RequirementRow done={setTo100} title="Avance al 100 %">
                <p className="text-sm text-muted-foreground">
                  {setTo100 ? 'Se guardará al 100 %.' : `Ahora está en ${formatPercent(progress)}.`}
                </p>
                <div>
                  <Button
                    ref={progressButtonRef}
                    type="button"
                    variant={setTo100 ? 'ghost' : 'outline'}
                    size="sm"
                    className="max-sm:min-h-11"
                    disabled={submitting}
                    aria-label={
                      setTo100
                        ? `Deshacer: no poner el avance de «${taskTitle}» en 100 %`
                        : `Poner el avance de «${taskTitle}» en 100 %`
                    }
                    onClick={() => {
                      setSetTo100((prev) => !prev);
                      setValidationError(null);
                    }}
                  >
                    {setTo100 ? 'Deshacer' : 'Poner el avance en 100 %'}
                  </Button>
                </div>
              </RequirementRow>
            ) : evidenceRequired ? (
              <RequirementRow done title="Avance al 100 %">
                <p className="text-sm text-muted-foreground">Ya está al 100 %.</p>
              </RequirementRow>
            ) : null}

            {evidenceRequired ? (
              req.needsEvidence ? (
                <RequirementRow done={hasNote} title="Evidencia">
                  <p className="text-sm text-muted-foreground">
                    {hasNote ? 'Se guardará con la tarea.' : 'Esta tarea exige evidencia.'}
                  </p>
                  <div className="grid gap-1.5">
                    <Label htmlFor={fieldId}>Nota o enlace de evidencia</Label>
                    <Textarea
                      ref={noteRef}
                      id={fieldId}
                      rows={3}
                      maxLength={EVIDENCE_NOTE_MAX}
                      value={note}
                      placeholder="Ej.: https://… o una descripción breve"
                      aria-describedby={helpId}
                      onChange={(event) => {
                        setNote(event.target.value);
                        setValidationError(null);
                      }}
                    />
                    <p id={helpId} className="text-meta text-muted-foreground">
                      Se guarda junto con el cambio de estado.
                    </p>
                  </div>
                  {onUploadFile ? (
                    <div className="grid gap-1">
                      <p className="text-sm text-muted-foreground">¿Prefieres un archivo?</p>
                      <div>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto px-0 max-sm:min-h-11"
                          disabled={submitting}
                          onClick={() => {
                            onOpenChange(false);
                            onUploadFile();
                          }}
                        >
                          Subir archivo en el detalle
                        </Button>
                      </div>
                      <p className="text-meta text-muted-foreground">
                        Cuando subas el archivo, vuelve a pulsar «Enviar a revisión».
                        {hasNote ? ' Se perderá lo escrito aquí.' : ''}
                      </p>
                    </div>
                  ) : null}
                </RequirementRow>
              ) : (
                <RequirementRow done title="Evidencia">
                  <p className="text-sm text-muted-foreground">Ya tiene evidencia.</p>
                </RequirementRow>
              )
            ) : null}

            <FormError id={fieldId} message={validationError ?? serverError} />
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
              {submitting ? 'Enviando…' : 'Enviar a revisión'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
