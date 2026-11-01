import { AssistantPage } from '@/components/assistant/assistant-page';

export const metadata = { title: 'Asistente' };

/**
 * Conversación existente con el asistente. `params` es asíncrono en Next 16:
 * se resuelve en el servidor y el id se pasa a la vista cliente.
 */
export default async function AsistenteConversacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  return <AssistantPage mode="conversation" conversationId={id} />;
}
