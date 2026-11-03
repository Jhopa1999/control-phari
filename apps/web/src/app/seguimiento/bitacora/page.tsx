import { Suspense } from 'react';
import { PageFallback } from '@/components/page-fallback';
import { BitacoraView } from './bitacora-view';

export const metadata = { title: 'Bitácora' };

// La vista lee los filtros de la URL (useSearchParams): el fallback ya trae el h1.
export default function BitacoraPage(): React.ReactElement {
  return (
    <Suspense fallback={<PageFallback title="Bitácora" />}>
      <BitacoraView />
    </Suspense>
  );
}
