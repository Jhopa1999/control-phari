import { RoleCode } from './role-code';

/**
 * Claves EXACTAS de la matriz de modulos de specs/10 (design 3.3). El frontend
 * usa estas mismas claves para filtrar el menu (una sola fuente de verdad,
 * compartida con el server-side; no se duplican reglas).
 */
export type ModuleKey =
  | 'demandOverview'
  | 'dashboard'
  | 'requests'
  | 'triage'
  | 'priority'
  | 'plan'
  | 'portfolio'
  | 'project'
  | 'assigned'
  | 'task'
  | 'log'
  | 'meeting'
  | 'asset'
  | 'docs'
  | 'capacity'
  | 'admin'
  | 'frameworks'
  | 'review'
  | 'audit'
  | 'team'
  | 'permissions'
  | 'systemSettings'
  | 'areas'
  | 'processesAdmin';

/**
 * Matriz de modulos -> roles permitidos. Reproduce LITERALMENTE la "Matriz de
 * modulos configurada" de specs/10-roles-permissions.md (una fila por modulo,
 * una columna por rol). No se "deriva" ni se reinterpreta: es la matriz del SDD
 * tal cual, porque es la fuente de verdad de paridad funcional.
 *
 * Columnas en specs/10 (Integrante / Lider / Jefe):
 * - demandOverview: — / ✓ / ✓   (NO integrante)
 * - dashboard:      ✓ / ✓ / ✓
 * - requests:       ✓ / ✓ / ✓
 * - triage:         — / ✓ / ✓
 * - priority:       — / ✓ / ✓
 * - plan:           — / ✓ / ✓   (integrante ejecuta tareas via assigned/task, no gestiona el plan)
 * - portfolio:      ✓ / ✓ / ✓
 * - project:        ✓ / ✓ / ✓
 * - assigned:       ✓ / ✓ / ✓
 * - task:           ✓ / ✓ / ✓
 * - log:            ✓ / ✓ / ✓
 * - meeting:        ✓ / ✓ / ✓
 * - asset:          ✓ / ✓ / ✓
 * - docs:           ✓ / ✓ / ✓
 * - capacity:       ✓ / ✓ / ✓
 * - admin:          — / — / ✓
 * - frameworks:     ✓ / ✓ / ✓
 * - review:         — / ✓ / ✓
 * - audit:          ✓(alcance propio) / ✓ / ✓
 * - team:           — / — / ✓
 * - permissions:    ✓ / ✓ / ✓
 */
export const MODULE_MATRIX: Record<ModuleKey, readonly RoleCode[]> = {
  demandOverview: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO],
  dashboard: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  requests: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  triage: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO],
  priority: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO],
  plan: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO],
  portfolio: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  project: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  assigned: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  task: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  log: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  meeting: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  asset: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  docs: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  capacity: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  admin: [RoleCode.JEFE_AREA],
  frameworks: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  review: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO],
  audit: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  team: [RoleCode.JEFE_AREA],
  permissions: [RoleCode.JEFE_AREA, RoleCode.LIDER_PROCESO, RoleCode.INTEGRANTE],
  // Rol de SISTEMA: SOLO ADMIN (design f). No se reutiliza 'admin' (Maestras,
  // de JEFE_AREA): este modulo es la configuracion tecnica del sistema (SMTP,
  // administradores) y queda fuera del alcance del jefe de area.
  systemSettings: [RoleCode.ADMIN],
  // Gestion de areas organizativas: SOLO ADMIN (crea/edita areas como
  // Analitica). Es administracion de la estructura, fuera del alcance de area.
  areas: [RoleCode.ADMIN],
  // Administracion de procesos: ADMIN (gestion global) y JEFE_AREA (gestiona
  // los procesos de su area).
  processesAdmin: [RoleCode.ADMIN, RoleCode.JEFE_AREA],
};

/** Todas las claves de modulo, en orden de declaracion. */
export const MODULE_KEYS = Object.keys(MODULE_MATRIX) as ModuleKey[];

/**
 * Deriva los modulos permitidos para un conjunto de roles (union): un modulo
 * es visible si alguno de los roles del actor lo permite.
 */
export function allowedModulesFor(
  roleCodes: Iterable<RoleCode>,
): ModuleKey[] {
  const roles = new Set<RoleCode>(roleCodes);
  return MODULE_KEYS.filter((key) =>
    MODULE_MATRIX[key].some((allowed) => roles.has(allowed)),
  );
}
