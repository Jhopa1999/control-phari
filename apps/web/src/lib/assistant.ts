import {
  api,
  apiBaseUrl,
  authHeaders,
  type AssistantStatus,
  type Attachment,
  type ChatRequest,
  type ConversationDetail,
  type ConversationSummary,
  type Proposal,
} from './api-client';
import { ApiError, toApiError } from './api-error';
import { createSseParser, type AssistantStreamEvent } from './assistant-sse';

export { ApiError };
export type { AssistantStatus, Attachment, ConversationDetail, ConversationSummary, Proposal };
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

/** Confirma una propuesta: el backend la ejecuta con los permisos de la persona. */
export async function confirmProposal(id: string): Promise<Proposal> {
  try {
    const { data, error, response } = await api.POST('/assistant/proposals/{id}/confirm', {
      params: { path: { id } },
    });
    if (error || !data) throw proposalError(response, error);
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Descarta una propuesta sin ejecutarla. */
export async function discardProposal(id: string): Promise<Proposal> {
  try {
    const { data, error, response } = await api.POST('/assistant/proposals/{id}/discard', {
      params: { path: { id } },
    });
    if (error || !data) throw proposalError(response, error);
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Error de una propuesta: en 409 el servidor explica por qué (venció, ya resuelta...). */
function proposalError(response: Response, body: unknown): ApiError {
  // El cliente tipado ya leyo el cuerpo: el motivo del 409 viene en ody.
  const serverMessage =
    response.status === 409 &&
    body !== null &&
    typeof body === 'object' &&
    typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message
      : undefined;
  const base = toApiError(response.status);
  return new ApiError(serverMessage ?? base.message, response.status);
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
  /** Adjuntos listos que acompañan al mensaje. */
  attachmentIds?: string[];
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
    ...(options.attachmentIds && options.attachmentIds.length > 0
      ? { attachmentIds: options.attachmentIds }
      : {}),
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
      credentials: 'include',
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

// ------------------------------------------------------------------ adjuntos

/** Fallo de la subida de un adjunto; `retryable` indica si tiene sentido reintentar. */
export class AttachmentUploadError extends ApiError {
  constructor(
    message: string,
    status: number | undefined,
    readonly retryable: boolean,
  ) {
    super(message, status);
    this.name = 'AttachmentUploadError';
  }
}

export interface UploadAttachmentOptions {
  signal?: AbortSignal;
  /** Avance de la subida, de 0 a 100. */
  onProgress?: (percent: number) => void;
  /** El archivo terminó de enviarse y el servidor está leyendo su contenido. */
  onUploaded?: () => void;
}

function serverMessage(body: unknown): string | undefined {
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim() !== '') return message;
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return undefined;
}

/**
 * Sube un archivo al chat (POST multipart). Usa `XMLHttpRequest` porque `fetch`
 * no informa el avance de la subida. La respuesta trae el texto que el asistente
 * extrajo, para que la persona lo revise antes de enviarlo.
 */
export function uploadAttachment(
  file: File,
  options: UploadAttachmentOptions = {},
): Promise<Attachment> {
  return new Promise<Attachment>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBaseUrl}/assistant/attachments`);
    // Envía la cookie de sesión HttpOnly (la API puede estar en otro origen).
    xhr.withCredentials = true;
    for (const [name, value] of Object.entries(authHeaders())) {
      xhr.setRequestHeader(name, value);
    }
    xhr.responseType = 'json';

    const network = (): AttachmentUploadError =>
      new AttachmentUploadError(
        `No se pudo subir ${file.name}. Revisa tu conexión e inténtalo de nuevo.`,
        undefined,
        true,
      );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.upload.onload = () => {
      options.onProgress?.(100);
      options.onUploaded?.();
    };
    xhr.onerror = () => reject(network());
    xhr.ontimeout = () => reject(network());
    xhr.onabort = () => reject(new DOMException('Subida cancelada', 'AbortError'));
    xhr.onload = () => {
      const body: unknown = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300 && body && typeof body === 'object') {
        resolve(body as Attachment);
        return;
      }
      const status = xhr.status;
      const message = serverMessage(body);
      if (status === 401) {
        reject(new AttachmentUploadError('Tu sesión expiró. Vuelve a iniciar sesión.', status, false));
      } else if (status === 429 || status >= 500) {
        reject(
          new AttachmentUploadError(
            message ?? 'No pudimos leer el archivo. Inténtalo de nuevo.',
            status,
            true,
          ),
        );
      } else {
        reject(
          new AttachmentUploadError(message ?? toApiError(status).message, status, false),
        );
      }
    };

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException('Subida cancelada', 'AbortError'));
        return;
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });
}

/** Guarda el texto corregido de un adjunto que aún no se envió. */
export async function updateAttachmentText(id: string, extractedText: string): Promise<Attachment> {
  try {
    const { data, error, response } = await api.PATCH('/assistant/attachments/{id}', {
      params: { path: { id } },
      body: { extractedText },
    });
    if (error || !data) {
      throw new ApiError(serverMessage(error) ?? toApiError(response.status).message, response.status);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}

/** Quita un adjunto que aún no se envió (borra también su archivo). */
export async function deleteAttachment(id: string): Promise<void> {
  try {
    const { error, response } = await api.DELETE('/assistant/attachments/{id}', {
      params: { path: { id } },
    });
    if (error) throw toApiError(response.status);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(undefined);
  }
}
