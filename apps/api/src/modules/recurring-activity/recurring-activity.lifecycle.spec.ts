import { ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { NotificationService } from '../notification/notification.service';
import { RecurringActivityService } from './recurring-activity.service';
import { Recurrence, toLocalDate, toUtcDate } from './recurrence';
import { OccurrenceStatus } from './occurrence-status';
import { OccurrenceDisplayStatus } from './occurrence-display';
import { ResponsibleKind } from './responsible-kind';
import { CompleteOccurrenceDto } from './dto/complete-occurrence.dto';
import { CreateRecurringActivityDto } from './dto/create-recurring-activity.dto';

/**
 * Ciclo de vida de las ocurrencias (rediseno FEAT-001): ventana prepDays,
 * reconcile al editar/pausar/reanudar, completar con texto y horas, cumplimiento
 * con horas y la migracion segura. Prisma va mockeado como en las demas specs
 * del modulo.
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
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function dayEs(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

interface PrismaMock {
  process: { findMany: jest.Mock };
  grant: { findMany: jest.Mock };
  catalogItem: { findFirst: jest.Mock };
  user: { findFirst: jest.Mock };
  recurringActivity: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  recurringActivityOccurrence: {
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    createMany: jest.Mock;
  };
  $transaction: jest.Mock;
}

function createPrismaMock(): PrismaService & PrismaMock {
  const prisma: PrismaMock = {
    process: { findMany: jest.fn().mockResolvedValue([]) },
    grant: { findMany: jest.fn().mockResolvedValue([]) },
    catalogItem: { findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }) },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    recurringActivity: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    recurringActivityOccurrence: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma as unknown as PrismaService & PrismaMock;
}

function createAudit(): AuditService & { record: jest.Mock } {
  return { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService & {
    record: jest.Mock;
  };
}

function createMail(): MailService {
  return {
    sendRecurringActivityNotice: jest.fn().mockResolvedValue(undefined),
  } as unknown as MailService;
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
    isLiderProceso: false,
    isAdmin: false,
    ...overrides,
  };
}

const admin = (): CurrentActor => actor({ isAdmin: true });

/** Definicion semanal que arranca hoy: con horizonte 14 genera hoy, +7 y +14. */
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
    createdAt: new Date(),
    updatedAt: new Date(),
    activity: definition(),
    startedBy: null,
    completedBy: null,
    ...overrides,
  };
}

/** Fila minima que devuelve la consulta de reconcile. */
function existing(
  id: string,
  targetDate: Date,
  status: string = OccurrenceStatus.PENDIENTE,
  estimatedHours = 2,
) {
  return { id, targetDate, status, estimatedHours };
}

describe('RecurringActivityService: ciclo de vida de ocurrencias', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let audit: ReturnType<typeof createAudit>;
  let service: RecurringActivityService;

  beforeEach(() => {
    process.env.RECURRING_ACTIVITY_TIMEZONE = TZ;
    process.env.RECURRING_ACTIVITY_ANTICIPATION_DAYS = '14';
    prisma = createPrismaMock();
    audit = createAudit();
    service = new RecurringActivityService(
      prisma,
      audit,
      createMail(),
      { notify: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationService,
    );
  });

  describe('ventana de preparacion (prepDays)', () => {
    it('start antes de targetDate - prepDays -> 409 con la fecha de apertura', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(
        occurrence({ targetDate: inDays(10) }),
      );
      const call = service.startOccurrence(actor(), 'occ-1');
      await expect(call).rejects.toBeInstanceOf(ConflictException);
      await expect(call).rejects.toThrow(dayEs(inDays(8)));
      expect(prisma.recurringActivityOccurrence.update).not.toHaveBeenCalled();
    });

    it('complete antes de abrir la ventana -> 409 con la fecha de apertura', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(
        occurrence({ targetDate: inDays(10) }),
      );
      const call = service.completeOccurrence(actor(), 'occ-1', {
        comment: 'hecho',
        actualHours: 1,
      });
      await expect(call).rejects.toBeInstanceOf(ConflictException);
      await expect(call).rejects.toThrow(dayEs(inDays(8)));
    });

    it('la ventana abre exactamente en targetDate - prepDays', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(
        occurrence({ targetDate: inDays(2) }),
      );
      prisma.recurringActivityOccurrence.update.mockResolvedValue(
        occurrence({ targetDate: inDays(2), status: OccurrenceStatus.EN_CURSO }),
      );
      await expect(service.startOccurrence(actor(), 'occ-1')).resolves.toMatchObject({
        status: OccurrenceStatus.EN_CURSO,
      });
    });

    it('una vencida (aun PENDIENTE en BD) no se toma: solo se completa', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(
        occurrence({ targetDate: inDays(-2) }),
      );
      await expect(service.startOccurrence(actor(), 'occ-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('una cancelada no se toma ni se completa (409)', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(
        occurrence({ status: OccurrenceStatus.CANCELADA }),
      );
      await expect(service.startOccurrence(actor(), 'occ-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(
        service.completeOccurrence(actor(), 'occ-1', { comment: 'x', actualHours: 1 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('la respuesta expone displayStatus, canStart, canComplete y opensOn', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(
        occurrence({ targetDate: inDays(10) }),
      );
      const res = await service.findOccurrence(actor(), 'occ-1');
      expect(res.displayStatus).toBe(OccurrenceDisplayStatus.PROGRAMADA);
      expect(res.canStart).toBe(false);
      expect(res.canComplete).toBe(false);
      expect(iso(res.opensOn)).toBe(iso(inDays(8)));
    });
  });

  describe('tomar y completar', () => {
    it('start registra quien y cuando la tomo', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(occurrence());
      prisma.recurringActivityOccurrence.update.mockResolvedValue(
        occurrence({ status: OccurrenceStatus.EN_CURSO }),
      );
      await service.startOccurrence(actor(), 'occ-1');
      const data = prisma.recurringActivityOccurrence.update.mock.calls[0][0].data;
      expect(data.status).toBe(OccurrenceStatus.EN_CURSO);
      expect(data.startedAt).toBeInstanceOf(Date);
      expect(data.startedBy).toEqual({ connect: { id: 'actor-1' } });
    });

    it('complete guarda el texto, las horas reales y quien completo', async () => {
      prisma.recurringActivityOccurrence.findUnique.mockResolvedValue(
        occurrence({ status: OccurrenceStatus.EN_CURSO }),
      );
      prisma.recurringActivityOccurrence.update.mockResolvedValue(
        occurrence({ status: OccurrenceStatus.COMPLETADA, actualHours: 3.25 }),
      );
      const res = await service.completeOccurrence(actor(), 'occ-1', {
        comment: 'Reporte enviado',
        actualHours: 3.25,
      });
      const data = prisma.recurringActivityOccurrence.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        status: OccurrenceStatus.COMPLETADA,
        completionComment: 'Reporte enviado',
        actualHours: 3.25,
        completedBy: { connect: { id: 'actor-1' } },
      });
      expect(res.actualHours).toBe(3.25);
    });

    it('CompleteOccurrenceDto exige texto y horas reales > 0', async () => {
      const empty = await validate(plainToInstance(CompleteOccurrenceDto, {}));
      expect(empty.map((e) => e.property).sort()).toEqual(['actualHours', 'comment']);

      const zero = await validate(
        plainToInstance(CompleteOccurrenceDto, { comment: 'ok', actualHours: 0 }),
      );
      expect(zero.map((e) => e.property)).toEqual(['actualHours']);

      const blank = await validate(
        plainToInstance(CompleteOccurrenceDto, { comment: '   ', actualHours: 1 }),
      );
      expect(blank.map((e) => e.property)).toEqual(['comment']);

      const ok = await validate(
        plainToInstance(CompleteOccurrenceDto, { comment: 'Hecho', actualHours: 1.5 }),
      );
      expect(ok).toHaveLength(0);
    });

    it('CreateRecurringActivityDto exige estimatedHours > 0', async () => {
      const base = {
        title: 'X',
        activityType: 'REPORTE',
        cadence: Recurrence.SEMANAL,
        startDate: '2026-11-16',
        responsibleKind: ResponsibleKind.USER,
        responsibleUserId: '6f3f6d3e-8b6d-4c6e-9a53-0d6f2f6a7c10',
      };
      const missing = await validate(plainToInstance(CreateRecurringActivityDto, base));
      expect(missing.map((e) => e.property)).toEqual(['estimatedHours']);
      const zero = await validate(
        plainToInstance(CreateRecurringActivityDto, { ...base, estimatedHours: 0 }),
      );
      expect(zero.map((e) => e.property)).toEqual(['estimatedHours']);
      const ok = await validate(
        plainToInstance(CreateRecurringActivityDto, { ...base, estimatedHours: 2.5 }),
      );
      expect(ok).toHaveLength(0);
    });
  });

  describe('reconcileOccurrences', () => {
    it('editar el inicio cancela las futuras PENDIENTE obsoletas y genera las nuevas sin tocar EN_CURSO', async () => {
      // Antes: hoy, +7 (PENDIENTE) y +14 (EN_CURSO). Ahora arranca manana: +1, +8.
      prisma.recurringActivityOccurrence.findMany.mockResolvedValue([
        existing('a', inDays(0)),
        existing('b', inDays(7)),
        existing('c', inDays(14), OccurrenceStatus.EN_CURSO),
      ]);
      prisma.recurringActivityOccurrence.createMany.mockResolvedValue({ count: 2 });

      const result = await service.reconcileOccurrences(
        definition({ startDate: inDays(1) }) as never,
        { cancelStale: true },
      );

      const cancel = prisma.recurringActivityOccurrence.updateMany.mock.calls.find(
        (c) => c[0].data.status === OccurrenceStatus.CANCELADA,
      );
      expect(cancel?.[0].where.id.in.sort()).toEqual(['a', 'b']);
      expect(cancel?.[0].data.cancelledAt).toBeInstanceOf(Date);
      const created = prisma.recurringActivityOccurrence.createMany.mock.calls[0][0];
      expect(created.skipDuplicates).toBe(true);
      expect(created.data.map((r: { targetDate: Date }) => iso(r.targetDate))).toEqual([
        iso(inDays(1)),
        iso(inDays(8)),
      ]);
      expect(created.data[0].estimatedHours).toBe(2);
      expect(result).toMatchObject({ created: 2, cancelled: 0 });
      // Nada toca a la EN_CURSO 'c'.
      for (const call of prisma.recurringActivityOccurrence.updateMany.mock.calls) {
        expect(JSON.stringify(call[0].where)).not.toContain('"c"');
      }
    });

    it('reactiva la CANCELADA que vuelve a coincidir (mismo registro) y no la duplica', async () => {
      prisma.recurringActivityOccurrence.findMany.mockResolvedValue([
        existing('a', inDays(0)),
        existing('b', inDays(7), OccurrenceStatus.CANCELADA),
        existing('c', inDays(14)),
      ]);

      await service.reconcileOccurrences(definition() as never, { cancelStale: true });

      const reactivate = prisma.recurringActivityOccurrence.updateMany.mock.calls.find(
        (c) => c[0].data.status === OccurrenceStatus.PENDIENTE,
      );
      expect(reactivate?.[0].where.id.in).toEqual(['b']);
      expect(reactivate?.[0].data).toMatchObject({
        cancelledAt: null,
        cancelReason: null,
      });
      expect(prisma.recurringActivityOccurrence.createMany).not.toHaveBeenCalled();
    });

    it('es idempotente: si ya esta todo, no cancela, no reactiva ni inserta', async () => {
      prisma.recurringActivityOccurrence.findMany.mockResolvedValue([
        existing('a', inDays(0)),
        existing('b', inDays(7)),
        existing('c', inDays(14)),
      ]);

      const result = await service.reconcileOccurrences(definition() as never, {
        cancelStale: true,
      });

      expect(result).toEqual({ created: 0, cancelled: 0, reactivated: 0 });
      expect(prisma.recurringActivityOccurrence.updateMany).not.toHaveBeenCalled();
      expect(prisma.recurringActivityOccurrence.createMany).not.toHaveBeenCalled();
    });

    it('actualiza las horas estimadas de las PENDIENTE no tomadas', async () => {
      prisma.recurringActivityOccurrence.findMany.mockResolvedValue([
        existing('a', inDays(0), OccurrenceStatus.PENDIENTE, 2),
        existing('b', inDays(7), OccurrenceStatus.EN_CURSO, 2),
        existing('c', inDays(14), OccurrenceStatus.PENDIENTE, 2),
      ]);

      await service.reconcileOccurrences(definition({ estimatedHours: 3 }) as never, {
        cancelStale: true,
      });

      const hours = prisma.recurringActivityOccurrence.updateMany.mock.calls.find(
        (c) => c[0].data.estimatedHours !== undefined,
      );
      expect(hours?.[0].where.id.in.sort()).toEqual(['a', 'c']);
      expect(hours?.[0].data.estimatedHours).toBe(3);
    });

    it('el modo del cron (cancelStale=false) solo genera: nunca cancela ni reactiva', async () => {
      prisma.recurringActivityOccurrence.findMany.mockResolvedValue([
        existing('a', inDays(0)),
        existing('x', inDays(3)),
        existing('b', inDays(7), OccurrenceStatus.CANCELADA),
      ]);
      prisma.recurringActivityOccurrence.createMany.mockResolvedValue({ count: 1 });

      await service.reconcileOccurrences(definition() as never, { cancelStale: false });

      const statusWrites = prisma.recurringActivityOccurrence.updateMany.mock.calls.filter(
        (c) => c[0].data.status !== undefined,
      );
      expect(statusWrites).toHaveLength(0);
      const created = prisma.recurringActivityOccurrence.createMany.mock.calls[0][0];
      // Solo la +14: hoy y +7 ya existen (la +7 CANCELADA no se duplica).
      expect(created.data.map((r: { targetDate: Date }) => iso(r.targetDate))).toEqual([
        iso(inDays(14)),
      ]);
    });

    it('el horizonte incluye prepDays (mayor que la anticipacion)', async () => {
      await service.reconcileOccurrences(
        definition({ startDate: inDays(0), prepDays: 30 }) as never,
        { cancelStale: true },
      );
      const created = prisma.recurringActivityOccurrence.createMany.mock.calls[0][0];
      // 30 dias de horizonte: hoy, +7, +14, +21, +28.
      expect(created.data).toHaveLength(5);
    });
  });

  describe('editar, pausar y reanudar', () => {
    it('editar solo el titulo no reconcilia', async () => {
      const current = definition();
      prisma.recurringActivity.findUnique.mockResolvedValue(current);
      prisma.recurringActivity.update.mockResolvedValue({ ...current, title: 'Otro' });

      await service.updateActivity(admin(), 'act-1', { title: 'Otro' });

      expect(prisma.recurringActivityOccurrence.findMany).not.toHaveBeenCalled();
    });

    it('editar la fecha de inicio reconcilia (cancela las que ya no corresponden)', async () => {
      const current = definition();
      const moved = { ...current, startDate: inDays(1) };
      prisma.recurringActivity.findUnique.mockResolvedValue(current);
      prisma.recurringActivity.update.mockResolvedValue(moved);
      prisma.recurringActivityOccurrence.findMany.mockResolvedValue([
        existing('a', inDays(0)),
      ]);

      await service.updateActivity(admin(), 'act-1', {
        startDate: inDays(1).toISOString(),
      });

      const cancel = prisma.recurringActivityOccurrence.updateMany.mock.calls.find(
        (c) => c[0].data.status === OccurrenceStatus.CANCELADA,
      );
      expect(cancel?.[0].where.id.in).toEqual(['a']);
    });

    it('pausar cancela todas las PENDIENTE futuras y no genera', async () => {
      const current = definition();
      prisma.recurringActivity.findUnique.mockResolvedValue(current);
      prisma.recurringActivity.update.mockResolvedValue({ ...current, active: false });
      prisma.recurringActivityOccurrence.findMany.mockResolvedValue([
        existing('a', inDays(0)),
        existing('b', inDays(7)),
        existing('c', inDays(14), OccurrenceStatus.EN_CURSO),
      ]);

      await service.removeActivity(admin(), 'act-1');

      expect(prisma.recurringActivity.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: false } }),
      );
      const cancel = prisma.recurringActivityOccurrence.updateMany.mock.calls.find(
        (c) => c[0].data.status === OccurrenceStatus.CANCELADA,
      );
      expect(cancel?.[0].where.id.in.sort()).toEqual(['a', 'b']);
      expect(prisma.recurringActivityOccurrence.createMany).not.toHaveBeenCalled();
    });

    it('reanudar activa, audita, reactiva las canceladas y regenera las faltantes', async () => {
      const paused = definition({ active: false });
      prisma.recurringActivity.findUnique.mockResolvedValue(paused);
      prisma.recurringActivity.update.mockResolvedValue({ ...paused, active: true });
      prisma.recurringActivityOccurrence.findMany.mockResolvedValue([
        existing('a', inDays(0), OccurrenceStatus.CANCELADA),
        existing('b', inDays(7), OccurrenceStatus.CANCELADA),
      ]);
      prisma.recurringActivityOccurrence.createMany.mockResolvedValue({ count: 1 });

      const res = await service.resumeActivity(admin(), 'act-1');

      expect(res.active).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ objectType: 'RECURRING_ACTIVITY' }),
      );
      const reactivate = prisma.recurringActivityOccurrence.updateMany.mock.calls.find(
        (c) => c[0].data.status === OccurrenceStatus.PENDIENTE,
      );
      expect(reactivate?.[0].where.id.in.sort()).toEqual(['a', 'b']);
      const created = prisma.recurringActivityOccurrence.createMany.mock.calls[0][0];
      expect(created.data.map((r: { targetDate: Date }) => iso(r.targetDate))).toEqual([
        iso(inDays(14)),
      ]);
    });

    it('reanudar una definicion ya activa es idempotente (no reconcilia)', async () => {
      prisma.recurringActivity.findUnique.mockResolvedValue(definition());
      await service.resumeActivity(admin(), 'act-1');
      expect(prisma.recurringActivity.update).not.toHaveBeenCalled();
      expect(prisma.recurringActivityOccurrence.findMany).not.toHaveBeenCalled();
    });
  });

  describe('cumplimiento con horas', () => {
    it('excluye canceladas, suma horas de las completadas y agrega por quien completo', async () => {
      const completedOnTime = occurrence({
        id: 'o1',
        targetDate: inDays(-6),
        status: OccurrenceStatus.COMPLETADA,
        completedAt: new Date(inDays(-6).getTime() + 15 * 3_600_000),
        completedByUserId: 'u1',
        completedBy: { name: 'Ana' },
        estimatedHours: 2,
        actualHours: 1.5,
      });
      const completedLate = occurrence({
        id: 'o2',
        targetDate: inDays(-5),
        status: OccurrenceStatus.COMPLETADA,
        completedAt: new Date(inDays(-2).getTime() + 15 * 3_600_000),
        completedByUserId: 'u2',
        completedBy: { name: 'Beto' },
        estimatedHours: 2,
        actualHours: 3,
      });
      const overdueDerived = occurrence({ id: 'o3', targetDate: inDays(-1) });
      const pendingFuture = occurrence({ id: 'o4', targetDate: inDays(1) });
      prisma.recurringActivityOccurrence.findMany.mockResolvedValue([
        completedOnTime,
        completedLate,
        overdueDerived,
        pendingFuture,
      ]);

      const res = await service.getCompliance(admin(), {} as never);

      const where = prisma.recurringActivityOccurrence.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ not: OccurrenceStatus.CANCELADA });
      expect(res.totals).toEqual({
        onTime: 1,
        late: 1,
        overdue: 1,
        pending: 1,
        total: 4,
        estimatedHours: 4,
        actualHours: 4.5,
      });
      expect(res.byPerson.map((p) => [p.userName, p.metrics.total])).toEqual([
        ['Ana', 1],
        ['Beto', 1],
      ]);
      expect(res.byPerson[0].metrics).toMatchObject({ onTime: 1, actualHours: 1.5 });
      expect(res.byPerson[1].metrics).toMatchObject({ late: 1, actualHours: 3 });
    });
  });

  describe('listado', () => {
    it('oculta las canceladas por defecto y las muestra si se filtra por CANCELADA', async () => {
      await service.findOccurrences(actor(), {} as never);
      expect(
        prisma.recurringActivityOccurrence.findMany.mock.calls[0][0].where.status,
      ).toEqual({ not: OccurrenceStatus.CANCELADA });

      await service.findOccurrences(actor(), { status: OccurrenceStatus.CANCELADA } as never);
      expect(
        prisma.recurringActivityOccurrence.findMany.mock.calls[1][0].where.status,
      ).toBe(OccurrenceStatus.CANCELADA);
    });
  });
});

describe('migracion 20261115120000_recurring_activity_redesign', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../../prisma/migrations/20261115120000_recurring_activity_redesign/migration.sql',
    ),
    'utf8',
  );

  it('hace backfill de 1 hora y de prepDays 2 (SEMANAL) / 5 (resto)', () => {
    expect(sql).toMatch(/"estimated_hours" DECIMAL\(6,2\) NOT NULL DEFAULT 1/);
    expect(sql).toMatch(/"prep_days" INTEGER NOT NULL DEFAULT 5/);
    expect(sql).toMatch(
      /UPDATE "recurring_activities" SET "prep_days" = 2 WHERE "cadence" = 'SEMANAL'/,
    );
  });

  it('las ocurrencias heredan las horas de su definicion', () => {
    expect(sql).toMatch(/UPDATE "recurring_activity_occurrences" AS o/);
    expect(sql).toMatch(/SET "estimated_hours" = a\."estimated_hours"/);
  });

  it('no borra datos ni cambia el estado de ninguna fila', () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|DROP TABLE|DROP COLUMN/i);
    expect(sql).not.toMatch(/SET\s+"status"/i);
  });

  it('agrega los CHECK de horas y dias de preparacion', () => {
    expect(sql).toMatch(/CHECK \("estimated_hours" > 0\)/);
    expect(sql).toMatch(/CHECK \("prep_days" >= 0\)/);
  });
});
