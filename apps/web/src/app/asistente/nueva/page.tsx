import { AssistantPage } from '@/components/assistant/assistant-page';

export const metadata = { title: 'Nueva conversación' };

/** Conversación nueva con el asistente de IA. */
export default function AsistenteNuevaPage(): React.ReactElement {
  return <AssistantPage mode="new" />;
}