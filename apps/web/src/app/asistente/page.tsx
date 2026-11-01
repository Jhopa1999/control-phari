import { AssistantPage } from '@/components/assistant/assistant-page';

export const metadata = { title: 'Asistente' };

/** Historial y conversación con el asistente de IA (lista en móvil, dos columnas en escritorio). */
export default function AsistentePage(): React.ReactElement {
  return <AssistantPage mode="list" />;
}