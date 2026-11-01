'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, History, Maximize2, SquarePen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { LabelTooltip } from '@/components/ui/tooltip';
import { AssistantConversation } from './assistant-conversation';
import { AssistantLiveRegion } from './assistant-live-region';
import { useAssistant } from './assistant-provider';
import { ConversationList } from './conversation-list';

/**
 * Panel lateral del asistente (Sheet derecho, modal): preguntas puntuales sin
 * salir de la pantalla. Tiene dos vistas internas (conversación / historial) y
 * un acceso a la página completa que conserva la conversación.
 */
export function AssistantPanel(): React.ReactElement {
  const a = useAssistant();
  const router = useRouter();
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const newButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const openFullPage = (): void => {
    a.setPanelOpen(false);
    router.push(a.conversationId ? `/asistente/${a.conversationId}` : '/asistente/nueva');
  };

  return (
    <Sheet open={a.panelOpen} onOpenChange={a.setPanelOpen}>
      <SheetContent
        side="right"
        closeLabel="Cerrar asistente"
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          textareaRef.current?.focus();
        }}
        className="w-full max-w-none gap-0 bg-background sm:w-[440px] xl:w-[480px]"
      >
        <header className="flex h-14 shrink-0 items-center gap-1 border-b pr-14 pl-4">
          {a.view === 'history' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() => {
                a.setView('chat');
                a.announce('Conversación.');
              }}
            >
              <ArrowLeft aria-hidden="true" />
              Volver a la conversación
            </Button>
          ) : null}
          <SheetTitle className={a.view === 'history' ? 'sr-only' : 'min-w-0 flex-1 truncate'}>
            {a.view === 'history' ? 'Conversaciones' : 'Asistente'}
          </SheetTitle>
          {a.view === 'chat' ? (
            <div className="flex shrink-0 items-center gap-0.5">
              <LabelTooltip label="Conversaciones">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Conversaciones"
                  onClick={() => {
                    a.setView('history');
                    a.announce('Conversaciones.');
                  }}
                >
                  <History aria-hidden="true" />
                </Button>
              </LabelTooltip>
              <LabelTooltip label="Nueva conversación">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Nueva conversación"
                  onClick={() => {
                    a.newConversation();
                    textareaRef.current?.focus();
                  }}
                >
                  <SquarePen aria-hidden="true" />
                </Button>
              </LabelTooltip>
              <LabelTooltip label="Abrir en página completa">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Abrir en página completa"
                  className="hidden sm:inline-flex"
                  onClick={openFullPage}
                >
                  <Maximize2 aria-hidden="true" />
                </Button>
              </LabelTooltip>
            </div>
          ) : null}
        </header>

        {a.view === 'history' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-4 pt-3">
              <h2 className="text-sm font-semibold">Conversaciones</h2>
              <Button
                ref={newButtonRef}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  a.newConversation();
                  textareaRef.current?.focus();
                }}
              >
                Nueva
              </Button>
            </div>
            <ConversationList
              activeId={a.conversationId}
              onOpen={(id) => {
                a.openConversation(id);
                window.setTimeout(() => textareaRef.current?.focus(), 0);
              }}
              fallbackFocus={() => newButtonRef.current}
            />
          </div>
        ) : (
          <AssistantConversation surface="canvas" textareaRef={textareaRef} />
        )}
        <AssistantLiveRegion />
      </SheetContent>
    </Sheet>
  );
}
