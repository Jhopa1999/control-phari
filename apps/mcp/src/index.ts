/**
 * Punto de entrada del servidor MCP. Orquesta el arranque:
 *   1. carga y valida la config por env (config.ts, fail-fast),
 *   2. construye el cliente de API con identidad (api.ts),
 *   3. crea el server y el contexto { server, api } (server.ts),
 *   4. registra las tools (tools/index.ts),
 *   5. conecta el transporte stdio.
 *
 * El arranque SOLO falla por configuración faltante (fatal, lo gestiona
 * config.ts). Un fallo de login NO es fatal: el login es perezoso y la
 * caducidad se maneja de forma reactiva (401).
 *
 * stdout está reservado al protocolo MCP: todo logging va a stderr.
 */
import { loadConfig } from './config.js';
import { createMcpApi } from './api.js';
import { createServer, connectStdio } from './server.js';
import { registerAll } from './tools/index.js';

function logStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function main(): Promise<void> {
  // Fail-fast: termina el proceso con código != 0 si falta config obligatoria.
  const config = loadConfig();

  const api = createMcpApi(config);
  const ctx = createServer(api);

  registerAll(ctx);

  await connectStdio(ctx);

  logStderr('MCP server conectado por stdio.');
}

main().catch((error: unknown) => {
  logStderr(`Fallo al iniciar el servidor MCP: ${String(error)}`);
  process.exit(1);
});
