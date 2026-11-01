'use client';

import * as React from 'react';
import { ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChatMessageView } from './assistant-provider';
import { AssistantMessage, UserMessage, type MessageSurface } from './chat-messages';

/** Distancia al fondo (px) hasta la que el hilo sigue anclado abajo. */
const STICK_THRESHOLD = 80;

export interface ChatThreadProps {
  messages: ReadonlyArray<ChatMessageView>;
  surface: MessageSurface;
  streaming: boolean;
  onRetry: () => void;
  /** Contenido que va al final del hilo (avisos de error del envío). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Hilo de la conversación. `role="log"` con `aria-live="off"` explícito: el
 * texto en streaming no se lee fragmento a fragmento (los hitos los anuncia la
 * región viva). Se mantiene anclado al fondo mientras la persona no se aleje y,
 * si se aleja, muestra «Ir al final».
 */
export function ChatThread({
  messages,
  surface,
  streaming,
  onRetry,
  children,
  className,
}: ChatThreadProps): React.ReactElement {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const stuck = React.useRef(true);
  const [atBottom, setAtBottom] = React.useState(true);
  // Última firma de contenido que la persona ya vio (al estar al fondo).
  const [seen, setSeen] = React.useState('');

  const lastMessage = messages[messages.length - 1];
  const signature = `${messages.length}:${lastMessage?.text.length ?? 0}:${
    lastMessage?.role === 'assistant' ? lastMessage.tools.length : 0
  }`;
  const signatureRef = React.useRef(signature);
  React.useEffect(() => {
    signatureRef.current = signature;
  });
  const hasNew = !atBottom && signature !== seen;

  const scrollToEnd = React.useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior:
        smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'smooth'
          : 'auto',
    });
  }, []);

  const handleScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD;
    stuck.current = near;
    setAtBottom(near);
    if (near) setSeen(signatureRef.current);
  };

  // Contenido nuevo: si estaba anclado al fondo, baja con él.
  React.useLayoutEffect(() => {
    if (stuck.current) scrollToEnd();
  }, [signature, scrollToEnd]);

  // Enviar un mensaje fuerza el anclaje.
  const lastRole = lastMessage?.role;
  const count = messages.length;
  React.useLayoutEffect(() => {
    if (lastRole === 'user' || (lastRole === 'assistant' && count <= 2)) {
      stuck.current = true;
      scrollToEnd();
    }
  }, [count, lastRole, scrollToEnd]);

  const lastAssistantIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i;
    return -1;
  })();

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
      <div
        ref={scrollRef}
        role="log"
        aria-label="Conversación con el asistente"
        aria-live="off"
        aria-relevant="additions"
        aria-busy={streaming}
        tabIndex={0}
        onScroll={handleScroll}
        className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4 scroll-smooth focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:scroll-auto md:px-6"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {messages.map((message, index) =>
            message.role === 'user' ? (
              <UserMessage key={message.id} text={message.text} />
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                surface={surface}
                onRetry={
                  message.status === 'error' && index === lastAssistantIndex && !streaming
                    ? onRetry
                    : undefined
                }
              />
            ),
          )}
          {children}
        </div>
      </div>
      {!atBottom ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            stuck.current = true;
            setSeen(signatureRef.current);
            scrollToEnd(true);
          }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background shadow-card"
        >
          <ArrowDown aria-hidden="true" />
          {hasNew ? 'Ir al final · hay respuesta nueva' : 'Ir al final'}
        </Button>
      ) : null}
    </div>
  );
}
