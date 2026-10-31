/**
 * Agregador de tools del MCP: registra el catálogo declarativo (motor
 * genérico) y las tools manuales. Cada tool está mapeada a una operación real
 * del contrato OpenAPI.
 */
import type { McpContext } from '../server.js';
import { registerManualTools } from './manual.js';
import { registerSpecTools } from './register.js';
import { TOOL_SPECS } from './specs/index.js';

/** Registra TODAS las tools en el server. */
export function registerAll(ctx: McpContext): void {
  registerManualTools(ctx);
  registerSpecTools(ctx, TOOL_SPECS);
}
