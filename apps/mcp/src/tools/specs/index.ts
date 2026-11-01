/**
 * CATÁLOGO DECLARATIVO de tools del MCP (las que usa el motor genérico).
 * Para añadir una tool: una entrada en el archivo de su dominio. Las dos tools
 * con comportamiento propio (`health.check`, `dev.actors.list`) viven en
 * `../manual.ts`.
 */
import type { ToolSpec } from '../spec.js';
import { CATALOG_SPECS } from './catalog.js';
import { PROCESS_SPECS } from './process.js';
import { USER_SPECS } from './user.js';
import { GRANT_SPECS } from './grant.js';
import { REQUEST_SPECS } from './request.js';
import { PLAN_SPECS } from './plan.js';
import { AUDIT_SPECS } from './audit.js';
import { GOVERNANCE_SPECS } from './governance.js';
import { LECTURA_SPECS } from './lectura.js';
import { ESCRITURA_SPECS } from './escritura.js';

export const TOOL_SPECS: ReadonlyArray<ToolSpec> = [
  ...USER_SPECS,
  ...CATALOG_SPECS,
  ...PROCESS_SPECS,
  ...GRANT_SPECS,
  ...REQUEST_SPECS,
  ...PLAN_SPECS,
  ...AUDIT_SPECS,
  ...GOVERNANCE_SPECS,
  ...LECTURA_SPECS,
  ...ESCRITURA_SPECS,
];
