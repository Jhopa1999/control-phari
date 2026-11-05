import { Suspense } from 'react';
import { MiTrabajoView } from './mi-trabajo-view';

export const metadata = { title: 'Mi trabajo' };

// useSearchParams (panel lateral con ?taskId=) exige un límite de Suspense.
export default function MiTrabajoPage(): React.ReactElement {
  return (
    <Suspense fallback={null}>
      <MiTrabajoView />
    </Suspense>
  );
}
