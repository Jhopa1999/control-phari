import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { PlanStateService } from '../plan-state.service';
import { DependencyService } from './dependency.service';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    task: { findFirst: jest.fn() },
    taskDependency: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const planState = {
    requireTaskInScope: jest.fn().mockResolvedValue({
      task: { id: 't1' },
      planId: 'plan1',
      requestId: 'r1',
      mainProcessId: 'p1',
    }),
  } as unknown as PlanStateService;
  return { prisma, prismaObj, audit, planState };
}

function lider(): CurrentActor {
  return {
    userId: 'ul',
    name: 'Beto',
    identifier: 'lider@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: false,
  };
}

/** Resuelve planIdOfTask: cada tarea devuelve su planId segun el mapa. */
function stubTaskPlans(m: ReturnType<typeof createMocks>, plans: Record<string, string>) {
  (m.prismaObj.task as any).findFirst.mockImplementation(
    ({ where }: { where: { id: string } }) => {
      const planId = plans[where.id];
      return Promise.resolve(planId ? { phase: { planId } } : null);
    },
  );
}

describe('DependencyService (design §2.3)', () => {
  let service: DependencyService;
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    service = new DependencyService(m.prisma, m.audit, m.planState);
  });

  it('auto-dependencia -> 400', async () => {
    await expect(
      service.add(lider(), 't1', { predecessorTaskId: 't1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tareas de planes distintos -> 400', async () => {
    stubTaskPlans(m, { t1: 'plan1', t2: 'plan2' });
    await expect(
      service.add(lider(), 't1', { predecessorTaskId: 't2' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dependencia duplicada -> 409 (findUnique por clave compuesta)', async () => {
    stubTaskPlans(m, { t1: 'plan1', t2: 'plan1' });
    (m.prismaObj.taskDependency as any).findUnique.mockResolvedValue({ id: 'dep1' });

    await expect(
      service.add(lider(), 't1', { predecessorTaskId: 't2' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect((m.prismaObj.taskDependency as any).findUnique.mock.calls[0][0].where).toEqual({
      task_dependency_unique: { dependentTaskId: 't1', predecessorTaskId: 't2' },
    });
  });

  it('ciclo directo (A->B existe, intentar B->A) -> 400', async () => {
    // Dependiente B (t2) depende de A (t1): intentar que A dependa de B cerraria ciclo.
    stubTaskPlans(m, { t1: 'plan1', t2: 'plan1' });
    (m.prismaObj.taskDependency as any).findUnique.mockResolvedValue(null);
    // Grafo existente: t2 -> t1 (B depende de A).
    (m.prismaObj.taskDependency as any).findMany.mockResolvedValue([
      { dependentTaskId: 't2', predecessorTaskId: 't1' },
    ]);

    // Intentar A(t1) depende de B(t2): dependent=t1, predecessor=t2. DFS desde
    // t2 alcanza t1 -> ciclo.
    await expect(
      service.add(lider(), 't1', { predecessorTaskId: 't2' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((m.prismaObj.taskDependency as any).create).not.toHaveBeenCalled();
  });

  it('ciclo transitivo (A->B->C, intentar C->A) -> 400', async () => {
    stubTaskPlans(m, { tA: 'plan1', tB: 'plan1', tC: 'plan1' });
    (m.prismaObj.taskDependency as any).findUnique.mockResolvedValue(null);
    // Grafo existente (dependent->predecessor): A->B, B->C.
    (m.prismaObj.taskDependency as any).findMany.mockResolvedValue([
      { dependentTaskId: 'tA', predecessorTaskId: 'tB' },
      { dependentTaskId: 'tB', predecessorTaskId: 'tC' },
    ]);

    // Intentar C depende de A: dependent=tC, predecessor=tA. DFS desde tA
    // alcanza tB->tC == dependent -> ciclo.
    await expect(
      service.add(lider(), 'tC', { predecessorTaskId: 'tA' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('arista valida sin ciclo -> crea y audita CREATE TASK_DEPENDENCY', async () => {
    stubTaskPlans(m, { t1: 'plan1', t2: 'plan1' });
    (m.prismaObj.taskDependency as any).findUnique.mockResolvedValue(null);
    (m.prismaObj.taskDependency as any).findMany.mockResolvedValue([]);
    (m.prismaObj.taskDependency as any).create.mockResolvedValue({
      id: 'dep1',
      dependentTaskId: 't1',
      predecessorTaskId: 't2',
      createdAt: new Date(),
    });
    // predecessor lookup for response: distinto del findFirst de planIdOfTask.
    (m.prismaObj.task as any).findFirst.mockImplementation(
      ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) => {
        if (select && 'title' in select) {
          return Promise.resolve({ title: 'Pre', status: 'POR_HACER', accepted: false });
        }
        return Promise.resolve({ phase: { planId: 'plan1' } });
      },
    );

    const res = await service.add(lider(), 't1', { predecessorTaskId: 't2' });

    expect(res.id).toBe('dep1');
    expect((m.audit.record as jest.Mock).mock.calls[0][1]).toMatchObject({
      action: 'CREATE',
      objectType: 'TASK_DEPENDENCY',
      scopeProcessId: 'p1',
    });
  });
});
