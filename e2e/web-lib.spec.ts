import { expect, test } from '@playwright/test';
import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  TriangleAlert,
} from 'lucide-react';
import type { PlanGuidePending } from '../apps/web/src/lib/api-client';
import {
  TASK_TRANSITIONS as API_TASK_TRANSITIONS,
  TASK_STATUSES as API_TASK_STATUSES,
} from '../apps/api/src/modules/plan/task-status';
import {
  TASK_TRANSITIONS as WEB_TASK_TRANSITIONS,
  canApproveTasks,
  nextTaskStatuses,
} from '../apps/web/src/lib/task-transitions';
import {
  hasPendingReviewRequirements,
  missingRequirementsText,
  reviewRequirementsOf,
} from '../apps/web/src/lib/review-requirements';
import { waitingInfo } from '../apps/web/src/lib/pending-review-wait';
import {
  RECORD_STATE_LABEL,
  nextStates,
  stateLabel,
} from '../apps/web/src/lib/record-state';
import {
  formatCount,
  formatDate,
  formatDateOnly,
  formatDateOnlyWithWeekday,
  formatDateTime,
  formatHours,
  formatMonth,
  formatPercent,
  localDateInputValue,
  localMonthInputValue,
  localMonthPeriod,
  localWeekMondayInputValue,
  orDash,
} from '../apps/web/src/lib/format';
import {
  MODULE_KEYS,
  allowedModulesFor,
} from '../apps/api/src/modules/auth/module-matrix';
import { RoleCode } from '../apps/api/src/modules/auth/role-code';
import {
  isRangePreset,
  rangeForPreset,
} from '../apps/web/src/lib/worklog-range';
import {
  MODULE_LABELS,
  MODULE_ORDER,
  NAV_APPS,
  NAV_GROUPS,
  findAppForPath,
  getAppGroups,
  getAppHomeHref,
  getVisibleNavApps,
  getVisibleNavGroups,
  getWorkspaceGroups,
  resolveActiveApp,
  isNavItemActive,
  searchNavItems,
  type NavItem,
} from '../apps/web/src/lib/navigation';
import {
  guideCategoryLabel,
  presentGuidePending,
  type GuideActionKind,
} from '../apps/web/src/lib/plan-guide';
import {
  COMMITTED_STATES,
  PLANNABLE_STATES,
  isCommitted,
  isPlannable,
  isPrioritizable,
  isTriageable,
} from '../apps/web/src/lib/request-state';
import {
  postLoginPath,
  safeInternalPath,
} from '../apps/web/src/lib/safe-redirect';
import {
  getStatus,
  parseBand,
  routeLabel,
  type StatusKind,
  type Tone,
} from '../apps/web/src/lib/status-presentation';
import {
  matchesTaskFilters,
  type TaskFilters,
} from '../apps/web/src/lib/task-filters';
import {
  buildTableView,
  compareByOrder,
  compareDate,
  compareNumber,
  compareText,
  matchesSearch,
  nextSort,
  paginate,
  sortRows,
  type Comparator,
  type SortState,
} from '../apps/web/src/lib/table-sort';
import {
  compareWithinGroup,
  countMyWork,
  groupMyWork,
  weekEndOf,
  type MyWorkGroupable,
} from '../apps/web/src/lib/my-work-groups';
import { nextStepFor, orderTransitions } from '../apps/web/src/lib/task-next-step';
import { BOARD_OTHER_KEY, boardColumns } from '../apps/web/src/lib/my-work-board';
import { BLOCK_REASON_MAX, validateBlockReason } from '../apps/web/src/lib/block-reason';
import {
  announceSelection,
  matchesAny,
  normalizeSelection,
  summarizeSelection,
  toggleValue,
  type MultiFilterOption,
} from '../apps/web/src/lib/multi-filter';

/**
 * Pruebas de funciones puras de apps/web/src/lib (design §7.9.2 y §20) con el
 * runner de Playwright y sin el fixture `page`: no abren navegador. Los módulos
 * que se importan solo usan importaciones relativas, lucide-react e
 * `import type`, así que Node los carga sin la configuración de Next. El
 * bloque de navigation.ts compara con MODULE_KEYS y MODULE_MATRIX del backend
 * (module-matrix.ts solo depende del enum RoleCode).
 */

test.describe('safe-redirect', () => {
  test('safeInternalPath conserva una ruta interna válida', () => {
    expect(safeInternalPath('/seguimiento/plan?requestId=abc')).toBe(
      '/seguimiento/plan?requestId=abc',
    );
  });

  test('safeInternalPath rechaza destinos externos, /login y valores vacíos', () => {
    const rejected: Array<string | null> = [
      'https://ejemplo.invalid',
      '//ejemplo.invalid',
      '/\\ejemplo.invalid',
      '/\t/ejemplo.invalid',
      'javascript:alert(1)',
      '/login',
      '/login?next=/x',
      '',
      null,
    ];
    for (const raw of rejected) {
      expect(safeInternalPath(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  test('postLoginPath usa un next válido y, si no, /inicio', () => {
    expect(
      postLoginPath(new URLSearchParams('next=%2Fdemanda%2Ftriage')),
    ).toBe('/demanda/triage');
    expect(postLoginPath(new URLSearchParams('expired=1'))).toBe('/inicio');
    expect(
      postLoginPath(new URLSearchParams('next=https%3A%2F%2Fejemplo.invalid')),
    ).toBe('/inicio');
  });
});

test.describe('format', () => {
  // La zona del proceso se fija en UTC−5 para que los fallos de UTC frente a
  // hora local se detecten en cualquier máquina (también en una CI en UTC). El
  // worker es compartido: se restaura al terminar.
  let previousTz: string | undefined;
  test.beforeAll(() => {
    previousTz = process.env.TZ;
    process.env.TZ = 'America/Bogota';
  });
  test.afterAll(() => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  });

  test('el proceso corre en UTC−5 (precondición del bloque)', () => {
    // Con la implementación anterior (toISOString) esta hora local daba el 1 de noviembre.
    expect(new Date(2026, 9, 31, 21, 30).toISOString().slice(0, 10)).toBe(
      '2026-11-01',
    );
  });

  test('formatDateOnly lee la fecha de calendario en UTC', () => {
    expect(formatDateOnly('2027-07-15T00:00:00.000Z')).toBe('15 jul 2027');
    expect(formatDateOnly('2027-07-15')).toBe('15 jul 2027');
  });

  test('formatDate y formatDateTime usan la zona local', () => {
    // 2026-10-11T03:30:00Z es el 10 de octubre a las 22:30 en Bogotá.
    expect(formatDate('2026-10-11T03:30:00.000Z')).toBe('10 oct 2026');
    expect(formatDateTime('2026-10-11T03:30:00.000Z')).toBe(
      '10 oct 2026, 22:30',
    );
  });

  test('las fechas vacías dan — y un texto que no es fecha se devuelve tal cual', () => {
    for (const format of [formatDate, formatDateTime, formatDateOnly, formatMonth]) {
      expect(format(null)).toBe('—');
      expect(format(undefined)).toBe('—');
      expect(format('')).toBe('—');
      expect(format('no-es-fecha')).toBe('no-es-fecha');
    }
  });

  test('formatMonth lee el mes en UTC', () => {
    // Sin timeZone: 'UTC' daría «septiembre de 2026» en Bogotá.
    expect(formatMonth('2026-10')).toBe('octubre de 2026');
  });

  test('formatHours y formatPercent usan U+2212 y espacio duro', () => {
    expect(formatHours(40)).toBe('40\u00a0h');
    expect(formatHours(37.5)).toBe('37,5\u00a0h');
    expect(formatHours(-10)).toBe('\u221210\u00a0h');
    expect(formatHours(-2.5)).toBe('\u22122,5\u00a0h');
    expect(formatHours(-0)).toBe('0\u00a0h');
    expect(formatPercent(45)).toBe('45\u00a0%');
  });

  test('formatCount usa el singular con 1 y el plural en el resto', () => {
    const pendiente = { one: 'pendiente', other: 'pendientes' };
    expect(formatCount(1, pendiente)).toBe('1 pendiente');
    expect(formatCount(0, pendiente)).toBe('0 pendientes');
    expect(formatCount(3, pendiente)).toBe('3 pendientes');
    expect(formatCount(1, { one: 'validación', other: 'validaciones' })).toBe(
      '1 validación',
    );
    expect(formatCount(12345, pendiente)).toBe('12.345 pendientes');
  });

  test('orDash da — para null, undefined o vacío', () => {
    expect(orDash(null)).toBe('—');
    expect(orDash(undefined)).toBe('—');
    expect(orDash('')).toBe('—');
    expect(orDash(0)).toBe('0');
    expect(orDash('Texto')).toBe('Texto');
  });

  test('los valores por defecto usan el calendario local (regla 2)', () => {
    expect(localDateInputValue(new Date(2026, 9, 31, 21, 30))).toBe(
      '2026-10-31',
    );
    expect(localMonthInputValue(new Date(2026, 9, 31, 21, 30))).toBe('2026-10');
    // Domingo: pasa al lunes anterior.
    expect(localWeekMondayInputValue(new Date(2026, 10, 1, 20, 0))).toBe(
      '2026-10-26',
    );
    // Sábado.
    expect(localWeekMondayInputValue(new Date(2026, 9, 31))).toBe('2026-10-26');
    // Lunes.
    expect(localWeekMondayInputValue(new Date(2026, 10, 2, 8, 0))).toBe(
      '2026-11-02',
    );
    expect(localMonthPeriod(new Date(2026, 9, 31, 21, 30))).toEqual({
      from: '2026-10-01',
      to: '2026-11-01',
    });
    // Cambio de año.
    expect(localMonthPeriod(new Date(2026, 11, 31, 23, 0))).toEqual({
      from: '2026-12-01',
      to: '2027-01-01',
    });
  });
});

test.describe('navigation', () => {
  const allItems = (): NavItem[] => NAV_GROUPS.flatMap((group) => group.items);
  const itemByLabel = (label: string): NavItem => {
    const item = allItems().find((candidate) => candidate.label === label);
    if (!item) throw new Error(`No existe el ítem «${label}» en NAV_GROUPS`);
    return item;
  };

  test('MODULE_ORDER tiene las claves del backend, sin repetidos, y cada una su etiqueta', () => {
    expect(MODULE_ORDER).toHaveLength(MODULE_KEYS.length);
    expect(new Set(MODULE_ORDER).size).toBe(MODULE_KEYS.length);
    expect([...MODULE_ORDER].sort()).toEqual([...MODULE_KEYS].sort());
    for (const key of MODULE_ORDER) {
      expect(MODULE_LABELS[key], key).toBeTruthy();
    }
  });

  test('los href del menu son exactamente las rutas esperadas, en sus 7 grupos', () => {
    // Protege las URLs: el rediseño reagrupa el menú, pero ninguna ruta cambia.
    expect(allItems().map((item) => item.href)).toEqual([
      '/inicio',
      '/mi-trabajo',
      '/actividades-recurrentes',
      '/demanda/solicitudes',
      '/demanda/triage',
      '/demanda/priorizacion',
      '/administracion/revision',
      '/seguimiento/plan',
      '/activos/capacidad',
      '/seguimiento/portafolio',
      '/demanda/resumen',
      '/seguimiento/bitacora',
      '/seguimiento/semanal',
      '/seguimiento/novedades',
      '/seguimiento/reuniones',
      '/activos/catalogo',
      '/activos/documentos',
      '/administracion/frameworks',
      '/gobierno/auditoria',
      '/gobierno/mis-permisos',
      '/gobierno/equipo',
      '/administracion/maestras',
      '/administracion/areas',
      '/administracion/procesos',
      '/administracion/solicitantes',
      '/administracion/configuracion-smtp',
      '/administracion/ia',
    ]);
    expect(NAV_GROUPS.map((group) => group.label)).toEqual([
      null,
      'Demanda',
      'Ejecución',
      'Seguimiento',
      'Activos y conocimiento',
      'Gobierno',
      'Administración',
    ]);
    for (const item of allItems()) {
      expect(MODULE_ORDER, item.href).toContain(item.moduleKey);
    }
  });

  test('getVisibleNavGroups filtra por módulos y quita los grupos vacíos', () => {
    const onlyDashboard = getVisibleNavGroups(new Set(['dashboard']));
    expect(onlyDashboard).toHaveLength(1);
    expect(onlyDashboard[0].items.map((item) => item.href)).toEqual(['/inicio']);
    expect(getVisibleNavGroups(new Set())).toEqual([]);

    // Claves que MODULE_MATRIX da al rol INTEGRANTE.
    const integrante = getVisibleNavGroups(
      new Set<string>(allowedModulesFor([RoleCode.INTEGRANTE])),
    );
    const labels = integrante.flatMap((group) => group.items.map((item) => item.label));
    for (const hidden of [
      'Triage',
      'Priorización',
      'Aprobaciones',
      'Planificación',
      'Indicadores',
      'Equipo y permisos',
      'Maestras',
    ]) {
      expect(labels, hidden).not.toContain(hidden);
    }
    for (const visible of ['Panel del área', 'Mi trabajo', 'Solicitudes', 'Capacidad']) {
      expect(labels, visible).toContain(visible);
    }
    expect(integrante.every((group) => group.items.length > 0)).toBe(true);
  });

  test('searchNavItems busca por etiqueta o grupo sin distinguir tildes ni mayúsculas', () => {
    const groups = getVisibleNavGroups(new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.moduleKey))));
    const labels = (query: string): string[] =>
      searchNavItems(groups, query).map((result) => result.item.label);

    // Sin tildes encuentra «Priorización».
    expect(labels('priorizacion')).toEqual(['Priorización']);
    expect(labels('  PRIORIZ ')).toEqual(['Priorización']);
    // El título del grupo también cuenta y se conserva el orden del menú.
    expect(labels('demanda')).toEqual(
      expect.arrayContaining(['Solicitudes', 'Triage', 'Priorización', 'Aprobaciones']),
    );
    expect(searchNavItems(groups, 'solicitudes')[0].groupLabel).toBe('Demanda');
    // El grupo de entrada no tiene título.
    expect(searchNavItems(groups, 'panel')[0].groupLabel).toBeNull();
    // Vacío o sin coincidencias: lista vacía.
    expect(searchNavItems(groups, '')).toEqual([]);
    expect(searchNavItems(groups, '   ')).toEqual([]);
    expect(labels('zzz inexistente')).toEqual([]);
    // Respeta los grupos recibidos (permisos ya aplicados).
    expect(searchNavItems(getVisibleNavGroups(new Set(['dashboard'])), 'solicitudes')).toEqual([]);
  });

  test('workspace: cada grupo con appId apunta a una app; Gobierno y Administración son transversales', () => {
    const appIds = new Set<string>(NAV_APPS.map((app) => app.id));
    for (const group of NAV_GROUPS) {
      if (group.appId) expect(appIds, group.id).toContain(group.appId);
    }
    expect(NAV_GROUPS.filter((g) => !g.appId).map((g) => g.id)).toEqual(['gobierno', 'administracion']);
    // El módulo de inicio de cada app existe en el menú de esa app.
    for (const app of NAV_APPS) {
      const keys = NAV_GROUPS.filter((g) => g.appId === app.id).flatMap((g) => g.items.map((i) => i.moduleKey));
      expect(keys, app.id).toContain(app.moduleKey);
    }
  });

  test('getVisibleNavApps muestra una app solo si hay algún módulo suyo permitido', () => {
    expect(getVisibleNavApps(new Set())).toEqual([]);
    // Solo módulos transversales: ninguna app.
    expect(getVisibleNavApps(new Set(['audit', 'team']))).toEqual([]);
    expect(getVisibleNavApps(new Set(['requests'])).map((app) => app.id)).toEqual(['demanda']);
  });

  test('getAppHomeHref usa el inicio de la app o el primer ítem visible si no hay permiso', () => {
    const demanda = NAV_APPS[0];
    expect(getAppHomeHref(demanda, new Set(['dashboard', 'requests']))).toBe('/inicio');
    expect(getAppHomeHref(demanda, new Set(['requests']))).toBe('/demanda/solicitudes');
  });

  test('getAppGroups y getWorkspaceGroups reparten los grupos visibles', () => {
    const visible = getVisibleNavGroups(new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.moduleKey))));
    expect(getAppGroups(visible, 'demanda').map((g) => g.id)).toEqual([
      'inicio',
      'demanda',
      'ejecucion',
      'seguimiento',
      'activos',
    ]);
    expect(getWorkspaceGroups(visible).map((g) => g.id)).toEqual(['gobierno', 'administracion']);
  });

  test('resolveActiveApp: dueña de la ruta, si no la última usada y si no la primera visible', () => {
    const allKeys = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.moduleKey)));
    const groups = getVisibleNavGroups(allKeys);
    const apps = getVisibleNavApps(allKeys);
    expect(findAppForPath('/demanda/solicitudes/abc', apps, groups)?.id).toBe('demanda');
    // Ruta de una app aunque su URL diga «administracion» (Aprobaciones).
    expect(findAppForPath('/administracion/revision', apps, groups)?.id).toBe('demanda');
    // Transversal o launcher: sin dueña.
    expect(findAppForPath('/gobierno/auditoria', apps, groups)).toBeNull();
    expect(findAppForPath('/aplicaciones', apps, groups)).toBeNull();
    // Última usada guardada que ya no es visible: se descarta.
    expect(resolveActiveApp('/gobierno/auditoria', apps, groups, 'demanda')?.id).toBe('demanda');
    expect(resolveActiveApp('/gobierno/auditoria', apps, groups, 'inexistente')?.id).toBe('demanda');
    expect(resolveActiveApp('/aplicaciones', [], [], null)).toBeNull();
  });

  test('searchNavItems informa la app de cada resultado (los transversales no tienen)', () => {
    const groups = getVisibleNavGroups(new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.moduleKey))));
    expect(searchNavItems(groups, 'solicitudes')[0].appId).toBe('demanda');
    expect(searchNavItems(groups, 'auditoria')[0].appId).toBeUndefined();
  });

  test('isNavItemActive usa igualdad o prefijo de ruta, también en activeFor', () => {
    expect(isNavItemActive(itemByLabel('Mi trabajo'), '/seguimiento/tareas')).toBe(true);
    expect(isNavItemActive(itemByLabel('Maestras'), '/catalogs')).toBe(true);
    const solicitudes = itemByLabel('Solicitudes');
    expect(isNavItemActive(solicitudes, '/demanda/solicitudes')).toBe(true);
    expect(isNavItemActive(solicitudes, '/demanda/solicitudes/x')).toBe(true);
    expect(isNavItemActive(solicitudes, '/demanda/solicitudesx')).toBe(false);
    expect(isNavItemActive(itemByLabel('Panel del área'), '/seguimiento/tareas')).toBe(false);
  });
});

test.describe('status-presentation', () => {
  test('getStatus con un valor desconocido o vacío no lanza', () => {
    expect(getStatus('request', 'X')).toEqual({ label: 'X', tone: 'neutral' });
    expect(getStatus('request', null).label).toBe('—');
    expect(getStatus('request', undefined)).toEqual({
      label: '—',
      tone: 'neutral',
    });
    expect(getStatus('task', 'toString')).toEqual({
      label: 'toString',
      tone: 'neutral',
    });
    expect(getStatus('log', 'REVISADO').label).toBe('Revisado');
  });

  test('getStatus cubre la tabla completa de §7.3', () => {
    const table: Array<[StatusKind, string, string, Tone]> = [
      ['request', 'REGISTRADA', 'Registrada', 'neutral'],
      ['request', 'EN_TRIAGE', 'En triage', 'info'],
      ['request', 'DEVUELTA', 'Devuelta', 'warning'],
      ['request', 'RECHAZADA', 'Rechazada', 'danger'],
      ['request', 'BACKLOG_PRIORIZADO', 'Backlog priorizado', 'info'],
      ['request', 'COMPROMETIDA', 'Comprometida', 'info'],
      ['request', 'EN_PLANIFICACION', 'En planificación', 'info'],
      ['request', 'EN_EJECUCION', 'En ejecución', 'info'],
      ['request', 'BLOQUEADA', 'Bloqueada', 'danger'],
      ['request', 'EN_VALIDACION', 'En validación', 'info'],
      ['request', 'LISTA_PARA_LIBERAR', 'Lista para liberar', 'success'],
      ['request', 'EN_ESTABILIZACION', 'En estabilización', 'info'],
      ['request', 'OPERATIVA', 'Operativa', 'success'],
      ['request', 'CERRADA', 'Cerrada', 'neutral'],
      ['request', 'RETIRADA', 'Retirada', 'neutral'],
      ['triage', 'CONTINUAR', 'Continuar', 'success'],
      ['triage', 'DEVOLVER', 'Devolver', 'warning'],
      ['triage', 'RECHAZAR', 'Rechazar', 'danger'],
      ['plan', 'BORRADOR', 'Borrador', 'neutral'],
      ['plan', 'EN_AUTORIZACION', 'En autorización', 'info'],
      ['plan', 'AUTORIZADO', 'Autorizado', 'success'],
      ['plan', 'DEVUELTO', 'Devuelto', 'warning'],
      ['task', 'POR_HACER', 'Por hacer', 'neutral'],
      ['task', 'EN_CURSO', 'En curso', 'info'],
      ['task', 'BLOQUEADA', 'Bloqueada', 'danger'],
      ['task', 'EN_REVISION', 'En revisión', 'info'],
      ['task', 'TERMINADA', 'Terminada', 'success'],
      ['record', 'BORRADOR', 'Borrador', 'neutral'],
      ['record', 'EN_CURSO', 'En curso', 'info'],
      ['record', 'BLOQUEADO', 'Bloqueado', 'danger'],
      ['record', 'COMPLETADO', 'Completado', 'success'],
      ['record', 'ARCHIVADO', 'Archivado', 'neutral'],
      ['log', 'BORRADOR', 'Borrador', 'neutral'],
      ['log', 'ENVIADO', 'Enviado', 'info'],
      ['log', 'REVISADO', 'Revisado', 'success'],
      ['asset', 'BORRADOR', 'Borrador', 'neutral'],
      ['asset', 'ACTIVO', 'Activo', 'success'],
      ['asset', 'RETIRADO', 'Retirado', 'neutral'],
      ['document', 'BORRADOR', 'Borrador', 'neutral'],
      ['document', 'VIGENTE', 'Vigente', 'success'],
      ['document', 'ARCHIVADA', 'Archivada', 'neutral'],
      ['gate', 'PENDIENTE', 'Pendiente', 'neutral'],
      ['gate', 'CUMPLIDO', 'Cumplido', 'success'],
      ['gate', 'NO_APLICA', 'No aplica', 'outline'],
      ['capacity', 'OK', 'Normal', 'success'],
      ['capacity', 'SOBRECARGA', 'Sobrecarga', 'danger'],
      ['capacity', 'SIN_DISPONIBILIDAD', 'Sin disponibilidad', 'neutral'],
      ['capacity', 'CARGA_PARCIAL', 'Carga parcial', 'warning'],
      ['band', 'P1', 'P1', 'danger'],
      ['band', 'P2', 'P2', 'warning'],
      ['band', 'P3', 'P3', 'info'],
      ['band', 'P4', 'P4', 'neutral'],
      ['band', 'SIN_PRIORIZAR', 'Sin priorizar', 'outline'],
      ['active', 'true', 'Activo', 'success'],
      ['active', 'false', 'Inactivo', 'neutral'],
      ['grant', 'true', 'Activo', 'success'],
      ['grant', 'false', 'Revocado', 'neutral'],
      ['permission', 'true', 'Permitido', 'success'],
      ['permission', 'false', 'No permitido', 'neutral'],
      ['blocking', 'RESUELTO', 'Resuelto', 'neutral'],
      ['blocking', 'SIN_RESOLVER', 'Sin resolver', 'danger'],
      ['blocked', 'true', 'Bloqueada', 'danger'],
      ['blocked', 'false', 'Sin bloqueo', 'neutral'],
    ];
    for (const [kind, value, label, tone] of table) {
      const status = getStatus(kind, value);
      expect({ kind, value, label: status.label, tone: status.tone }).toEqual({
        kind,
        value,
        label,
        tone,
      });
    }
  });

  test('getStatus lleva los iconos de §7.3', () => {
    expect(getStatus('gate', 'PENDIENTE').icon).toBe(CircleDashed);
    expect(getStatus('gate', 'CUMPLIDO').icon).toBe(CircleCheck);
    expect(getStatus('gate', 'NO_APLICA').icon).toBe(CircleMinus);
    expect(getStatus('capacity', 'SOBRECARGA').icon).toBe(TriangleAlert);
    expect(getStatus('blocking', 'SIN_RESOLVER').icon).toBe(TriangleAlert);
    expect(getStatus('blocked', 'true').icon).toBe(TriangleAlert);
    expect(getStatus('request', 'REGISTRADA').icon).toBeUndefined();
  });

  test('parseBand toma la banda del prefijo de la etiqueta de la API', () => {
    expect(parseBand('P2 · Programación en el horizonte cercano')).toBe('P2');
    expect(parseBand('P10')).toBeNull();
    expect(parseBand('Sin priorizar')).toBeNull();
    expect(parseBand(null)).toBeNull();
  });

  test('routeLabel usa la maestra, después el respaldo y después el código', () => {
    expect(
      routeLabel('SIMPLIFICADA', [
        { code: 'SIMPLIFICADA', label: 'Ruta simplificada' },
      ]),
    ).toBe('Ruta simplificada');
    expect(routeLabel('EXPLORACION', [])).toBe('Exploración');
    expect(routeLabel('OTRA', [])).toBe('OTRA');
    expect(routeLabel(null, [])).toBe('—');
    expect(routeLabel('', [])).toBe('—');
  });
});

test.describe('plan-guide', () => {
  const names = {
    phase: (id: string) => (id === 'ph-1' ? 'Análisis' : null),
    task: (id: string) => (id === 't-1' ? 'Modelo de datos' : null),
  };

  function pending(
    code: string,
    category: string,
    targetId?: string,
  ): PlanGuidePending {
    return {
      category,
      code,
      message: `Mensaje de la API (${code})`,
      ...(targetId ? { targetId } : {}),
    };
  }

  test('cada código conocido produce su texto y su acción (§10.2)', () => {
    const cases: Array<
      [PlanGuidePending, string, GuideActionKind, string, string | null]
    > = [
      [
        pending('NO_PHASES', 'datesPhases'),
        'El plan necesita al menos una fase.',
        'newPhase',
        'Nueva fase',
        null,
      ],
      [
        pending('PHASE_MISSING_DATES', 'datesPhases', 'ph-1'),
        'La fase «Análisis» necesita fecha de inicio y de fin.',
        'editPhase',
        'Editar fase',
        'ph-1',
      ],
      [
        pending('PHASE_DATES_INVERTED', 'datesPhases', 'ph-1'),
        'La fase «Análisis» empieza después de terminar.',
        'editPhase',
        'Editar fase',
        'ph-1',
      ],
      [
        pending('NO_TASKS', 'tasksResponsibles'),
        'El plan necesita al menos una tarea.',
        'newTask',
        'Agregar tarea',
        null,
      ],
      [
        pending('TASK_MISSING_RESPONSIBLE', 'tasksResponsibles', 't-1'),
        'La tarea «Modelo de datos» necesita un responsable.',
        'editTask',
        'Editar tarea',
        't-1',
      ],
      [
        pending('TASK_MISSING_DATES', 'tasksResponsibles', 't-1'),
        'La tarea «Modelo de datos» necesita fecha de inicio y de fin.',
        'editTask',
        'Editar tarea',
        't-1',
      ],
      [
        pending('TASK_DATES_INVERTED', 'tasksResponsibles', 't-1'),
        'La tarea «Modelo de datos» empieza después de terminar.',
        'editTask',
        'Editar tarea',
        't-1',
      ],
      [
        pending('MILESTONE_WITH_HOURS', 'tasksResponsibles', 't-1'),
        'El hito «Modelo de datos» debe tener 0 horas de esfuerzo.',
        'editTask',
        'Editar tarea',
        't-1',
      ],
    ];
    for (const [p, label, kind, actionLabel, targetId] of cases) {
      expect(presentGuidePending(p, names)).toEqual({
        id: `${p.code}:${p.targetId ?? ''}`,
        category: p.category,
        label,
        action: { kind, label: actionLabel, targetId },
      });
    }
  });

  test('un código desconocido devuelve el mensaje de la API y ninguna acción', () => {
    expect(
      presentGuidePending(
        {
          category: 'capacity',
          code: 'CODIGO_NUEVO',
          message: 'Mensaje de la API',
          targetId: 'x-1',
        },
        names,
      ),
    ).toEqual({
      id: 'CODIGO_NUEVO:x-1',
      category: 'capacity',
      label: 'Mensaje de la API',
      action: null,
    });
  });

  test('un targetId que no está en los datos cargados devuelve el mensaje de la API', () => {
    const phase = presentGuidePending(
      pending('PHASE_MISSING_DATES', 'datesPhases', 'ph-otra'),
      names,
    );
    expect(phase.label).toBe('Mensaje de la API (PHASE_MISSING_DATES)');
    expect(phase.action).toEqual({
      kind: 'editPhase',
      label: 'Editar fase',
      targetId: 'ph-otra',
    });
    const task = presentGuidePending(
      pending('MILESTONE_WITH_HOURS', 'tasksResponsibles', 't-otra'),
      names,
    );
    expect(task.label).toBe('Mensaje de la API (MILESTONE_WITH_HOURS)');
  });

  test('guideCategoryLabel traduce las categorías y deja la clave si es desconocida', () => {
    expect(guideCategoryLabel('datesPhases')).toBe('Fases y fechas');
    expect(guideCategoryLabel('tasksResponsibles')).toBe(
      'Tareas y responsables',
    );
    expect(guideCategoryLabel('evidenceGates')).toBe('Evidencias de controles');
    expect(guideCategoryLabel('categoriaNueva')).toBe('categoriaNueva');
  });
});

test.describe('request-state', () => {
  test('isTriageable solo con REGISTRADA', () => {
    expect(isTriageable({ operationalState: 'REGISTRADA' })).toBe(true);
    for (const state of ['EN_TRIAGE', 'DEVUELTA', 'BACKLOG_PRIORIZADO', 'COMPROMETIDA']) {
      expect(isTriageable({ operationalState: state }), state).toBe(false);
    }
  });

  test('isPrioritizable con Continuar y En triage o Backlog priorizado', () => {
    expect(
      isPrioritizable({
        operationalState: 'EN_TRIAGE',
        currentTriageDecision: 'CONTINUAR',
      }),
    ).toBe(true);
    expect(
      isPrioritizable({
        operationalState: 'BACKLOG_PRIORIZADO',
        currentTriageDecision: 'CONTINUAR',
      }),
    ).toBe(true);
    expect(
      isPrioritizable({
        operationalState: 'EN_TRIAGE',
        currentTriageDecision: 'DEVOLVER',
      }),
    ).toBe(false);
    expect(
      isPrioritizable({
        operationalState: 'COMPROMETIDA',
        currentTriageDecision: 'CONTINUAR',
      }),
    ).toBe(false);
    expect(
      isPrioritizable({
        operationalState: 'REGISTRADA',
        currentTriageDecision: null,
      }),
    ).toBe(false);
  });

  test('isCommitted: iniciativas desde COMPROMETIDA hasta CERRADA; el resto son solicitudes', () => {
    expect(COMMITTED_STATES).toEqual([
      'COMPROMETIDA',
      'EN_PLANIFICACION',
      'EN_EJECUCION',
      'BLOQUEADA',
      'EN_VALIDACION',
      'LISTA_PARA_LIBERAR',
      'EN_ESTABILIZACION',
      'OPERATIVA',
      'CERRADA',
    ]);
    for (const state of COMMITTED_STATES) {
      expect(isCommitted({ operationalState: state }), state).toBe(true);
    }
    for (const state of ['REGISTRADA', 'EN_TRIAGE', 'DEVUELTA', 'RECHAZADA', 'BACKLOG_PRIORIZADO', 'RETIRADA']) {
      expect(isCommitted({ operationalState: state }), state).toBe(false);
    }
  });

  test('isPlannable con los tres estados de PLANNABLE_STATES', () => {
    expect(PLANNABLE_STATES).toEqual([
      'COMPROMETIDA',
      'EN_PLANIFICACION',
      'EN_EJECUCION',
    ]);
    for (const state of PLANNABLE_STATES) {
      expect(isPlannable({ operationalState: state }), state).toBe(true);
    }
    expect(isPlannable({ operationalState: 'BACKLOG_PRIORIZADO' })).toBe(false);
  });
});

test.describe('task-filters', () => {
  const task = {
    title: 'Diseño del Modelo de datos',
    status: 'EN_CURSO',
    phaseId: 'ph-1',
    responsibleUserId: 'u-1',
  };
  const noFilters: TaskFilters = {
    q: '',
    status: 'ALL',
    phaseId: 'ALL',
    mineUserId: null,
  };

  test("'ALL' y mineUserId null no filtran", () => {
    expect(matchesTaskFilters(task, noFilters)).toBe(true);
    expect(
      matchesTaskFilters({ ...task, responsibleUserId: null }, noFilters),
    ).toBe(true);
  });

  test('Solo mis tareas compara responsibleUserId con el userId del actor', () => {
    expect(matchesTaskFilters(task, { ...noFilters, mineUserId: 'u-1' })).toBe(
      true,
    );
    expect(matchesTaskFilters(task, { ...noFilters, mineUserId: 'u-2' })).toBe(
      false,
    );
    expect(
      matchesTaskFilters(
        { ...task, responsibleUserId: null },
        { ...noFilters, mineUserId: 'u-1' },
      ),
    ).toBe(false);
  });

  test('q también coincide con el ID visible (completo, parcial y forma corta)', () => {
    const coded = { ...task, code: 'PRY-0012-T07' };
    for (const q of ['PRY-0012-T07', 'pry-0012-t07', 'pry-0012', 'T07', 't7', ' t07 ']) {
      expect(matchesTaskFilters(coded, { ...noFilters, q })).toBe(true);
    }
    for (const q of ['T08', 'F2', 'PRY-0013']) {
      expect(matchesTaskFilters(coded, { ...noFilters, q })).toBe(false);
    }
    // Sin code (llamadores antiguos) sigue buscando solo por título.
    expect(matchesTaskFilters(task, { ...noFilters, q: 'T07' })).toBe(false);
  });

  test('q no distingue mayúsculas ni tildes', () => {
    expect(matchesTaskFilters(task, { ...noFilters, q: 'MODELO' })).toBe(true);
    expect(matchesTaskFilters(task, { ...noFilters, q: ' diseno ' })).toBe(true);
    expect(matchesTaskFilters(task, { ...noFilters, q: 'despliegue' })).toBe(
      false,
    );
  });

  test('estado y fase filtran por igualdad', () => {
    expect(matchesTaskFilters(task, { ...noFilters, status: 'EN_CURSO' })).toBe(
      true,
    );
    expect(matchesTaskFilters(task, { ...noFilters, status: 'TERMINADA' })).toBe(
      false,
    );
    expect(matchesTaskFilters(task, { ...noFilters, phaseId: 'ph-1' })).toBe(
      true,
    );
    expect(matchesTaskFilters(task, { ...noFilters, phaseId: 'ph-2' })).toBe(
      false,
    );
  });
});

test.describe('table-sort', () => {
  interface Row {
    id: number;
    title: string;
  }
  const rows: Row[] = Array.from({ length: 45 }, (_, i) => ({
    id: i + 1,
    title: `Fila ${i + 1}`,
  }));
  const comparators: Record<'id' | 'title', Comparator<Row>> = {
    id: (a, b, d) => compareNumber(a.id, b.id, d),
    title: (a, b, d) => compareText(a.title, b.title, d),
  };

  test('compareText no distingue mayúsculas ni tildes y ordena números de forma natural', () => {
    expect(compareText('Árbol', 'arbol', 'asc')).toBe(0);
    expect(compareText('Item 2', 'Item 10', 'asc')).toBeLessThan(0);
    expect(compareText('Item 2', 'Item 10', 'desc')).toBeGreaterThan(0);
    expect(
      ['Item 10', 'beta', 'Árbol', 'Item 2', 'arbol'].sort((a, b) =>
        compareText(a, b, 'asc'),
      ),
    ).toEqual(['Árbol', 'arbol', 'beta', 'Item 2', 'Item 10']);
  });

  test('los vacíos quedan al final en las dos direcciones', () => {
    const byFlow = compareByOrder(['REGISTRADA', 'EN_TRIAGE', 'CERRADA']);
    for (const d of ['asc', 'desc'] as const) {
      const texts = ['b', null, '', 'a', '  '].sort((x, y) =>
        compareText(x, y, d),
      );
      expect(texts.slice(0, 2)).toEqual(d === 'asc' ? ['a', 'b'] : ['b', 'a']);

      const numbers = [2, null, 1, Number.NaN].sort((x, y) =>
        compareNumber(x, y, d),
      );
      expect(numbers.slice(0, 2)).toEqual(d === 'asc' ? [1, 2] : [2, 1]);

      const dates = ['2026-02-01', null, 'no-es-fecha', '2026-01-01', ''].sort(
        (x, y) => compareDate(x, y, d),
      );
      expect(dates.slice(0, 2)).toEqual(
        d === 'asc' ? ['2026-01-01', '2026-02-01'] : ['2026-02-01', '2026-01-01'],
      );

      const states = ['CERRADA', 'DESCONOCIDO', null, 'REGISTRADA'].sort(
        (x, y) => byFlow(x, y, d),
      );
      expect(states.slice(0, 2)).toEqual(
        d === 'asc' ? ['REGISTRADA', 'CERRADA'] : ['CERRADA', 'REGISTRADA'],
      );
    }
  });

  test('sortRows es estable y con sort null devuelve el orden recibido', () => {
    interface Item {
      id: number;
      group: string;
    }
    const items: Item[] = [
      { id: 1, group: 'b' },
      { id: 2, group: 'a' },
      { id: 3, group: 'b' },
      { id: 4, group: 'a' },
    ];
    const byGroup: Record<'group', Comparator<Item>> = {
      group: (a, b, d) => compareText(a.group, b.group, d),
    };
    const ids = (list: Item[]) => list.map((item) => item.id);
    expect(ids(sortRows(items, { key: 'group', direction: 'asc' }, byGroup))).toEqual([
      2, 4, 1, 3,
    ]);
    expect(ids(sortRows(items, { key: 'group', direction: 'desc' }, byGroup))).toEqual([
      1, 3, 2, 4,
    ]);
    const copy = sortRows(items, null, byGroup);
    expect(copy).toEqual(items);
    expect(copy).not.toBe(items);
  });

  test('paginate acota la página y calcula from y to', () => {
    expect(paginate(rows, 2, 25)).toMatchObject({
      page: 2,
      pageCount: 2,
      from: 26,
      to: 45,
    });
    expect(paginate(rows, 2, 25).pageRows).toEqual(rows.slice(25));
    expect(paginate(rows, 9, 25)).toMatchObject({ page: 2, from: 26, to: 45 });
    expect(paginate(rows, 0, 25)).toMatchObject({ page: 1, from: 1, to: 25 });
    expect(paginate([], 1, 25)).toEqual({
      pageRows: [],
      page: 1,
      pageCount: 1,
      from: 0,
      to: 0,
    });
  });

  test('matchesSearch ignora espacios, mayúsculas y tildes', () => {
    expect(matchesSearch('Priorización de demanda', ' priorizacion ')).toBe(
      true,
    );
    expect(matchesSearch('priorizacion de demanda', 'PRIORIZACIÓN')).toBe(true);
    expect(matchesSearch('Priorización de demanda', 'triage')).toBe(false);
    expect(matchesSearch(null, 'x')).toBe(false);
    expect(matchesSearch(null, '   ')).toBe(true);
  });

  test('nextSort: ascendente, descendente y vuelta al orden por defecto', () => {
    type Key = 'registeredAt' | 'title';
    const def: SortState<Key> = { key: 'registeredAt', direction: 'desc' };
    expect(nextSort<Key>(null, 'title', def)).toEqual({
      key: 'title',
      direction: 'asc',
    });
    expect(nextSort<Key>(def, 'title', def)).toEqual({
      key: 'title',
      direction: 'asc',
    });
    expect(
      nextSort<Key>({ key: 'title', direction: 'asc' }, 'title', def),
    ).toEqual({ key: 'title', direction: 'desc' });
    expect(
      nextSort<Key>({ key: 'title', direction: 'desc' }, 'title', def),
    ).toEqual(def);
    // La columna del orden por defecto llega a ascendente y, con otro clic, vuelve a def.
    const ascending = nextSort<Key>(def, 'registeredAt', def);
    expect(ascending).toEqual({ key: 'registeredAt', direction: 'asc' });
    expect(nextSort<Key>(ascending, 'registeredAt', def)).toEqual(def);
    expect(
      nextSort<Key>({ key: 'title', direction: 'desc' }, 'title', null),
    ).toBeNull();
  });

  // Invariante de design §24.1: con pageSize null no se trunca ninguna fila;
  // con un número, pageRows.length <= pageSize y filtered sigue disponible.
  test('invariante §24.1: con pageSize null, pageRows contiene todas las filas', () => {
    const view = buildTableView(rows, {
      sort: null,
      comparators,
      page: 1,
      pageSize: null,
    });
    expect(view.pageRows).toHaveLength(45);
    expect(view.pageRows).toEqual(rows);
    expect(view).toMatchObject({
      total: 45,
      filtered: 45,
      page: 1,
      pageCount: 1,
      from: 1,
      to: 45,
    });
    // Una página fuera de rango tampoco oculta filas.
    expect(
      buildTableView(rows, { sort: null, comparators, page: 3, pageSize: null })
        .pageRows,
    ).toHaveLength(45);
    expect(paginate(rows, 1, null)).toMatchObject({
      page: 1,
      pageCount: 1,
      from: 1,
      to: 45,
    });
    expect(paginate(rows, 1, null).pageRows).toHaveLength(45);
  });

  test('invariante §24.1: con un número, pageRows.length <= pageSize y filtered sigue disponible', () => {
    const first = buildTableView(rows, {
      sort: null,
      comparators,
      page: 1,
      pageSize: 25,
    });
    expect(first.pageRows).toHaveLength(25);
    expect(first).toMatchObject({
      total: 45,
      filtered: 45,
      page: 1,
      pageCount: 2,
      from: 1,
      to: 25,
    });
    const second = buildTableView(rows, {
      sort: null,
      comparators,
      page: 2,
      pageSize: 25,
    });
    expect(second.pageRows).toHaveLength(20);
    expect(second).toMatchObject({ filtered: 45, page: 2, from: 26, to: 45 });
    for (const pageSize of [25, 50, 100]) {
      for (const page of [1, 2, 3]) {
        const view = buildTableView(rows, {
          sort: null,
          comparators,
          page,
          pageSize,
        });
        expect(view.pageRows.length).toBeLessThanOrEqual(pageSize);
        expect(view.filtered).toBe(45);
      }
    }
  });

  test('invariante §24.1: sin filas, pageCount 1, from 0 y to 0', () => {
    for (const pageSize of [null, 25]) {
      expect(
        buildTableView<Row, 'id' | 'title'>([], {
          sort: null,
          comparators,
          page: 1,
          pageSize,
        }),
      ).toEqual({
        pageRows: [],
        total: 0,
        filtered: 0,
        page: 1,
        pageCount: 1,
        from: 0,
        to: 0,
      });
    }
  });

  test('buildTableView filtra, después ordena y después pagina', () => {
    const view = buildTableView(rows, {
      filter: (row) => row.id <= 40,
      sort: { key: 'id', direction: 'desc' },
      comparators,
      page: 2,
      pageSize: 25,
    });
    expect(view).toMatchObject({
      total: 45,
      filtered: 40,
      page: 2,
      pageCount: 2,
      from: 26,
      to: 40,
    });
    expect(view.pageRows.map((row) => row.id)).toEqual(
      Array.from({ length: 15 }, (_, i) => 15 - i),
    );
  });
});

test.describe('task-transitions', () => {
  test('el espejo del frontend coincide con la máquina de estados del backend', () => {
    const fromApi = [...API_TASK_TRANSITIONS]
      .map(([from, to]) => `${from}>${to}`)
      .sort();
    const fromWeb = Object.entries(WEB_TASK_TRANSITIONS)
      .flatMap(([from, targets]) => targets.map((to) => `${from}>${to}`))
      .sort();
    expect(fromWeb).toEqual(fromApi);
  });

  test('el espejo cubre exactamente los estados del backend', () => {
    expect(Object.keys(WEB_TASK_TRANSITIONS).sort()).toEqual(
      [...API_TASK_STATUSES].sort(),
    );
  });

  test('nextTaskStatuses con un valor fuera del enum devuelve [] sin lanzar', () => {
    for (const canApprove of [true, false]) {
      expect(
        nextTaskStatuses('INEXISTENTE' as unknown as keyof typeof WEB_TASK_TRANSITIONS, canApprove),
      ).toEqual([]);
    }
  });
  test('quien puede aprobar ve la máquina completa (espejo exacto del backend)', () => {
    for (const from of Object.keys(WEB_TASK_TRANSITIONS) as Array<keyof typeof WEB_TASK_TRANSITIONS>) {
      expect(nextTaskStatuses(from, true), from).toEqual(WEB_TASK_TRANSITIONS[from]);
    }
  });
  test('quien no puede aprobar no ve «Terminar» desde En revisión ni «Reabrir» desde Terminada', () => {
    expect(nextTaskStatuses('EN_REVISION', false)).toEqual(['EN_CURSO', 'BLOQUEADA']);
    expect(nextTaskStatuses('TERMINADA', false)).toEqual([]);
    // El resto de estados no cambia.
    for (const from of ['POR_HACER', 'EN_CURSO', 'BLOQUEADA'] as const) {
      expect(nextTaskStatuses(from, false), from).toEqual(WEB_TASK_TRANSITIONS[from]);
    }
  });
});
test.describe('canApproveTasks (espejo de isPlanManager)', () => {
  test('solo el jefe de área y el líder de proceso pueden aprobar', () => {
    expect(canApproveTasks(['JEFE_AREA'])).toBe(true);
    expect(canApproveTasks(['LIDER_PROCESO'])).toBe(true);
    expect(canApproveTasks(['INTEGRANTE', 'LIDER_PROCESO'])).toBe(true);
    expect(canApproveTasks(['INTEGRANTE'])).toBe(false);
    expect(canApproveTasks(['ADMIN'])).toBe(false);
    expect(canApproveTasks(['ROL_DESCONOCIDO'])).toBe(false);
    expect(canApproveTasks([])).toBe(false);
    expect(canApproveTasks(undefined)).toBe(false);
    expect(canApproveTasks(null)).toBe(false);
  });
});
test.describe('reviewRequirementsOf (requisitos de envío a revisión)', () => {
  test('avance al 100 % sin evidencia exigida: no falta nada', () => {
    expect(reviewRequirementsOf({ progress: 100, evidenceRequired: false, hasEvidence: false })).toEqual({
      needsProgress: false,
      needsEvidence: false,
      evidenceRequired: false,
    });
    expect(hasPendingReviewRequirements({ progress: 100, evidenceRequired: false, hasEvidence: false })).toBe(false);
  });
  test('evidencia exigida y ausente: falta evidencia', () => {
    const req = reviewRequirementsOf({ progress: 100, evidenceRequired: true, hasEvidence: false });
    expect(req.needsEvidence).toBe(true);
    expect(req.needsProgress).toBe(false);
    expect(missingRequirementsText(req)).toBe('evidencia');
  });
  test('evidencia exigida y presente: no falta', () => {
    expect(hasPendingReviewRequirements({ progress: 100, evidenceRequired: true, hasEvidence: true })).toBe(false);
  });
  test('avance por debajo de 100: falta avance; con ambos lo dice junto', () => {
    expect(reviewRequirementsOf({ progress: 99, evidenceRequired: false }).needsProgress).toBe(true);
    const both = reviewRequirementsOf({ progress: 90, evidenceRequired: true, hasEvidence: false });
    expect(missingRequirementsText(both)).toBe('avance al 100 % y evidencia');
  });
  test('banderas ausentes (respuesta antigua) se tratan como sin requisito de evidencia', () => {
    const req = reviewRequirementsOf({ progress: 100 });
    expect(req.needsEvidence).toBe(false);
    expect(req.evidenceRequired).toBe(false);
  });
});
test.describe('waitingInfo (tiempo de espera en «Por aprobar»)', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const wait = (iso: string, approximate = false) =>
    waitingInfo({ waitingSince: iso, waitingSinceApproximate: approximate }, now);
  test('menos de 24 h es «desde hoy»', () => {
    expect(wait('2026-11-10T01:00:00Z')).toMatchObject({ label: 'Espera desde hoy', days: 0, long: false });
  });
  test('una fecha futura cuenta como hoy', () => {
    expect(wait('2026-11-12T00:00:00Z').label).toBe('Espera desde hoy');
  });
  test('1 día y varios días, con singular y plural', () => {
    expect(wait('2026-11-09T11:00:00Z').label).toBe('Espera hace 1 día');
    expect(wait('2026-11-08T11:00:00Z')).toMatchObject({ label: 'Espera hace 2 días', long: false });
  });
  test('desde 3 días la espera es larga', () => {
    expect(wait('2026-11-07T11:00:00Z')).toMatchObject({ days: 3, long: true });
  });
  test('la fecha aproximada lo dice con «unos»', () => {
    expect(wait('2026-11-06T11:00:00Z', true)).toMatchObject({
      label: 'Espera hace unos 4 días',
      approximate: true,
    });
  });
});

test.describe('record-state', () => {
  test('nextStates sigue las transiciones reversibles del flujo', () => {
    expect(nextStates('EN_CURSO')).toEqual(['BLOQUEADO', 'COMPLETADO']);
    expect(nextStates('BLOQUEADO')).toEqual(['EN_CURSO', 'COMPLETADO']);
    expect(nextStates('COMPLETADO')).toEqual(['ARCHIVADO', 'EN_CURSO']);
    expect(nextStates('ARCHIVADO')).toEqual(['EN_CURSO']);
  });

  test('BORRADOR y los valores desconocidos no ofrecen transiciones', () => {
    expect(nextStates('BORRADOR')).toEqual([]);
    expect(nextStates('XYZ')).toEqual([]);
  });

  test('stateLabel traduce los estados y deja el código si es desconocido', () => {
    for (const [code, label] of Object.entries(RECORD_STATE_LABEL)) {
      expect(stateLabel(code)).toBe(label);
    }
    expect(stateLabel('XYZ')).toBe('XYZ');
  });
});

test.describe('my-work-groups', () => {
  let seq = 0;
  function task(
    endDate: string | null,
    status = 'POR_HACER',
    extra: Partial<MyWorkGroupable> = {},
  ): MyWorkGroupable {
    seq += 1;
    return {
      taskId: `t${String(seq).padStart(3, '0')}`,
      title: `Tarea ${seq}`,
      status,
      isMilestone: false,
      endDate,
      ...extra,
    };
  }
  const keyOf = (endDate: string | null, today: string, status = 'POR_HACER') => {
    const item = task(endDate, status);
    const groups = groupMyWork([item], today);
    return Object.entries(groups).find(([, list]) => list.includes(item))?.[0];
  };

  test('hoy, ayer y mañana caen en Hoy, Vencidas y Esta semana', () => {
    // 2026-11-04 es miércoles
    expect(keyOf('2026-11-04', '2026-11-04')).toBe('today');
    expect(keyOf('2026-11-03', '2026-11-04')).toBe('overdue');
    expect(keyOf('2026-11-05', '2026-11-04')).toBe('week');
  });

  test('Esta semana llega hasta el domingo (lunes–domingo) y lo siguiente es Más adelante', () => {
    expect(weekEndOf('2026-11-04')).toBe('2026-11-08');
    expect(keyOf('2026-11-08', '2026-11-04')).toBe('week');
    expect(keyOf('2026-11-09', '2026-11-04')).toBe('later');
    // el texto del encabezado se deriva del formateador, sin literal
    expect(formatDateOnlyWithWeekday(weekEndOf('2026-11-04'))).toBe(
      formatDateOnlyWithWeekday('2026-11-08'),
    );
  });

  test('viernes, sábado y domingo: el límite se acorta y el domingo deja Esta semana vacía', () => {
    expect(weekEndOf('2026-11-06')).toBe('2026-11-08'); // viernes
    expect(weekEndOf('2026-11-07')).toBe('2026-11-08'); // sábado
    expect(weekEndOf('2026-11-08')).toBe('2026-11-08'); // domingo
    expect(keyOf('2026-11-09', '2026-11-07')).toBe('later'); // el lunes ya es Más adelante
    expect(keyOf('2026-11-08', '2026-11-07')).toBe('week');
    expect(keyOf('2026-11-08', '2026-11-08')).toBe('today');
    expect(keyOf('2026-11-09', '2026-11-08')).toBe('later');
    // lunes: la semana vuelve a tener seis días por delante
    expect(weekEndOf('2026-11-09')).toBe('2026-11-15');
    expect(keyOf('2026-11-15', '2026-11-09')).toBe('week');
    expect(keyOf('2026-11-16', '2026-11-09')).toBe('later');
  });

  test('sin fecha, fecha inválida y terminadas', () => {
    expect(keyOf(null, '2026-11-04')).toBe('noDate');
    expect(keyOf('', '2026-11-04')).toBe('noDate');
    expect(keyOf('no-es-fecha', '2026-11-04')).toBe('noDate');
    // terminada gana a cualquier fecha (vencida, de hoy, futura o ausente)
    expect(keyOf('2026-01-01', '2026-11-04', 'TERMINADA')).toBe('done');
    expect(keyOf('2026-11-04', '2026-11-04', 'TERMINADA')).toBe('done');
    expect(keyOf('2027-01-01', '2026-11-04', 'TERMINADA')).toBe('done');
    expect(keyOf(null, '2026-11-04', 'TERMINADA')).toBe('done');
  });

  test('medianoche: 23:59 y 00:00 del día siguiente cambian el grupo sin desfase UTC', () => {
    // el vencimiento es una fecha solo-fecha; «hoy» es la cadena local ya calculada
    expect(keyOf('2026-11-04T00:00:00.000Z', '2026-11-04')).toBe('today'); // 23:59 del 4
    expect(keyOf('2026-11-04T00:00:00.000Z', '2026-11-05')).toBe('overdue'); // 00:00 del 5
    expect(keyOf('2026-11-04T23:59:59.999Z', '2026-11-04')).toBe('today');
  });

  test('cambio de mes, de año y 29 de febrero', () => {
    expect(keyOf('2026-12-01', '2026-11-30')).toBe('week'); // lunes 30 nov → hasta dom 6 dic
    expect(keyOf('2026-11-30', '2026-12-01')).toBe('overdue');
    expect(weekEndOf('2026-12-31')).toBe('2027-01-03');
    expect(keyOf('2027-01-01', '2026-12-31')).toBe('week');
    expect(keyOf('2026-12-31', '2027-01-01')).toBe('overdue');
    // 2028 es bisiesto
    expect(keyOf('2028-02-29', '2028-02-28')).toBe('week');
    expect(keyOf('2028-02-29', '2028-03-01')).toBe('overdue');
    expect(weekEndOf('2028-02-28')).toBe('2028-03-05');
    expect(weekEndOf('2027-02-28')).toBe('2027-02-28'); // domingo, no bisiesto
  });

  test('todayLocal inválido lanza RangeError', () => {
    for (const bad of ['', '2026-2-3', '2026-02-30', '2026-13-01', 'hoy', '2026-11-04T10:00']) {
      expect(() => groupMyWork([], bad)).toThrow(RangeError);
      expect(() => weekEndOf(bad)).toThrow('todayLocal inválido');
    }
    expect(() => countMyWork([], '2026-02-30')).toThrow(RangeError);
  });

  test('orden: fecha ascendente, iniciado primero, hito primero y desempate estable', () => {
    const today = '2026-11-10';
    const porHacer = task('2026-11-01', 'POR_HACER', { title: 'B' });
    const enCurso = task('2026-11-01', 'EN_CURSO', { title: 'Z' });
    const revision = task('2026-11-01', 'EN_REVISION', { title: 'A' });
    const bloqueada = task('2026-11-01', 'BLOQUEADA', { title: 'A' });
    const masAntigua = task('2026-10-01', 'POR_HACER', { title: 'Z' });
    const groups = groupMyWork([porHacer, enCurso, revision, bloqueada, masAntigua], today);
    expect(groups.overdue).toEqual([masAntigua, enCurso, revision, bloqueada, porHacer]);

    const hito = task('2026-11-01', 'POR_HACER', { title: 'Z', isMilestone: true });
    const ordinaria = task('2026-11-01', 'POR_HACER', { title: 'A' });
    expect(groupMyWork([ordinaria, hito], today).overdue).toEqual([hito, ordinaria]);

    const x = task('2026-11-01', 'POR_HACER', { title: 'Igual', taskId: 'b' });
    const y = task('2026-11-01', 'POR_HACER', { title: 'Igual', taskId: 'a' });
    expect(groupMyWork([x, y], today).overdue).toEqual([y, x]);
    expect(groupMyWork([y, x], today).overdue).toEqual([y, x]);
  });

  test('Sin fecha omite la fecha; Terminadas va de la más reciente a la más antigua y sin fecha al final', () => {
    const today = '2026-11-10';
    const sinFechaCurso = task(null, 'EN_CURSO', { title: 'Z' });
    const sinFechaHacer = task(null, 'POR_HACER', { title: 'A' });
    expect(groupMyWork([sinFechaHacer, sinFechaCurso], today).noDate).toEqual([
      sinFechaCurso,
      sinFechaHacer,
    ]);

    const vieja = task('2026-01-01', 'TERMINADA');
    const nueva = task('2026-10-01', 'TERMINADA');
    const sinFecha = task(null, 'TERMINADA');
    expect(groupMyWork([sinFecha, vieja, nueva], today).done).toEqual([nueva, vieja, sinFecha]);
    expect(compareWithinGroup('done', nueva, vieja)).toBeLessThan(0);
  });

  test('hitos y estados fuera del enum se agrupan solo por fecha', () => {
    const hitoVencido = task('2026-11-01', 'POR_HACER', { isMilestone: true });
    const raro = task('2026-11-10', 'INEXISTENTE');
    const groups = groupMyWork([hitoVencido, raro], '2026-11-10');
    expect(groups.overdue).toEqual([hitoVencido]);
    expect(groups.today).toEqual([raro]);
  });

  test('un proyecto cerrado no cambia el agrupamiento (no hay dato en /my-work)', () => {
    // El front no inventa el estado de la solicitud: campos extra se conservan y se ignoran.
    const conExtra = { ...task('2026-11-01'), requestOperationalState: 'CERRADO' };
    const groups = groupMyWork([conExtra], '2026-11-10');
    expect(groups.overdue).toEqual([conExtra]);
  });

  test('countMyWork cuenta sobre todas las tareas y los contadores se solapan', () => {
    const items = [
      task('2026-11-01', 'EN_CURSO'), // vencida y en curso
      task('2026-11-01', 'BLOQUEADA'), // vencida y bloqueada
      task('2026-11-01', 'TERMINADA'), // terminada: no vence
      task('2026-11-10', 'EN_REVISION'), // hoy
      task('2026-11-10', 'TERMINADA'), // hoy pero terminada
      task(null, 'EN_CURSO'), // sin fecha pero en curso
      task('2026-11-20', 'POR_HACER'),
    ];
    expect(countMyWork(items, '2026-11-10')).toEqual({
      overdue: 2,
      today: 1,
      inProgress: 2,
      blocked: 1,
    });
    expect(countMyWork([], '2026-11-10')).toEqual({
      overdue: 0,
      today: 0,
      inProgress: 0,
      blocked: 0,
    });
  });
});

test.describe('task-next-step', () => {
  test('el siguiente paso natural va primero y es una transición válida en cada estado', () => {
    // Regresión: el menú rotulaba «Siguiente paso» a la primera transición de la
    // lista (p. ej. «Volver a Por hacer» desde En curso), no al avance natural.
    const esperado: Record<string, string> = {
      POR_HACER: 'EN_CURSO',
      EN_CURSO: 'EN_REVISION',
      BLOQUEADA: 'EN_CURSO',
      EN_REVISION: 'TERMINADA',
    };
    for (const [from, to] of Object.entries(esperado)) {
      const { ordered, naturalFirst } = orderTransitions(from, nextTaskStatuses(from as never, true), true);
      expect(naturalFirst, from).toBe(true);
      expect(ordered[0], from).toBe(to);
      expect(nextStepFor(from, true)?.to, from).toBe(to);
    }
  });

  test('conserva todas las transiciones, sin duplicar ni inventar', () => {
    for (const from of ['POR_HACER', 'EN_CURSO', 'BLOQUEADA', 'EN_REVISION', 'TERMINADA']) {
      const base = nextTaskStatuses(from as never, true);
      const { ordered } = orderTransitions(from, base, true);
      expect([...ordered].sort()).toEqual([...base].sort());
    }
  });

  test('desde TERMINADA solo se reabre: no hay siguiente paso', () => {
    const { ordered, naturalFirst } = orderTransitions('TERMINADA', nextTaskStatuses('TERMINADA', true), true);
    expect(naturalFirst).toBe(false);
    expect(ordered).toEqual(['EN_CURSO']);
    expect(nextStepFor('TERMINADA', true)).toBeNull();
    expect(nextStepFor('TERMINADA', false)).toBeNull();
  });
  test('un integrante en En revisión no tiene siguiente paso: espera aprobación', () => {
    expect(nextStepFor('EN_REVISION', false)).toBeNull();
    expect(nextStepFor('EN_REVISION', true)?.to).toBe('TERMINADA');
    const { ordered, naturalFirst } = orderTransitions('EN_REVISION', nextTaskStatuses('EN_REVISION', false), false);
    expect(naturalFirst).toBe(false);
    expect(ordered).toEqual(['EN_CURSO', 'BLOQUEADA']);
  });

  test('un estado fuera del enum no ofrece opciones ni lanza', () => {
    const { ordered, naturalFirst } = orderTransitions('RARO', nextTaskStatuses('RARO' as never, true), true);
    expect(ordered).toEqual([]);
    expect(naturalFirst).toBe(false);
  });
});

test.describe('Mi trabajo: proyectos cerrados, tablero y motivo de bloqueo', () => {
  const t = (
    taskId: string,
    status: string,
    endDate: string | null,
    extra: Partial<MyWorkGroupable> = {},
  ): MyWorkGroupable => ({ taskId, title: taskId, status, isMilestone: false, endDate, ...extra });

  test('una tarea pendiente de un proyecto cerrado va al grupo «closed», nunca a Vencidas', () => {
    const closed = t('a', 'EN_CURSO', '2026-01-01', { requestOperationalState: 'CERRADA' });
    const open = t('b', 'EN_CURSO', '2026-01-01', { requestOperationalState: 'EN_EJECUCION' });
    const groups = groupMyWork([closed, open], '2026-11-04');
    expect(groups.closed).toEqual([closed]);
    expect(groups.overdue).toEqual([open]);
  });

  test('una terminada de proyecto cerrado sigue en Terminadas', () => {
    const done = t('a', 'TERMINADA', '2026-01-01', { requestOperationalState: 'CERRADA' });
    expect(groupMyWork([done], '2026-11-04').done).toEqual([done]);
  });

  test('countMyWork no cuenta las tareas de proyectos cerrados', () => {
    const items = [
      t('a', 'EN_CURSO', '2026-11-01', { requestOperationalState: 'CERRADA' }),
      t('b', 'BLOQUEADA', '2026-11-04', { requestOperationalState: 'CERRADA' }),
      t('c', 'EN_CURSO', '2026-11-01'),
    ];
    expect(countMyWork(items, '2026-11-04')).toEqual({ overdue: 1, today: 0, inProgress: 1, blocked: 0 });
  });

  test('boardColumns: cinco columnas en orden fijo, abiertas antes que cerradas y fecha ascendente', () => {
    const items = [
      t('c1', 'POR_HACER', '2026-11-01', { requestOperationalState: 'CERRADA' }),
      t('o2', 'POR_HACER', '2026-12-01'),
      t('o1', 'POR_HACER', '2026-11-10'),
      t('sin', 'POR_HACER', null),
    ];
    const columns = boardColumns(items);
    expect(columns.map((c) => c.key)).toEqual(['POR_HACER', 'EN_CURSO', 'EN_REVISION', 'BLOQUEADA', 'TERMINADA']);
    expect(columns[0].items.map((i) => i.taskId)).toEqual(['o1', 'o2', 'sin', 'c1']);
  });

  test('boardColumns: topes 20 y 10, terminadas recientes primero y estado desconocido en «Otros»', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      t(`d${i}`, 'TERMINADA', `2026-10-${String((i % 28) + 1).padStart(2, '0')}`),
    );
    const columns = boardColumns([...many, t('x', 'RARO', null)]);
    const done = columns.find((c) => c.key === 'TERMINADA');
    expect(done?.limit).toBe(10);
    expect(done?.items[0].taskId).toBe('d24');
    expect(columns.find((c) => c.key === 'POR_HACER')?.limit).toBe(20);
    expect(columns.at(-1)?.key).toBe(BOARD_OTHER_KEY);
  });

  test('validateBlockReason: vacío y espacios fallan; 500 pasa; 501 falla; recorta', () => {
    expect(validateBlockReason('').ok).toBe(false);
    expect(validateBlockReason('   ').ok).toBe(false);
    expect(validateBlockReason('a'.repeat(BLOCK_REASON_MAX)).ok).toBe(true);
    expect(validateBlockReason('a'.repeat(BLOCK_REASON_MAX + 1)).ok).toBe(false);
    expect(validateBlockReason('  falta acceso  ')).toEqual({ ok: true, reason: 'falta acceso' });
  });
});

test.describe('multi-filter', () => {
  const states: MultiFilterOption[] = [
    { value: 'REGISTRADA', label: 'Registrada', group: 'Entrada' },
    { value: 'EN_TRIAGE', label: 'En triage', group: 'Entrada' },
    { value: 'DEVUELTA', label: 'Devuelta', group: 'Entrada' },
    { value: 'BLOQUEADA', label: 'Bloqueada', group: 'Ejecución' },
    { value: 'CERRADA', label: 'Cerrada', group: 'Cierre' },
    { value: 'RETIRADA', label: 'Retirada', group: 'Cierre' },
  ];
  const bands: MultiFilterOption[] = [
    { value: 'P1', label: 'P1' },
    { value: 'P2', label: 'P2' },
    { value: 'P3', label: 'P3' },
    { value: 'P4', label: 'P4' },
    { value: 'SIN_PRIORIZAR', label: 'Sin priorizar' },
  ];

  test('summarizeSelection: sin selección devuelve el placeholder', () => {
    expect(summarizeSelection(states, [])).toBe('Todos');
    expect(summarizeSelection(bands, [], 'Todas', 'f')).toBe('Todas');
  });
  test('summarizeSelection: una opción devuelve su etiqueta completa', () => {
    expect(summarizeSelection(states, ['BLOQUEADA'])).toBe('Bloqueada');
    expect(summarizeSelection([{ value: 'a', label: 'Backlog priorizado' }], ['a'])).toBe('Backlog priorizado');
  });
  test('summarizeSelection: 2 o 3 opciones se listan solo si caben en 14 caracteres', () => {
    expect(summarizeSelection(bands, ['P1', 'P2'], 'Todas', 'f')).toBe('P1, P2');
    expect(summarizeSelection(bands, ['P1', 'P2', 'P3'], 'Todas', 'f')).toBe('P1, P2, P3');
    // «En triage, Devuelta» = 19 caracteres
    expect(summarizeSelection(states, ['EN_TRIAGE', 'DEVUELTA'])).toBe('2 seleccionados');
    // «Cerrada, Retirada» = 17 caracteres
    expect(summarizeSelection(states, ['CERRADA', 'RETIRADA'])).toBe('2 seleccionados');
    // «P1, Sin priorizar» = 17 caracteres
    expect(summarizeSelection(bands, ['P1', 'SIN_PRIORIZAR'], 'Todas', 'f')).toBe('2 seleccionadas');
  });
  test('summarizeSelection: límite exacto 14 y 15 caracteres', () => {
    const opts: MultiFilterOption[] = [
      { value: 'a', label: 'Abcdef' }, // «Abcdef, Ghijkl» = 14
      { value: 'b', label: 'Ghijkl' },
      { value: 'c', label: 'Ghijklm' }, // «Abcdef, Ghijklm» = 15
    ];
    expect(summarizeSelection(opts, ['a', 'b'])).toBe('Abcdef, Ghijkl');
    expect(summarizeSelection(opts, ['a', 'c'])).toBe('2 seleccionados');
  });
  test('summarizeSelection: más de 3 opciones usa el contador y respeta el género', () => {
    expect(summarizeSelection(bands, ['P1', 'P2', 'P3', 'P4'], 'Todas', 'f')).toBe('4 seleccionadas');
    expect(summarizeSelection(bands, ['P1', 'P2', 'P3', 'P4'])).toBe('4 seleccionados');
  });
  test('summarizeSelection: ignora valores que no están en options y usa el orden de options', () => {
    expect(summarizeSelection(bands, ['FANTASMA'], 'Todas', 'f')).toBe('Todas');
    expect(summarizeSelection(bands, ['P2', 'P1', 'FANTASMA'], 'Todas', 'f')).toBe('P1, P2');
  });
  test('toggleValue: añade, quita, ordena según options y no duplica', () => {
    expect(toggleValue(bands, [], 'P3')).toEqual(['P3']);
    expect(toggleValue(bands, ['P3'], 'P1')).toEqual(['P1', 'P3']);
    expect(toggleValue(bands, ['P1', 'P3'], 'P1')).toEqual(['P3']);
    expect(toggleValue(bands, ['P1', 'P1'], 'P2')).toEqual(['P1', 'P2']);
    expect(toggleValue(bands, ['P3'], 'P3')).toEqual([]);
  });
  test('toggleValue: ignora valores desconocidos y los descarta de la selección', () => {
    expect(toggleValue(bands, ['P1'], 'FANTASMA')).toEqual(['P1']);
    expect(toggleValue(bands, ['FANTASMA', 'P2'], 'P1')).toEqual(['P1', 'P2']);
  });
  test('normalizeSelection: no convierte «todo marcado» en vacío (D10)', () => {
    const all = bands.map((b) => b.value);
    expect(normalizeSelection(bands, [...all].reverse())).toEqual(all);
  });
  test('announceSelection: texto de la región viva', () => {
    expect(announceSelection('Estado', states, [])).toBe('Estado: ninguna selección, se muestran todos');
    expect(announceSelection('Prioridad', bands, [], 'f')).toBe('Prioridad: ninguna selección, se muestran todas');
    expect(announceSelection('Estado', states, ['CERRADA'])).toBe('Estado: 1 seleccionado');
    expect(announceSelection('Prioridad', bands, ['P1', 'P2', 'P3'], 'f')).toBe('Prioridad: 3 seleccionadas');
  });
  test('matchesAny: sin selección todo pasa; con selección es OR y el nulo no coincide', () => {
    expect(matchesAny([], 'X')).toBe(true);
    expect(matchesAny([], null)).toBe(true);
    expect(matchesAny(['A', 'B'], 'B')).toBe(true);
    expect(matchesAny(['A', 'B'], 'C')).toBe(false);
    expect(matchesAny(['A'], null)).toBe(false);
    expect(matchesAny(['A'], undefined)).toBe(false);
  });
});