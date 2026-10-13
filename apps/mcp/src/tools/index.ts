/**
 * Agregador de tools del MCP. Centraliza el registro de todas las tools de
 * dominio. Por ahora está vacío: FEAT-003 lo poblará invocando cada
 * register<Modulo>Tools(ctx) (health, catalog, process, user, grant, request,
 * plan, audit, portfolio).
 */
import type { McpContext } from '../server.js';

/**
 * Registra TODAS las tools en el server. Hoy no registra ninguna; se mantiene la
 * firma estable para que index.ts la invoque y FEAT-003 solo tenga que añadir
 * las llamadas a los registradores de cada módulo.
 */
export function registerAll(_ctx: McpContext): void {
  // FEAT-003: registerHealthTools(_ctx), registerCatalogTools(_ctx), etc.
}
