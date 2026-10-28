import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RecurringActivityService } from './recurring-activity.service';
import { OccurrenceStatus } from './occurrence-status';
import { Recurrence } from './recurrence';

/** Audit mockeado: el motor (generacion/vencidas) no audita, pero el service lo requiere en el constructor. */
function createAuditMock(): AuditService {
  return { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
}

/** Define las variables de entorno del motor para un test determinista. */
function withConfigEnv(): void {
  process.env.RECURRING_ACTIVITY_TIMEZONE = 'America/Lima';
  process.env.RECURRING_ACTIVITY_ANTICIPATION_DAYS = '14';
}

interface PrismaMock {
  recurringActivity: { findMany: jest.Mock };
  recurringActivityOccurrence: {
    createMany: jest.Mock;
    updateMany: jest.Mock;
  };
}

function createPrismaMock(): PrismaService & PrismaMock {
  const prisma: PrismaMock = {
    recurringActivity: { findMany: jest.fn() },
    recurringActivityOccurrence: {
      createMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  return prisma as unknown as PrismaService & PrismaMock;
}

/** Definicion mensual de ejemplo (dia 10), responsable persona. */
function monthlyActivity() {
  return {
    id: 'act-1',
    title: 'Reporte a presidencia',
    description: null,
    activityType: 'REPORTE',
    cadence: Recurrence.MENSUAL as string,
    intervalCount: 1,
    startDate: new Date(Date.UTC(2024, 0, 10)),
    endDate: null as Date | null,
    anticipationDays: 40,
    responsibleKind: 'USER',
    responsibleUserId: 'u1',
    responsibleAreaId: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('RecurringActivityService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: RecurringActivityService;

  beforeEach(() => {
    withConfigEnv();
    prisma = createPrismaMock();
    service = new RecurringActivityService(prisma, createAuditMock());
  });

  describe('generateDueOccurrences (idempotencia por createMany skipDuplicates)', () => {
    it('inserta con skipDuplicates sobre (activityId, targetDate) y cuenta solo las creadas', async () => {
      prisma.recurringActivity.findMany.mockResolvedValue([monthlyActivity()]);
      prisma.recurringActivityOccurrence.createMany.mockResolvedValue({ count: 2 });

      const now = new Date('2024-02-15T12:00:00Z');
      const result = await service.generateDueOccurrences(now);

      expect(result.activitiesProcessed).toBe(1);
      expect(result.occurrencesCreated).toBe(2);

      const call = prisma.recurringActivityOccurrence.createMany.mock.calls[0][0];
      expect(call.skipDuplicates).toBe(true);
      for (const row of call.data) {
        expect(row.activityId).toBe('act-1');
        expect(row.status).toBe(OccurrenceStatus.PENDIENTE);
        expect(row.targetDate).toBeInstanceOf(Date);
        expect(typeof row.periodLabel).toBe('string');
      }
    });

    it('correr dos veces no duplica: la 2a pasada reporta 0 creadas (skipDuplicates las salta)', async () => {
      prisma.recurringActivity.findMany.mockResolvedValue([monthlyActivity()]);
      // 1a pasada crea las filas; 2a pasada las encuentra existentes (count 0).
      prisma.recurringActivityOccurrence.createMany
        .mockResolvedValueOnce({ count: 3 })
        .mockResolvedValueOnce({ count: 0 });

      const now = new Date('2024-02-15T12:00:00Z');
      const first = await service.generateDueOccurrences(now);
      const second = await service.generateDueOccurrences(now);

      expect(first.occurrencesCreated).toBe(3);
      expect(second.occurrencesCreated).toBe(0);
      // Ambas pasadas usan skipDuplicates sobre el mismo conjunto de fechas.
      const firstData =
        prisma.recurringActivityOccurrence.createMany.mock.calls[0][0].data;
      const secondData =
        prisma.recurringActivityOccurrence.createMany.mock.calls[1][0].data;
      expect(secondData.map((r: { targetDate: Date }) => r.targetDate.toISOString())).toEqual(
        firstData.map((r: { targetDate: Date }) => r.targetDate.toISOString()),
      );
    });

    it('omite definiciones con cadencia desconocida sin insertar', async () => {
      prisma.recurringActivity.findMany.mockResolvedValue([
        { ...monthlyActivity(), cadence: 'DIARIA' },
      ]);

      const result = await service.generateDueOccurrences(
        new Date('2024-02-15T12:00:00Z'),
      );

      expect(result.occurrencesCreated).toBe(0);
      expect(prisma.recurringActivityOccurrence.createMany).not.toHaveBeenCalled();
    });
  });

  describe('markOverdueOccurrences (idempotente por estado)', () => {
    it('solo afecta PENDIENTE/EN_CURSO con targetDate < hoy', async () => {
      prisma.recurringActivityOccurrence.updateMany.mockResolvedValue({ count: 4 });

      const now = new Date('2024-02-15T12:00:00Z');
      const result = await service.markOverdueOccurrences(now);

      expect(result.occurrencesMarkedOverdue).toBe(4);
      const where = prisma.recurringActivityOccurrence.updateMany.mock.calls[0][0].where;
      expect(where.status).toEqual({
        in: [OccurrenceStatus.PENDIENTE, OccurrenceStatus.EN_CURSO],
      });
      expect(where.targetDate.lt).toBeInstanceOf(Date);
      const data = prisma.recurringActivityOccurrence.updateMany.mock.calls[0][0].data;
      expect(data.status).toBe(OccurrenceStatus.VENCIDA);
    });

    it('segunda pasada no reafecta filas ya vencidas (count 0)', async () => {
      prisma.recurringActivityOccurrence.updateMany
        .mockResolvedValueOnce({ count: 4 })
        .mockResolvedValueOnce({ count: 0 });

      const now = new Date('2024-02-15T12:00:00Z');
      const first = await service.markOverdueOccurrences(now);
      const second = await service.markOverdueOccurrences(now);

      expect(first.occurrencesMarkedOverdue).toBe(4);
      expect(second.occurrencesMarkedOverdue).toBe(0);
    });
  });
});
