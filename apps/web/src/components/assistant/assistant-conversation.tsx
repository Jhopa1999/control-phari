'use client';

import * as React from 'react';
import { MessageSquareOff } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { InlineNotice } from '@/components/inline-notice';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AssistantEmptyState } from './assistant-empty-state';
import { useAssistant } from './assistant-provider';
import { ChatThread } from './chat-thread';
import type { MessageSurface } from './chat-messages';
import { Composer } from './composer';

/** Aviso cuando el asistente no está disponible (apagado, sin presupuesto...). */
export function AssistantUnavailableNotice({
  reason,
  className,
}: {
  reason: string | null;
  className?: string;
}): React.ReactElement {
  return (
    <InlineNotice
      tone="warning"
      role="status"
      title="El asistente no está disponible"
      className={className}
    >
      <p>{reason ?? 'El asistente no está disponible por ahora.'}</p>
      <p className="text-muted-foreground">
        Puedes seguir leyendo tus conversaciones anteriores.
      </p>
    </InlineNotice>
  );
}

export interface AssistantConversationProps {
  surface: MessageSurface;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  className?: string;
}

/**
 * Conversación activa: avisos, hilo (o estado vacío con sugerencias) y
 * composer. Sirve al panel lateral y a la página; ambos comparten el estado.
 */
export function AssistantConversation({
  surface,
  textareaRef,
  className,
}: AssistantConversationProps): React.ReactElement {
  const a = useAssistant();
  const unavailable = a.availability.state === 'unavailable';

  const body = (): React.ReactElement => {
    if (a.loadingConversation) {
      return (
        <div role="status" aria-busy="true" className="flex flex-1 flex-col gap-4 px-4 py-4">
          <span className="sr-only">Cargando conversación…</span>
          <Skeleton className="ml-auto h-10 w-2/3 rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      );
    }
    if (a.loadFailure === 'not-found') {
      return (
        <EmptyState
          size="compact"
          icon={MessageSquareOff}
          title="No encontramos esta conversación."
          description="Puede que se haya eliminado."
          action={
            <Button type="button" onClick={a.newConversation}>
              Nueva conversación
            </Button>
          }
        />
      );
    }
    if (a.loadFailure === 'error') {
      return (
        <ErrorState
          size="compact"
          title="No fue posible cargar la conversación."
          onRetry={() => a.conversationId && a.openConversation(a.conversationId)}
        />
      );
    }
    if (a.messages.length === 0) {
      return <AssistantEmptyState onPick={a.send} disabled={unavailable || a.streaming} />;
    }
    return (
      <ChatThread
        messages={a.messages}
        surface={surface}
        streaming={a.streaming}
        onRetry={a.retry}
      >
        {a.turnError ? (
          <InlineNotice
            tone={a.turnError.tone}
            role={a.turnError.tone === 'danger' ? 'alert' : 'status'}
            title={a.turnError.title}
            action={
              a.turnError.canRetry ? (
                <Button type="button" variant="outline" size="sm" onClick={a.retry}>
                  Reintentar
                </Button>
              ) : null
            }
          >
            {a.turnError.message}
          </InlineNotice>
        ) : null}
      </ChatThread>
    );
  };

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      {unavailable ? (
        <AssistantUnavailableNotice
          reason={a.availability.reason}
          className="mx-3 mt-3 shrink-0"
        />
      ) : null}
      {body()}
      {/* Un fallo del envío antes de empezar el flujo, sin hilo todavía. */}
      {a.messages.length === 0 && a.turnError && !a.loadingConversation ? (
        <InlineNotice
          tone={a.turnError.tone}
          role={a.turnError.tone === 'danger' ? 'alert' : 'status'}
          title={a.turnError.title}
          className="mx-3 mb-2 shrink-0"
        >
          {a.turnError.message}
        </InlineNotice>
      ) : null}
      <div className="shrink-0 border-t bg-background px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-4">
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            value={a.draft}
            onChange={a.setDraft}
            onSend={() => a.send(a.draft)}
            onStop={a.stop}
            streaming={a.streaming}
            disabled={a.loadingConversation}
            fieldDisabled={unavailable}
            textareaRef={textareaRef}
          />
        </div>
      </div>
    </div>
  );
}
