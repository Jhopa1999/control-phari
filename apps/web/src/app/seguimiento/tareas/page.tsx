import { Suspense } from 'react';
import { TareasView } from './tareas-view';

export const metadata = { title: 'Tareas | Portal del area' };

export default function TareasPage(): React.ReactElement {
  return (
    <Suspense>
      <TareasView />
    </Suspense>
  );
}
