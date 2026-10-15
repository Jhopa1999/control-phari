import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { CoordinationScopeService } from '../coordination-scope.service';
import { WorkflowStateService } from '../workflow-state.service';
import { CommitmentService } from './commitment.service';

function createMocks() {
  const prismaObj: Record<string, any> = {
    commitment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    meeting: { findFirst: jest.fn() },
    request: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
    grant: { findMany: jest.fn() },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const scope = new CoordinationScopeService(prisma);
  const workflow = new WorkflowStateService();
  const service = new CommitmentService(prisma, audit, scope, workflow);
  return { prismaObj, auditRecord, service };
}

function integrante(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ui',
    name: 'Integrante',
    identifier: 'integrante@demo.local',
    grants: scoped.map((p) => ({
      processId: p,
      processCode: p,
      processName: p,
      roleCode: RoleCode.INTEGRANTE,
      roleName: 'INTEGRANTE',
    })),
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isAdmin: false,
  };
}

const now = new Date('2025-03-10T00:00:00.000Z');

function commitmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    processId: 'p1',
    title: 'Entregar X',
    state: 'EN_CURSO',
    relatedRequestId: null,
    responsibleUserId: null,
    assignedUserId: 'ui',
    dueDate: new Date(Date.UTC(2025, 2, 20)),
    relatedProjectRequestId: null,
    sourceMeetingId: null,
    expectedResult: null,
    result: null,
    blockers: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('CommitmentService', () => {
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
  });

  it('crea con dueDate y audita CREATE COMMITMENT con scopeProcessId del registro', async () => {
    m.prismaObj.commitment.create.mockImplementation(({ data }: any) =>
      Promise.resolve(commitmentRow(data)),
    );
    const res = await m.service.create(integrante(), {
      processId: 'p1',
      title: 'Entregar X',
      dueDate: '2025-03-20',
    });
    expect(res.dueDate).toBe('2025-03-20');
    expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
      action: 'CREATE',
      objectType: 'COMMITMENT',
      scopeProcessId: 'p1',
    });
  });

  it('sourceMeetingId solo relaciona: no crea nada automatico (§11 D7)', async () => {
    m.prismaObj.meeting.findFirst.mockResolvedValue({ id: 'mt1' });
    m.prismaObj.commitment.create.mockImplementation(({ data }: any) =>
      Promise.resolve(commitmentRow(data)),
    );
    const res = await m.service.create(integrante(), {
      processId: 'p1',
      title: 'Entregar X',
      dueDate: '2025-03-20',
      sourceMeetingId: '11111111-1111-1111-1111-111111111111',
    });
    expect(res.sourceMeetingId).toBe('11111111-1111-1111-1111-111111111111');
    // Solo la reunion se LEE (validacion de visibilidad), nunca se muta.
    expect(m.prismaObj.meeting.findFirst).toHaveBeenCalled();
  });

  describe('transition (grafo igual que Issue)', () => {
    it('EN_CURSO -> BLOQUEADO permitido', async () => {
      m.prismaObj.commitment.findFirst.mockResolvedValue(commitmentRow());
      m.prismaObj.commitment.update.mockResolvedValue(
        commitmentRow({ state: 'BLOQUEADO' }),
      );
      const res = await m.service.transition(integrante(), 'c1', {
        toState: 'BLOQUEADO',
      });
      expect(res.state).toBe('BLOQUEADO');
    });

    it('salto no permitido -> 400', async () => {
      m.prismaObj.commitment.findFirst.mockResolvedValue(commitmentRow());
      await expect(
        m.service.transition(integrante(), 'c1', { toState: 'ARCHIVADO' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reapertura COMPLETADO -> EN_CURSO ok', async () => {
      m.prismaObj.commitment.findFirst.mockResolvedValue(
        commitmentRow({ state: 'COMPLETADO' }),
      );
      m.prismaObj.commitment.update.mockResolvedValue(
        commitmentRow({ state: 'EN_CURSO' }),
      );
      const res = await m.service.transition(integrante(), 'c1', {
        toState: 'EN_CURSO',
      });
      expect(res.state).toBe('EN_CURSO');
    });
  });

  it('alcance integrante por asignado/responsable: :id ajeno -> 404', async () => {
    m.prismaObj.commitment.findFirst.mockResolvedValue(null);
    await expect(
      m.service.get(integrante(), 'ajeno'),
    ).rejects.toBeInstanceOf(NotFoundException);
    const where = m.prismaObj.commitment.findFirst.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [{ assignedUserId: 'ui' }, { responsibleUserId: 'ui' }],
    });
  });
});
