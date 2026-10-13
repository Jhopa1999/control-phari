/**
 * Agregador de tools del MCP. Centraliza el registro de todas las tools de
 * dominio, cada una mapeada 1:1 a operaciones reales del contrato OpenAPI.
 */
import type { McpContext } from '../server.js';
import { registerHealthTools } from './health.js';
import { registerCatalogTools } from './catalog.js';
import { registerProcessTools } from './process.js';
import { registerUserTools } from './user.js';
import { registerGrantTools } from './grant.js';
import { registerRequestTools } from './request.js';
import { registerPlanTools } from './plan.js';
import { registerAuditTools } from './audit.js';
import { registerPortfolioTools } from './portfolio.js';
import { registerGovernanceTools } from './governance.js';

/**
 * Registra TODAS las tools en el server, invocando cada registrador de módulo.
 * El orden no afecta el comportamiento (cada módulo registra sus propias tools).
 */
export function registerAll(ctx: McpContext): void {
  registerHealthTools(ctx);
  registerCatalogTools(ctx);
  registerProcessTools(ctx);
  registerUserTools(ctx);
  registerGrantTools(ctx);
  registerRequestTools(ctx);
  registerPlanTools(ctx);
  registerAuditTools(ctx);
  registerPortfolioTools(ctx);
  registerGovernanceTools(ctx);
}
