import { RequestersView } from './requesters-view';

export const metadata = { title: 'Solicitantes' };

/**
 * Maestro de solicitantes (modulo `requesters`, ADMIN y JEFE_AREA): cada
 * solicitante se asocia a un área. El control real lo aplica el backend.
 */
export default function RequestersPage(): React.ReactElement {
  return <RequestersView />;
}
