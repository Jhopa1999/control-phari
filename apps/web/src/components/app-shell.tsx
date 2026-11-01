import * as React from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { AssistantPanel } from '@/components/assistant/assistant-panel';
import { AssistantProvider } from '@/components/assistant/assistant-provider';
import { AssistantTrigger } from '@/components/assistant/assistant-trigger';
import { MobileNav } from '@/components/mobile-nav';
import { NotificationBell } from '@/components/notification-bell';
import { SkipLink } from '@/components/skip-link';
import { UserMenu } from '@/components/user-menu';

/**
 * Shell del portal (design §8.1): «Saltar al contenido», menú lateral (≥1024 px),
 * barra superior con cajón (<1024 px) y el único `main#contenido`, destino del
 * skip link. `min-w-0` en la columna deja que el contenido se estreche junto al
 * menú: sin él, el ancho mínimo de una tabla ensancharía la página en lugar de
 * desplazarse dentro de su región.
 */
export function AppShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <AssistantProvider>
      <SkipLink />
      <div className="flex min-h-dvh bg-background">
        <AppSidebar variant="desktop" />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileNav />
          {/* Barra superior de escritorio: centro de notificaciones (NOT-01). */}
          <div className="sticky top-0 z-30 hidden h-12 items-center justify-end gap-2 border-b bg-background/95 px-4 backdrop-blur lg:flex md:px-6 xl:px-8">
            <AssistantTrigger />
            <NotificationBell />
            <UserMenu />
          </div>
          <main
            id="contenido"
            tabIndex={-1}
            className="flex-1 px-4 py-5 focus:outline-none md:px-6 md:py-6 xl:px-8"
          >
            {children}
          </main>
        </div>
      </div>
      <AssistantPanel />
    </AssistantProvider>
  );
}
