import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { RequestService } from './request.service';
import { RequestStateService } from './request-state.service';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    request: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    requestParticipant: { deleteMany: jest.fn(), createMany: jest.fn() },
    process: { findFirst: jest.fn(), findMany: jest.fn() },
    triage: { findFirst: jest.fn() },
    priorityEvaluation: { findFirst: jest.fn() },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const state = new RequestStateService(prisma);
  return { prisma, prismaObj, audit, auditRecord, state };
}

function lider(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ul',
    name: 'Beto',
    identifier: 'lider@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
  };
}

function makeRequestRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'r1',
    title: 'Solicitud',
    registeredAt: now,
    requesterArea: null,
    requesterName: null,
    functionalOwner: null,
    targetDate: null,
    referenceUrl: null,
    expectedResult: null,
    mainProcessId: 'p1',
    operationalState: 'REGISTRADA',
    initialCommitmentDate: null,
    changeJustification: null,
    createdAt: now,
    updatedAt: now,
    participants: [{ id: 'rp1', processId: 'p1' }],
    ...overrides,
  };
}

describe('RequestService', () => {
  let service: RequestService;
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    service = new RequestService(m.prisma, m.audit, m.state);
    (m.prismaObj.triage as any).findFirst.mockResolvedValue(null);
    (m.prismaObj.priorityEvaluation as any).findFirst.mockResolvedValue(null);
  });

  describe('create', () => {
    it('crea REGISTRADA, materializa el proceso principal como participante (BR-001) y audita CREATE', async () => {
      (m.prismaObj.process as any).findFirst.mockResolvedValue({ id: 'p1' });
      (m.prismaObj.request as any).create.mockResolvedValue(makeRequestRow());

      const res = await service.create(lider(), {
        title: 'Solicitud',
        mainProcessId: 'p1',
      });

      const data = (m.prismaObj.request as any).create.mock.calls[0][0].data;
      // El service NO fija operationalState (default del schema).
      expect(data.operationalState).toBeUndefined();
      expect(data.participants.create).toEqual([{ processId: 'p1' }]);
      expect(res.participants).toEqual([{ id: 'rp1', processId: 'p1' }]);
      expect(m.auditRecord).toHaveBeenCalledTimes(1);
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'CREATE',
        objectType: 'REQUEST',
        objectId: 'r1',
        scopeProcessId: 'p1',
        before: null,
      });
    });

    it('deduplica el proceso principal si viene en participantProcessIds (BR-001/D9)', async () => {
      (m.prismaObj.process as any).findFirst.mockResolvedValue({ id: 'p1' });
      (m.prismaObj.process as any).findMany.mockResolvedValue([{ id: 'p2' }]);
      (m.prismaObj.request as any).create.mockResolvedValue(makeRequestRow());

      await service.create(lider(['p1']), {
        title: 'S',
        mainProcessId: 'p1',
        participantProcessIds: ['p1', 'p2'],
      });

      const data = (m.prismaObj.request as any).create.mock.calls[0][0].data;
      expect(data.participants.create).toEqual([
        { processId: 'p1' },
        { processId: 'p2' },
      ]);
    });

    it('participante inexistente/inactivo -> 400 sin crear', async () => {
      (m.prismaObj.process as any).findFirst.mockResolvedValue({ id: 'p1' });
      (m.prismaObj.process as any).findMany.mockResolvedValue([]); // p2 no activo
      await expect(
        service.create(lider(['p1']), {
          title: 'S',
          mainProcessId: 'p1',
          participantProcessIds: ['p2'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect((m.prismaObj.request as any).create).not.toHaveBeenCalled();
    });

    it('proceso principal fuera de alcance -> 404', async () => {
      (m.prismaObj.process as any).findFirst.mockResolvedValue(null);
      await expect(
        service.create(lider(['p1']), { title: 'S', mainProcessId: 'pX' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('fuera de alcance -> 404 (where por mainProcessId)', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(null);
      await expect(service.findOne(lider(['p1']), 'r1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      const where = (m.prismaObj.request as any).findFirst.mock.calls[0][0].where;
      expect(where.AND).toEqual([
        { id: 'r1' },
        { mainProcessId: { in: ['p1'] } },
      ]);
    });

    it('expone triage/score vigentes en la respuesta', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(makeRequestRow());
      (m.prismaObj.triage as any).findFirst.mockResolvedValue({ decision: 'CONTINUAR' });
      (m.prismaObj.priorityEvaluation as any).findFirst.mockResolvedValue({ score: 72 });

      const res = await service.findOne(lider(), 'r1');
      expect(res.currentTriageDecision).toBe('CONTINUAR');
      expect(res.currentScore).toBe(72);
      expect(res.priorityLabel).toBe('Alta');
    });
  });

  describe('update', () => {
    it('conserva fechas iniciales (no toca registeredAt/initialCommitmentDate/estado) y audita UPDATE', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(makeRequestRow());
      (m.prismaObj.request as any).update.mockResolvedValue(
        makeRequestRow({ title: 'Nuevo', changeJustification: 'ajuste' }),
      );

      await service.update(lider(), 'r1', {
        title: 'Nuevo',
        changeJustification: 'ajuste',
      });

      const data = (m.prismaObj.request as any).update.mock.calls[0][0].data;
      expect(data.registeredAt).toBeUndefined();
      expect(data.initialCommitmentDate).toBeUndefined();
      expect(data.operationalState).toBeUndefined();
      expect(data.title).toBe('Nuevo');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'REQUEST',
        scopeProcessId: 'p1',
      });
    });

    it('al reconciliar participantes mantiene el principal (BR-001)', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(makeRequestRow());
      (m.prismaObj.process as any).findMany.mockResolvedValue([{ id: 'p2' }]);
      (m.prismaObj.request as any).update.mockResolvedValue(makeRequestRow());

      await service.update(lider(), 'r1', { participantProcessIds: ['p2'] });

      expect((m.prismaObj.requestParticipant as any).deleteMany).toHaveBeenCalledWith({
        where: { requestId: 'r1' },
      });
      const createData = (m.prismaObj.requestParticipant as any).createMany.mock.calls[0][0].data;
      expect(createData).toEqual([
        { requestId: 'r1', processId: 'p1' },
        { requestId: 'r1', processId: 'p2' },
      ]);
    });
  });
});
