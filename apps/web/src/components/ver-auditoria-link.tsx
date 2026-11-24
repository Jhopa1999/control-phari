'use client';

import * as React from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { useActor } from '@/lib/actor-context';
import { cn } from '@/lib/utils';

export interface VerAuditoriaLinkProps {
  /** Código visible del objeto: PRY-0012, ACT-0007 o DOC-0003. */
  code: string | null | undefined;
  /**
   * `row` añade el código al nombre accesible (filas y tarjetas, donde el
   * contexto no aclara de qué objeto es). En una cabecera basta el texto visible.
   */
  context?: 'header' | 'row';
  className?: string;
}

/**
 * Enlace a la Auditoría ya filtrada por el código del objeto
 * (`/gobierno/auditoria?objectCode=ACT-0007`). Solo se pinta si el actor tiene
 * el módulo de auditoría: sin él no se renderiza (un enlace deshabilitado sin
 * explicación no ayuda). El alcance de lo que verá lo decide la API.
 */
export function VerAuditoriaLink({
  code,
  context = 'header',
  className,
}: VerAuditoriaLinkProps): React.ReactElement | null {
  const { allowedModules } = useActor();
  if (!code || !allowedModules.has('audit')) return null;
  return (
    <Link
      href={`/gobierno/auditoria?objectCode=${encodeURIComponent(code)}`}
      aria-label={context === 'row' ? `Ver auditoría de ${code}` : undefined}
      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'max-md:min-h-11', className)}
    >
      <History aria-hidden="true" />
      Ver auditoría
    </Link>
  );
}
