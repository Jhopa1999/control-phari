import { Suspense } from 'react';
import { PageFallback } from '@/components/page-fallback';
import { PortafolioView } from './portafolio-view';

export const metadata = { title: 'Portafolio' };

// La vista lee ?q= (useSearchParams): el fallback ya trae el h1.
export default function PortafolioPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <PageFallback
          title="Portafolio"
          description="Seguimiento de avance y fechas de las iniciativas comprometidas."
        />
      }
    >
      <PortafolioView />
    </Suspense>
  );
}
