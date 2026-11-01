/**
 * Parser de Server-Sent Events del chat del asistente (BL-032 F2). Módulo puro
 * (sin DOM ni red): acepta fragmentos de texto tal como llegan del `fetch` —que
 * pueden cortar un evento a la mitad— y devuelve los eventos completos.
 */

import type { Proposal } from './api-client';

/** Evento del flujo del asistente (contrato de POST /assistant/chat). */
export type AssistantStreamEvent =
  | { event: 'conversation'; data: { conversationId: string; title: string } }
  | { event: 'text'; data: { delta: string } }
  | {
      event: 'tool';
      data: {
        id: string;
        name: string;
        label: string;
        status: 'running' | 'done' | 'error';
      };
    }
  | { event: 'proposal'; data: Proposal }
  | { event: 'done'; data: { messageId: string } }
  | { event: 'error'; data: { message: string } };

const KNOWN_EVENTS = new Set([
  'conversation',
  'text',
  'tool',
  'proposal',
  'done',
  'error',
]);

export interface SseParser {
  /** Procesa un fragmento y devuelve los eventos que quedaron completos. */
  push(chunk: string): AssistantStreamEvent[];
}

/** Crea un parser con estado (conserva lo que quedó a medias entre fragmentos). */
export function createSseParser(): SseParser {
  let buffer = '';
  return {
    push(chunk: string): AssistantStreamEvent[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const events: AssistantStreamEvent[] = [];
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseBlock(raw);
        if (parsed) events.push(parsed);
        boundary = buffer.indexOf('\n\n');
      }
      return events;
    },
  };
}

/** Un bloque `event: x\ndata: {...}`; ignora comentarios, eventos desconocidos y JSON inválido. */
function parseBlock(raw: string): AssistantStreamEvent | null {
  let event = '';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  if (!KNOWN_EVENTS.has(event) || dataLines.length === 0) return null;
  try {
    const data: unknown = JSON.parse(dataLines.join('\n'));
    return { event, data } as AssistantStreamEvent;
  } catch {
    return null;
  }
}
