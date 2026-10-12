import { Suspense } from 'react';
import { PageFallback } from '@/components/page-fallback';
import { TareasView } from './tareas-view';

export const metadata = { title: 'Tarea' };

// La vista lee ?taskId= (useSearchParams): el fallback ya trae el h1.
export default function TareasPage(): React.ReactElement {
  return (
    <Suspense fallback={<PageFallback title="Tarea" variant="detail" />}>
      <TareasView />
    </Suspense>
  );
}
