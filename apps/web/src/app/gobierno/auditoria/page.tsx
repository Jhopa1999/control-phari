import { Suspense } from 'react';
import { PageFallback } from '@/components/page-fallback';
import { AuditoriaView } from './auditoria-view';

export const metadata = { title: 'Auditoría' };

// La vista lee ?objectCode=, ?objectType= y ?actorUserId= (useSearchParams): el
// fallback ya trae el h1.
export default function AuditoriaPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <PageFallback
          title="Auditoría"
          description="Cambios registrados dentro de tu alcance."
          variant="detail"
        />
      }
    >
      <AuditoriaView />
    </Suspense>
  );
}
