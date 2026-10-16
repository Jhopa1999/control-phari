import { ProcesosView } from './procesos-view';

export const metadata = { title: 'Procesos' };

/**
 * Procesos (modulo `processesAdmin`, ADMIN y JEFE_AREA): crea y edita procesos
 * (por ejemplo, BI, Integraciones, IA) dentro de un area. El control real lo
 * aplica el backend (@Roles(ADMIN, JEFE_AREA)); el gating de la vista es
 * cosmetico.
 */
export default function ProcesosPage(): React.ReactElement {
  return <ProcesosView />;
}
