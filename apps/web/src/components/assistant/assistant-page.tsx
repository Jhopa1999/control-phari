'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, SquarePen } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AssistantConversation } from './assistant-conversation';
import { AssistantLiveRegion } from './assistant-live-region';
import { useAssistant } from './assistant-provider';
import { ConversationList } from './conversation-list';

export type AssistantPageMode = 'list' | 'new' | 'conversation';

export interface AssistantPageProps {
  mode: AssistantPageMode;
  /** Solo en `conversation`. */
  conversationId?: string;
}

const CARD = 'flex min-h-0 flex-col rounded-xl bg-card shadow-card';
const HEIGHT = 'h-[calc(100dvh-6rem)] md:h-[calc(100dvh-6.5rem)] lg:h-[calc(100dvh-6rem)]';

/**
 * Página completa del asistente. En ≥1280 px: historial + conversación en dos
 * columnas. Por debajo, pantallas separadas: `/asistente` (lista) y
 * `/asistente/nueva` o `/asistente/{id}` (conversación). Comparte el estado del
 * panel: es la misma conversación.
 */
export function AssistantPage({ mode, conversationId }: AssistantPageProps): React.ReactElement {
  const a = useAssistant();
  const router = useRouter();
  const { openConversation, newConversation } = a;
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Alinea la conversación activa con la URL al entrar.
  React.useEffect(() => {
    if (mode === 'conversation' && conversationId) {
      openConversation(conversationId);
    } else if (mode === 'new') {
      newConversation();
    }
    // Solo al entrar o cambiar de destino; abrir ya ignora la conversación activa repetida.
  }, [mode, conversationId, openConversation, newConversation]);

  // Una conversación nueva recibe su id al primer mensaje: la URL lo refleja sin remontar.
  const createdId = mode === 'new' ? a.conversationId : null;
  React.useEffect(() => {
    if (createdId) window.history.replaceState(null, '', `/asistente/${createdId}`);
  }, [createdId]);

  const title = a.title ?? 'Nueva conversación';
  const showList = mode === 'list';

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Asistente</h1>
      {showList ? (
        <div className="xl:hidden">
          <PageHeader
            title="Asistente"
            description="Pregunta por tus solicitudes y proyectos, o cómo usar el portal."
            actions={
              <Button asChild>
                <Link href="/asistente/nueva" onClick={newConversation}>
                  Nueva conversación
                </Link>
              </Button>
            }
          />
        </div>
      ) : null}
      <div
        className={cn(
          'grid min-h-[28rem] grid-cols-1 gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]',
          showList ? 'xl:h-[calc(100dvh-6rem)]' : HEIGHT,
        )}
      >
        <section
          aria-labelledby="asistente-historial"
          className={cn(CARD, showList ? 'flex' : 'hidden xl:flex')}
        >
          <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <h2 id="asistente-historial" className="text-sm font-semibold">
              Conversaciones
            </h2>
            <Button asChild variant="outline" size="sm">
              <Link href="/asistente/nueva" onClick={newConversation}>
                Nueva
              </Link>
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ConversationList
              activeId={a.conversationId}
              hrefFor={(id) => `/asistente/${id}`}
              onDeleted={() => {
                if (mode === 'conversation') router.push('/asistente/nueva');
              }}
            />
          </div>
        </section>

        <section
          aria-labelledby="asistente-conversacion"
          className={cn(CARD, showList ? 'hidden xl:flex' : 'flex')}
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <Button asChild variant="ghost" size="sm" className="-ml-2 xl:hidden">
              <Link href="/asistente">
                <ArrowLeft aria-hidden="true" />
                Conversaciones
              </Link>
            </Button>
            <h2
              id="asistente-conversacion"
              className="min-w-0 flex-1 truncate text-sm font-semibold"
            >
              {title}
            </h2>
            <Button asChild variant="ghost" size="icon-sm">
              <Link
                href="/asistente/nueva"
                aria-label="Nueva conversación"
                onClick={newConversation}
              >
                <SquarePen aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <AssistantConversation surface="card" textareaRef={textareaRef} />
        </section>
      </div>
      <AssistantLiveRegion />
    </div>
  );
}
