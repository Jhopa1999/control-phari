import { MODULE_MATRIX } from './module-matrix';
import { RoleCode } from './role-code';

/** Claves estables de las acciones de negocio que explica «Mis permisos». */
export enum CapabilityKey {
  REQUEST_CREATE = 'request.create',
  REQUEST_TRIAGE = 'request.triage',
  REQUEST_PRIORITIZE = 'request.prioritize',
  REQUEST_APPROVE = 'request.approve',
  PLAN_MANAGE = 'plan.manage',
  PLAN_AUTHORIZE = 'plan.authorize',
  TASK_EXECUTE = 'task.execute',
  TASK_REVIEW = 'task.review',
  LOG_RECORD = 'log.record',
  GATE_MANAGE = 'gate.manage',
  CLOSURE_APPROVE = 'closure.approve',
  ASSET_MANAGE = 'asset.manage',
  DOCUMENT_REVIEW = 'document.review',
  TEAM_MANAGE = 'team.manage',
  ADMIN_CATALOGS = 'admin.catalogs',
  ADMIN_STRUCTURE = 'admin.structure',
  SYSTEM_SETTINGS = 'system.settings',
}

export type CapabilityScope = 'PROCESS' | 'AREA' | 'SYSTEM';

/** Nombre visible de cada rol, para decir a quién pedir una acción. */
export const ROLE_LABELS: Record<RoleCode, string> = {
  [RoleCode.JEFE_AREA]: 'Jefe de área',
  [RoleCode.LIDER_PROCESO]: 'Líder de proceso',
  [RoleCode.INTEGRANTE]: 'Integrante',
  [RoleCode.ADMIN]: 'Administrador',
};

/** Handler de un controlador cuyo `@Roles` respalda la capacidad (solo para la prueba de sincronía). */
export interface CapabilityEnforcer {
  controller: string;
  handler: string;
}

export interface CapabilityDef {
  key: CapabilityKey;
  label: string;
  description: string;
  group: string;
  scope: CapabilityScope;
  roles: readonly RoleCode[];
  /** Controladores/handlers que aplican `@Roles` equivalente. Lo lee la prueba de sincronía. */
  enforcedBy?: readonly CapabilityEnforcer[];
}

const JEFE = RoleCode.JEFE_AREA;
const LIDER = RoleCode.LIDER_PROCESO;

/**
 * Catálogo de acciones por rol. Los `roles` deben coincidir con el `@Roles`
 * real de los controladores citados en `enforcedBy`; la prueba
 * `capability-matrix.spec.ts` lo comprueba. Si cambia un `@Roles`, hay que
 * actualizar esta lista en el mismo cambio.
 */
export const CAPABILITY_CATALOG: readonly CapabilityDef[] = [
  {
    key: CapabilityKey.REQUEST_CREATE,
    label: 'Registrar solicitudes',
    description: 'Crear solicitudes de trabajo para el área.',
    group: 'Demanda',
    scope: 'PROCESS',
    roles: MODULE_MATRIX.requests,
  },
  {
    key: CapabilityKey.REQUEST_TRIAGE,
    label: 'Decidir el triage',
    description: 'Aceptar, rechazar o redirigir una solicitud recién registrada.',
    group: 'Demanda',
    scope: 'PROCESS',
    roles: MODULE_MATRIX.triage,
  },
  {
    key: CapabilityKey.REQUEST_PRIORITIZE,
    label: 'Evaluar la prioridad',
    description: 'Registrar la evaluación de prioridad de una solicitud.',
    group: 'Demanda',
    scope: 'PROCESS',
    roles: MODULE_MATRIX.priority,
    enforcedBy: [{ controller: 'PriorityController', handler: 'create' }],
  },
  {
    key: CapabilityKey.REQUEST_APPROVE,
    label: 'Aprobar solicitudes priorizadas',
    description: 'Aprobar o rechazar la priorización de una solicitud, solas o en lote.',
    group: 'Demanda',
    scope: 'AREA',
    roles: [JEFE],
    enforcedBy: [
      { controller: 'ApprovalController', handler: 'create' },
      { controller: 'ApprovalController', handler: 'batchApproval' },
    ],
  },
  {
    key: CapabilityKey.PLAN_MANAGE,
    label: 'Armar y enviar el plan',
    description: 'Crear el plan de una solicitud, definir sus fases y enviarlo a autorización.',
    group: 'Ejecución',
    scope: 'PROCESS',
    roles: MODULE_MATRIX.plan,
    enforcedBy: [{ controller: 'PlanController', handler: 'update' }],
  },
  {
    key: CapabilityKey.PLAN_AUTHORIZE,
    label: 'Autorizar o devolver un plan',
    description: 'Decidir si un plan enviado puede ejecutarse o vuelve a su responsable.',
    group: 'Ejecución',
    scope: 'AREA',
    roles: MODULE_MATRIX.review,
    enforcedBy: [{ controller: 'PlanController', handler: 'authorize' }],
  },
  {
    key: CapabilityKey.TASK_EXECUTE,
    label: 'Ejecutar y reportar tareas',
    description: 'Cambiar el estado y el avance de las tareas que te asignan.',
    group: 'Ejecución',
    scope: 'PROCESS',
    roles: MODULE_MATRIX.task,
    enforcedBy: [{ controller: 'TaskController', handler: 'changeStatus' }],
  },
  {
    key: CapabilityKey.TASK_REVIEW,
    label: 'Aceptar o devolver tareas en revisión',
    description: 'Revisar las tareas terminadas por el equipo y aceptarlas o devolverlas.',
    group: 'Ejecución',
    scope: 'PROCESS',
    roles: [JEFE, LIDER],
    enforcedBy: [{ controller: 'TaskController', handler: 'accept' }],
  },
  {
    key: CapabilityKey.LOG_RECORD,
    label: 'Bitácora, reporte semanal y reuniones',
    description: 'Registrar tu bitácora diaria, el reporte semanal y las reuniones de seguimiento.',
    group: 'Seguimiento',
    scope: 'PROCESS',
    roles: MODULE_MATRIX.log,
    enforcedBy: [{ controller: 'WorklogController', handler: 'createDailyLog' }],
  },
  {
    key: CapabilityKey.GATE_MANAGE,
    label: 'Gestionar los controles',
    description: 'Aprobar, marcar como no aplica o bloquear los controles de gobierno de una solicitud.',
    group: 'Gobierno',
    scope: 'PROCESS',
    roles: [JEFE, LIDER],
    enforcedBy: [{ controller: 'GateCheckController', handler: 'approve' }],
  },
  {
    key: CapabilityKey.CLOSURE_APPROVE,
    label: 'Aprobar el cierre de un proyecto',
    description: 'Decidir el cierre formal de una solicitud o reabrirla.',
    group: 'Gobierno',
    scope: 'AREA',
    roles: [JEFE],
    enforcedBy: [
      { controller: 'ClosureController', handler: 'decide' },
      { controller: 'ClosureController', handler: 'reopen' },
    ],
  },
  {
    key: CapabilityKey.ASSET_MANAGE,
    label: 'Gestionar activos',
    description: 'Crear, editar y cambiar el estado de los activos del área.',
    group: 'Conocimiento',
    scope: 'AREA',
    roles: [JEFE],
    enforcedBy: [
      { controller: 'AssetController', handler: 'create' },
      { controller: 'AssetController', handler: 'update' },
      { controller: 'AssetController', handler: 'changeStatus' },
    ],
  },
  {
    key: CapabilityKey.DOCUMENT_REVIEW,
    label: 'Aprobar documentos',
    description: 'Aprobar o rechazar los documentos enviados a aprobación.',
    group: 'Conocimiento',
    scope: 'AREA',
    roles: [JEFE],
    enforcedBy: [{ controller: 'DocumentController', handler: 'review' }],
  },
  {
    key: CapabilityKey.TEAM_MANAGE,
    label: 'Invitar personas y gestionar el equipo',
    description: 'Invitar personas al portal y forzar el cambio de su contraseña.',
    group: 'Administración',
    scope: 'AREA',
    roles: MODULE_MATRIX.team,
    enforcedBy: [{ controller: 'UserInviteController', handler: 'invite' }],
  },
  {
    key: CapabilityKey.ADMIN_CATALOGS,
    label: 'Editar las Maestras',
    description: 'Mantener los catálogos y parámetros del portal.',
    group: 'Administración',
    scope: 'AREA',
    roles: MODULE_MATRIX.admin,
    enforcedBy: [{ controller: 'CatalogController', handler: 'update' }],
  },
  {
    key: CapabilityKey.ADMIN_STRUCTURE,
    label: 'Gestionar áreas, procesos y solicitantes',
    description: 'Crear y editar la estructura organizativa del portal.',
    group: 'Administración',
    scope: 'AREA',
    roles: MODULE_MATRIX.areas,
    enforcedBy: [{ controller: 'AreaController', handler: 'create' }],
  },
  {
    key: CapabilityKey.SYSTEM_SETTINGS,
    label: 'Configurar el sistema',
    description: 'Configurar el correo, los administradores y los agentes de IA.',
    group: 'Administración',
    scope: 'SYSTEM',
    roles: MODULE_MATRIX.systemSettings,
    enforcedBy: [{ controller: 'SmtpConfigController', handler: 'update' }],
  },
];

export interface CapabilityRole {
  code: RoleCode;
  name: string;
}

export interface Capability {
  key: CapabilityKey;
  label: string;
  description: string;
  group: string;
  scope: CapabilityScope;
  allowed: boolean;
  allowedRoles: CapabilityRole[];
}

/**
 * Proyecta el catálogo para un conjunto de roles. Devuelve todas las
 * capacidades en orden fijo; `allowed` es verdadero si alguno de los roles la
 * permite. Los roles desconocidos se ignoran.
 */
export function capabilitiesFor(roleCodes: Iterable<RoleCode>): Capability[] {
  const roles = new Set<RoleCode>(roleCodes);
  return CAPABILITY_CATALOG.map((def) => ({
    key: def.key,
    label: def.label,
    description: def.description,
    group: def.group,
    scope: def.scope,
    allowed: def.roles.some((role) => roles.has(role)),
    allowedRoles: def.roles.map((code) => ({ code, name: ROLE_LABELS[code] })),
  }));
}
