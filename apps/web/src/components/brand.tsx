import * as React from 'react';
import { ChartNoAxesCombined } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * Marca del portal (design §7.8). Es el ÚNICO lugar a tocar para el logo
 * corporativo: sustituir el contenido de BrandMark por
 * `<Image src="/logo.svg" alt="" width={28} height={28} />` de next/image. La
 * usan el menú lateral, la barra móvil, el login, las pantallas de carga de la
 * sesión y la de error global. Seguro para servidor (sin hooks ni Radix).
 */

/** Símbolo de 28 px; decorativo: el nombre lo aporta BrandName o el texto vecino. */
export function BrandMark({ className }: { className?: string }): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground',
        className,
      )}
    >
      <ChartNoAxesCombined className="size-4" />
    </span>
  );
}

/** «Portal del área» y, debajo, el área. */
export function BrandName({ className }: { className?: string }): React.ReactElement {
  return (
    <span className={cn('flex min-w-0 flex-col', className)}>
      <span className="truncate text-sm font-semibold leading-tight">Portal del área</span>{' '}
      <span className="truncate text-xs text-sidebar-muted-foreground">Analítica</span>
    </span>
  );
}
