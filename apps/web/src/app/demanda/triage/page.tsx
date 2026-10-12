import { Suspense } from 'react';
import { PageFallback } from '@/components/page-fallback';
import { TriageView } from './triage-view';

export const metadata = { title: 'Triage' };

// La vista lee ?requestId= (useSearchParams): el fallback ya trae el h1.
export default function TriagePage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <PageFallback
          title="Triage"
          description="Clasifica cada solicitud registrada y decide si continúa, se devuelve o se rechaza."
        />
      }
    >
      <TriageView />
    </Suspense>
  );
}
