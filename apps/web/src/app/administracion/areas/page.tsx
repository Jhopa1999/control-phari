import { AreasView } from './areas-view';

export const metadata = { title: 'Áreas' };

/**
 * Áreas organizativas (modulo `areas`, solo ADMIN): crea y edita areas como
 * Analitica, que agrupan procesos. El control real lo aplica el backend
 * (@Roles(ADMIN)); el gating de la vista es cosmetico.
 */
export default function AreasPage(): React.ReactElement {
  return <AreasView />;
}
