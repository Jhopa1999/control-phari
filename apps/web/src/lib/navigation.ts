/**
 * Modelo de navegacion del portal (design 5.1 / 5.2). Los 6 grupos de
 * 02-modules.md: Inicio, Demanda, Seguimiento, Activos, Administracion,
 * Gobierno. Cada item declara su `moduleKey`, que coincide EXACTAMENTE con las
 * claves de MODULE_MATRIX del backend; el menu se filtra por `allowedModules`
 * de GET /me/permissions (filtrado cosmetico: el control real es server-side).
 */

/** Claves de modulo exactas de MODULE_MATRIX (design 3.3 / FEAT-002). */
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
  | 'permissions';

export interface NavItem {
  href: string;
  label: string;
  moduleKey: ModuleKey;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Estructura del menu. El `href` apunta a la ruta de App Router; las pantallas
 * no construidas son placeholders claros, pero el menu y el gating son reales.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Inicio',
    items: [
      { href: '/inicio', label: 'Control del area', moduleKey: 'dashboard' },
      { href: '/mi-trabajo', label: 'Mi trabajo', moduleKey: 'assigned' },
    ],
  },
  {
    label: 'Demanda',
    items: [
      {
        href: '/demanda/resumen',
        label: 'Resumen de demanda',
        moduleKey: 'demandOverview',
      },
      {
        href: '/demanda/solicitudes',
        label: 'Solicitudes',
        moduleKey: 'requests',
      },
      { href: '/demanda/triage', label: 'Triage', moduleKey: 'triage' },
      {
        href: '/demanda/priorizacion',
        label: 'Priorizacion',
        moduleKey: 'priority',
      },
    ],
  },
  {
    label: 'Seguimiento',
    items: [
      { href: '/seguimiento/plan', label: 'Plan', moduleKey: 'plan' },
      {
        href: '/seguimiento/portafolio',
        label: 'Portafolio',
        moduleKey: 'portfolio',
      },
      {
        href: '/seguimiento/proyectos',
        label: 'Proyectos',
        moduleKey: 'project',
      },
      { href: '/seguimiento/tareas', label: 'Tareas', moduleKey: 'task' },
      {
        href: '/seguimiento/bitacora',
        label: 'Bitacora',
        moduleKey: 'log',
      },
      {
        href: '/seguimiento/reuniones',
        label: 'Reuniones',
        moduleKey: 'meeting',
      },
    ],
  },
  {
    label: 'Activos',
    items: [
      { href: '/activos/catalogo', label: 'Activos', moduleKey: 'asset' },
      { href: '/activos/documentos', label: 'Documentos', moduleKey: 'docs' },
      {
        href: '/activos/capacidad',
        label: 'Capacidad',
        moduleKey: 'capacity',
      },
    ],
  },
  {
    label: 'Administracion',
    items: [
      {
        href: '/administracion/maestras',
        label: 'Configuracion / maestras',
        moduleKey: 'admin',
      },
      {
        href: '/administracion/frameworks',
        label: 'Frameworks',
        moduleKey: 'frameworks',
      },
      {
        href: '/administracion/revision',
        label: 'Revision',
        moduleKey: 'review',
      },
    ],
  },
  {
    label: 'Gobierno',
    items: [
      {
        href: '/gobierno/equipo',
        label: 'Equipo y permisos',
        moduleKey: 'team',
      },
      {
        href: '/gobierno/auditoria',
        label: 'Auditoria',
        moduleKey: 'audit',
      },
      {
        href: '/gobierno/mis-permisos',
        label: 'Mis permisos',
        moduleKey: 'permissions',
      },
    ],
  },
];
