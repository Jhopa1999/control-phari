import { expect, test } from '@playwright/test';
import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  TriangleAlert,
} from 'lucide-react';
import type { PlanGuidePending } from '../apps/web/src/lib/api-client';
import {
  formatCount,
  formatDate,
  formatDateOnly,
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
  MODULE_LABELS,
  MODULE_ORDER,
  NAV_GROUPS,
  getVisibleNavGroups,
  isNavItemActive,
  type NavItem,
} from '../apps/web/src/lib/navigation';
import {
  guideCategoryLabel,
  presentGuidePending,
  type GuideActionKind,
} from '../apps/web/src/lib/plan-guide';
import {
  PLANNABLE_STATES,
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

  test('MODULE_ORDER tiene las 21 claves del backend, sin repetidos, y cada una su etiqueta', () => {
    expect(MODULE_ORDER).toHaveLength(21);
    expect(new Set(MODULE_ORDER).size).toBe(21);
    expect([...MODULE_ORDER].sort()).toEqual([...MODULE_KEYS].sort());
    for (const key of MODULE_ORDER) {
      expect(MODULE_LABELS[key], key).toBeTruthy();
    }
  });

  test('los href del menú son exactamente las 23 rutas de §8.5, en sus 7 grupos', () => {
    // Protege las URLs: el rediseño reagrupa el menú, pero ninguna ruta cambia.
    expect(allItems().map((item) => item.href)).toEqual([
      '/inicio',
      '/mi-trabajo',
      '/demanda/solicitudes',
      '/demanda/triage',
      '/demanda/priorizacion',
      '/administracion/revision',
      '/seguimiento/plan',
      '/activos/capacidad',
      '/seguimiento/portafolio',
      '/demanda/resumen',
      '/seguimiento/proyectos',
      '/seguimiento/bitacora',
      '/seguimiento/semanal',
      '/seguimiento/novedades',
      '/seguimiento/reuniones',
      '/seguimiento/compromisos',
      '/activos/catalogo',
      '/activos/documentos',
      '/administracion/frameworks',
      '/gobierno/auditoria',
      '/gobierno/mis-permisos',
      '/gobierno/equipo',
      '/administracion/maestras',
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
    expect(parseBand('P2 · Programacion en el horizonte cercano')).toBe('P2');
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
