import { Injectable } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  isToolAllowed,
  type AssistantTool,
  type AssistantToolGateway,
  type AssistantToolResult,
  type AssistantToolSession,
} from './assistant-tools';

/** Tiempo maximo de una llamada a una herramienta. */
const TOOL_TIMEOUT_MS = 30_000;

/** Tope de caracteres de un resultado que se devuelve al modelo. */
export const MAX_TOOL_RESULT_CHARS = 30_000;

/** Recorta un resultado muy grande para no desbordar el contexto del modelo. */
export function clampToolResult(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return (
    text.slice(0, MAX_TOOL_RESULT_CHARS) +
    '\n[Resultado recortado por su tamaño. Pide un filtro más específico.]'
  );
}

/**
 * Implementacion real sobre el cliente MCP (Streamable HTTP). La URL del MCP
 * (`ASSISTANT_MCP_URL`, p. ej. http://mcp:3002) viene de entorno; sin ella el
 * asistente queda no disponible. Cada sesion usa el token de la persona, asi que
 * el MCP -> API aplica sus permisos y su alcance.
 */
@Injectable()
export class McpToolGateway implements AssistantToolGateway {
  private url(): string | null {
    const value = process.env.ASSISTANT_MCP_URL?.trim();
    return value ? value : null;
  }

  isConfigured(): boolean {
    return this.url() !== null;
  }

  async open(authorization: string): Promise<AssistantToolSession> {
    const url = this.url();
    if (!url) {
      throw new Error('ASSISTANT_MCP_URL no esta configurada.');
    }
    const client = new Client({ name: 'control-phari-asistente', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: authorization } },
    });
    await client.connect(transport);

    return {
      async listTools(): Promise<AssistantTool[]> {
        const { tools } = await client.listTools();
        return tools
          .filter((t) =>
            isToolAllowed(
              t.name,
              t.annotations?.readOnlyHint === true,
              t.annotations?.destructiveHint === true,
            ),
          )
          .map((t) => ({
            name: t.name,
            description: t.description ?? t.name,
            inputSchema: t.inputSchema as Record<string, unknown>,
            readOnly: t.annotations?.readOnlyHint === true,
          }));
      },

      async callTool(
        name: string,
        args: Record<string, unknown>,
      ): Promise<AssistantToolResult> {
        const result = await client.callTool(
          { name, arguments: args },
          undefined,
          { timeout: TOOL_TIMEOUT_MS },
        );
        const blocks = Array.isArray(result.content) ? result.content : [];
        const text = blocks
          .map((b) => (b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
          .join('\n');
        return { text: clampToolResult(text), isError: result.isError === true };
      },

      async close(): Promise<void> {
        await client.close();
      },
    };
  }
}
