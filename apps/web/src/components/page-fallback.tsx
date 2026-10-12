import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { Skeleton } from '@/components/ui/skeleton';

export interface PageFallbackProps {
  /** Mismo h1 que la vista (en Tareas, «Tarea»). */
  title: string;
  /** Misma descripción que la vista. */
  description?: string;
  /** 'workbench' (por defecto) añade la barra de contexto; 'detail' la omite. */
  variant?: 'workbench' | 'detail';
}

/**
 * Fallback de los <Suspense> de las vistas que leen ?requestId= o ?taskId=
 * (design §7.9.1): el HTML prerenderizado ya trae el h1. Seguro para servidor
 * (sin hooks ni Radix).
 */
export function PageFallback({
  title,
  description,
  variant = 'workbench',
}: PageFallbackProps): React.ReactElement {
  return (
    <PageLayout>
      <PageHeader title={title} description={description} />
      {variant === 'workbench' ? <Skeleton className="h-16 rounded-lg" /> : null}
      <Skeleton className="h-64 rounded-lg" />
    </PageLayout>
  );
}
