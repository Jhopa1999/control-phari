import {
  api,
  apiBaseUrl,
  authHeaders,
  type AssistantStatus,
  type ChatRequest,
  type ConversationDetail,
  type ConversationSummary,
} from './api-client';
import { ApiError, toApiError } from './api-error';
import { createSseParser, type AssistantStreamEvent } from './assistant-sse';

export { ApiError };
export type { AssistantStatus, ConversationDetail, ConversationSummary };
export type { AssistantStreamEvent };

/**
 * Capa de consumo del asistente de IA (BL-032 F2). REST con el cliente tipado
 * del contrato; el chat usa `fetch` porque responde en streaming (SSE) y el
 * cliente tipado no lo expone. apps/web no toca la BD ni Bedrock.
 */

/** Disponibilidad del asistente para la persona actual. */
export async function getAssistantStatus(): Promise<AssistantStatus> {
  try {
    const { data, error, response } = await api.GET('/assistant/status');
    if (error || !data) throw toApiError(response.status);
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Conversaciones propias (las 50 más recientes). */
export async function listConversations(): Promise<ConversationSummary[]> {
  try {
    const { data, error, response } = await api.GET('/assistant/conversations');
    if (error || !data) throw toApiError(response.status);
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Una conversación propia con sus mensajes. */
export async function getConversation(id: string): Promise<ConversationDetail> {
  try {
    const { data, error, response } = await api.GET('/assistant/conversations/{id}', {
      params: { path: { id } },
    });
    if (error || !data) throw toApiError(response.status);
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Elimina una conversación propia. */
export async function deleteConversation(id: string): Promise<void> {
  try {
    const { error, response } = await api.DELETE('/assistant/conversations/{id}', {
      params: { path: { id } },
    });
    if (error) throw toApiError(response.status);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Mensaje del backend ante un 4xx/5xx previo al flujo (p. ej. 409 «desactivado»). */
async function messageFrom(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

export interface StreamChatOptions {
  message: string;
  conversationId?: string | null;
  signal: AbortSignal;
  onEvent: (event: AssistantStreamEvent) => void;
}

/**
 * Envía un mensaje y entrega los eventos a medida que llegan. Lanza `ApiError`
 * si la petición falla antes de abrir el flujo (con el motivo del servidor si
 * es un 409). Un corte de red a mitad del flujo lanza el error original de
 * `fetch` y quien llama decide cómo mostrarlo.
 */
export async function streamChat(options: StreamChatOptions): Promise<void> {
  const body: ChatRequest = {
    message: options.message,
    ...(options.conversationId ? { conversationId: options.conversationId } : {}),
  };
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...authHeaders(),
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    if (options.signal.aborted) throw err;
    throw toApiError(undefined);
  }

  if (!response.ok || !response.body) {
    const serverMessage = response.status === 409 ? await messageFrom(response) : undefined;
    const base = toApiError(response.status);
    throw new ApiError(serverMessage ?? base.message, response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      options.onEvent(event);
    }
  }
}
