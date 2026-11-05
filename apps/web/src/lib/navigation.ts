import {
  BadgeCheck,
  Bot,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ChartGantt,
  ChartLine,
  Database,
  FileText,
  FolderKanban,
  FolderTree,
  Gauge,
  Headset,
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
  UserRound,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { matchesSearch } from './table-sort';

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
 * Módulo puro (design §7.9.2): solo importa lucide-react y table-sort (también
 * puro), así que e2e/web-lib.spec.ts lo carga en Node.
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
  | 'processesAdmin'
  | 'requesters'
  | 'aiSettings'
  | 'recurring';

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

/** Aplicaciones del workspace GIBO. Ampliable: 'demanda' | 'servicedesk' | … */
export type AppId = 'demanda';

/**
 * Aplicación del workspace. Las URLs no cambian: la pertenencia a una app se
 * declara con `appId` en cada grupo del menú. Los grupos sin `appId` son
 * transversales (sección «Workspace» del menú).
 */
export interface NavApp {
  id: AppId;
  name: string;
  icon: LucideIcon;
  /** Texto largo, para el inicio del workspace (/aplicaciones). */
  description: string;
  /** Texto corto (≤ 70 caracteres), para el panel del selector. */
  shortDescription: string;
  /** Pantalla de inicio de la app. */
  homeHref: string;
  /** Módulo que habilita la pantalla de inicio de la app. */
  moduleKey: ModuleKey;
}

export interface NavGroup {
  id: string;
  /** El primer grupo (entrada personal) no lleva título. */
  label: string | null;
  /** App a la que pertenece; ausente = transversal (workspace). */
  appId?: AppId;
  items: NavItem[];
}

/** Aplicaciones del workspace, en el orden en que se ofrecen. */
export const NAV_APPS: readonly NavApp[] = [
  {
    id: 'demanda',
    name: 'Demanda',
    icon: Workflow,
    description:
      'Solicitudes, triage, priorización, aprobaciones, planificación, capacidad, portafolio, indicadores, seguimiento, activos y documentos.',
    shortDescription: 'Solicitudes, planificación, portafolio e indicadores.',
    homeHref: '/inicio',
    moduleKey: 'dashboard',
  },
];

/**
 * Aplicación del workspace aún no construida (placeholder «Próximamente»). NO es
 * una NavApp: no tiene grupos, menú, ruta ni módulo, no se puede abrir y no
 * cuenta como app activa. Solo reserva el apartado en el selector y el launcher
 * (spec: docs/design/workspace-apps-gibo.md, anexo A). Se mantiene separada de
 * NAV_APPS a propósito para no alterar ningún flujo de las apps reales.
 */
export interface UpcomingApp {
  id: string;
  name: string;
  icon: LucideIcon;
  /** Texto largo, para el inicio del workspace (/aplicaciones). */
  description: string;
  /** Texto corto (≤ 70 caracteres), para el panel del selector. */
  shortDescription: string;
}

/** Apps anunciadas pero no disponibles todavía, en el orden en que se muestran. */
export const NAV_UPCOMING_APPS: readonly UpcomingApp[] = [
  {
    id: 'servicedesk',
    name: 'Service Desk',
    icon: Headset,
    description:
      'Mesa de servicio: incidencias, requerimientos y acuerdos de nivel de servicio. Próximamente.',
    shortDescription: 'Incidencias, requerimientos y SLA. Próximamente.',
  },
];

/**
 * Menú del portal: 7 grupos y 26 ítems. «Tareas» (/seguimiento/tareas) no es un
 * ítem porque es una página de detalle sin listado: se llega desde Mi trabajo y
 * Planificación, y «Mi trabajo» queda activo en ella. /catalogs sigue fuera del
 * menú, operativa, y marca «Maestras».
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'inicio',
    appId: 'demanda',
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
      {
        href: '/actividades-recurrentes',
        label: 'Actividades recurrentes',
        moduleKey: 'recurring',
        icon: CalendarClock,
      },
    ],
  },
  {
    id: 'demanda',
    appId: 'demanda',
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
    appId: 'demanda',
    label: 'Ejecución',
    items: [
      { href: '/seguimiento/plan', label: 'Planificación', moduleKey: 'plan', icon: ChartGantt },
      { href: '/activos/capacidad', label: 'Capacidad', moduleKey: 'capacity', icon: Gauge },
      { href: '/seguimiento/portafolio', label: 'Portafolio', moduleKey: 'portfolio', icon: FolderKanban },
      // «Proyectos» queda fuera del menú hasta que la sección exista: la ruta
      // /seguimiento/proyectos se conserva, pero un ítem que no lleva a nada útil
      // solo añade ruido (auditoría UX, fase 1).
      { href: '/demanda/resumen', label: 'Indicadores', moduleKey: 'demandOverview', icon: ChartLine },
    ],
  },
  {
    id: 'seguimiento',
    appId: 'demanda',
    label: 'Seguimiento',
    items: [
      { href: '/seguimiento/bitacora', label: 'Bitácora', moduleKey: 'log', icon: NotebookPen },
      { href: '/seguimiento/semanal', label: 'Reporte semanal', moduleKey: 'log', icon: CalendarDays },
      { href: '/seguimiento/novedades', label: 'Novedades', moduleKey: 'log', icon: TriangleAlert },
      {
        href: '/seguimiento/reuniones',
        label: 'Reuniones y compromisos',
        moduleKey: 'meeting',
        icon: Users,
        activeFor: ['/seguimiento/compromisos'],
      },
    ],
  },
  {
    id: 'activos',
    appId: 'demanda',
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
        href: '/administracion/solicitantes',
        label: 'Solicitantes',
        moduleKey: 'requesters',
        icon: UserRound,
      },
      {
        href: '/administracion/configuracion-smtp',
        label: 'Configuración SMTP',
        moduleKey: 'systemSettings',
        icon: Mail,
      },
      {
        href: '/administracion/ia',
        label: 'Agentes de IA',
        moduleKey: 'aiSettings',
        icon: Bot,
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
  requesters: 'Solicitantes',
  aiSettings: 'Agentes de IA',
  recurring: 'Actividades recurrentes',
};

/** Las 25 claves de módulo, sin repetidos, en el orden de MODULE_LABELS. */
export const MODULE_ORDER: readonly ModuleKey[] = Object.keys(MODULE_LABELS) as ModuleKey[];

/** Grupos con sus ítems permitidos; los grupos que quedan vacíos no se devuelven. */
export function getVisibleNavGroups(allowed: ReadonlySet<string>): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.moduleKey)),
  })).filter((group) => group.items.length > 0);
}

/** Grupos de una app (los grupos recibidos ya vienen filtrados por permisos). */
export function getAppGroups(groups: readonly NavGroup[], appId: AppId): NavGroup[] {
  return groups.filter((group) => group.appId === appId);
}

/** Grupos transversales del workspace (Gobierno y Administración). */
export function getWorkspaceGroups(groups: readonly NavGroup[]): NavGroup[] {
  return groups.filter((group) => group.appId === undefined);
}

/** Apps con al menos un módulo permitido en alguno de sus grupos. */
export function getVisibleNavApps(allowed: ReadonlySet<string>): NavApp[] {
  const visible = getVisibleNavGroups(allowed);
  return NAV_APPS.filter((app) => getAppGroups(visible, app.id).length > 0);
}

/**
 * Pantalla de inicio efectiva de una app: la declarada si su módulo está
 * permitido; si no, el primer ítem visible de la app (evita un 403 al entrar).
 */
export function getAppHomeHref(app: NavApp, allowed: ReadonlySet<string>): string {
  if (allowed.has(app.moduleKey)) return app.homeHref;
  const first = getAppGroups(getVisibleNavGroups(allowed), app.id)[0]?.items[0];
  return first?.href ?? app.homeHref;
}

/** App dueña de la ruta (por el ítem activo de sus grupos); null si es transversal u otra. */
export function findAppForPath(
  pathname: string,
  apps: readonly NavApp[],
  groups: readonly NavGroup[],
): NavApp | null {
  for (const group of groups) {
    if (!group.appId) continue;
    if (!group.items.some((item) => isNavItemActive(item, pathname))) continue;
    const app = apps.find((candidate) => candidate.id === group.appId);
    if (app) return app;
  }
  return null;
}

/**
 * App activa: (1) la dueña de la ruta; (2) si la ruta es transversal o es
 * /aplicaciones, la última usada (si sigue visible); (3) la primera visible.
 */
export function resolveActiveApp(
  pathname: string,
  apps: readonly NavApp[],
  groups: readonly NavGroup[],
  lastAppId: string | null,
): NavApp | null {
  return (
    findAppForPath(pathname, apps, groups) ??
    apps.find((app) => app.id === lastAppId) ??
    apps[0] ??
    null
  );
}

export interface NavSearchResult {
  item: NavItem;
  /** Título del grupo del ítem (null en el grupo de entrada, que no lo tiene). */
  groupLabel: string | null;
  /** App del grupo; ausente en los grupos transversales. */
  appId?: AppId;
}

/**
 * Buscador de pantallas del menú (BL-027): ítems cuya etiqueta o cuyo grupo
 * contienen el texto, sin distinguir mayúsculas ni tildes («priorizacion»
 * encuentra «Priorización»; «demanda» lista las pantallas del grupo Demanda).
 * Recibe los grupos ya filtrados por permisos y conserva el orden del menú. Una
 * búsqueda vacía no devuelve nada: el menú se muestra agrupado.
 */
export function searchNavItems(groups: readonly NavGroup[], query: string): NavSearchResult[] {
  if (query.trim() === '') return [];
  return groups.flatMap((group) =>
    group.items
      .filter((item) => matchesSearch(`${group.label ?? ''} ${item.label}`, query))
      .map((item) => ({ item, groupLabel: group.label, appId: group.appId })),
  );
}

/** El ítem está activo en su ruta, en las de `activeFor` y en sus subrutas. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.activeFor ?? [])].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
