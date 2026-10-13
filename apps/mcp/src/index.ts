import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createApiClient } from '@plantilla-portales/api-client';

// stdout está reservado al protocolo MCP: todo logging va a stderr.
function logStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

// Referencia al cliente del contrato para probar la resolución del workspace
// dependency. No se invoca todavía (sin backend vivo en el gate de factibilidad).
void createApiClient;

async function main(): Promise<void> {
  const server = new McpServer({
    name: '@plantilla-portales/mcp',
    version: '0.1.0',
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logStderr('MCP server conectado por stdio.');
}

main().catch((error: unknown) => {
  logStderr(`Fallo al iniciar el servidor MCP: ${String(error)}`);
  process.exit(1);
});
