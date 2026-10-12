import { Suspense } from 'react';
import { TareasView } from './tareas-view';

export const metadata = { title: 'Tarea' };

export default function TareasPage(): React.ReactElement {
  return (
    <Suspense>
      <TareasView />
    </Suspense>
  );
}
