import { Suspense } from 'react';
import { PageFallback } from '@/components/page-fallback';
import { PriorizacionView } from './priorizacion-view';

export const metadata = { title: 'Priorización' };

// La vista lee ?requestId= (useSearchParams): el fallback ya trae el h1.
export default function PriorizacionPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <PageFallback
          title="Priorización"
          description="Evalúa ocho criterios de 1 a 5; el sistema calcula el score y la banda al guardar."
        />
      }
    >
      <PriorizacionView />
    </Suspense>
  );
}
