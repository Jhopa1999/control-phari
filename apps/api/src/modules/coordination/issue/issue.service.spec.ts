import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { CoordinationScopeService } from '../coordination-scope.service';
import { WorkflowStateService } from '../workflow-state.service';
import { IssueService } from './issue.service';

function createMocks() {
  const prismaObj: Record<string, any> = {
    issue: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    request: { findFirst: jest.fn() },
    task: { findFirst: jest.fn() },
    plan: { findFirst: jest.fn() },
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
  const service = new IssueService(prisma, audit, scope, workflow);
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
  };
}

const now = new Date('2025-03-10T00:00:00.000Z');

function issueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'is1',
    processId: 'p1',
    reportedByUserId: 'ui',
    date: new Date(Date.UTC(2025, 2, 10)),
    typeCode: 'BLOQUEO',
    relatedRequestId: null,
    relatedTaskId: null,
    relatedAssetRef: null,
    title: 'Falla',
    detail: null,
    impact: null,
    resolverUserId: null,
    targetDate: null,
    resolution: null,
    state: 'EN_CURSO',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('IssueService', () => {
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
  });

  it('crea con tipo por defecto y audita CREATE ISSUE con scopeProcessId del registro', async () => {
    m.prismaObj.issue.create.mockImplementation(({ data }: any) =>
      Promise.resolve(issueRow(data)),
    );
    const res = await m.service.create(integrante(), {
      processId: 'p1',
      date: '2025-03-10',
      title: 'Falla',
    });
    expect(res.typeCode).toBe('BLOQUEO'); // default de columna (no se escribe)
    expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
      action: 'CREATE',
      objectType: 'ISSUE',
      scopeProcessId: 'p1',
    });
  });

  it('un registro por incidente: PATCH edita el mismo id (AC-019)', async () => {
    m.prismaObj.issue.findFirst.mockResolvedValue(issueRow());
    m.prismaObj.issue.update.mockResolvedValue(
      issueRow({ title: 'Falla editada' }),
    );
    const res = await m.service.update(integrante(), 'is1', {
      title: 'Falla editada',
    });
    expect(m.prismaObj.issue.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'is1' } }),
    );
    expect(res.title).toBe('Falla editada');
    expect(m.prismaObj.issue.create).not.toHaveBeenCalled();
  });

  describe('transition (maquina minima §4)', () => {
    it('transicion permitida EN_CURSO -> COMPLETADO ok y audita UPDATE', async () => {
      m.prismaObj.issue.findFirst.mockResolvedValue(issueRow());
      m.prismaObj.issue.update.mockResolvedValue(
        issueRow({ state: 'COMPLETADO' }),
      );
      const res = await m.service.transition(integrante(), 'is1', {
        toState: 'COMPLETADO',
      });
      expect(res.state).toBe('COMPLETADO');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'ISSUE',
      });
    });

    it('salto no permitido EN_CURSO -> ARCHIVADO -> 400', async () => {
      m.prismaObj.issue.findFirst.mockResolvedValue(issueRow());
      await expect(
        m.service.transition(integrante(), 'is1', { toState: 'ARCHIVADO' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(m.prismaObj.issue.update).not.toHaveBeenCalled();
    });

    it('reapertura COMPLETADO -> EN_CURSO ok', async () => {
      m.prismaObj.issue.findFirst.mockResolvedValue(
        issueRow({ state: 'COMPLETADO' }),
      );
      m.prismaObj.issue.update.mockResolvedValue(
        issueRow({ state: 'EN_CURSO' }),
      );
      const res = await m.service.transition(integrante(), 'is1', {
        toState: 'EN_CURSO',
      });
      expect(res.state).toBe('EN_CURSO');
    });
  });

  it(':id ajeno -> 404', async () => {
    m.prismaObj.issue.findFirst.mockResolvedValue(null);
    await expect(
      m.service.get(integrante(), 'ajeno'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('relatedRequestId fuera de visibilidad -> 404 (no 400)', async () => {
    m.prismaObj.request.findFirst.mockResolvedValue(null);
    await expect(
      m.service.create(integrante(), {
        processId: 'p1',
        date: '2025-03-10',
        title: 'Falla',
        relatedRequestId: '11111111-1111-1111-1111-111111111111',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
