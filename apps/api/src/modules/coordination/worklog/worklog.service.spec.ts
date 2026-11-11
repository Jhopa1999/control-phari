import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { NotificationService } from '../../notification/notification.service';
import { CoordinationScopeService } from '../coordination-scope.service';
import { RequestScopeService } from '../../request/request-scope.service';
import { WorklogEligibilityService } from './worklog-eligibility.service';
import { WorklogService } from './worklog.service';

function createMocks() {
  const prismaObj: Record<string, any> = {
    dailyLog: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
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
      findFirstOrThrow: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    request: { findFirst: jest.fn() },
    task: { findFirst: jest.fn() },
    plan: { findFirst: jest.fn() },
    catalogItem: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findMany: jest.fn() },
    grant: { findMany: jest.fn() },
  };
  // El servicio relee el semanal con autor y revisión tras mutarlo: el doble
  // devuelve lo último que produjo create/update (o un semanal por defecto).
  prismaObj.weeklyReport.findFirstOrThrow.mockImplementation(async () => {
    const mocks = [prismaObj.weeklyReport.create, prismaObj.weeklyReport.update]
      .map((fn) => fn.mock)
      .filter((mk) => mk.results.length > 0);
    if (mocks.length === 0) return weeklyRow();
    const last = mocks.reduce((a, b) =>
      Math.max(...a.invocationCallOrder) > Math.max(...b.invocationCallOrder)
        ? a
        : b,
    );
    return (await last.results[last.results.length - 1].value) ?? weeklyRow();
  });
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const scope = new CoordinationScopeService(prisma);
  const notifications = { notify: jest.fn() } as unknown as NotificationService;
  const notify = notifications.notify as unknown as jest.Mock;
  const eligibility = new WorklogEligibilityService(prisma, new RequestScopeService());
  const service = new WorklogService(prisma, audit, scope, notifications, eligibility);
  return { prisma, prismaObj, audit, auditRecord, scope, service, notify };
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
    isLiderProceso: false,
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
    isLiderProceso: false,
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
    isLiderProceso: false,
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

  // --- Elegibilidad de proyecto y tarea (alcance, estado, proceso, responsable) ---
  // Las reglas completas (por rol, estado, ventana, proceso) están en
  // worklog-eligibility.service.spec.ts; aquí se comprueba el cableado del service.

  describe('addActivity · referencias', () => {
    const PROJECT = '11111111-1111-1111-1111-111111111111';
    const TASK = '33333333-3333-3333-3333-333333333333';
    beforeEach(() => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(dailyLogRow());
      (m.prismaObj.dailyLogActivity as any).create.mockImplementation(
        ({ data }: any) => Promise.resolve(activityRow(data)),
      );
    });

    it('proyecto fuera de alcance -> 404 y no se guarda', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.addActivity(integrante(['p1']), 'dl1', {
          classificationCode: 'PLANIFICADA',
          projectRequestId: PROJECT,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect((m.prismaObj.dailyLogActivity as any).create).not.toHaveBeenCalled();
    });

    it('proyecto no elegible (REGISTRADA) -> 400 con el código visible', async () => {
      (m.prismaObj.request as any).findFirst
        .mockResolvedValueOnce({
          code: 'PRY-0001',
          operationalState: 'REGISTRADA',
          closedAt: null,
          plan: { id: 'pl1' },
          participants: [],
          mainProcessId: 'p1',
        })
        .mockResolvedValueOnce(null);
      await expect(
        m.service.addActivity(integrante(['p1']), 'dl1', {
          classificationCode: 'PLANIFICADA',
          projectRequestId: PROJECT,
        }),
      ).rejects.toThrow(/PRY-0001/);
    });

    it('solo tarea propia: el proyecto se deriva de la tarea (D8)', async () => {
      (m.prismaObj.task as any).findFirst.mockResolvedValue({
        code: 'PRY-0003-T01',
        responsibleUserId: 'ui',
        phase: { plan: { requestId: 'r3' } },
      });
      (m.prismaObj.request as any).findFirst.mockResolvedValue({
        code: 'PRY-0003',
        operationalState: 'EN_EJECUCION',
        plan: { id: 'pl1' },
        participants: [],
      });
      await m.service.addActivity(integrante(['p1']), 'dl1', {
        classificationCode: 'PLANIFICADA',
        taskId: TASK,
      });
      const data = (m.prismaObj.dailyLogActivity as any).create.mock.calls[0][0]
        .data;
      expect(data.projectRequestId).toBe('r3');
      expect(data.taskId).toBe(TASK);
    });

    it('tarea ajena de un integrante -> 400', async () => {
      (m.prismaObj.task as any).findFirst.mockResolvedValue({
        code: 'PRY-0003-T02',
        responsibleUserId: 'otro',
        phase: { plan: { requestId: 'r3' } },
      });
      (m.prismaObj.request as any).findFirst.mockResolvedValue({
        code: 'PRY-0003',
        operationalState: 'EN_EJECUCION',
        plan: { id: 'pl1' },
        participants: [],
      });
      await expect(
        m.service.addActivity(integrante(['p1']), 'dl1', {
          classificationCode: 'PLANIFICADA',
          taskId: TASK,
        }),
      ).rejects.toThrow(/PRY-0003-T02/);
    });
  });
  // --- Separacion de conceptos (§2.4, BR-013/023) -------------------------

  describe('separacion de conceptos (BR-013/023)', () => {
    it('crear actividad con taskId NO invoca mutacion de Task (solo lectura de visibilidad)', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(dailyLogRow());
      (m.prismaObj.task as any).findFirst.mockResolvedValue({
        code: 'PRY-0001-T01',
        responsibleUserId: 'ui',
        phase: { plan: { requestId: 'r1' } },
      });
      (m.prismaObj.request as any).findFirst.mockResolvedValue({
        code: 'PRY-0001',
        operationalState: 'EN_EJECUCION',
        plan: { id: 'pl1' },
        participants: [],
      });
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
      expect(Object.keys(data).sort()).toEqual([
        'returnReason',
        'returnedAt',
        'returnedByUserId',
        'status',
        'submittedAt',
      ]);
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
      expect(Object.keys(data).sort()).toEqual([
        'returnReason',
        'returnedAt',
        'returnedByUserId',
        'status',
        'submittedAt',
      ]);
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

  // --- Listado paginado, filtros, resumen y bloqueo de edicion -------------
  describe('listDailyLogs · filtros y paginacion', () => {
    it('devuelve el sobre paginado con total y hasMore', async () => {
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([
        dailyLogRow({ author: { name: 'Ana' } }),
      ]);
      (m.prismaObj.dailyLog as any).count.mockResolvedValue(30);
      const res = await m.service.listDailyLogs(jefe(), { page: 1, pageSize: 10 });
      expect(res.total).toBe(30);
      expect(res.pageSize).toBe(10);
      expect(res.hasMore).toBe(true);
      expect(res.data[0].authorName).toBe('Ana');
      const args = (m.prismaObj.dailyLog as any).findMany.mock.calls[0][0];
      expect(args.skip).toBe(0);
      expect(args.take).toBe(10);
    });

    it('acota el tamano de pagina a 100', async () => {
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);
      (m.prismaObj.dailyLog as any).count.mockResolvedValue(0);
      const res = await m.service.listDailyLogs(jefe(), { pageSize: 500 });
      expect(res.pageSize).toBe(100);
    });

    it('aplica rango de fechas, estado, clasificacion y texto SIN ampliar el alcance', async () => {
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);
      (m.prismaObj.dailyLog as any).count.mockResolvedValue(0);
      await m.service.listDailyLogs(integrante(['p1']), {
        from: '2025-03-03',
        to: '2025-03-09',
        status: 'ENVIADO',
        classificationCode: 'SOPORTE',
        q: 'tablero',
      });
      const and = (m.prismaObj.dailyLog as any).findMany.mock.calls[0][0].where.AND;
      expect(and).toContainEqual({ authorUserId: 'ui' }); // el alcance sigue
      expect(and).toContainEqual({ status: 'ENVIADO' });
      expect(and).toContainEqual({
        date: {
          gte: new Date(Date.UTC(2025, 2, 3)),
          lte: new Date(Date.UTC(2025, 2, 9)),
        },
      });
      expect(and).toContainEqual({
        activities: { some: { classificationCode: 'SOPORTE' } },
      });
      expect(and.some((c: any) => Array.isArray(c.OR))).toBe(true);
    });

    it('ordena ascendente cuando se pide date_asc', async () => {
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);
      (m.prismaObj.dailyLog as any).count.mockResolvedValue(0);
      await m.service.listDailyLogs(jefe(), { sort: 'date_asc' });
      const args = (m.prismaObj.dailyLog as any).findMany.mock.calls[0][0];
      expect(args.orderBy[0]).toEqual({ date: 'asc' });
    });
  });

  describe('summarizeDailyLogs', () => {
    it('totaliza estados, horas, clasificacion y persona', async () => {
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([
        {
          authorUserId: 'u1',
          status: 'ENVIADO',
          author: { name: 'Ana' },
          activities: [
            { classificationCode: 'INTERNA', hours: 2 },
            { classificationCode: 'SOPORTE', hours: 3 },
          ],
        },
        {
          authorUserId: 'u1',
          status: 'BORRADOR',
          author: { name: 'Ana' },
          activities: [{ classificationCode: 'INTERNA', hours: 1 }],
        },
        {
          authorUserId: 'u2',
          status: 'REVISADO',
          author: { name: 'Beto' },
          activities: [],
        },
      ]);
      const res = await m.service.summarizeDailyLogs(jefe(), {});
      expect(res).toMatchObject({
        total: 3,
        draftCount: 1,
        sentCount: 1,
        reviewedCount: 1,
        activityCount: 3,
        totalHours: 6,
      });
      expect(res.byClassification).toEqual([
        { classificationCode: 'INTERNA', activityCount: 2, hours: 3 },
        { classificationCode: 'SOPORTE', activityCount: 1, hours: 3 },
      ]);
      expect(res.byPerson[0]).toEqual({
        userId: 'u1',
        name: 'Ana',
        logCount: 2,
        hours: 6,
        pendingReviewCount: 1,
      });
    });
  });

  describe('un diario enviado queda de solo lectura (409)', () => {
    beforeEach(() => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(
        dailyLogRow({ status: 'ENVIADO' }),
      );
    });

    it('no permite agregar actividades', async () => {
      await expect(
        m.service.addActivity(integrante(['p1']), 'dl1', {
          classificationCode: 'INTERNA',
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('no permite editar las notas ni eliminar el diario', async () => {
      await expect(
        m.service.updateDailyLog(integrante(['p1']), 'dl1', { dayNotes: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        m.service.removeDailyLog(integrante(['p1']), 'dl1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((m.prismaObj.dailyLog as any).update).not.toHaveBeenCalled();
      expect((m.prismaObj.dailyLog as any).delete).not.toHaveBeenCalled();
    });

    it('no permite editar ni borrar actividades', async () => {
      (m.prismaObj.dailyLogActivity as any).findFirst.mockResolvedValue(activityRow());
      await expect(
        m.service.updateActivity(integrante(['p1']), 'a1', { hours: 2 }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        m.service.removeActivity(integrante(['p1']), 'a1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('un semanal enviado tampoco se edita', async () => {
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(
        weeklyRow({ status: 'ENVIADO' }),
      );
      await expect(
        m.service.updateWeeklyReport(integrante(['p1']), 'wr1', { results: 'x' }),
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

    it('error no-P2002 se re-lanza tal cual', async () => {
      const boom = new Error('db down');
      (m.prismaObj.dailyLog as any).create.mockRejectedValue(boom);
      await expect(
        m.service.createDailyLog(integrante(['p1']), {
          processId: 'p1',
          date: '2025-03-10',
        }),
      ).rejects.toBe(boom);
    });
  });

  // --- addActivity: clasificacion invalida y campos opcionales -----------

  describe('addActivity · casos adicionales', () => {
    beforeEach(() => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(dailyLogRow());
      (m.prismaObj.dailyLogActivity as any).create.mockImplementation(
        ({ data }: any) => Promise.resolve(activityRow(data)),
      );
    });

    it('clasificacion desconocida -> 400 (default)', async () => {
      await expect(
        m.service.addActivity(integrante(['p1']), 'dl1', {
          classificationCode: 'NO_EXISTE' as any,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('crea con todos los campos opcionales (incluye nextStepDate)', async () => {
      const res = await m.service.addActivity(integrante(['p1']), 'dl1', {
        classificationCode: 'INTERNA',
        hours: 4,
        description: 'desc',
        result: 'res',
        activityStatus: 'EN_CURSO',
        evidenceUrl: 'http://x',
        nextStep: 'seguir',
        nextStepDate: '2025-03-15',
      });
      expect(res.hours).toBe(4);
      expect(res.nextStepDate).toBe('2025-03-15');
      expect(res.evidenceUrl).toBe('http://x');
    });

    it('diario padre fuera de alcance -> 404', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.addActivity(integrante(['p1']), 'ajeno', {
          classificationCode: 'INTERNA',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // --- updateDailyLog / removeDailyLog -----------------------------------

  describe('updateDailyLog', () => {
    it('actualiza dayNotes y recarga con actividades', async () => {
      (m.prismaObj.dailyLog as any).findFirst
        .mockResolvedValueOnce(dailyLogRow())
        .mockResolvedValueOnce(dailyLogRow({ dayNotes: 'nuevas notas' }));
      (m.prismaObj.dailyLog as any).update.mockResolvedValue(
        dailyLogRow({ dayNotes: 'nuevas notas' }),
      );
      const res = await m.service.updateDailyLog(integrante(['p1']), 'dl1', {
        dayNotes: 'nuevas notas',
      });
      expect(res.dayNotes).toBe('nuevas notas');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'DAILY_LOG',
      });
    });

    it(':id fuera de alcance -> 404', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.updateDailyLog(integrante(['p1']), 'ajeno', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeDailyLog', () => {
    it('elimina y audita DELETE con after null', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(dailyLogRow());
      (m.prismaObj.dailyLog as any).delete.mockResolvedValue(dailyLogRow());
      await m.service.removeDailyLog(integrante(['p1']), 'dl1');
      expect((m.prismaObj.dailyLog as any).delete).toHaveBeenCalledWith({
        where: { id: 'dl1' },
      });
      expect(m.auditRecord.mock.calls[0][1].after).toBeNull();
    });

    it(':id fuera de alcance -> 404', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.removeDailyLog(integrante(['p1']), 'ajeno'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // --- updateActivity / removeActivity -----------------------------------

  describe('updateActivity', () => {
    it('revalida clasificacion con merge y actualiza campos', async () => {
      (m.prismaObj.dailyLogActivity as any).findFirst.mockResolvedValue(
        activityRow({ classificationCode: 'INTERNA' }),
      );
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(dailyLogRow());
      (m.prismaObj.dailyLogActivity as any).update.mockImplementation(
        ({ data }: any) =>
          Promise.resolve(activityRow({ classificationCode: 'INTERNA', ...data })),
      );
      const res = await m.service.updateActivity(integrante(['p1']), 'a1', {
        description: 'editada',
        hours: 2,
      });
      expect(res.description).toBe('editada');
      expect(res.hours).toBe(2);
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'DAILY_LOG_ACTIVITY',
      });
    });

    it('cambiar a PLANIFICADA sin proyecto/tarea (merge) -> 400', async () => {
      (m.prismaObj.dailyLogActivity as any).findFirst.mockResolvedValue(
        activityRow({ classificationCode: 'INTERNA' }),
      );
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(dailyLogRow());
      await expect(
        m.service.updateActivity(integrante(['p1']), 'a1', {
          classificationCode: 'PLANIFICADA',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('actividad inexistente -> 404', async () => {
      (m.prismaObj.dailyLogActivity as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.updateActivity(integrante(['p1']), 'ajena', { hours: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('diario padre de la actividad fuera de alcance -> 404', async () => {
      (m.prismaObj.dailyLogActivity as any).findFirst.mockResolvedValue(
        activityRow(),
      );
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.updateActivity(integrante(['p1']), 'a1', { hours: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeActivity', () => {
    it('elimina y audita DELETE DAILY_LOG_ACTIVITY', async () => {
      (m.prismaObj.dailyLogActivity as any).findFirst.mockResolvedValue(
        activityRow(),
      );
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(dailyLogRow());
      (m.prismaObj.dailyLogActivity as any).delete.mockResolvedValue(
        activityRow(),
      );
      await m.service.removeActivity(integrante(['p1']), 'a1');
      expect((m.prismaObj.dailyLogActivity as any).delete).toHaveBeenCalledWith({
        where: { id: 'a1' },
      });
      expect(m.auditRecord.mock.calls[0][1].after).toBeNull();
    });

    it('actividad inexistente -> 404', async () => {
      (m.prismaObj.dailyLogActivity as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.removeActivity(integrante(['p1']), 'ajena'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // --- Semanales: list / get / create / update / submit -------------------

  describe('weeklyReports CRUD', () => {
    it('listWeeklyReports aplica filtros weekStart/processId y omite consolidacion', async () => {
      (m.prismaObj.weeklyReport as any).findMany.mockResolvedValue([weeklyRow()]);
      const res = await m.service.listWeeklyReports(integrante(['p1']), {
        weekStart: '2025-03-12',
        processId: 'p1',
      } as any);
      expect(res[0].consolidation).toBeNull();
      const and = (m.prismaObj.weeklyReport as any).findMany.mock.calls[0][0]
        .where.AND;
      expect(and).toContainEqual({ processId: 'p1' });
      // weekStart normalizado a lunes.
      const wsFilter = and.find((c: any) => c.weekStart);
      expect(wsFilter.weekStart.toISOString()).toBe('2025-03-10T00:00:00.000Z');
    });

    it('getWeeklyReport :id fuera de alcance -> 404', async () => {
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.getWeeklyReport(integrante(['p1']), 'ajeno'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('createWeeklyReport con todos los campos y consolidacion', async () => {
      (m.prismaObj.weeklyReport as any).create.mockImplementation(
        ({ data }: any) => Promise.resolve(weeklyRow(data)),
      );
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);
      const res = await m.service.createWeeklyReport(integrante(['p1']), {
        processId: 'p1',
        weekStart: '2025-03-10',
        results: 'r',
        proposals: 'p',
        blockers: 'b',
        commitmentsText: 'c',
        decisions: 'd',
      });
      expect(res.results).toBe('r');
      expect(res.consolidation).toMatchObject({ hasBacking: false });
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'CREATE',
        objectType: 'WEEKLY_REPORT',
      });
    });

    it('createWeeklyReport re-lanza error no-P2002', async () => {
      const boom = new Error('db down');
      (m.prismaObj.weeklyReport as any).create.mockRejectedValue(boom);
      await expect(
        m.service.createWeeklyReport(integrante(['p1']), {
          processId: 'p1',
          weekStart: '2025-03-10',
        }),
      ).rejects.toBe(boom);
    });

    it('updateWeeklyReport actualiza campos y audita UPDATE', async () => {
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(weeklyRow());
      (m.prismaObj.weeklyReport as any).update.mockImplementation(
        ({ data }: any) => Promise.resolve(weeklyRow(data)),
      );
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);
      const res = await m.service.updateWeeklyReport(integrante(['p1']), 'wr1', {
        results: 'actualizado',
        proposals: 'pp',
        blockers: 'bb',
        commitmentsText: 'cc',
        decisions: 'dd',
      });
      expect(res.results).toBe('actualizado');
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'WEEKLY_REPORT',
      });
    });

    it('updateWeeklyReport :id fuera de alcance -> 404', async () => {
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.updateWeeklyReport(integrante(['p1']), 'ajeno', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('submitWeeklyReport BORRADOR -> ENVIADO ok', async () => {
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(weeklyRow());
      (m.prismaObj.weeklyReport as any).update.mockResolvedValue(
        weeklyRow({ status: 'ENVIADO', submittedAt: now }),
      );
      (m.prismaObj.dailyLog as any).findMany.mockResolvedValue([]);
      const res = await m.service.submitWeeklyReport(integrante(['p1']), 'wr1');
      expect(res.status).toBe('ENVIADO');
    });

    it('submitWeeklyReport ya ENVIADO -> 409', async () => {
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(
        weeklyRow({ status: 'ENVIADO' }),
      );
      await expect(
        m.service.submitWeeklyReport(integrante(['p1']), 'wr1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('submitWeeklyReport :id fuera de alcance -> 404', async () => {
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.submitWeeklyReport(integrante(['p1']), 'ajeno'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // --- Revisión y devolución ----------------------------------------------

  describe('revisión y devolución de diarios', () => {
    const enviado = () =>
      dailyLogRow({ status: 'ENVIADO', submittedAt: now, authorUserId: 'ui' });

    it('el jefe marca como revisado un diario enviado', async () => {
      (m.prismaObj.dailyLog as any).findFirst
        .mockResolvedValueOnce(enviado())
        .mockResolvedValueOnce(
          dailyLogRow({ status: 'REVISADO', reviewedAt: now }),
        );
      (m.prismaObj.dailyLog as any).update.mockResolvedValue(
        dailyLogRow({ status: 'REVISADO' }),
      );
      const res = await m.service.reviewDailyLog(jefe(), 'dl1');
      expect(res.status).toBe('REVISADO');
      const data = (m.prismaObj.dailyLog as any).update.mock.calls[0][0].data;
      expect(data).toMatchObject({ status: 'REVISADO', reviewedByUserId: 'uj' });
      expect(m.notify).not.toHaveBeenCalled();
    });

    it('el autor no se revisa a sí mismo -> 403', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(enviado());
      await expect(
        m.service.reviewDailyLog(integrante(['p1']), 'dl1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un integrante ajeno al diario no puede revisar -> 404 por alcance', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.reviewDailyLog(integrante(['p1']), 'dl1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('un líder de otro proceso no revisa -> 403', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(enviado());
      await expect(
        m.service.reviewDailyLog(lider(['p9']), 'dl1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('revisar un borrador -> 409', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(dailyLogRow());
      await expect(
        m.service.reviewDailyLog(jefe(), 'dl1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('devolver guarda motivo, vuelve a borrador y avisa al autor', async () => {
      (m.prismaObj.dailyLog as any).findFirst
        .mockResolvedValueOnce(enviado())
        .mockResolvedValueOnce(
          dailyLogRow({
            status: 'BORRADOR',
            returnedAt: now,
            returnReason: 'Faltan las horas de soporte',
          }),
        );
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(null);
      (m.prismaObj.dailyLog as any).update.mockResolvedValue(dailyLogRow());
      const res = await m.service.returnDailyLog(lider(['p1']), 'dl1', {
        reason: 'Faltan las horas de soporte',
      });
      expect(res.returned).toBe(true);
      const data = (m.prismaObj.dailyLog as any).update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        status: 'BORRADOR',
        returnedByUserId: 'ul',
        returnReason: 'Faltan las horas de soporte',
        reviewedAt: null,
      });
      expect(m.notify.mock.calls[0][0]).toMatchObject({
        userIds: ['ui'],
        type: 'WORKLOG_RETURNED',
      });
    });

    it('no se devuelve un diario ya revisado -> 409', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(
        dailyLogRow({ status: 'REVISADO' }),
      );
      await expect(
        m.service.returnDailyLog(jefe(), 'dl1', { reason: 'x'.repeat(12) }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('no se devuelve si su semanal ya fue enviado -> 409', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(enviado());
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue({ id: 'w1' });
      await expect(
        m.service.returnDailyLog(jefe(), 'dl1', { reason: 'x'.repeat(12) }),
      ).rejects.toThrow('Primero devuelve el reporte semanal');
    });

    it('el autor retira su envío', async () => {
      (m.prismaObj.dailyLog as any).findFirst
        .mockResolvedValueOnce(enviado())
        .mockResolvedValueOnce(dailyLogRow());
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(null);
      (m.prismaObj.dailyLog as any).update.mockResolvedValue(dailyLogRow());
      const res = await m.service.recallDailyLog(integrante(['p1']), 'dl1');
      expect(res.status).toBe('BORRADOR');
    });

    it('el jefe ya no escribe diarios ajenos: el alcance de escritura es el autor', async () => {
      (m.prismaObj.dailyLog as any).findFirst.mockResolvedValue(null);
      await expect(
        m.service.submitDailyLog(jefe(), 'dl-de-otro'),
      ).rejects.toBeInstanceOf(NotFoundException);
      const where = (m.prismaObj.dailyLog as any).findFirst.mock.calls[0][0].where;
      expect(where.AND).toContainEqual({ authorUserId: 'uj' });
    });
  });

  describe('revisión de semanales', () => {
    const weekly = (status: string) => ({
      id: 'w1',
      authorUserId: 'ui',
      processId: 'p1',
      weekStart: new Date(Date.UTC(2025, 2, 10)),
      status,
    });

    it('devolver exige que esté enviado -> 409 si es borrador', async () => {
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(weekly('BORRADOR'));
      await expect(
        m.service.returnWeeklyReport(jefe(), 'w1', { reason: 'x'.repeat(12) }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('el autor no revisa su propio semanal -> 403', async () => {
      (m.prismaObj.weeklyReport as any).findFirst.mockResolvedValue(weekly('ENVIADO'));
      await expect(
        m.service.reviewWeeklyReport(integrante(['p1']), 'w1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

});
