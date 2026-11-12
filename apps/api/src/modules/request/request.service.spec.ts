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
    // Secuencia requests_number_seq (ID visible): devuelve 12, 13, 14...
    $queryRaw: jest.fn(),
  };
  let nextNumber = 12;
  (prismaObj.$queryRaw as jest.Mock).mockImplementation(async () => [{ n: BigInt(nextNumber++) }]);
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

/**
 * Integrante puro: ni jefe ni líder. Ve las solicitudes de sus procesos y
 * SIEMPRE las que él creó (A1), aunque aún no tengan proceso principal.
 */
function integrante(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ui',
    name: 'Ivo',
    identifier: 'integrante@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
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
    assetId: null,
    createdByUserId: null,
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
      // ID visible: número de la secuencia + código PRY-0012 (el DTO no lo aporta).
      expect(data.number).toBe(12);
      expect(data.code).toBe('PRY-0012');
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

    it('los códigos de solicitud siguen la secuencia y no se reutilizan', async () => {
      (m.prismaObj.request as any).create.mockResolvedValue(makeRequestRow());
      await service.create(lider(), { title: 'A' });
      await service.create(lider(), { title: 'B' });
      const datas = (m.prismaObj.request as any).create.mock.calls.map((c: any[]) => c[0].data);
      expect(datas.map((d: any) => d.code)).toEqual(['PRY-0012', 'PRY-0013']);
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

    it('no-jefe: scopeWhere filtra por scopedProcessIds O createdByUserId (A1)', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([]);
      await service.findMany(lider(['p1', 'p2']), {});
      const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { mainProcessId: { in: ['p1', 'p2'] } },
        { createdByUserId: 'ul' },
      ]);
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
        {
          deletedAt: null,
          OR: [
            { mainProcessId: { in: ['p1'] } },
            { createdByUserId: 'ul' },
          ],
        },
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

  describe('findByCode (ID visible)', () => {
    it('normaliza a mayúsculas y aplica el alcance del actor', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(makeRequestRow());
      await service.findByCode(lider(['p1']), ' pry-0012 ');
      const where = (m.prismaObj.request as any).findFirst.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({ code: 'PRY-0012' });
      expect(where.AND[1]).toEqual({
        deletedAt: null,
        OR: [{ mainProcessId: { in: ['p1'] } }, { createdByUserId: 'ul' }],
      });
    });

    it.each(['PRY-12', 'PRY-0012-F2', 'PRY-0012-T07', 'abc', 'T07'])(
      '"%s" no es un código de solicitud -> 400',
      async (code) => {
        await expect(service.findByCode(lider(['p1']), code)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect((m.prismaObj.request as any).findFirst).not.toHaveBeenCalled();
      },
    );

    it('inexistente o fuera de alcance -> 404', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(null);
      await expect(service.findByCode(lider(['p1']), 'PRY-0099')).rejects.toBeInstanceOf(
        NotFoundException,
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
      // El ID visible es inmutable: la edición nunca lo escribe.
      expect(data.number).toBeUndefined();
      expect(data.code).toBeUndefined();
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

    it('integrante puro: conserva el filtro por scopedProcessIds (dentro del OR)', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([]);
      await service.findMany(lider(['p1', 'p2']), {});
      const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { mainProcessId: { in: ['p1', 'p2'] } },
        { createdByUserId: 'ul' },
      ]);
    });
  });

  describe('A1 · el creador siempre ve su solicitud', () => {
    it('create escribe createdByUserId = actor.userId (integrante puro, sin proceso)', async () => {
      (m.prismaObj.request as any).create.mockResolvedValue(
        makeRequestRow({
          mainProcessId: null,
          participants: [],
          createdByUserId: 'ui',
        }),
      );

      await service.create(integrante(['p2']), { title: 'Solicitud propia' });

      const data = (m.prismaObj.request as any).create.mock.calls[0][0].data;
      expect(data.createdByUserId).toBe('ui');
      expect(data.mainProcessId).toBeUndefined();
    });

    it('findMany del integrante incluye el OR con createdByUserId (ve lo suyo)', async () => {
      (m.prismaObj.request as any).findMany.mockResolvedValue([]);
      await service.findMany(integrante(['p2']), {});
      const where = (m.prismaObj.request as any).findMany.mock.calls[0][0].where;
      expect(where.deletedAt).toBeNull();
      expect(where.OR).toEqual([
        { mainProcessId: { in: ['p2'] } },
        { createdByUserId: 'ui' },
      ]);
    });

    it('findOne del integrante consulta con el OR createdByUserId', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequestRow({ mainProcessId: null, createdByUserId: 'ui' }),
      );
      await service.findOne(integrante(['p2']), 'r1');
      const where = (m.prismaObj.request as any).findFirst.mock.calls[0][0].where;
      expect(where.AND).toEqual([
        { id: 'r1' },
        {
          deletedAt: null,
          OR: [
            { mainProcessId: { in: ['p2'] } },
            { createdByUserId: 'ui' },
          ],
        },
      ]);
    });

    it('una solicitud sin proceso creada por OTRO no aparece: findOne -> 404', async () => {
      // El scopeWhere (mainProcessId fuera de alcance + createdByUserId ajeno)
      // no la alcanza: Prisma no devuelve fila y el service lanza 404.
      (m.prismaObj.request as any).findFirst.mockResolvedValue(null);
      await expect(
        service.findOne(integrante(['p2']), 'rAjena'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
