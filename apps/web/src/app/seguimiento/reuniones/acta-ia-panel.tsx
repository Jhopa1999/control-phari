'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Field } from '@/components/field';
import { InlineNotice } from '@/components/inline-notice';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { MeetingAiProposal } from '@/lib/api-client';
import {
  MeetingAiError,
  structureMeetingNotes,
  toMeetingAiError,
  type MeetingAiUiStatus,
} from '@/lib/meetings-ai';

interface ActaIaPanelProps {
  /** Estado de la ayuda según la API: apagada = no se pinta. */
  status: MeetingAiUiStatus;
  /** Motivo que trae la API cuando no está disponible. */
  unavailableMessage?: string;
  processId: string;
  meetingDate: string;
  participantUserIds: string[];
  /** Texto de las notas: vive en el diálogo para conservarse entre vistas. */
  text: string;
  onTextChange: (text: string) => void;
  /** Resumen del último resultado aplicado; se retira al cambiar el texto. */
  appliedNotice: string | null;
  onProposal: (proposal: MeetingAiProposal) => void;
  /** Un 403 o un 409 bloquean la ayuda el resto de la sesión del diálogo. */
  onBlocked: () => void;
  /** Se pidió enviar el acta: se cancela cualquier petición en curso. */
  cancelSignal: number;
  disabled: boolean;
  /** Foco al botón (al descartar la propuesta o quitar el último compromiso). */
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Bloque «Estructurar con IA» del formulario del acta. Solo pide una propuesta:
 * el texto de las notas no se guarda y nada se registra por sí solo.
 */
export function ActaIaPanel({
  status,
  unavailableMessage,
  processId,
  meetingDate,
  participantUserIds,
  text,
  onTextChange,
  appliedNotice,
  onProposal,
  onBlocked,
  cancelSignal,
  disabled,
  buttonRef,
}: ActaIaPanelProps): React.ReactElement | null {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<MeetingAiError | null>(null);
  const [textError, setTextError] = React.useState<string | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);
  const textRef = React.useRef<HTMLTextAreaElement>(null);

  // Al enviar el acta o al cerrar el diálogo se aborta la petición en curso.
  React.useEffect(() => {
    controllerRef.current?.abort();
  }, [cancelSignal]);
  React.useEffect(() => () => controllerRef.current?.abort(), []);

  if (status === 'off' || status === 'checking') return null;

  const blocked = status === 'unavailable';
  const noProcess = processId === '';
  const unavailableReason = blocked
    ? (unavailableMessage ?? 'La ayuda de IA no está disponible por ahora. Puedes escribir el acta a mano.')
    : noProcess
      ? 'Elige primero un proceso para usar la IA.'
      : null;

  async function run(): Promise<void> {
    if (unavailableReason) return;
    if (text.trim() === '') {
      setTextError('Escribe o pega el texto de la reunión para que la IA lo ordene.');
      textRef.current?.focus();
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const proposal = await structureMeetingNotes(
        { processId, meetingDate, text, participantUserIds },
        controller.signal,
      );
      onProposal(proposal);
    } catch (err) {
      if (controller.signal.aborted) return;
      const failure = err instanceof MeetingAiError ? err : toMeetingAiError(undefined);
      setError(failure);
      if (failure.blocksSession) onBlocked();
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setLoading(false);
    }
  }

  function cancel(): void {
    controllerRef.current?.abort();
    setLoading(false);
    buttonRef.current?.focus();
  }

  return (
    <section
      aria-labelledby="reu-ia-title"
      className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-link" aria-hidden="true" />
        <h3 id="reu-ia-title" className="text-sm font-semibold text-foreground">
          Estructurar con IA
        </h3>
      </div>
      <p className="text-meta text-muted-foreground">
        Señal orientativa: nada se registra por sí solo. Revisa y confirma antes de usar el resultado.
      </p>

      <Field
        id="reu-ia-text"
        label="Notas de la reunión"
        help="Pega o escribe lo que se habló, tal como lo tengas. Este texto no se guarda en el acta: solo sirve para que la IA lo ordene."
        error={textError}
      >
        <Textarea
          ref={textRef}
          className="min-h-32 max-h-80 resize-y"
          autoComplete="off"
          spellCheck
          readOnly={loading}
          aria-busy={loading || undefined}
          disabled={disabled}
          placeholder="Ejemplo: Se acordó mover el lanzamiento al 15. Marta envía el informe el viernes…"
          value={text}
          onChange={(e) => {
            onTextChange(e.target.value);
            setTextError(null);
            setError(null);
          }}
        />
      </Field>

      <InlineNotice tone="info" role="note">
        El texto que escribas aquí, la fecha de la reunión y los nombres de las personas del proceso
        se envían al modelo de IA configurado por la organización. No se envían correos,
        identificadores ni el resto del acta. No pegues información que no deba salir de la
        organización.
      </InlineNotice>

      {blocked ? (
        <InlineNotice tone="warning" role="note">
          {unavailableReason}
        </InlineNotice>
      ) : null}

      {error ? (
        <InlineNotice
          tone={error.tone}
          role="alert"
          title={error.title}
          action={
            error.retry ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void run()}>
                Reintentar
              </Button>
            ) : undefined
          }
        >
          {error.message}
        </InlineNotice>
      ) : null}

      {appliedNotice && !error ? (
        <InlineNotice tone="success" role="status">
          {appliedNotice}
        </InlineNotice>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span id="reu-ia-state" aria-live="polite" className="text-meta text-muted-foreground">
          {loading
            ? 'Estructurando tu texto. Puede tardar unos segundos.'
            : !blocked && noProcess
              ? 'Elige primero un proceso para usar la IA.'
              : ''}
        </span>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {loading ? (
            <Button type="button" variant="ghost" onClick={cancel}>
              Cancelar
            </Button>
          ) : null}
          <Button
            ref={buttonRef}
            type="button"
            variant="outline"
            className="w-full sm:w-auto pointer-coarse:min-h-11"
            loading={loading}
            unavailable={Boolean(unavailableReason) && !loading}
            aria-describedby="reu-ia-state"
            disabled={disabled}
            onClick={() => void run()}
          >
            <Sparkles aria-hidden="true" />
            {loading ? 'Estructurando…' : 'Estructurar con IA'}
          </Button>
        </div>
      </div>
      {loading ? (
        <span className="sr-only" role="status">
          Estructurando tu texto. Puede tardar unos segundos.
        </span>
      ) : null}
    </section>
  );
}
