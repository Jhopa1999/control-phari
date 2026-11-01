'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Preguntas de ejemplo para gestión de demanda (se envían al activarlas). */
export const SUGGESTED_QUESTIONS: readonly string[] = [
  '¿Qué solicitudes están bloqueadas y por qué?',
  '¿Qué solicitudes de prioridad P1 siguen abiertas?',
  'Muéstrame mis tareas que vencen esta semana.',
  '¿Qué solicitudes están pendientes de triage?',
  '¿Cómo apruebo un documento en el portal?',
];

export const TRUST_NOTE =
  'El asistente consulta tus datos del portal con tus permisos y puede equivocarse. Verifica la información importante.';

export interface AssistantEmptyStateProps {
  onPick: (question: string) => void;
  disabled?: boolean;
}

/** Estado vacío del chat: invitación y sugerencias que se envían de inmediato. */
export function AssistantEmptyState({
  onPick,
  disabled = false,
}: AssistantEmptyStateProps): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-6 text-center">
      <Sparkles className="size-5 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">¿En qué te puedo ayudar?</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Pregúntame por tus solicitudes, proyectos o cómo usar el portal.
        </p>
      </div>
      <ul aria-label="Preguntas sugeridas" className="flex w-full max-w-md flex-col gap-2">
        {SUGGESTED_QUESTIONS.map((question, index) => (
          <li key={question} className={index >= 3 ? 'max-[520px]:hidden' : undefined}>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => onPick(question)}
              className="h-auto min-h-11 w-full justify-start px-3 py-2 text-left font-normal whitespace-normal"
            >
              {question}
            </Button>
          </li>
        ))}
      </ul>
      <p className="max-w-sm text-meta text-muted-foreground">{TRUST_NOTE}</p>
    </div>
  );
}
