import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { RecurringActivityService } from './recurring-activity.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { Recurrence } from './recurrence';
import { OccurrenceStatus } from './occurrence-status';
import { ResponsibleKind } from './responsible-kind';

/** Config determinista del motor para los tests. */
function withConfigEnv(): void {
  process.env.RECURRING_ACTIVITY_TIMEZONE = 'America/Lima';
  process.env.RECURRING_ACTIVITY_ANTICIPATION_DAYS = '14';
}

/* ------------------------------------------------------------------ mocks */

interface PrismaMock {
  process: { findMany: jest.Mock };
  grant: { findMany: jest.Mock };
  catalogItem: { findFirst: jest.Mock };
  recurringActivity: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  recurringActivityOccurrence: {
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
}

function createPrismaMock(): PrismaService & PrismaMock {
  const prisma: PrismaMock = {
    process: { findMany: jest.fn().mockResolvedValue([]) },
    grant: { findMany: jest.fn().mockResolvedValue([]) },
    catalogItem: { findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }) },
    recurringActivity: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    recurringActivityOccurrence: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    // $transaction: ejecuta el callback con el mismo cliente (tx = prisma) o
    // resuelve un arreglo de promesas (modo batch de findMany/count).
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => unknown)(prisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  return prisma as unknown as PrismaService & PrismaMock;
}

function createAuditMock(): AuditService & { record: jest.Mock } {
  return { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService & {
    record: jest.Mock;
  };
}

function createMailMock(): MailService & { sendRecurringActivityNotice: jest.Mock } {
  return {
    sendRecurringActivityNotice: jest.fn().mockResolvedValue(undefined),
  } as unknown as MailService & { sendRecurringActivityNotice: jest.Mock };
}

function actor(overrides: Partial<CurrentActor> = {}): CurrentActor {
  return {
    userId: 'actor-1',
    name: 'Actor',
    identifier: 'actor',
    grants: [],
    roleCodes: new Set<RoleCode>([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set<string>(),
    isJefeArea: false,
    isAdmin: false,
    ...overrides,
  };
}

function definition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act-1',
    title: 'Reporte a presidencia',
    description: null,
    activityType: 'REPORTE',
    cadence: Recurrence.MENSUAL as string,
    intervalCount: 1,
    startDate: new Date(Date.UTC(2024, 0, 10)),
    endDate: null as Date | null,
    anticipationDays: null as number | null,
    responsibleKind: ResponsibleKind.USER as string,
    responsibleUserId: 'actor-1',
    responsibleAreaId: null as string | null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function occurrence(overrides: Record<string, unknown> = {}) {
  return {
    id: 'occ-1',
    activityId: 'act-1',
    targetDate: new Date(Date.UTC(2024, 1, 10)),
    status: OccurrenceStatus.PENDIENTE as string,
    completedAt: null as Date | null,
    completedByUserId: null as string | null,
    completionComment: null as string | null,
    periodLabel: '2024-02',
    createdAt: new Date(),
    updatedAt: new Date(),
    activity: definition(),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ tests */

describe('RecurringActivityService (FEAT-002: API + autorizacion)', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let audit: ReturnType<typeof createAuditMock>;
  let service: RecurringActivityService;

  beforeEach(() => {
    withConfigEnv();
    prisma = createPrismaMock();
    audit = createAuditMock();
    service = new RecurringActivityService(prisma, audit, createMailMock());
  });

  describe('createActivity (validaciones + gestion por area)', () => {
    const jefe = () =>
      actor({
        roleCodes: new Set([RoleCode.JEFE_AREA]),
        scopedProcessIds: new Set(['proc-A']),
        isJefeArea: true,
      });

    it('409 si el responsable es incoherente (USER sin userId)', async () => {
      await expect(
        service.createActivity(actor({ isAdmin: true }), {
          title: 'X',
          activityType: 'REPORTE',
          cadence: Recurrence.MENSUAL,
          startDate: '2024-01-10',
          responsibleKind: ResponsibleKind.USER,
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('400 si el activityType no existe o esta inactivo en el catalogo', async () => {
      prisma.catalogItem.findFirst.mockResolvedValue(null);
      await expect(
        service.createActivity(actor({ isAdmin: true }), {
          title: 'X',
          activityType: 'DESCONOCIDO',
          cadence: Recurrence.MENSUAL,
          startDate: '2024-01-10',
          responsibleKind: ResponsibleKind.AREA,
          responsibleAreaId: 'area-1',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('JEFE_AREA fuera de su area -> 403', async () => {
      // El area objetivo (area-Z) no esta entre las del jefe (area-A).
      prisma.process.findMany.mockResolvedValue([{ areaId: 'area-A' }]);
      await expect(
        service.createActivity(jefe(), {
          title: 'X',
          activityType: 'REPORTE',
          cadence: Recurrence.MENSUAL,
          startDate: '2024-01-10',
          responsibleKind: ResponsibleKind.AREA,
          responsibleAreaId: 'area-Z',
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('JEFE_AREA en su area -> crea y audita', async () => {
      prisma.process.findMany.mockResolvedValue([{ areaId: 'area-A' }]);
      prisma.recurringActivity.create.mockResolvedValue(
        definition({
          responsibleKind: ResponsibleKind.AREA,
          responsibleUserId: null,
          responsibleAreaId: 'area-A',
        }),
      );
      const result = await service.createActivity(jefe(), {
        title: 'X',
        activityType: 'REPORTE',
        cadence: Recurrence.MENSUAL,
        startDate: '2024-01-10',
        responsibleKind: ResponsibleKind.AREA,
        responsibleAreaId: 'area-A',
      } as never);
      expect(result.responsibleAreaId).toBe('area-A');
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'CREATE', objectType: 'RECURRING_ACTIVITY' }),
      );
    });

    it('ADMIN no esta restringido por area', async () => {
      prisma.recurringActivity.create.mockResolvedValue(definition());
      await expect(
        service.createActivity(actor({ isAdmin: true }), {
          title: 'X',
          activityType: 'REPORTE',
          cadence: Recurrence.MENSUAL,
          startDate: '2024-01-10',
          responsibleKind: ResponsibleKind.USER,
          responsibleUserId: 'actor-1',
        } as never),
      ).resolves.toMatchObject({ id: 'act-1' });
      // No consulta areas del actor: ADMIN pasa directo.
      expect(prisma.process.findMany).not.toHaveBeenCalled();
    });

    it('409 si endDate es anterior a startDate', async () => {
      await expect(
        service.createActivity(actor({ isAdmin: true }), {
          title: 'X',
          activityType: 'REPORTE',
          cadence: Recurrence.MENSUAL,
          startDate: '2024-06-10',
          endDate: '2024-01-10',
          responsibleKind: ResponsibleKind.USER,
          responsibleUserId: 'actor-1',
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('removeActivity (soft-delete)', () => {
    it('pausa (active=false) sin borrar la fila', async () => {
      prisma.recurringActivity.findUnique.mockResolvedValue(definition({ active: true }));
      prisma.recurringActivity.update.mockResolvedValue(definition({ active: false }));
      await service.removeActivity(actor({ isAdmin: true }), 'act-1');
      expect(prisma.recurringActivity.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: false } }),
      );
    });

    it('404 cuando la definicion no existe', async () => {
      prisma.recurringActivity.findUnique.mockResolvedValue(null);
      await expect(
        service.removeActivity(actor({ isAdmin: true }), 'nope'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findOccurrences (alcance mine/all)', () => {
    it('scope=all para un integrante -> 403', async () => {
      await expect(
        service.findOccurrences(actor(), { scope: 'all' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('scope=mine filtra por responsable USER=actor o AREA de su area', async () => {
      prisma.process.findMany.mockResolvedValue([{ areaId: 'area-A' }]);
      await service.findOccurrences(
        actor({ scopedProcessIds: new Set(['proc-A']) }),
        {} as never,
      );
      const where = prisma.recurringActivityOccurrence.findMany.mock.calls[0][0].where;
      const scope = where.activity.AND[0];
      expect(scope.OR).toEqual([
        { responsibleKind: ResponsibleKind.USER, responsibleUserId: 'actor-1' },
        { responsibleKind: ResponsibleKind.AREA, responsibleAreaId: { in: ['area-A'] } },
      ]);
    });

    it('LIDER_PROCESO con grant ve sus ocurrencias con scope=mine (sin 403) y deriva el area del proceso', async () => {
      // Regresion del bug "que me toca": un LIDER_PROCESO (sin JEFE_AREA ni
      // ADMIN) con grant activo en un proceso debe poder consultar scope=mine.
      // La pertenencia al area se deriva del grant por proceso (Process.areaId),
      // no de un vinculo directo usuario-area.
      prisma.process.findMany.mockResolvedValue([{ areaId: 'area-FIBI' }]);
      const lider = actor({
        userId: 'lider-1',
        roleCodes: new Set([RoleCode.LIDER_PROCESO]),
        scopedProcessIds: new Set(['proc-FIBI']),
      });
      await expect(
        service.findOccurrences(lider, {} as never),
      ).resolves.toBeDefined();
      // Solo se consultan los procesos del propio actor para derivar su area.
      expect(prisma.process.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['proc-FIBI'] } } }),
      );
      const where = prisma.recurringActivityOccurrence.findMany.mock.calls[0][0].where;
      expect(where.activity.AND[0].OR).toEqual([
        { responsibleKind: ResponsibleKind.USER, responsibleUserId: 'lider-1' },
        { responsibleKind: ResponsibleKind.AREA, responsibleAreaId: { in: ['area-FIBI'] } },
      ]);
    });

    it('scope=all para un LIDER_PROCESO sigue siendo 403 (solo jefe/admin)', async () => {
      const lider = actor({
        userId: 'lider-1',
        roleCodes: new Set([RoleCode.LIDER_PROCESO]),
        scopedProcessIds: new Set(['proc-FIBI']),
      });
      await expect(
        service.findOccurrences(lider, { scope: 'all' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('scope=all para ADMIN no acota por area', async () => {
      await service.findOccurrences(
        actor({ isAdmin: true }),
        { scope: 'all' } as never,
      );
      const where = prisma.recurringActivityOccurrence.findMany.mock.calls[0][0].where;
      expect(where.activity.AND[0]).toEqual({});
    });

    it('pageSize se acota a 100', async () => {
      await service.findOccurrences(actor(), { pageSize: 500 } as never);
      const call = prisma.recurringActivityOccurrence.findMany.mock.calls[0][0];
      expect(call.take).toBe(100);
    });
  });

  describe('completeOccurrence / startOccurrence (transiciones + alcance)', () => {
    it('PENDIENTE -> EN_CURSO (start) actualiza y audita', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(occurrence());
      prisma.recurringActivityOccurrence.update.mockResolvedValue(
        occurrence({ status: OccurrenceStatus.EN_CURSO }),
      );
      const result = await service.startOccurrence(actor(), 'occ-1');
      expect(result.status).toBe(OccurrenceStatus.EN_CURSO);
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ objectType: 'RECURRING_ACTIVITY_OCCURRENCE' }),
      );
    });

    it('COMPLETADA -> EN_CURSO no se permite (409)', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(
        occurrence({ status: OccurrenceStatus.COMPLETADA }),
      );
      await expect(
        service.startOccurrence(actor(), 'occ-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('VENCIDA -> COMPLETADA se permite (cierre tardio), con comentario opcional', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(
        occurrence({ status: OccurrenceStatus.VENCIDA }),
      );
      prisma.recurringActivityOccurrence.update.mockResolvedValue(
        occurrence({ status: OccurrenceStatus.COMPLETADA }),
      );
      const result = await service.completeOccurrence(actor(), 'occ-1', {});
      expect(result.status).toBe(OccurrenceStatus.COMPLETADA);
      const data = prisma.recurringActivityOccurrence.update.mock.calls[0][0].data;
      expect(data.completionComment).toBeNull();
      expect(data.completedBy).toEqual({ connect: { id: 'actor-1' } });
    });

    it('ocurrencia ajena (otro usuario, otra area) -> 404', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(
        occurrence({
          activity: definition({
            responsibleKind: ResponsibleKind.USER,
            responsibleUserId: 'otro',
          }),
        }),
      );
      await expect(
        service.completeOccurrence(actor(), 'occ-1', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 cuando la ocurrencia no existe', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(null);
      await expect(
        service.findOccurrence(actor(), 'nope'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
