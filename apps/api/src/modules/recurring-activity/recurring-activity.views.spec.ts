import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { NotificationService } from '../notification/notification.service';
import { StorageService } from '../storage/storage.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { RecurringActivityService } from './recurring-activity.service';
import { OccurrenceEvidenceService } from './occurrence-evidence.service';
import { Recurrence, toLocalDate, toUtcDate } from './recurrence';
import { OccurrenceStatus } from './occurrence-status';
import { ResponsibleKind } from './responsible-kind';

/**
 * FEAT-002: adjuntos de ocurrencia (con exigencia requiresEvidence), vistas de
 * lectura (tablero, calendario, mi trabajo, vista previa) y avisos internos
 * idempotentes. Prisma y S3 van mockeados como en las demas specs del modulo.
 */

const TZ = 'America/Lima';

function todayUtc(): Date {
  return toUtcDate(toLocalDate(new Date(), TZ));
}
function inDays(days: number): Date {
  const d = todayUtc();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function createPrismaMock() {
  const prisma = {
    process: { findMany: jest.fn().mockResolvedValue([]) },
    grant: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'actor-1',
        identifier: 'actor@example.com',
        name: 'Actor',
      }),
    },
    recurringActivityOccurrence: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    recurringOccurrenceEvidence: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma;
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

function actor(overrides: Partial<CurrentActor> = {}): CurrentActor {
  return {
    userId: 'actor-1',
    name: 'Actor',
    identifier: 'actor',
    grants: [],
    roleCodes: new Set<RoleCode>([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set<string>(),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
    ...overrides,
  };
}

function definition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act-1',
    title: 'Reporte semanal',
    description: null,
    activityType: 'REPORTE',
    cadence: Recurrence.SEMANAL as string,
    intervalCount: 1,
    startDate: todayUtc(),
    endDate: null as Date | null,
    anticipationDays: null as number | null,
    responsibleKind: ResponsibleKind.USER as string,
    responsibleUserId: 'actor-1',
    responsibleAreaId: null as string | null,
    active: true,
    estimatedHours: 2,
    prepDays: 2,
    requiresEvidence: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    responsibleUser: { name: 'Actor' },
    responsibleArea: null,
    ...overrides,
  };
}

function occurrence(overrides: Record<string, unknown> = {}) {
  return {
    id: 'occ-1',
    activityId: 'act-1',
    targetDate: inDays(1),
    status: OccurrenceStatus.PENDIENTE as string,
    completedAt: null as Date | null,
    completedByUserId: null as string | null,
    completionComment: null as string | null,
    estimatedHours: 2,
    actualHours: null as number | null,
    startedAt: null as Date | null,
    startedByUserId: null as string | null,
    cancelledAt: null as Date | null,
    cancelReason: null as string | null,
    periodLabel: null as string | null,
    windowNotifiedAt: null as Date | null,
    dueNotifiedAt: null as Date | null,
    overdueNotifiedAt: null as Date | null,
    createdAt: new Date(),
    updatedAt: new Date(),
    activity: definition(),
    startedBy: null,
    completedBy: null,
    _count: { evidence: 0 },
    ...overrides,
  };
}

function file(overrides: Record<string, unknown> = {}) {
  return {
    originalname: 'reporte.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('x'),
    ...overrides,
  };
}

describe('FEAT-002: adjuntos, vistas y avisos de actividades recurrentes', () => {
  let prisma: PrismaMock;
  let notify: jest.Mock;
  let storage: { put: jest.Mock; remove: jest.Mock; presignDownload: jest.Mock };
  let service: RecurringActivityService;
  let evidence: OccurrenceEvidenceService;

  beforeEach(() => {
    process.env.RECURRING_ACTIVITY_TIMEZONE = TZ;
    process.env.RECURRING_ACTIVITY_ANTICIPATION_DAYS = '14';
    delete process.env.EVIDENCE_MAX_BYTES;
    prisma = createPrismaMock();
    notify = jest.fn().mockResolvedValue(undefined);
    storage = {
      put: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      presignDownload: jest
        .fn()
        .mockResolvedValue({ url: 'https://s3/x', expiresInSeconds: 300 }),
    };
    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    service = new RecurringActivityService(
      prisma as unknown as PrismaService,
      audit,
      { sendRecurringActivityNotice: jest.fn() } as unknown as MailService,
      { notify } as unknown as NotificationService,
    );
    evidence = new OccurrenceEvidenceService(
      prisma as unknown as PrismaService,
      audit,
      storage as unknown as StorageService,
      service,
    );
  });

  describe('adjuntos de ocurrencia', () => {
    it('sube un PDF a una ocurrencia abierta con clave actividades-recurrentes/...', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(occurrence());
      prisma.recurringOccurrenceEvidence.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          createdAt: new Date(),
          uploadedBy: { name: 'Actor' },
        }),
      );

      const res = await evidence.upload(actor(), 'occ-1', file());

      expect(res.fileName).toBe('reporte.pdf');
      const key = storage.put.mock.calls[0][0] as string;
      expect(key).toMatch(/^actividades-recurrentes\/act-1\/occ-1\/[0-9a-f-]+-reporte\.pdf$/);
    });

    it('rechaza tipo no permitido y archivo muy grande con 400', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(occurrence());
      await expect(
        evidence.upload(actor(), 'occ-1', file({ originalname: 'x.exe', mimetype: 'application/x-msdownload' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        evidence.upload(actor(), 'occ-1', file({ size: 9 * 1024 * 1024 })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('409 si la ocurrencia esta programada, completada o cancelada', async () => {
      for (const row of [
        occurrence({ targetDate: inDays(10) }),
        occurrence({ status: OccurrenceStatus.COMPLETADA, completedAt: new Date() }),
        occurrence({ status: OccurrenceStatus.CANCELADA }),
      ]) {
        prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(row);
        await expect(evidence.upload(actor(), 'occ-1', file())).rejects.toBeInstanceOf(
          ConflictException,
        );
      }
    });

    it('404 si la ocurrencia esta fuera de alcance', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(
        occurrence({ activity: definition({ responsibleUserId: 'otro' }) }),
      );
      await expect(evidence.list(actor(), 'occ-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('borra el objeto de S3 si falla el registro en BD', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(occurrence());
      prisma.recurringOccurrenceEvidence.create.mockRejectedValue(new Error('db'));
      await expect(evidence.upload(actor(), 'occ-1', file())).rejects.toThrow('db');
      expect(storage.remove).toHaveBeenCalledWith(storage.put.mock.calls[0][0]);
    });
  });

  describe('completar con requiresEvidence', () => {
    const dto = { comment: 'Enviado a gerencia', actualHours: 1.5 };

    it('sin adjuntos -> 409', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(
        occurrence({ activity: definition({ requiresEvidence: true }) }),
      );
      prisma.recurringOccurrenceEvidence.count.mockResolvedValue(0);
      await expect(service.completeOccurrence(actor(), 'occ-1', dto)).rejects.toThrow(
        'Esta actividad exige al menos un adjunto antes de completarla.',
      );
      expect(prisma.recurringActivityOccurrence.update).not.toHaveBeenCalled();
    });

    it('con un adjunto -> completa', async () => {
      const row = occurrence({ activity: definition({ requiresEvidence: true }) });
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(row);
      prisma.recurringOccurrenceEvidence.count.mockResolvedValue(1);
      prisma.recurringActivityOccurrence.update.mockResolvedValue({
        ...row,
        status: OccurrenceStatus.COMPLETADA,
        completedAt: new Date(),
        completedByUserId: 'actor-1',
        _count: { evidence: 1 },
      });
      const res = await service.completeOccurrence(actor(), 'occ-1', dto);
      expect(res.status).toBe(OccurrenceStatus.COMPLETADA);
      expect(res.evidenceCount).toBe(1);
    });
  });

  describe('tablero', () => {
    it('agrupa en vencidas, esta semana, proximas y completadas y calcula la semana ISO', async () => {
      const today = todayUtc();
      const dow = (today.getUTCDay() + 6) % 7; // lunes=0
      const weekEnd = inDays(6 - dow);
      prisma.recurringActivityOccurrence.findMany.mockResolvedValue([
        occurrence({ id: 'v', targetDate: inDays(-1) }),
        occurrence({ id: 'w', targetDate: weekEnd, activity: definition({ prepDays: 7 }) }),
        occurrence({ id: 'u', targetDate: inDays(9), activity: definition({ prepDays: 30 }) }),
        occurrence({ id: 'p', targetDate: inDays(30), activity: definition({ prepDays: 2 }) }),
        occurrence({
          id: 'c',
          targetDate: inDays(-3),
          status: OccurrenceStatus.COMPLETADA,
          completedAt: new Date(),
        }),
      ]);

      const board = await service.getBoard(actor(), {});

      expect(board.week.startDate.getTime()).toBe(inDays(-dow).getTime());
      expect(board.week.endDate.getTime()).toBe(weekEnd.getTime());
      expect(board.week.number).toBeGreaterThanOrEqual(1);
      expect(board.week.number).toBeLessThanOrEqual(53);
      expect(board.overdue.map((o) => o.id)).toEqual(['v']);
      expect(board.thisWeek.map((o) => o.id)).toEqual(['w']);
      // Las programadas (ventana aun cerrada) tambien son proximas.
      expect(board.upcoming.map((o) => o.id)).toEqual(['u', 'p']);
      expect(board.completed.map((o) => o.id)).toEqual(['c']);
      expect(board.counts).toEqual({
        overdue: 1,
        dueToday: weekEnd.getTime() === today.getTime() ? 1 : 0,
        thisWeek: 1,
      });
      expect(board.plannedHoursThisWeek).toBe(2);
    });

    it('la semana ISO de un dia conocido (2026-11-18 -> 2026-W47)', async () => {
      const board = await service.getBoard(actor(), {}, new Date('2026-11-18T15:00:00Z'));
      expect(board.week.isoYear).toBe(2026);
      expect(board.week.number).toBe(47);
      expect(board.week.startDate.toISOString().slice(0, 10)).toBe('2026-11-16');
      expect(board.week.endDate.toISOString().slice(0, 10)).toBe('2026-11-22');
    });
  });

  describe('mi trabajo', () => {
    it('incluye solo ventana abierta, vence hoy, en curso y vencidas, en ese orden', async () => {
      prisma.recurringActivityOccurrence.findMany.mockResolvedValue([
        occurrence({ id: 'prog', targetDate: inDays(10) }),
        occurrence({ id: 'pend', targetDate: inDays(2) }),
        occurrence({ id: 'curso', targetDate: inDays(3), status: OccurrenceStatus.EN_CURSO }),
        occurrence({ id: 'hoy', targetDate: inDays(0) }),
        occurrence({ id: 'venc', targetDate: inDays(-2), status: OccurrenceStatus.VENCIDA }),
      ]);

      const res = await service.getMyWork(actor());

      expect(res.items.map((o) => o.id)).toEqual(['venc', 'hoy', 'curso', 'pend']);
      expect(res.total).toBe(4);
      const where = prisma.recurringActivityOccurrence.findMany.mock.calls[0][0].where;
      expect(where.status.in).not.toContain(OccurrenceStatus.COMPLETADA);
      expect(where.status.in).not.toContain(OccurrenceStatus.CANCELADA);
    });
  });

  describe('calendario', () => {
    it('rechaza rangos de mas de 62 dias y rangos invertidos', async () => {
      await expect(
        service.getCalendar(actor(), { from: '2026-01-01', to: '2026-03-15' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.getCalendar(actor(), { from: '2026-02-01', to: '2026-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('scope=all solo para jefe/admin', async () => {
      await expect(
        service.getCalendar(actor(), { from: '2026-01-01', to: '2026-01-31', scope: 'all' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('filtra por rango, excluye canceladas y limita a 500', async () => {
      await service.getCalendar(actor(), { from: '2026-01-01', to: '2026-01-31' });
      const args = prisma.recurringActivityOccurrence.findMany.mock.calls[0][0];
      expect(args.where.targetDate.gte.toISOString().slice(0, 10)).toBe('2026-01-01');
      expect(args.where.targetDate.lte.toISOString().slice(0, 10)).toBe('2026-01-31');
      expect(args.where.status).toEqual({ not: OccurrenceStatus.CANCELADA });
      expect(args.take).toBe(500);
    });
  });

  describe('vista previa', () => {
    it('devuelve 3 fechas desde hoy con su dia de apertura segun prepDays', () => {
      const start = inDays(1);
      const res = service.previewRecurrence({
        cadence: Recurrence.SEMANAL,
        startDate: start.toISOString(),
        prepDays: 3,
      });
      expect(res.dates).toHaveLength(3);
      res.dates.forEach((d, i) => {
        expect(d.targetDate.getTime()).toBe(start.getTime() + i * 7 * 86_400_000);
        expect(d.opensOn.getTime()).toBe(d.targetDate.getTime() - 3 * 86_400_000);
      });
    });
  });

  describe('avisos internos', () => {
    it('notifica ventana abierta y vence hoy una sola vez (segunda pasada no duplica)', async () => {
      const open = occurrence({ id: 'open', targetDate: inDays(1) });
      const closed = occurrence({ id: 'closed', targetDate: inDays(10) });
      const due = occurrence({ id: 'due', targetDate: inDays(0) });
      prisma.recurringActivityOccurrence.findMany
        .mockResolvedValueOnce([open, closed])
        .mockResolvedValueOnce([due]);
      prisma.recurringActivityOccurrence.updateMany.mockResolvedValue({ count: 1 });

      const first = await service.sendLifecycleNotices();
      expect(first).toEqual({ windowNotices: 1, dueNotices: 1 });
      expect(notify).toHaveBeenCalledTimes(2);
      expect(notify.mock.calls.map((c) => c[0].type)).toEqual([
        'RECURRING_WINDOW_OPEN',
        'RECURRING_DUE_TODAY',
      ]);
      expect(notify.mock.calls[0][0].userIds).toEqual(['actor-1']);

      // Segunda pasada: otra instancia ya reclamo la marca (count 0) -> no notifica.
      notify.mockClear();
      prisma.recurringActivityOccurrence.findMany
        .mockResolvedValueOnce([open])
        .mockResolvedValueOnce([due]);
      prisma.recurringActivityOccurrence.updateMany.mockResolvedValue({ count: 0 });
      const second = await service.sendLifecycleNotices();
      expect(second).toEqual({ windowNotices: 0, dueNotices: 0 });
      expect(notify).not.toHaveBeenCalled();
    });

    it('markOverdueOccurrences avisa de la vencida reclamando overdueNotifiedAt', async () => {
      const late = occurrence({ id: 'late', targetDate: inDays(-1) });
      prisma.recurringActivityOccurrence.findMany.mockResolvedValueOnce([late]);
      prisma.recurringActivityOccurrence.updateMany.mockResolvedValue({ count: 1 });

      await service.markOverdueOccurrences();

      expect(prisma.recurringActivityOccurrence.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'late', overdueNotifiedAt: null },
        }),
      );
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RECURRING_OVERDUE' }),
      );
    });

    it('un fallo de notificacion no rompe la pasada', async () => {
      prisma.recurringActivityOccurrence.findMany
        .mockResolvedValueOnce([occurrence({ targetDate: inDays(1) })])
        .mockResolvedValueOnce([]);
      prisma.recurringActivityOccurrence.updateMany.mockResolvedValue({ count: 1 });
      notify.mockRejectedValue(new Error('boom'));
      await expect(service.sendLifecycleNotices()).resolves.toEqual({
        windowNotices: 0,
        dueNotices: 0,
      });
    });
  });
});
