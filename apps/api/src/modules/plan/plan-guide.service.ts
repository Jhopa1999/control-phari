import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PlanGuideDto, PlanGuidePendingDto } from './dto/plan-guide.dto';

/**
 * Categorias de la guia implementadas en Fase 3 (design §2.1).
 */
const CATEGORY_DATES_PHASES = 'datesPhases';
const CATEGORY_TASKS_RESPONSIBLES = 'tasksResponsibles';

/**
 * Categorias gancho de fases futuras (design §2.2, D5). Existen en el contrato
 * pero SIEMPRE aportan 0 pendientes en Fase 3; se encenderan en fases
 * posteriores sin cambiar el mecanismo.
 * TODO: encender frameworkControls en FEATURE-008 (NIT-1 de design-review.md);
 * capacity en FEATURE-005.
 */
const FUTURE_CATEGORIES = ['capacity', 'evidenceGates', 'frameworkControls'];

/**
 * Calcula la guia "Resuelve el siguiente paso" server-side (design §2.1). Dos
 * categorias implementadas (datesPhases, tasksResponsibles); las futuras no
 * aportan pendientes. `canSubmit = pendings.length === 0`. Es la unica fuente de
 * verdad del gate de envio: `submit()` recomputa y rechaza con 409 si hay
 * pendientes.
 */
@Injectable()
export class PlanGuideService {
  constructor(private readonly prisma: PrismaService) {}

  async compute(planId: string): Promise<PlanGuideDto> {
    const pendings: PlanGuidePendingDto[] = [];

    const phases = await this.prisma.planPhase.findMany({
      where: { planId },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, startDate: true, endDate: true },
    });

    // Categoria datesPhases: al menos una fase; cada fase con fechas coherentes.
    if (phases.length === 0) {
      pendings.push({
        category: CATEGORY_DATES_PHASES,
        code: 'NO_PHASES',
        message: 'El plan debe tener al menos una fase.',
      });
    }
    for (const phase of phases) {
      if (phase.startDate === null || phase.endDate === null) {
        pendings.push({
          category: CATEGORY_DATES_PHASES,
          code: 'PHASE_MISSING_DATES',
          message: `La fase "${phase.name}" necesita fecha de inicio y de fin.`,
          targetId: phase.id,
        });
      } else if (phase.startDate.getTime() > phase.endDate.getTime()) {
        pendings.push({
          category: CATEGORY_DATES_PHASES,
          code: 'PHASE_DATES_INVERTED',
          message: `La fase "${phase.name}" tiene la fecha de inicio despues de la de fin.`,
          targetId: phase.id,
        });
      }
    }

    const tasks = await this.prisma.task.findMany({
      where: { phase: { planId } },
      select: {
        id: true,
        title: true,
        responsibleUserId: true,
        startDate: true,
        endDate: true,
        isMilestone: true,
        estimateHours: true,
      },
    });

    // Categoria tasksResponsibles: al menos una tarea; cada tarea con
    // responsable y fechas; hito con estimacion 0.
    if (tasks.length === 0) {
      pendings.push({
        category: CATEGORY_TASKS_RESPONSIBLES,
        code: 'NO_TASKS',
        message: 'El plan debe tener al menos una tarea.',
      });
    }
    for (const task of tasks) {
      if (task.responsibleUserId === null) {
        pendings.push({
          category: CATEGORY_TASKS_RESPONSIBLES,
          code: 'TASK_MISSING_RESPONSIBLE',
          message: `La tarea "${task.title}" necesita un responsable.`,
          targetId: task.id,
        });
      }
      if (task.startDate === null || task.endDate === null) {
        pendings.push({
          category: CATEGORY_TASKS_RESPONSIBLES,
          code: 'TASK_MISSING_DATES',
          message: `La tarea "${task.title}" necesita fecha de inicio y de fin.`,
          targetId: task.id,
        });
      } else if (task.startDate.getTime() > task.endDate.getTime()) {
        pendings.push({
          category: CATEGORY_TASKS_RESPONSIBLES,
          code: 'TASK_DATES_INVERTED',
          message: `La tarea "${task.title}" tiene la fecha de inicio despues de la de fin.`,
          targetId: task.id,
        });
      }
      if (task.isMilestone && (task.estimateHours ?? 0) !== 0) {
        pendings.push({
          category: CATEGORY_TASKS_RESPONSIBLES,
          code: 'MILESTONE_WITH_HOURS',
          message: `El hito "${task.title}" debe tener estimacion 0.`,
          targetId: task.id,
        });
      }
    }

    return {
      planId,
      canSubmit: pendings.length === 0,
      pendings,
      futureCategories: [...FUTURE_CATEGORIES],
    };
  }
}
