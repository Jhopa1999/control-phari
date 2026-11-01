'use client';

import * as React from 'react';
import { CircleAlert, SendHorizontal, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  MAX_MESSAGE_LENGTH,
  counterAnnouncement,
  counterState,
} from '@/lib/assistant-format';
import { cn } from '@/lib/utils';
import { useAssistant } from './assistant-provider';

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  /** Bloquea el envío (asistente no disponible, conversación cargando). */
  disabled?: boolean;
  /** Si el campo mismo debe estar deshabilitado (asistente no disponible). */
  fieldDisabled?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  className?: string;
}

const COUNTER = new Intl.NumberFormat('es-CO');

function isTouchPrimary(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Campo de mensaje del asistente. Enter envía con puntero fino y Mayús+Enter
 * inserta un salto; en táctil Enter inserta el salto y se envía con el botón.
 * Nunca se envía durante una composición IME.
 */
export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled = false,
  fieldDisabled = false,
  textareaRef,
  className,
}: ComposerProps): React.ReactElement {
  const { announce } = useAssistant();
  const helpId = React.useId();
  const counterId = React.useId();
  const errorId = React.useId();
  const ownRef = React.useRef<HTMLTextAreaElement | null>(null);
  const innerRef = textareaRef ?? ownRef;

  // Respaldo del autoajuste en navegadores sin `field-sizing` (solo toca el DOM).
  React.useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || (typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content'))) return;
    el.style.height = 'auto';
    el.style.height = `px`;
  }, [value, innerRef]);
  const length = value.length;
  const state = counterState(length);
  const over = state === 'over';
  const empty = value.trim() === '';
  const canSend = !empty && !over && !disabled && !fieldDisabled && !streaming;

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const next = event.target.value;
    const message = counterAnnouncement(counterState(value.length), counterState(next.length));
    if (message) announce(message);
    onChange(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    if (isTouchPrimary()) return;
    event.preventDefault();
    if (canSend) onSend();
  };

  const describedBy = [helpId, state !== 'hidden' ? counterId : null, over ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <form
      aria-label="Enviar mensaje al asistente"
      className={cn('flex flex-col gap-1.5', className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      <div className="flex items-end gap-2">
        <Textarea
          ref={innerRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={fieldDisabled}
          aria-label="Mensaje para el asistente"
          aria-describedby={describedBy}
          aria-invalid={over || undefined}
          autoComplete="off"
          enterKeyHint={isTouchPrimary() ? 'enter' : 'send'}
          placeholder={
            fieldDisabled ? 'El asistente no está disponible ahora.' : 'Escribe tu pregunta…'
          }
          className="max-h-32 min-h-11 resize-none text-base md:max-h-40 md:min-h-10 md:text-sm"
        />
        {streaming ? (
          <Button
            type="button"
            variant="outline"
            className="size-11 shrink-0 md:h-10 md:w-auto md:px-3"
            onClick={onStop}
          >
            <Square aria-hidden="true" />
            <span className="sr-only md:not-sr-only">Detener</span>
            <span className="sr-only md:hidden">respuesta</span>
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0 md:size-10"
            disabled={!canSend}
            aria-label="Enviar mensaje"
          >
            <SendHorizontal aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="flex items-start justify-between gap-3 text-meta text-muted-foreground">
        <p id={helpId} className="sr-only md:not-sr-only">
          {streaming
            ? 'Espera a que termine o pulsa Detener.'
            : 'Enter para enviar · Mayús+Enter para salto de línea'}
        </p>
        {state !== 'hidden' ? (
          <p
            id={counterId}
            className={cn(
              'ml-auto shrink-0 tabular-nums',
              state === 'warning' && 'text-warning',
              over && 'flex items-center gap-1 text-danger',
            )}
          >
            {over ? <CircleAlert className="size-3.5" aria-hidden="true" /> : null}
            {COUNTER.format(length)} / {COUNTER.format(MAX_MESSAGE_LENGTH)}
          </p>
        ) : null}
      </div>
      {over ? (
        <p id={errorId} className="text-meta text-danger">
          Tu mensaje supera el límite de 4 000 caracteres. Acórtalo para enviarlo.
        </p>
      ) : null}
    </form>
  );
}
