'use client';

import * as React from 'react';
import { NoAccessNotice, type NoAccessCopy } from '@/components/no-access-notice';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { Skeleton } from '@/components/ui/skeleton';
import { useActor } from '@/lib/actor-context';

export interface ModuleGateProps {
  /** Módulo de `MODULE_MATRIX` que da acceso a la pantalla. */
  moduleKey: string;
  title: string;
  description?: string;
  copy: NoAccessCopy;
  children: React.ReactNode;
}

/**
 * Pantalla de ruta con el módulo requerido. Mientras los permisos cargan
 * muestra un esqueleto; sin el módulo, el encabezado y `NoAccessNotice`, sin
 * montar la vista (por eso no se dispara ninguna petición a la API).
 */
export function ModuleGate({
  moduleKey,
  title,
  description,
  copy,
  children,
}: ModuleGateProps): React.ReactElement {
  const { allowedModules, state } = useActor();
  if (state === 'loading' || state === 'none') {
    return (
      <PageLayout>
        <PageHeader title={title} description={description} />
        <div aria-busy="true">
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </PageLayout>
    );
  }
  if (state === 'success' && !allowedModules.has(moduleKey)) {
    return (
      <PageLayout>
        <PageHeader title={title} description={description} />
        <NoAccessNotice title={copy.title}>{copy.children}</NoAccessNotice>
      </PageLayout>
    );
  }
  return <>{children}</>;
}
