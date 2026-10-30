'use client';

import * as React from 'react';
import { useResetOnChange } from '@/lib/use-reset-on-change';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { AppSidebar } from '@/components/app-sidebar';
import { BrandName } from '@/components/brand';
import { NotificationBell } from '@/components/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

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
  const pathname = usePathname();

  // Respaldo de onNavigate (p. ej. atrás/adelante con el cajón abierto).
  useResetOnChange([pathname], () => {
    setOpen(false);
  });

  React.useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent): void => {
      if (event.matches) setOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Abrir menú">
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        {/* Sin descripción: el título basta para nombrar el diálogo. */}
        <SheetContent side="left" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Menú principal</SheetTitle>
          <AppSidebar variant="drawer" onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <BrandName showTagline={false} className="min-w-0" />
      <NotificationBell className="ml-auto" />
      <ThemeToggle />
    </header>
  );
}
