import { Suspense } from 'react';
import { PageFallback } from '@/components/page-fallback';
import { PlanView } from './plan-view';

export const metadata = { title: 'Planificación' };

// La vista lee ?requestId= (useSearchParams): el fallback ya trae el h1.
export default function PlanPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <PageFallback
          title="Planificación"
          description="Plan por fases y tareas de una solicitud comprometida. La guía indica qué falta para enviarlo a autorización."
        />
      }
    >
      <PlanView />
    </Suspense>
  );
}
