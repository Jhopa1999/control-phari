'use client';

import * as React from 'react';
import {
  Check,
  ChevronRight,
  CircleCheck,
  Copy,
  LoaderCircle,
  Sparkles,
  Square,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { InlineNotice } from '@/components/inline-notice';
import { MarkdownViewContent } from '@/components/markdown-view-content';
import { Button } from '@/components/ui/button';
import { capitalize, runningText, toolsSummary, type ToolView } from '@/lib/assistant-format';
import { cn } from '@/lib/utils';
import { useAssistant, type AssistantMessageView } from './assistant-provider';
import { ProposalCard } from './proposal-card';

/** Superficie del mensaje: sobre el lienzo (panel) o dentro de una tarjeta (página). */
export type MessageSurface = 'canvas' | 'card';

export function UserMessage({ text }: { text: string }): React.ReactElement {
  return (
    <article
      aria-label="Tu mensaje"
      className="ml-auto max-w-[85%] rounded-xl bg-primary-subtle px-3.5 py-2.5 text-sm wrap-break-word whitespace-pre-wrap text-foreground"
    >
      {text}
    </article>
  );
}

export function ThinkingIndicator(): React.ReactElement {
  return (
    <p className="flex items-center gap-2 text-meta text-muted-foreground">
      Pensando
      <span className="flex gap-0.5" aria-hidden="true">
        <span className="size-1 animate-pulse rounded-full bg-current motion-reduce:animate-none" />
        <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:150ms] motion-reduce:animate-none" />
        <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:300ms] motion-reduce:animate-none" />
      </span>
      <span className="sr-only">…</span>
    </p>
  );
}

/**
 * Herramientas consultadas en el turno: en curso muestra «Consultando X…»;
 * terminado, un resumen expandible con el detalle por fuente.
 */
export function ToolActivity({ tools }: { tools: ReadonlyArray<ToolView> }): React.ReactElement | null {
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  if (tools.length === 0) return null;

  if (tools.some((t) => t.status === 'running')) {
    return (
      <p className="flex items-center gap-2 text-meta text-muted-foreground">
        <LoaderCircle
          className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {runningText(tools)}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-8 items-center gap-1.5 self-start rounded-md text-meta font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-10"
      >
        <ChevronRight
          className={cn('size-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-90')}
          aria-hidden="true"
        />
        {toolsSummary(tools)}
      </button>
      <ul
        id={listId}
        aria-label="Fuentes consultadas"
        hidden={!open}
        className="mt-1.5 flex flex-col gap-1 pl-5 text-meta"
      >
        {tools.map((tool, index) => (
          <li key={tool.id ?? `${tool.label}-${index}`} className="flex items-center gap-1.5">
            {tool.status === 'error' ? (
              <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
            ) : (
              <CircleCheck className="size-3.5 shrink-0 text-success" aria-hidden="true" />
            )}
            <span>
              {capitalize(tool.label)}
              {tool.status === 'error' ? ' · no se pudo consultar' : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyButton({ text }: { text: string }): React.ReactElement {
  // `self-start`: dentro de la columna del mensaje el botón no se estira ni se centra.
  const { announce } = useAssistant();
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = (): void => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        announce('Respuesta copiada.');
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        toast.error('No se pudo copiar. Selecciona el texto y cópialo manualmente.');
      });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 self-start"
      onClick={copy}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? 'Copiado' : 'Copiar'}
    </Button>
  );
}

export interface AssistantMessageProps {
  message: AssistantMessageView;
  surface: MessageSurface;
  /** Solo el último turno fallido ofrece «Reintentar». */
  onRetry?: () => void;
  /** Punto de extensión (tarjetas de propuesta de acción, F3). */
  footer?: React.ReactNode;
}

function AssistantMessageBase({
  message,
  surface,
  onRetry,
  footer,
}: AssistantMessageProps): React.ReactElement {
  const waiting =
    message.status === 'streaming' &&
    message.text === '' &&
    message.tools.length === 0 &&
    message.proposals.length === 0;
  const finished = message.status === 'done' || message.status === 'stopped';

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 text-meta font-medium text-muted-foreground">
        <Sparkles className="size-3.5" aria-hidden="true" />
        Asistente
      </p>
      <article
        aria-label="Respuesta del asistente"
        tabIndex={-1}
        className={cn(
          'flex w-full min-w-0 flex-col gap-2.5 focus:outline-none',
          surface === 'canvas' ? 'rounded-xl bg-card px-4 py-3 shadow-card' : 'px-0 py-1',
        )}
      >
        {waiting ? <ThinkingIndicator /> : null}
        <ToolActivity tools={message.tools} />
        {message.text !== '' ? (
          <MarkdownViewContent content={message.text} variant="chat" />
        ) : null}

        {message.proposals.length > 0 ? (
          <div className="flex flex-col gap-2">
            {message.proposals.map((proposal) => (
              <ProposalCard key={proposal.id} proposal={proposal} />
            ))}
          </div>
        ) : null}

        {message.status === 'stopped' ? (
          <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
            <Square className="size-3" aria-hidden="true" />
            Respuesta detenida.
          </p>
        ) : null}

        {message.status === 'error' ? (
          <InlineNotice
            tone="danger"
            role="alert"
            title="El asistente no pudo completar la respuesta"
            action={
              onRetry ? (
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  Reintentar
                </Button>
              ) : null
            }
          >
            {message.errorMessage ??
              'Inténtalo de nuevo. Si el problema continúa, contacta al administrador del portal.'}
          </InlineNotice>
        ) : null}

        {finished && message.text !== '' ? <CopyButton text={message.text} /> : null}
        {footer}
      </article>
    </div>
  );
}

export const AssistantMessage = React.memo(AssistantMessageBase);
