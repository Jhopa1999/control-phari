import type {
  ContentBlock,
  ConverseStreamOutput,
  Message,
  ToolConfiguration,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Tipos y traduccion de la API Converse de Bedrock para el asistente (BL-032 F0).
 * El resto del backend habla estos tipos PROPIOS (no los del SDK) y usa nombres
 * de tool del MCP con punto (`request.list`); aqui se traducen al formato del
 * proveedor. Todo lo de este archivo es puro (sin red), por eso es testeable.
 */

/** Formatos de imagen aceptados por Converse. */
export type ConverseImageFormat = 'png' | 'jpeg' | 'gif' | 'webp';

/** Formatos de documento aceptados por Converse. */
export type ConverseDocumentFormat =
  | 'pdf'
  | 'csv'
  | 'doc'
  | 'docx'
  | 'xls'
  | 'xlsx'
  | 'html'
  | 'txt'
  | 'md';

/** Bloque de contenido de un mensaje. */
export type ConverseBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; format: ConverseImageFormat; bytes: Uint8Array }
  | {
      type: 'document';
      format: ConverseDocumentFormat;
      name: string;
      bytes: Uint8Array;
    }
  | {
      type: 'toolUse';
      toolUseId: string;
      /** Nombre de la tool del MCP (con punto). */
      name: string;
      input: unknown;
    }
  | {
      type: 'toolResult';
      toolUseId: string;
      /** Texto del resultado (normalmente JSON serializado). */
      text: string;
      isError?: boolean;
    };

/** Mensaje de la conversacion. */
export interface ConverseMessage {
  role: 'user' | 'assistant';
  content: ConverseBlock[];
}

/** Tool ofrecida al modelo (derivada de una tool del MCP). */
export interface ConverseTool {
  /** Nombre de la tool del MCP (con punto). */
  name: string;
  description: string;
  /** JSON Schema del input. */
  inputSchema: Record<string, unknown>;
}

/** Por que termino el turno del modelo. */
export type ConverseStopReason =
  | 'end_turn'
  | 'tool_use'
  | 'max_tokens'
  | 'stop_sequence'
  | 'content_filtered'
  | 'guardrail_intervened'
  | 'other';

/** Consumo de tokens de una llamada. */
export interface ConverseUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
}

/** Credenciales estaticas (modo access-keys); ausentes => rol IAM. */
export interface ConverseCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

/** Peticion Converse. `temperature` ausente => se omite (Claude 5.x). */
export interface ConverseRequest {
  region: string;
  modelId: string;
  system?: string;
  messages: ConverseMessage[];
  tools?: ConverseTool[];
  temperature?: number;
  maxTokens: number;
  timeoutMs: number;
  credentials?: ConverseCredentials;
}

/** Respuesta completa (sin streaming). */
export interface ConverseResult {
  content: ConverseBlock[];
  stopReason: ConverseStopReason;
  usage: ConverseUsage;
}

/** Evento de la respuesta en streaming. */
export type ConverseStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'toolUse'; toolUseId: string; name: string; input: unknown }
  | { type: 'done'; stopReason: ConverseStopReason; usage: ConverseUsage };

// ---------------------------------------------------------------- nombres tool

/**
 * Bedrock solo admite `[a-zA-Z0-9_-]` en el nombre de una tool; las del MCP
 * llevan punto (`request.list`). El punto se codifica como `__`.
 */
const DOT = '.';
const ENCODED_DOT = '__';

export function toBedrockToolName(name: string): string {
  return name.split(DOT).join(ENCODED_DOT);
}

export function fromBedrockToolName(name: string): string {
  return name.split(ENCODED_DOT).join(DOT);
}

// ------------------------------------------------------------------- peticion

function toSdkBlock(block: ConverseBlock): ContentBlock {
  switch (block.type) {
    case 'text':
      return { text: block.text };
    case 'image':
      return { image: { format: block.format, source: { bytes: block.bytes } } };
    case 'document':
      return {
        document: {
          format: block.format,
          name: block.name,
          source: { bytes: block.bytes },
        },
      };
    case 'toolUse':
      return {
        toolUse: {
          toolUseId: block.toolUseId,
          name: toBedrockToolName(block.name),
          input: block.input as never,
        },
      };
    case 'toolResult':
      return {
        toolResult: {
          toolUseId: block.toolUseId,
          content: [{ text: block.text }],
          status: block.isError ? 'error' : 'success',
        },
      };
  }
}

export function toSdkMessages(messages: ConverseMessage[]): Message[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map(toSdkBlock),
  }));
}

/** `undefined` si no hay tools (Converse rechaza un toolConfig vacio). */
export function toSdkToolConfig(
  tools: ConverseTool[] | undefined,
): ToolConfiguration | undefined {
  if (!tools || tools.length === 0) return undefined;
  return {
    tools: tools.map((t) => ({
      toolSpec: {
        name: toBedrockToolName(t.name),
        description: t.description,
        inputSchema: { json: t.inputSchema as never },
      },
    })),
  };
}

// ------------------------------------------------------------------ respuesta

export function mapStopReason(reason: string | undefined): ConverseStopReason {
  switch (reason) {
    case 'end_turn':
    case 'tool_use':
    case 'max_tokens':
    case 'stop_sequence':
    case 'content_filtered':
    case 'guardrail_intervened':
      return reason;
    default:
      return 'other';
  }
}

interface SdkUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}

export function mapUsage(usage: SdkUsage | undefined): ConverseUsage {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cacheReadInputTokens: usage?.cacheReadInputTokens ?? 0,
    cacheWriteInputTokens: usage?.cacheWriteInputTokens ?? 0,
  };
}

/** Traduce los bloques de la respuesta; ignora los que el asistente no usa. */
export function fromSdkBlocks(blocks: ContentBlock[] | undefined): ConverseBlock[] {
  const out: ConverseBlock[] = [];
  for (const block of blocks ?? []) {
    if (typeof block.text === 'string') {
      out.push({ type: 'text', text: block.text });
    } else if (block.toolUse) {
      out.push({
        type: 'toolUse',
        toolUseId: block.toolUse.toolUseId ?? '',
        name: fromBedrockToolName(block.toolUse.name ?? ''),
        input: block.toolUse.input ?? {},
      });
    }
  }
  return out;
}

/**
 * Convierte el flujo crudo de Converse en eventos de dominio: el texto sale a
 * medida que llega; cada tool use se emite COMPLETO (su input llega troceado y
 * se acumula por indice de bloque) y al final un unico `done` con el motivo de
 * parada y el consumo. Un evento de error del flujo lanza.
 */
export async function* mapConverseStream(
  stream: AsyncIterable<ConverseStreamOutput>,
): AsyncGenerator<ConverseStreamEvent> {
  const tools = new Map<number, { toolUseId: string; name: string; json: string }>();
  let stopReason: ConverseStopReason = 'other';
  let usage = mapUsage(undefined);

  for await (const event of stream) {
    if (event.contentBlockStart) {
      const start = event.contentBlockStart.start;
      const index = event.contentBlockStart.contentBlockIndex ?? 0;
      if (start?.toolUse) {
        tools.set(index, {
          toolUseId: start.toolUse.toolUseId ?? '',
          name: fromBedrockToolName(start.toolUse.name ?? ''),
          json: '',
        });
      }
    } else if (event.contentBlockDelta) {
      const index = event.contentBlockDelta.contentBlockIndex ?? 0;
      const delta = event.contentBlockDelta.delta;
      if (typeof delta?.text === 'string' && delta.text !== '') {
        yield { type: 'text', text: delta.text };
      } else if (delta?.toolUse) {
        const acc = tools.get(index);
        if (acc) acc.json += delta.toolUse.input ?? '';
      }
    } else if (event.contentBlockStop) {
      const index = event.contentBlockStop.contentBlockIndex ?? 0;
      const acc = tools.get(index);
      if (acc) {
        tools.delete(index);
        yield {
          type: 'toolUse',
          toolUseId: acc.toolUseId,
          name: acc.name,
          input: parseToolInput(acc.json),
        };
      }
    } else if (event.messageStop) {
      stopReason = mapStopReason(event.messageStop.stopReason);
    } else if (event.metadata) {
      usage = mapUsage(event.metadata.usage);
    } else if (
      event.internalServerException ||
      event.modelStreamErrorException ||
      event.validationException ||
      event.throttlingException ||
      event.serviceUnavailableException
    ) {
      throw new Error('El flujo de Bedrock termino con un error.');
    }
  }
  yield { type: 'done', stopReason, usage };
}

/** El input de una tool sin argumentos llega vacio: equivale a `{}`. */
function parseToolInput(json: string): unknown {
  if (json.trim() === '') return {};
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return {};
  }
}
