import { IaAgentesView } from './ia-agentes-view';

export const metadata = { title: 'Agentes de IA' };

/**
 * Configuracion de agentes de IA (modulo aiSettings, solo ADMIN): estado global
 * de IA, agentes por code y prueba de conexion con Bedrock. El control real lo
 * aplica el backend (@Roles(ADMIN)); el gating de la vista es cosmetico.
 */
export default function IaAgentesPage(): React.ReactElement {
  return <IaAgentesView />;
}
