import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageLayoutProps {
  children: React.ReactNode;
  className?: string;
  /** fluid (1760 px, por defecto), form (960 px, a la izquierda) o reading (720 px, a la izquierda). */
  width?: 'fluid' | 'form' | 'reading';
}

const WIDTHS = {
  fluid: 'mx-auto max-w-[1760px]',
  form: 'mr-auto max-w-[960px]',
  reading: 'mr-auto max-w-[720px]',
} as const;

/**
 * Raíz de toda vista (design §7.1): columna de hasta 1760 px (fluid) con 24 px
 * entre bloques (16 px desde lg). Seguro para servidor (sin hooks ni Radix).
 */
export function PageLayout({
  children,
  className,
  width = 'fluid',
}: PageLayoutProps): React.ReactElement {
  return (
    <div className={cn('flex w-full flex-col gap-6 lg:gap-4', WIDTHS[width], className)}>
      {children}
    </div>
  );
}
