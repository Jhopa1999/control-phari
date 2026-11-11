import { Suspense } from 'react';
import { PageFallback } from '@/components/page-fallback';
import { SolicitudesView } from './solicitudes-view';

export const metadata = { title: 'Solicitudes' };

// La vista lee ?proceso= (useSearchParams): el fallback ya trae el h1.
export default function SolicitudesPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <PageFallback
          title="Solicitudes"
          description="Bandeja de entrada y gestión de solicitudes."
        />
      }
    >
      <SolicitudesView />
    </Suspense>
  );
}
