import type { PlanGuidePending } from './api-client';

/**
 * Presentación de la guía de pendientes del plan (design §7.9.2 y §10.2,
 * fila Planificación): texto con ortografía y acción de resolución por código.
 * La guía la calcula el backend (GET /requests/:id/plan/guide); aquí solo se
 * traduce. La vista convierte action.kind en la apertura de PhaseDialog o
 * TaskDialog.
 *
 * Módulo puro: solo `import type` de ./api-client, para que
 * e2e/web-lib.spec.ts lo cargue en Node.
 */

export type GuideActionKind = 'newPhase' | 'editPhase' | 'newTask' | 'editTask';

export interface GuideItemPresentation {
  /** `${code}:${targetId ?? ''}` */
  id: string;
  /** Categoría de la API. */
  category: string;
  /** Texto de §10.2; código desconocido o nombre ausente en los datos cargados -> message de la API. */
  label: string;
  /** null si el código es desconocido. */
  action: {
    kind: GuideActionKind;
    label: string;
    targetId: string | null;
  } | null;
}

/** Categorías de la guía; las tres últimas son futuras (hoy sin pendientes). */
export const GUIDE_CATEGORY_LABELS: Record<string, string> = {
  datesPhases: 'Fases y fechas',
  tasksResponsibles: 'Tareas y responsables',
  capacity: 'Capacidad',
  evidenceGates: 'Evidencias de controles',
  frameworkControls: 'Controles del marco',
};

/** Etiqueta de una categoría; si es desconocida, la propia clave. */
export function guideCategoryLabel(category: string): string {
  return Object.prototype.hasOwnProperty.call(GUIDE_CATEGORY_LABELS, category)
    ? GUIDE_CATEGORY_LABELS[category]
    : category;
}

type GuideTarget = 'phase' | 'task' | null;

interface GuideCodeCopy {
  /** Qué nombra el texto: la fase o la tarea de targetId, o nada. */
  target: GuideTarget;
  text: (name: string) => string;
  action: { kind: GuideActionKind; label: string };
}

const EDIT_PHASE = { kind: 'editPhase', label: 'Editar fase' } as const;
const EDIT_TASK = { kind: 'editTask', label: 'Editar tarea' } as const;

/** Textos y acciones por código (design §10.2). */
const GUIDE_CODES: Record<string, GuideCodeCopy> = {
  NO_PHASES: {
    target: null,
    text: () => 'El plan necesita al menos una fase.',
    action: { kind: 'newPhase', label: 'Nueva fase' },
  },
  PHASE_MISSING_DATES: {
    target: 'phase',
    text: (name) => `La fase «${name}» necesita fecha de inicio y de fin.`,
    action: EDIT_PHASE,
  },
  PHASE_DATES_INVERTED: {
    target: 'phase',
    text: (name) => `La fase «${name}» empieza después de terminar.`,
    action: EDIT_PHASE,
  },
  NO_TASKS: {
    target: null,
    text: () => 'El plan necesita al menos una tarea.',
    action: { kind: 'newTask', label: 'Agregar tarea' },
  },
  TASK_MISSING_RESPONSIBLE: {
    target: 'task',
    text: (name) => `La tarea «${name}» necesita un responsable.`,
    action: EDIT_TASK,
  },
  TASK_MISSING_DATES: {
    target: 'task',
    text: (name) => `La tarea «${name}» necesita fecha de inicio y de fin.`,
    action: EDIT_TASK,
  },
  TASK_DATES_INVERTED: {
    target: 'task',
    text: (name) => `La tarea «${name}» empieza después de terminar.`,
    action: EDIT_TASK,
  },
  MILESTONE_WITH_HOURS: {
    target: 'task',
    text: (name) => `El hito «${name}» debe tener 0 horas de esfuerzo.`,
    action: EDIT_TASK,
  },
};

/**
 * Texto y acción de un pendiente de la guía. `names` busca el nombre de la
 * fase o la tarea en los datos ya cargados; si no lo encuentra (o el código es
 * desconocido), el texto es el `message` de la API. La acción es null solo si
 * el código es desconocido.
 */
export function presentGuidePending(
  p: PlanGuidePending,
  names: {
    phase: (id: string) => string | null;
    task: (id: string) => string | null;
  },
): GuideItemPresentation {
  const targetId = p.targetId ?? null;
  const id = `${p.code}:${targetId ?? ''}`;
  const copy = Object.prototype.hasOwnProperty.call(GUIDE_CODES, p.code)
    ? GUIDE_CODES[p.code]
    : undefined;
  if (!copy) {
    return { id, category: p.category, label: p.message, action: null };
  }

  let label = p.message;
  if (copy.target === null) {
    label = copy.text('');
  } else if (targetId !== null) {
    const name =
      copy.target === 'phase' ? names.phase(targetId) : names.task(targetId);
    if (name) label = copy.text(name);
  }

  return {
    id,
    category: p.category,
    label,
    action: {
      kind: copy.action.kind,
      label: copy.action.label,
      // Crear una fase o una tarea no apunta a un objeto existente: la vista
      // abre TaskDialog en la fase inicial (§10.2).
      targetId: copy.target === null ? null : targetId,
    },
  };
}
