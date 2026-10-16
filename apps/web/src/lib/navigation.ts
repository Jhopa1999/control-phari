import {
  BadgeCheck,
  CalendarDays,
  ChartColumn,
  ChartGantt,
  ChartLine,
  Database,
  FileText,
  FolderKanban,
  FolderOpen,
  FolderTree,
  Gauge,
  Handshake,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Mail,
  ListFilter,
  ListTodo,
  ListTree,
  NotebookPen,
  ScrollText,
  ShieldCheck,
  TriangleAlert,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

/*
 * Arquitectura de información del portal (design §8.5). Ninguna URL cambia:
 * solo se reagrupa el menú por flujo de trabajo (entrada personal → demanda →
 * ejecución → seguimiento diario → conocimiento → gobierno → administración).
 *
 * Cada ítem declara su `moduleKey`, que coincide EXACTAMENTE con las claves de
 * MODULE_MATRIX del backend; el menú se filtra por `allowedModules` de
 * GET /me/permissions. Es un filtrado cosmético: el control real lo hace el
 * servidor.
 *
 * Módulo puro (design §7.9.2): solo importa lucide-react, así que
 * e2e/web-lib.spec.ts lo carga en Node.
 */

/** Claves de módulo exactas de MODULE_MATRIX (apps/api/src/modules/auth/module-matrix.ts). */
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

export interface NavItem {
  href: string;
  label: string;
  moduleKey: ModuleKey;
  icon: LucideIcon;
  /** Otras rutas en las que el ítem se marca como activo (igualdad o prefijo). */
  activeFor?: string[];
  /** Distintivo junto a la etiqueta («Próximamente»); forma parte del nombre accesible. */
  badge?: string;
}

export interface NavGroup {
  id: string;
  /** El primer grupo (entrada personal) no lleva título. */
  label: string | null;
  items: NavItem[];
}

/**
 * Menú del portal: 7 grupos y 26 ítems. «Tareas» (/seguimiento/tareas) no es un
 * ítem porque es una página de detalle sin listado: se llega desde Mi trabajo y
 * Planificación, y «Mi trabajo» queda activo en ella. /catalogs sigue fuera del
 * menú, operativa, y marca «Maestras».
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'inicio',
    label: null,
    items: [
      { href: '/inicio', label: 'Panel del área', moduleKey: 'dashboard', icon: LayoutDashboard },
      {
        href: '/mi-trabajo',
        label: 'Mi trabajo',
        moduleKey: 'assigned',
        icon: ListTodo,
        activeFor: ['/seguimiento/tareas'],
      },
    ],
  },
  {
    id: 'demanda',
    label: 'Demanda',
    items: [
      { href: '/demanda/solicitudes', label: 'Solicitudes', moduleKey: 'requests', icon: Inbox },
      { href: '/demanda/triage', label: 'Triage', moduleKey: 'triage', icon: ListFilter },
      { href: '/demanda/priorizacion', label: 'Priorización', moduleKey: 'priority', icon: ChartColumn },
      { href: '/administracion/revision', label: 'Aprobaciones', moduleKey: 'review', icon: BadgeCheck },
    ],
  },
  {
    id: 'ejecucion',
    label: 'Ejecución',
    items: [
      { href: '/seguimiento/plan', label: 'Planificación', moduleKey: 'plan', icon: ChartGantt },
      { href: '/activos/capacidad', label: 'Capacidad', moduleKey: 'capacity', icon: Gauge },
      { href: '/seguimiento/portafolio', label: 'Portafolio', moduleKey: 'portfolio', icon: FolderKanban },
      { href: '/demanda/resumen', label: 'Indicadores', moduleKey: 'demandOverview', icon: ChartLine },
      {
        href: '/seguimiento/proyectos',
        label: 'Proyectos',
        moduleKey: 'project',
        icon: FolderOpen,
        badge: 'Próximamente',
      },
    ],
  },
  {
    id: 'seguimiento',
    label: 'Seguimiento',
    items: [
      { href: '/seguimiento/bitacora', label: 'Bitácora', moduleKey: 'log', icon: NotebookPen },
      { href: '/seguimiento/semanal', label: 'Reporte semanal', moduleKey: 'log', icon: CalendarDays },
      { href: '/seguimiento/novedades', label: 'Novedades', moduleKey: 'log', icon: TriangleAlert },
      { href: '/seguimiento/reuniones', label: 'Reuniones', moduleKey: 'meeting', icon: Users },
      { href: '/seguimiento/compromisos', label: 'Compromisos', moduleKey: 'meeting', icon: Handshake },
    ],
  },
  {
    id: 'activos',
    label: 'Activos y conocimiento',
    items: [
      { href: '/activos/catalogo', label: 'Activos', moduleKey: 'asset', icon: Database },
      { href: '/activos/documentos', label: 'Documentos', moduleKey: 'docs', icon: FileText },
    ],
  },
  {
    id: 'gobierno',
    label: 'Gobierno',
    items: [
      { href: '/administracion/frameworks', label: 'Controles', moduleKey: 'frameworks', icon: ShieldCheck },
      { href: '/gobierno/auditoria', label: 'Auditoría', moduleKey: 'audit', icon: ScrollText },
      { href: '/gobierno/mis-permisos', label: 'Mis permisos', moduleKey: 'permissions', icon: KeyRound },
    ],
  },
  {
    id: 'administracion',
    label: 'Administración',
    items: [
      { href: '/gobierno/equipo', label: 'Equipo y permisos', moduleKey: 'team', icon: UserCog },
      {
        href: '/administracion/maestras',
        label: 'Maestras',
        moduleKey: 'admin',
        icon: ListTree,
        activeFor: ['/catalogs'],
      },
      {
        href: '/administracion/areas',
        label: 'Áreas',
        moduleKey: 'areas',
        icon: FolderTree,
      },
      {
        href: '/administracion/procesos',
        label: 'Procesos',
        moduleKey: 'processesAdmin',
        icon: FolderKanban,
      },
      {
        href: '/administracion/configuracion-smtp',
        label: 'Configuracion SMTP',
        moduleKey: 'systemSettings',
        icon: Mail,
      },
    ],
  },
];

/**
 * Etiqueta de cada módulo (Mis permisos). Es la única lista de etiquetas por
 * clave: ya no se deriva del menú, donde `log` y `meeting` se repiten y `task`
 * no aparece. El orden de declaración es el de MODULE_ORDER.
 */
export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: 'Panel del área',
  assigned: 'Mi trabajo',
  task: 'Detalle de tareas',
  requests: 'Solicitudes',
  triage: 'Triage',
  priority: 'Priorización',
  review: 'Aprobaciones',
  plan: 'Planificación',
  capacity: 'Capacidad',
  portfolio: 'Portafolio',
  demandOverview: 'Indicadores',
  project: 'Proyectos',
  log: 'Bitácora, reporte semanal y novedades',
  meeting: 'Reuniones y compromisos',
  asset: 'Activos',
  docs: 'Documentos',
  frameworks: 'Controles de gobierno',
  audit: 'Auditoría',
  permissions: 'Mis permisos',
  team: 'Equipo y permisos',
  admin: 'Maestras',
  systemSettings: 'Configuración del sistema',
  areas: 'Áreas',
  processesAdmin: 'Procesos',
};

/** Las 24 claves de módulo, sin repetidos, en el orden de MODULE_LABELS. */
export const MODULE_ORDER: readonly ModuleKey[] = Object.keys(MODULE_LABELS) as ModuleKey[];

/** Grupos con sus ítems permitidos; los grupos que quedan vacíos no se devuelven. */
export function getVisibleNavGroups(allowed: ReadonlySet<string>): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.moduleKey)),
  })).filter((group) => group.items.length > 0);
}

/** El ítem está activo en su ruta, en las de `activeFor` y en sus subrutas. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.activeFor ?? [])].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
