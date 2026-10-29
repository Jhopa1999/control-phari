import { ReunionesView } from './reuniones-view';

export const metadata = { title: 'Reuniones y compromisos' };

/** Módulo unificado de actas de reunión y compromisos (`meeting`). */
export default function ReunionesPage(): React.ReactElement {
  return <ReunionesView />;
}
