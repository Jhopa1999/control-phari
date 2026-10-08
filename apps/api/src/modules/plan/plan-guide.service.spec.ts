import { PrismaService } from '../../database/prisma.service';
import { PlanGuideService } from './plan-guide.service';

function createPrismaMock() {
  const prisma = {
    planPhase: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

const d = (iso: string) => new Date(iso);

describe('PlanGuideService (design §2.1)', () => {
  let service: PlanGuideService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PlanGuideService(prisma);
  });

  it('plan sin fases ni tareas -> pendientes NO_PHASES y NO_TASKS, canSubmit=false', async () => {
    prisma.planPhase.findMany.mockResolvedValue([]);
    prisma.task.findMany.mockResolvedValue([]);

    const guide = await service.compute('plan1');

    expect(guide.canSubmit).toBe(false);
    expect(guide.pendings.map((p) => p.code)).toEqual(
      expect.arrayContaining(['NO_PHASES', 'NO_TASKS']),
    );
    expect(guide.futureCategories).toEqual([
      'capacity',
      'evidenceGates',
      'frameworkControls',
    ]);
  });

  it('fase sin fechas y tarea sin responsable -> pendientes con targetId', async () => {
    prisma.planPhase.findMany.mockResolvedValue([
      { id: 'ph1', name: 'Analisis', startDate: null, endDate: null },
    ]);
    prisma.task.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'Tarea A',
        responsibleUserId: null,
        startDate: d('2025-01-01'),
        endDate: d('2025-01-02'),
        isMilestone: false,
        estimateHours: 4,
      },
    ]);

    const guide = await service.compute('plan1');

    const phasePending = guide.pendings.find((p) => p.code === 'PHASE_MISSING_DATES');
    const taskPending = guide.pendings.find((p) => p.code === 'TASK_MISSING_RESPONSIBLE');
    expect(phasePending?.targetId).toBe('ph1');
    expect(taskPending?.targetId).toBe('t1');
    expect(guide.canSubmit).toBe(false);
  });

  it('hito con estimacion distinta de 0 -> pendiente MILESTONE_WITH_HOURS', async () => {
    prisma.planPhase.findMany.mockResolvedValue([
      { id: 'ph1', name: 'F', startDate: d('2025-01-01'), endDate: d('2025-01-10') },
    ]);
    prisma.task.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'Hito',
        responsibleUserId: 'u1',
        startDate: d('2025-01-05'),
        endDate: d('2025-01-05'),
        isMilestone: true,
        estimateHours: 8,
      },
    ]);

    const guide = await service.compute('plan1');

    expect(guide.pendings.some((p) => p.code === 'MILESTONE_WITH_HOURS')).toBe(true);
    expect(guide.canSubmit).toBe(false);
  });

  it('plan completo -> canSubmit=true sin pendientes', async () => {
    prisma.planPhase.findMany.mockResolvedValue([
      { id: 'ph1', name: 'F', startDate: d('2025-01-01'), endDate: d('2025-01-10') },
    ]);
    prisma.task.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'Tarea A',
        responsibleUserId: 'u1',
        startDate: d('2025-01-02'),
        endDate: d('2025-01-05'),
        isMilestone: false,
        estimateHours: 10,
      },
    ]);

    const guide = await service.compute('plan1');

    expect(guide.pendings).toEqual([]);
    expect(guide.canSubmit).toBe(true);
  });

  it('categorias futuras nunca aportan pendientes (plan con framework pendiente sin evidencia envia)', async () => {
    prisma.planPhase.findMany.mockResolvedValue([
      { id: 'ph1', name: 'F', startDate: d('2025-01-01'), endDate: d('2025-01-10') },
    ]);
    prisma.task.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'Con control de framework',
        responsibleUserId: 'u1',
        startDate: d('2025-01-02'),
        endDate: d('2025-01-05'),
        isMilestone: false,
        estimateHours: 10,
      },
    ]);

    const guide = await service.compute('plan1');
    expect(guide.canSubmit).toBe(true);
    expect(guide.pendings).toEqual([]);
  });
});
