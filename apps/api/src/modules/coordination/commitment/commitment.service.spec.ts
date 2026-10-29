import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
  const notifications = {
    notify: jest.fn(),
    areaHeadsForProcess: jest.fn().mockResolvedValue([]),
    processLeaders: jest.fn().mockResolvedValue([]),
  };
  const service = new CommitmentService(prisma, audit, scope, workflow, notifications as never);
  return { prismaObj, auditRecord, service, notifications };
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
    m.prismaObj.meeting.findFirst.mockResolvedValue({ id: 'mt1', state: 'BORRADOR', processId: 'p1' });
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

  describe('acta de origen', () => {
    const MT = '11111111-1111-1111-1111-111111111111';

    it('no se agregan compromisos a un acta cerrada -> 409', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue({ id: 'mt1', state: 'COMPLETADO', processId: 'p1' });
      await expect(
        m.service.create(integrante(), { processId: 'p1', title: 'X', dueDate: '2025-03-20', sourceMeetingId: MT }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(m.prismaObj.commitment.create).not.toHaveBeenCalled();
    });

    it('el compromiso debe ser del mismo proceso que el acta -> 400', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue({ id: 'mt1', state: 'BORRADOR', processId: 'p2' });
      await expect(
        m.service.create(integrante(), { processId: 'p1', title: 'X', dueDate: '2025-03-20', sourceMeetingId: MT }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('notifica al asignado y al responsable al crear', async () => {
      m.prismaObj.commitment.create.mockImplementation(({ data }: any) =>
        Promise.resolve(commitmentRow(data)),
      );
      await m.service.create(integrante(), {
        processId: 'p1', title: 'X', dueDate: '2025-03-20', assignedUserId: 'ua', responsibleUserId: 'ur',
      });
      expect(m.notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'COMMITMENT_ASSIGNED', userIds: ['ua', 'ur'] }),
      );
    });

    it('no se elimina un compromiso de un acta cerrada -> 409', async () => {
      m.prismaObj.commitment.findFirst.mockResolvedValue(commitmentRow({ sourceMeetingId: 'mt1' }));
      m.prismaObj.meeting.findFirst.mockResolvedValue({ state: 'COMPLETADO' });
      await expect(m.service.remove(integrante(), 'c1')).rejects.toBeInstanceOf(ConflictException);
      expect(m.prismaObj.commitment.delete).not.toHaveBeenCalled();
    });
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

  describe('create: validacion de relaciones visibles', () => {
    it('reunion fuente no visible -> 404', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue(null);
      await expect(
        m.service.create(integrante(), {
          processId: 'p1',
          title: 'X',
          dueDate: '2025-03-20',
          sourceMeetingId: '11111111-1111-1111-1111-111111111111',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(m.prismaObj.commitment.create).not.toHaveBeenCalled();
    });

    it('relatedRequestId no visible -> 404', async () => {
      m.prismaObj.request.findFirst.mockResolvedValue(null);
      await expect(
        m.service.create(integrante(), {
          processId: 'p1',
          title: 'X',
          dueDate: '2025-03-20',
          relatedRequestId: '22222222-2222-2222-2222-222222222222',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('relatedProjectRequestId no visible -> 404', async () => {
      m.prismaObj.request.findFirst.mockResolvedValue(null);
      await expect(
        m.service.create(integrante(), {
          processId: 'p1',
          title: 'X',
          dueDate: '2025-03-20',
          relatedProjectRequestId: '33333333-3333-3333-3333-333333333333',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('crea con todos los campos opcionales presentes', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue({ id: 'mt1', state: 'BORRADOR', processId: 'p1' });
      m.prismaObj.request.findFirst.mockResolvedValue({ id: 'r1' });
      m.prismaObj.commitment.create.mockImplementation(({ data }: any) =>
        Promise.resolve(commitmentRow(data)),
      );
      const res = await m.service.create(integrante(), {
        processId: 'p1',
        title: 'Completo',
        dueDate: '2025-03-20',
        sourceMeetingId: '11111111-1111-1111-1111-111111111111',
        assignedUserId: 'ua',
        responsibleUserId: 'ur',
        relatedRequestId: '22222222-2222-2222-2222-222222222222',
        relatedProjectRequestId: '33333333-3333-3333-3333-333333333333',
        expectedResult: 'esperado',
        result: 'resultado',
        blockers: 'ninguno',
      });
      expect(res.assignedUserId).toBe('ua');
      expect(res.responsibleUserId).toBe('ur');
      expect(res.expectedResult).toBe('esperado');
      expect(res.blockers).toBe('ninguno');
    });
  });

  describe('update', () => {
    it('actualiza campos y audita UPDATE con before/after', async () => {
      m.prismaObj.commitment.findFirst.mockResolvedValue(commitmentRow());
      m.prismaObj.commitment.update.mockImplementation(({ data }: any) =>
        Promise.resolve(commitmentRow({ ...data })),
      );
      const res = await m.service.update(integrante(), 'c1', {
        title: 'Nuevo titulo',
        dueDate: '2025-04-01',
        result: 'hecho',
      });
      expect(res.title).toBe('Nuevo titulo');
      expect(res.dueDate).toBe('2025-04-01');
      const auditCall = m.auditRecord.mock.calls[0][1];
      expect(auditCall).toMatchObject({ action: 'UPDATE', objectType: 'COMMITMENT' });
      expect(auditCall.before).not.toBeNull();
      expect(auditCall.after).not.toBeNull();
    });

    it('sin dueDate conserva la fecha previa', async () => {
      m.prismaObj.commitment.findFirst.mockResolvedValue(commitmentRow());
      m.prismaObj.commitment.update.mockImplementation(({ data }: any) =>
        Promise.resolve(commitmentRow({ ...data })),
      );
      await m.service.update(integrante(), 'c1', { title: 'Solo titulo' });
      const data = m.prismaObj.commitment.update.mock.calls[0][0].data;
      expect(data.dueDate).toBeUndefined();
    });

    it(':id fuera de alcance -> 404', async () => {
      m.prismaObj.commitment.findFirst.mockResolvedValue(null);
      await expect(
        m.service.update(integrante(), 'ajeno', { title: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('update con reunion fuente no visible -> 404', async () => {
      m.prismaObj.commitment.findFirst.mockResolvedValue(commitmentRow());
      m.prismaObj.meeting.findFirst.mockResolvedValue(null);
      await expect(
        m.service.update(integrante(), 'c1', {
          sourceMeetingId: '11111111-1111-1111-1111-111111111111',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('update con relatedRequestId/relatedProjectRequestId no visible -> 404', async () => {
      m.prismaObj.commitment.findFirst.mockResolvedValue(commitmentRow());
      m.prismaObj.request.findFirst.mockResolvedValue(null);
      await expect(
        m.service.update(integrante(), 'c1', {
          relatedRequestId: '22222222-2222-2222-2222-222222222222',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('aplica filtros state/processId/assignedUserId', async () => {
      m.prismaObj.commitment.findMany.mockResolvedValue([commitmentRow()]);
      const res = await m.service.list(integrante(), {
        state: 'EN_CURSO',
        processId: 'p1',
        assignedUserId: 'ui',
      } as any);
      expect(res).toHaveLength(1);
      const and = m.prismaObj.commitment.findMany.mock.calls[0][0].where.AND;
      expect(and).toContainEqual({ state: 'EN_CURSO' });
      expect(and).toContainEqual({ processId: 'p1' });
      expect(and).toContainEqual({ assignedUserId: 'ui' });
    });

    it('sin filtros devuelve solo alcance', async () => {
      m.prismaObj.commitment.findMany.mockResolvedValue([]);
      const res = await m.service.list(integrante(), {} as any);
      expect(res).toEqual([]);
      const and = m.prismaObj.commitment.findMany.mock.calls[0][0].where.AND;
      expect(and).toHaveLength(1);
    });
  });

  describe('remove', () => {
    it('elimina y audita DELETE con after null', async () => {
      m.prismaObj.commitment.findFirst.mockResolvedValue(commitmentRow());
      m.prismaObj.commitment.delete.mockResolvedValue(commitmentRow());
      await m.service.remove(integrante(), 'c1');
      expect(m.prismaObj.commitment.delete).toHaveBeenCalledWith({
        where: { id: 'c1' },
      });
      const auditCall = m.auditRecord.mock.calls[0][1];
      expect(auditCall).toMatchObject({ action: 'DELETE', objectType: 'COMMITMENT' });
      expect(auditCall.after).toBeNull();
    });

    it(':id fuera de alcance -> 404', async () => {
      m.prismaObj.commitment.findFirst.mockResolvedValue(null);
      await expect(
        m.service.remove(integrante(), 'ajeno'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
