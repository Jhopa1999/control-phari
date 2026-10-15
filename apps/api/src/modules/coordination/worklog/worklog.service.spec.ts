import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { CoordinationScopeService } from '../coordination-scope.service';
import { WorklogService } from './worklog.service';

function createMocks() {
  const prismaObj: Record<string, any> = {
    dailyLog: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    dailyLogActivity: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    weeklyReport: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    request: { findFirst: jest.fn() },
    task: { findFirst: jest.fn() },
    plan: { findFirst: jest.fn() },
    issue: { findFirst: jest.fn() },
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
  const service = new WorklogService(prisma, audit, scope);
  return { prisma, prismaObj, audit, auditRecord, scope, service };
}

function grantFor(processId: string, roleCode: RoleCode) {
  return {
    processId,
    processCode: processId.toUpperCase(),
    processName: processId,
    roleCode,
    roleName: roleCode,
  };
}

function jefe(): CurrentActor {
  return {
    userId: 'uj',
    name: 'Jefa',
    identifier: 'jefe@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.JEFE_AREA]),
    scopedProcessIds: new Set(),
    isJefeArea: true,
    isAdmin: false,
  };
}

function lider(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ul',
    name: 'Lider',
    identifier: 'lider@demo.local',
    grants: scoped.map((p) => grantFor(p, RoleCode.LIDER_PROCESO)),
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isAdmin: false,
  };
}

function integrante(scoped: string[] = []): CurrentActor {
  return {
    userId: 'ui',
    name: 'Integrante',
    identifier: 'integrante@demo.local',
    grants: scoped.map((p) => grantFor(p, RoleCode.INTEGRANTE)),
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isAdmin: false,
  };
}

const now = new Date('2025-03-10T00:00:00.000Z');

function dailyLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dl1',
    authorUserId: 'ui',
    processId: 'p1',
    date: new Date(Date.UTC(2025, 2, 10)),
    status: 'BORRADOR',
    submittedAt: null,
    dayNotes: null,
    createdAt: now,
    updatedAt: now,
    activities: [],
    ...overrides,
  };
}

function activityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    dailyLogId: 'dl1',
    classificationCode: 'INTERNA',
    projectRequestId: null,
    taskId: null,
    assetRef: null,
    requesterRef: null,
    justification: null,
    description: null,
    result: null,
    activityStatus: null,
    hours: 0,
    evidenceUrl: null,
    relatedIssueId: null,
    nextStep: null,
    nextStepDate: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function weeklyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wr1',
    authorUserId: 'ui',
    processId: 'p1',
    weekStart: new Date(Date.UTC(2025, 2, 10)), // lunes
    status: 'BORRADOR',
    submittedAt: null,
    results: null,
    proposals: null,
    blockers: null,
    commitmentsText: null,
    decisions: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('WorklogService', () => {
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    (m.prismaObj.grant as any).findMany.mockResolvedValue([]);
  });

  // --- Clasificacion de actividad (§2.3, BR-014) --------------------------

  describe('addActivity · clasificacion', () => {
    beforeEach(() => {
      // El diario padre existe y esta en alcance de escritura.
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(
        dailyLogRow(),
      );
      (m.prismaObj.dailyLogActivity as any).create.mockImplementation(
        ({ data }: any) => Promise.resolve(activityRow(data)),
      );
    });

    it('PLANIFICADA sin proyecto ni tarea -> 400 (AC-014)', async () => {
      await expect(
        m.service.addActivity(integrante(['p1']), 'dl1', {
          classificationCode: 'PLANIFICADA',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect((m.prismaObj.dailyLogActivity as any).create).not.toHaveBeenCalled();
    });

    it('PLANIFICADA con projectRequestId visible -> ok', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue({ id: 'r1' });
      const res = await m.service.addActivity(integrante(['p1']), 'dl1', {
        classificationCode: 'PLANIFICADA',
        projectRequestId: '11111111-1111-1111-1111-111111111111',
      });
      expect(res.classificationCode).toBe('PLANIFICADA');
    });

    it('SOPORTE sin assetRef -> 400 (AC-015)', async () => {
      await expect(
        m.service.addActivity(integrante(['p1']), 'dl1', {
          classificationCode: 'SOPORTE',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('SOPORTE con assetRef -> ok', async () => {
      const res = await m.service.addActivity(integrante(['p1']), 'dl1', {
        classificationCode: 'SOPORTE',
        assetRef: 'Servidor X',
      });
      expect(res.classificationCode).toBe('SOPORTE');
    });

    it('INTERNA sin referencias -> ok', async () => {
      const res = await m.service.addActivity(integrante(['p1']), 'dl1', {
        classificationCode: 'INTERNA',
      });
      expect(res.classificationCode).toBe('INTERNA');
    });

    it('EXTRAORDINARIA sin solicitante o sin justificacion -> 400 (AC-016)', async () => {
      await expect(
        m.service.addActivity(integrante(['p1']), 'dl1', {
          classificationCode: 'EXTRAORDINARIA',
          requesterRef: 'Alguien',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('EXTRAORDINARIA con solicitante y justificacion -> ok', async () => {
      const res = await m.service.addActivity(integrante(['p1']), 'dl1', {
        classificationCode: 'EXTRAORDINARIA',
        requesterRef: 'Area Y',
        justification: 'Urgencia',
      });
      expect(res.classificationCode).toBe('EXTRAORDINARIA');
    });

    it('(Finding 4) borrador sin hours -> se persiste con hours = 0', async () => {
      const res = await m.service.addActivity(integrante(['p1']), 'dl1', {
        classificationCode: 'INTERNA',
      });
      const data = (m.prismaObj.dailyLogActivity as any).create.mock
        .calls[0][0].data;
      expect(data.hours).toBeUndefined(); // no se escribe -> columna @default(0)
      expect(res.hours).toBe(0);
    });

    it('audita CREATE DAILY_LOG_ACTIVITY con scopeProcessId del diario padre', async () => {
      await m.service.addActivity(integrante(['p1']), 'dl1', {
        classificationCode: 'INTERNA',
      });
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'CREATE',
        objectType: 'DAILY_LOG_ACTIVITY',
        scopeProcessId: 'p1',
      });
    });
  });

  // --- Visibilidad de FK (HIGH-1/HIGH-2/MEDIUM-1) -------------------------

  describe('addActivity · visibilidad de FK', () => {
    beforeEach(() => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(dailyLogRow());
      (m.prismaObj.dailyLogActivity as any).create.mockImplementation(
        ({ data }: any) => Promise.resolve(activityRow(data)),
      );
    });

    it('(HIGH-2) projectRequestId visible por scopedProcessIds del integrante -> OK, where usa scopedProcessIds', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue({ id: 'r1' });
      await m.service.addActivity(integrante(['p1']), 'dl1', {
        classificationCode: 'PLANIFICADA',
        projectRequestId: '11111111-1111-1111-1111-111111111111',
      });
      const where = (m.prismaObj.request as any).findFirst.mock.calls[0][0]
        .where;
      expect(where.AND).toContainEqual({ mainProcessId: { in: ['p1'] } });
    });

    it('(HIGH-2) projectRequestId de un proceso sin grant -> 404', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.addActivity(integrante(['p1']), 'dl1', {
          classificationCode: 'PLANIFICADA',
          projectRequestId: '22222222-2222-2222-2222-222222222222',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('(HIGH-1) taskId fuera de visibilidad -> 404 por traversal phase.plan.request', async () => {
      (m.prismaObj.task as any).findFirst.mockResolvedValue({
        id: 't1',
        phase: { planId: 'pl1' },
      });
      (m.prismaObj.plan as any).findFirst.mockResolvedValue({ requestId: 'r1' });
      (m.prismaObj.request as any).findFirst.mockResolvedValue(null); // fuera
      await expect(
        m.service.addActivity(integrante(['p1']), 'dl1', {
          classificationCode: 'PLANIFICADA',
          taskId: '33333333-3333-3333-3333-333333333333',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      // Verifica el traversal (no un where: { request } sobre task).
      expect((m.prismaObj.task as any).findFirst).toHaveBeenCalled();
      expect((m.prismaObj.plan as any).findFirst).toHaveBeenCalled();
    });

    it('(HIGH-1) taskId cuya Request es visible -> OK', async () => {
      (m.prismaObj.task as any).findFirst.mockResolvedValue({
        id: 't1',
        phase: { planId: 'pl1' },
      });
      (m.prismaObj.plan as any).findFirst.mockResolvedValue({ requestId: 'r1' });
      (m.prismaObj.request as any).findFirst.mockResolvedValue({ id: 'r1' });
      const res = await m.service.addActivity(integrante(['p1']), 'dl1', {
        classificationCode: 'PLANIFICADA',
        taskId: '33333333-3333-3333-3333-333333333333',
      });
      expect(res.classificationCode).toBe('PLANIFICADA');
    });

    it('(MEDIUM-1) relatedIssueId del mismo proceso del diario -> OK (por processId del diario)', async () => {
      (m.prismaObj.issue as any).findFirst.mockResolvedValue({ id: 'is1' });
      await m.service.addActivity(integrante(['p1']), 'dl1', {
        classificationCode: 'INTERNA',
        relatedIssueId: '44444444-4444-4444-4444-444444444444',
      });
      const where = (m.prismaObj.issue as any).findFirst.mock.calls[0][0].where;
      expect(where).toMatchObject({ processId: 'p1' });
    });

    it('(MEDIUM-1) relatedIssueId de otro proceso -> 404', async () => {
      (m.prismaObj.issue as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.addActivity(integrante(['p1']), 'dl1', {
          classificationCode: 'INTERNA',
          relatedIssueId: '44444444-4444-4444-4444-444444444444',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // --- Separacion de conceptos (§2.4, BR-013/023) -------------------------

  describe('separacion de conceptos (BR-013/023)', () => {
    it('crear actividad con taskId NO invoca mutacion de Task (solo lectura de visibilidad)', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(dailyLogRow());
      (m.prismaObj.task as any).findFirst.mockResolvedValue({
        id: 't1',
        phase: { planId: 'pl1' },
      });
      (m.prismaObj.plan as any).findFirst.mockResolvedValue({ requestId: 'r1' });
      (m.prismaObj.request as any).findFirst.mockResolvedValue({ id: 'r1' });
      (m.prismaObj.dailyLogActivity as any).create.mockImplementation(
        ({ data }: any) => Promise.resolve(activityRow(data)),
      );

      await m.service.addActivity(integrante(['p1']), 'dl1', {
        classificationCode: 'PLANIFICADA',
        taskId: '33333333-3333-3333-3333-333333333333',
        hours: 8,
      });
      // El mock de task solo se LEE (findFirst), nunca update/delete.
      expect((m.prismaObj.task as any).update).toBeUndefined();
      // No existe delegado plan.update invocado.
      expect((m.prismaObj.plan as any).update).toBeUndefined();
    });

    it('submitDailyLog solo cambia status/submittedAt; no toca request/issue', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(dailyLogRow());
      (m.prismaObj.dailyLog as any).update.mockResolvedValue(
        dailyLogRow({ status: 'ENVIADO', submittedAt: now }),
      );
      // findFirst 2a vez para recargar con actividades.
      (m.prismaObj.dailyLog as any).findFirst
        .mockResolvedValueOnce(dailyLogRow())
        .mockResolvedValueOnce(dailyLogRow({ status: 'ENVIADO' }));

      await m.service.submitDailyLog(integrante(['p1']), 'dl1');
      const data = (m.prismaObj.dailyLog as any).update.mock.calls[0][0].data;
      expect(Object.keys(data).sort()).toEqual(['status', 'submittedAt']);
      expect(data.status).toBe('ENVIADO');
      expect((m.prismaObj.request as any).findFirst).not.toHaveBeenCalled();
    });

    it('enviar semanal con proposals/commitmentsText no crea Commitment ni muta prioridad (AC-018)', async () => {
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(
        weeklyRow({ proposals: 'subir X', commitmentsText: 'hacer Y' }),
      );
      (m.prismaObj.weeklyReport as any).update.mockResolvedValue(
        weeklyRow({ status: 'ENVIADO', submittedAt: now }),
      );
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);

      await m.service.submitWeeklyReport(integrante(['p1']), 'wr1');
      const data = (m.prismaObj.weeklyReport as any).update.mock.calls[0][0]
        .data;
      // Solo status/submittedAt; nunca escribe proposals ni crea nada mas.
      expect(Object.keys(data).sort()).toEqual(['status', 'submittedAt']);
      expect((m.prismaObj.request as any).findFirst).not.toHaveBeenCalled();
    });
  });

  // --- Consolidacion semanal (§2.5, BR-015/AC-017) ------------------------

  describe('consolidacion semanal', () => {
    it('(Finding 2) lider consolida el semanal de un integrante: usa authorUserId/processId del WeeklyReport objetivo', async () => {
      const report = weeklyRow({ authorUserId: 'ui', processId: 'p1' });
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(report);
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([
        {
          ...dailyLogRow({ status: 'ENVIADO' }),
          activities: [activityRow({ hours: 5 }), activityRow({ hours: 3, classificationCode: 'EXTRAORDINARIA' })],
        },
      ]);

      const res = await m.service.getWeeklyReport(lider(['p1']), 'wr1');
      const where = (m.prismaObj.dailyLog as any).findMany.mock.calls[0][0]
        .where;
      // Autor/proceso del semanal OBJETIVO, no del lider.
      expect(where.authorUserId).toBe('ui');
      expect(where.processId).toBe('p1');
      expect(where.status).toEqual({ in: ['ENVIADO', 'REVISADO'] });
      expect(res.consolidation).toMatchObject({
        dailyLogCount: 1,
        activityCount: 2,
        totalHours: 8,
        extraordinaryCount: 1,
        hasBacking: true,
      });
    });

    it('sin diarios elegibles -> conteos en cero y hasBacking false', async () => {
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(weeklyRow());
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);

      const res = await m.service.getWeeklyReport(integrante(['p1']), 'wr1');
      expect(res.consolidation).toMatchObject({
        dailyLogCount: 0,
        activityCount: 0,
        totalHours: 0,
        extraordinaryCount: 0,
        hasBacking: false,
      });
    });

    it('rango de fecha [weekStart, weekStart+6]: domingo incluido, filtro por lte week+6', async () => {
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(weeklyRow());
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);
      await m.service.getWeeklyReport(integrante(['p1']), 'wr1');
      const where = (m.prismaObj.dailyLog as any).findMany.mock.calls[0][0]
        .where;
      expect(where.date.gte.toISOString()).toBe('2025-03-10T00:00:00.000Z');
      expect(where.date.lte.toISOString()).toBe('2025-03-16T00:00:00.000Z'); // domingo
    });
  });

  // --- Normalizacion de weekStart (§3.4, Finding 3) -----------------------

  describe('createWeeklyReport · normalizacion weekStart', () => {
    it('fecha miercoles -> persiste el lunes ISO de esa semana (nunca 400)', async () => {
      (m.prismaObj.weeklyReport as any).create.mockImplementation(
        ({ data }: any) => Promise.resolve(weeklyRow(data)),
      );
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);

      await m.service.createWeeklyReport(integrante(['p1']), {
        processId: 'p1',
        weekStart: '2025-03-12', // miercoles
      });
      const data = (m.prismaObj.weeklyReport as any).create.mock.calls[0][0]
        .data;
      expect(data.weekStart.toISOString()).toBe('2025-03-10T00:00:00.000Z'); // lunes
    });

    it('dos semanales de la misma semana (fechas distintas) -> segundo 409', async () => {
      (m.prismaObj.weeklyReport as any).create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);

      await expect(
        m.service.createWeeklyReport(integrante(['p1']), {
          processId: 'p1',
          weekStart: '2025-03-14',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // --- Alcance por rol (§2.2, AC-025/026) ---------------------------------

  describe('alcance por rol de diarios', () => {
    it('integrante: where de lectura por authorUserId propio (no scopedProcessIds)', async () => {
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);
      await m.service.listDailyLogs(integrante(['p1']), {});
      const where = (m.prismaObj.dailyLog as any).findMany.mock.calls[0][0]
        .where;
      expect(where.AND).toContainEqual({ authorUserId: 'ui' });
    });

    it('lider: where por processId ∈ grants LIDER', async () => {
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);
      await m.service.listDailyLogs(lider(['p1', 'p2']), {});
      const where = (m.prismaObj.dailyLog as any).findMany.mock.calls[0][0]
        .where;
      expect(where.AND).toContainEqual({ processId: { in: ['p1', 'p2'] } });
    });

    it('jefe: where de lectura vacio (area)', async () => {
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);
      await m.service.listDailyLogs(jefe(), {});
      const where = (m.prismaObj.dailyLog as any).findMany.mock.calls[0][0]
        .where;
      expect(where.AND).toContainEqual({});
    });

    it('integrante accediendo a :id ajeno -> 404', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.getDailyLog(integrante(['p1']), 'ajeno'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // --- DailyLog submit / 409 ----------------------------------------------

  describe('submitDailyLog', () => {
    it('BORRADOR -> ENVIADO ok', async () => {
      (m.prismaObj.dailyLog as any).findFirst
        .mockResolvedValueOnce(dailyLogRow())
        .mockResolvedValueOnce(dailyLogRow({ status: 'ENVIADO' }));
      (m.prismaObj.dailyLog as any).update.mockResolvedValue(
        dailyLogRow({ status: 'ENVIADO', submittedAt: now }),
      );

      const res = await m.service.submitDailyLog(integrante(['p1']), 'dl1');
      expect(res.status).toBe('ENVIADO');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'DAILY_LOG',
        scopeProcessId: 'p1',
      });
    });

    it('segundo submit sobre un diario ya ENVIADO -> 409', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(
        dailyLogRow({ status: 'ENVIADO' }),
      );
      await expect(
        m.service.submitDailyLog(integrante(['p1']), 'dl1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('submit sobre diario ajeno -> 404', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.submitDailyLog(integrante(['p1']), 'ajeno'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // --- Duplicados / 409 ----------------------------------------------------

  describe('createDailyLog · duplicado', () => {
    it('segundo diario (autor, proceso, fecha) -> P2002 -> 409', async () => {
      (m.prismaObj.dailyLog as any).create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(
        m.service.createDailyLog(integrante(['p1']), {
          processId: 'p1',
          date: '2025-03-10',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('crea diario con autor = actor y audita CREATE DAILY_LOG', async () => {
      (m.prismaObj.dailyLog as any).create.mockImplementation(
        ({ data }: any) => Promise.resolve(dailyLogRow(data)),
      );
      await m.service.createDailyLog(integrante(['p1']), {
        processId: 'p1',
        date: '2025-03-10',
      });
      const data = (m.prismaObj.dailyLog as any).create.mock.calls[0][0].data;
      expect(data.authorUserId).toBe('ui');
      expect(data.date.toISOString()).toBe('2025-03-10T00:00:00.000Z');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'CREATE',
        objectType: 'DAILY_LOG',
        scopeProcessId: 'p1',
      });
    });

    it('fecha irreal (2025-02-30) -> 400 (round-trip de dateStringToDate)', async () => {
      await expect(
        m.service.createDailyLog(integrante(['p1']), {
          processId: 'p1',
          date: '2025-02-30',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
