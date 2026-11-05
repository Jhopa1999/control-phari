import { NotFoundException } from '@nestjs/common';
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
    isLiderProceso: false,
    isAdmin: false,
  };
}

function jefe(): CurrentActor {
  return {
    userId: 'uj',
    name: 'Jefa',
    identifier: 'jefe@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set<string>(),
    isJefeArea: true,
    isLiderProceso: false,
    isAdmin: false,
  };
}

/** Líder de proceso: ve TODAS las solicitudes (visibilidad abierta, rediseño). */
function liderProceso(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ulp',
    name: 'Lidia',
    identifier: 'liderproc@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isLiderProceso: true,
    isAdmin: false,
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
    it('registra SIN proceso ni participantes (el proceso se fija en el triage) y audita CREATE', async () => {
      (m.prismaObj.request as any).create.mockResolvedValue(
        makeRequestRow({ mainProcessId: null, participants: [] }),
      );

      const res = await service.create(lider(), { title: 'Solicitud' });

      const data = (m.prismaObj.request as any).create.mock.calls[0][0].data;
      // El service NO fija operationalState (default del schema).
      expect(data.operationalState).toBeUndefined();
      // Sin proceso: ni se escribe mainProcessId ni se crean participantes.
      expect(data.mainProcessId).toBeUndefined();
      expect(data.participants).toBeUndefined();
      // No se valida ningún proceso al registrar.
      expect((m.prismaObj.process as any).findFirst).not.toHaveBeenCalled();
      expect(res.participants).toEqual([]);
      expect(m.auditRecord).toHaveBeenCalledTimes(1);
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'CREATE',
        objectType: 'REQUEST',
        objectId: 'r1',
        scopeProcessId: null,
        before: null,
      });
    });

    it('por compatibilidad: si llega mainProcessId lo valida y lo materializa como único participante (BR-001)', async () => {
      (m.prismaObj.process as any).findFirst.mockResolvedValue({ id: 'p1' });
      (m.prismaObj.request as any).create.mockResolvedValue(makeRequestRow());

      await service.create(lider(['p1']), { title: 'S', mainProcessId: 'p1' });

      const data = (m.prismaObj.request as any).create.mock.calls[0][0].data;
      expect(data.mainProcessId).toBe('p1');
      expect(data.participants.create).toEqual([{ processId: 'p1' }]);
      // La Solicitud no valida procesos extra: process.findMany no se usa.
      expect((m.prismaObj.process as any).findMany).not.toHaveBeenCalled();
    });

    it('si llega un proceso principal fuera de alcance -> 404', async () => {
      (m.prismaObj.process as any).findFirst.mockResolvedValue(null);
      await expect(
        service.create(lider(['p1']), { title: 'S', mainProcessId: 'pX' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findMany', () => {
    it('jefe de area: scopeWhere {} (sin filtro de alcance)', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([]);
      await service.findMany(jefe(), {});
      const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
      expect(where).toEqual({ deletedAt: null });
    });

    it('no-jefe: scopeWhere filtra por scopedProcessIds', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([]);
      await service.findMany(lider(['p1', 'p2']), {});
      const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
      expect(where.mainProcessId).toEqual({ in: ['p1', 'p2'] });
    });

    it('aplica filtros state y mainProcessId al where', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([makeRequestRow()]);
      const res = await service.findMany(jefe(), {
        state: 'EN_EJECUCION' as any,
        mainProcessId: 'p9',
      });
      const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
      expect(where.operationalState).toBe('EN_EJECUCION');
      expect(where.mainProcessId).toBe('p9');
      expect(res).toHaveLength(1);
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
        { deletedAt: null, mainProcessId: { in: ['p1'] } },
      ]);
    });

    it('expone triage/score vigentes en la respuesta', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(makeRequestRow());
      (m.prismaObj.triage as any).findFirst.mockResolvedValue({ decision: 'CONTINUAR' });
      (m.prismaObj.priorityEvaluation as any).findFirst.mockResolvedValue({ score: 72 });

      const res = await service.findOne(lider(), 'r1');
      expect(res.currentTriageDecision).toBe('CONTINUAR');
      expect(res.currentScore).toBe(72);
      expect(res.priorityLabel).toBe(
        'P2 · Programación en el horizonte cercano',
      );
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

    it('la edicion de la ficha NO toca participantes (se reconcilian en el triage)', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(makeRequestRow());
      (m.prismaObj.request as any).update.mockResolvedValue(makeRequestRow());

      await service.update(lider(), 'r1', { title: 'Nuevo' });

      expect((m.prismaObj.requestParticipant as any).deleteMany).not.toHaveBeenCalled();
      expect((m.prismaObj.requestParticipant as any).createMany).not.toHaveBeenCalled();
    });
  });

  describe('visibilidad por rol (scopeWhere)', () => {
    it('lider de proceso: ve TODAS las solicitudes (sin filtro de mainProcessId)', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([]);
      await service.findMany(liderProceso(['p1']), {});
      const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
      expect(where).toEqual({ deletedAt: null });
      expect(where.mainProcessId).toBeUndefined();
    });

    it('integrante puro: conserva el filtro por scopedProcessIds', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([]);
      await service.findMany(lider(['p1', 'p2']), {});
      const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
      expect(where.mainProcessId).toEqual({ in: ['p1', 'p2'] });
    });
  });
});
