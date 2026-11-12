'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { AssistantTrigger } from '@/components/assistant/assistant-trigger';
import { BrandName } from '@/components/brand';
import { GlobalCodeSearch } from '@/components/global-code-search';
import { NotificationBell } from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { UserMenu } from '@/components/user-menu';

/** A partir de aquí manda el sidebar de escritorio (lg). */
const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * Barra superior por debajo de 1024 px (design §8.2 y §8.4): «Abrir menú» y la
 * marca. El cajón contiene el mismo sidebar, siempre expandido, y se cierra al
 * elegir un enlace, al cambiar de ruta, al pasar a ≥1024 px (su contenido vive
 * en un portal y `lg:hidden` no lo oculta), con Escape o con clic fuera. Radix
 * devuelve el foco al botón, que por eso no lleva tooltip (§14).
 */
export function MobileNav(): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const pathname = usePathname();

  // Respaldo de onNavigate (p. ej. atrás/adelante con el cajón abierto).
  useResetOnChange([pathname], () => {
    setOpen(false);
  });

  React.useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent): void => {
      if (event.matches) {
        setOpen(false);
        setSearching(false);
      }
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 print:hidden items-center gap-2 bg-card/90 px-3 backdrop-blur lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild className={searching ? 'hidden' : undefined}>
          <Button type="button" variant="ghost" size="icon" aria-label="Abrir menú">
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        {/* Sin descripción: el título basta para nombrar el diálogo. */}
        <SheetContent side="left" tone="sidebar" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Menú principal</SheetTitle>
          <AppSidebar variant="drawer" onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      {/* Modo búsqueda (design §3): el campo ocupa la fila y el resto se oculta. */}
      <BrandName showTagline={false} className={searching ? 'hidden' : 'min-w-0'} />
      <div className={searching ? 'flex min-w-0 flex-1 items-center' : 'ml-auto flex items-center gap-1'}>
        <React.Suspense fallback={null}>
          <GlobalCodeSearch placement="mobile" onModeChange={setSearching} />
        </React.Suspense>
        <div className={searching ? 'hidden' : 'contents'}>
          <AssistantTrigger iconOnly />
          <NotificationBell />
        </div>
      </div>
      <div className={searching ? 'hidden' : 'contents'}>
        <ThemeToggle />
        <UserMenu />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-brand-gradient forced-colors:hidden print:hidden" />
    </header>
  );
}
