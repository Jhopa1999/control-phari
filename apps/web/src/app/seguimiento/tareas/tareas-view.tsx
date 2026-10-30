'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ListChecks } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader, type Crumb } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { buttonVariants } from '@/components/ui/button';
import { useActor } from '@/lib/actor-context';
import { TaskDetail } from './task-detail';

/**
 * Página de detalle de una tarea (se llega desde Mi trabajo). En Planificación
 * el mismo detalle se abre como panel lateral.
 */
export function TareasView(): React.ReactElement {
  const searchParams = useSearchParams();
  const taskIdParam = searchParams.get('taskId');
  const router = useRouter();
  const { allowedModules } = useActor();

  const breadcrumbs: Crumb[] | undefined = allowedModules.has('assigned')
    ? [{ label: 'Mi trabajo', href: '/mi-trabajo' }]
    : undefined;

  // Sin ?taskId= esta página no tiene contenido propio: quien puede ver «Mi
  // trabajo» aterriza ahí (auditoría UX B1). Quien no, ve el estado vacío.
  const redirectToMyWork = !taskIdParam && allowedModules.has('assigned');
  React.useEffect(() => {
    if (redirectToMyWork) router.replace('/mi-trabajo');
  }, [redirectToMyWork, router]);

  if (redirectToMyWork) return <PageLayout>{null}</PageLayout>;

  if (!taskIdParam) {
    return (
      <PageLayout>
        <PageHeader title="Detalle de tarea" breadcrumbs={breadcrumbs} />
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={ListChecks}
            title="Elige una tarea para ver su detalle."
            description="Abre una tarea desde Mi trabajo o desde la lista de tareas de un plan."
            action={
              allowedModules.has('assigned') ? (
                <Link href="/mi-trabajo" className={buttonVariants({ variant: 'outline' })}>
                  Ir a Mi trabajo
                </Link>
              ) : undefined
            }
            secondaryAction={
              allowedModules.has('plan') ? (
                <Link href="/seguimiento/plan" className={buttonVariants({ variant: 'outline' })}>
                  Ir a Planificación
                </Link>
              ) : undefined
            }
          />
        </div>
      </PageLayout>
    );
  }

  return <TaskDetail taskId={taskIdParam} breadcrumbs={breadcrumbs} />;
}
