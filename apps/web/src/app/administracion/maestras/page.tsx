import { CatalogsView } from '@/app/catalogs/catalogs-view';

export const metadata = { title: 'Configuracion / maestras | Portal del area' };

/**
 * SCR-18 Configuracion / maestras: reutiliza la vista existente de /catalogs
 * sin duplicar codigo (design 5.1 / 5.4). /catalogs se mantiene operativo.
 */
export default function MaestrasPage(): React.ReactElement {
  return <CatalogsView />;
}
