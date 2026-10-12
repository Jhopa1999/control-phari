'use client';

import * as React from 'react';
import Link from 'next/link';
import { FolderOpen } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { buttonVariants } from '@/components/ui/button';
import { useActor } from '@/lib/actor-context';

/**
 * Proyectos (design §11.14): la sección aún no existe, pero el ítem del menú y
 * su permiso son reales. Los enlaces a Planificación y Portafolio solo
 * aparecen si el actor tiene esos módulos (filtrado cosmético: el backend es la
 * autoridad).
 */
export function ProyectosView(): React.ReactElement {
  const { allowedModules } = useActor();
  const linkClass = buttonVariants({ variant: 'outline', size: 'sm' });
  return (
    <PageLayout>
      <PageHeader title="Proyectos" description="Seguimiento de proyectos en curso." />
      <div className="rounded-lg border bg-card">
        <EmptyState
          icon={FolderOpen}
          title="Esta sección estará disponible próximamente."
          description="Aquí podrás seguir los proyectos en curso. Mientras tanto, usa Planificación y Portafolio."
          action={
            allowedModules.has('plan') ? (
              <Link href="/seguimiento/plan" className={linkClass}>
                Ir a Planificación
              </Link>
            ) : undefined
          }
          secondaryAction={
            allowedModules.has('portfolio') ? (
              <Link href="/seguimiento/portafolio" className={linkClass}>
                Ir a Portafolio
              </Link>
            ) : undefined
          }
        />
      </div>
    </PageLayout>
  );
}
