import { Suspense } from 'react';
import { PageFallback } from '@/components/page-fallback';
import { FrameworksView } from './frameworks-view';

export const metadata = { title: 'Controles de gobierno' };

// La vista lee ?requestId= (useSearchParams): el fallback ya trae el h1.
export default function FrameworksPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <PageFallback
          title="Controles de gobierno"
          description="Controles GC1–GC5, ruta proporcional y validaciones de cada solicitud."
        />
      }
    >
      <FrameworksView />
    </Suspense>
  );
}
