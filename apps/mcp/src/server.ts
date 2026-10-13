/**
 * Armazón del servidor MCP: construye el McpServer, define el contexto que las
 * tools reciben y conecta el transporte stdio.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpApi } from './api.js';

/** Nombre e identidad del servidor MCP (anunciados en el handshake). */
const SERVER_INFO = {
  name: '@plantilla-portales/mcp',
  version: '0.1.0',
} as const;

/**
 * Contexto compartido que se pasa a cada registrador de tools. Mantiene el
 * server (para registrar tools y operaciones avanzadas) y la api (cliente
 * tipado + login perezoso + re-login reactivo).
 */
export interface McpContext {
  readonly server: McpServer;
  readonly api: McpApi;
}

/** Crea el McpServer y el contexto compartido para las tools. */
export function createServer(api: McpApi): McpContext {
  const server = new McpServer(SERVER_INFO);
  return { server, api };
}

/** Conecta el server al transporte stdio y empieza a escuchar mensajes. */
export async function connectStdio(ctx: McpContext): Promise<void> {
  const transport = new StdioServerTransport();
  await ctx.server.connect(transport);
}
