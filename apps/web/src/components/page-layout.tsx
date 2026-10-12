import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageLayoutProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Raíz de toda vista (design §7.1): columna centrada de hasta 1600 px con 24 px
 * entre bloques. Seguro para servidor (sin hooks ni Radix).
 */
export function PageLayout({ children, className }: PageLayoutProps): React.ReactElement {
  return (
    <div className={cn('mx-auto flex w-full max-w-[1600px] flex-col gap-6', className)}>
      {children}
    </div>
  );
}
