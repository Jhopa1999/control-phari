import * as React from 'react';
import { DisabledReason } from '@/components/disabled-reason';
import { RequirementsPanel, type RequirementItem } from '@/components/requirements-panel';
import { Button } from '@/components/ui/button';
import type { PlanGuide, PlanPhase, Task } from '@/lib/api-client';
import { guideCategoryLabel, presentGuidePending } from '@/lib/plan-guide';

const SUBMIT_REASON_ID = 'plan-guide-submit-reason';
const LIST_FORMAT = new Intl.ListFormat('es', { style: 'long', type: 'conjunction' });

export interface PlanGuidePanelProps {
  guide: PlanGuide;
  phases: PlanPhase[];
  tasks: Task[];
  phaseNameById: ReadonlyMap<string, string>;
  taskTitleById: ReadonlyMap<string, string>;
  /** Fase inicial protegida; null si el plan aún no tiene fases. */
  initialPhaseId: string | null;
  busy: boolean;
  onNewPhase: () => void;
  onNewTask: (phaseId: string) => void;
  onEditPhase: (phase: PlanPhase) => void;
  onEditTask: (task: Task) => void;
  onSubmit: () => void;
}

/**
 * Guía de envío a autorización: lista los pendientes del plan, con la acción que
 * resuelve cada uno, y el botón «Enviar a autorización» (habilitado solo sin
 * pendientes). Es presentación; el backend valida el envío.
 */
export function PlanGuidePanel({
  guide: currentGuide,
  phases,
  tasks,
  phaseNameById,
  taskTitleById,
  initialPhaseId,
  busy,
  onNewPhase,
  onNewTask,
  onEditPhase,
  onEditTask,
  onSubmit,
}: PlanGuidePanelProps): React.ReactElement {
  const seen = new Map<string, number>();
  const presented = currentGuide.pendings.map((p) => {
    const item = presentGuidePending(p, {
      phase: (id) => phaseNameById.get(id) ?? null,
      task: (id) => taskTitleById.get(id) ?? null,
    });
    // Ids ├║nicos aunque la API repita c├│digo y destino.
    const count = seen.get(item.id) ?? 0;
    seen.set(item.id, count + 1);
    return count === 0 ? item : { ...item, id: `${item.id}#${count}` };
  });

  const items: RequirementItem[] = presented.map((item) => {
    let action: RequirementItem['action'];
    if (item.action) {
      const { kind, label, targetId } = item.action;
      if (kind === 'newPhase') {
        action = { label, onClick: onNewPhase, disabled: busy };
      } else if (kind === 'newTask') {
        action = initialPhaseId
          ? { label, onClick: () => onNewTask(initialPhaseId), disabled: busy }
          : { label, disabled: true, disabledReason: 'Primero crea una fase.' };
      } else if (kind === 'editPhase') {
        const phase = phases.find((p) => p.id === targetId);
        action = phase ? { label, onClick: () => onEditPhase(phase), disabled: busy } : undefined;
      } else {
        const task = tasks.find((t) => t.id === targetId);
        action = task ? { label, onClick: () => onEditTask(task), disabled: busy } : undefined;
      }
    }
    return { id: item.id, label: item.label, status: 'pending', action };
  });

  const groupOrder: string[] = [];
  const groupItems = new Map<string, string[]>();
  for (const item of presented) {
    if (!groupItems.has(item.category)) {
      groupOrder.push(item.category);
      groupItems.set(item.category, []);
    }
    groupItems.get(item.category)?.push(item.id);
  }
  const groups = groupOrder.map((category) => ({
    id: category,
    label: guideCategoryLabel(category),
    itemIds: groupItems.get(category) ?? [],
  }));

  const future = currentGuide.futureCategories.map(guideCategoryLabel);
  const canSubmit = currentGuide.canSubmit;

  return (
    <RequirementsPanel
      id="plan-guide"
      liveUpdates
      title="A├║n no puedes enviar el plan a autorizaci├│n"
      description="Resuelve cada pendiente desde su acci├│n; la lista se actualiza al guardar."
      doneTitle="El plan est├í listo para enviar"
      doneDescription="No hay pendientes en las categor├¡as evaluadas."
      items={items}
      groups={groups}
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex flex-col items-start gap-1">
            <Button
              type="button"
              unavailable={!canSubmit}
              disabled={canSubmit && busy}
              aria-describedby={canSubmit ? 'plan-guide-summary' : `plan-guide-summary ${SUBMIT_REASON_ID}`}
              onClick={onSubmit}
            >
              Enviar a autorizaci├│n
            </Button>
            {!canSubmit ? (
              <DisabledReason id={SUBMIT_REASON_ID}>
                Resuelve los pendientes de la lista para enviar el plan.
              </DisabledReason>
            ) : null}
          </div>
          {future.length > 0 ? (
            <p className="text-meta text-muted-foreground">
              {`Se evaluar├ín m├ís adelante: ${LIST_FORMAT.format(future)}.`}
            </p>
          ) : null}
        </div>
      }
    />
  );
}
