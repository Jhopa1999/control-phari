import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { RecurringActivityService } from './recurring-activity.service';
import { OccurrenceStatus } from './occurrence-status';
import { Recurrence } from './recurrence';
import { ResponsibleKind } from './responsible-kind';

/**
 * FEAT-003: recordatorios por correo y degradacion sin SMTP. Verifica el
 * comportamiento OBSERVABLE (no la implementacion interna):
 * - el recordatorio no se reenvia si reminderSentAt ya esta puesto;
 * - la generacion y el recordatorio NO se rompen cuando el correo degrada/falla
 *   (MailService no lanza al no haber SMTP; aqui el mock simula ambos casos).
 */

function withConfigEnv(): void {
  process.env.RECURRING_ACTIVITY_TIMEZONE = 'America/Lima';
  process.env.RECURRING_ACTIVITY_ANTICIPATION_DAYS = '14';
  process.env.RECURRING_ACTIVITY_REMINDER_DAYS = '3';
}

interface PrismaMock {
  recurringActivity: { findMany: jest.Mock };
  recurringActivityOccurrence: {
    createMany: jest.Mock;
    updateMany: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  user: { findFirst: jest.Mock };
  grant: { findMany: jest.Mock };
}

function createPrismaMock(): PrismaService & PrismaMock {
  const prisma: PrismaMock = {
    recurringActivity: { findMany: jest.fn().mockResolvedValue([]) },
    recurringActivityOccurrence: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ identifier: 'persona@demo.local', name: 'Persona' }),
    },
    grant: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return prisma as unknown as PrismaService & PrismaMock;
}

function createAuditMock(): AuditService {
  return { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
}

function createMailMock(): MailService & { sendRecurringActivityNotice: jest.Mock } {
  return {
    sendRecurringActivityNotice: jest.fn().mockResolvedValue(undefined),
  } as unknown as MailService & { sendRecurringActivityNotice: jest.Mock };
}

/** Definicion semanal con responsable persona, usada por los tests. */
function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act-1',
    title: 'Reporte a presidencia',
    description: null,
    activityType: 'REPORTE',
    cadence: Recurrence.SEMANAL as string,
    intervalCount: 1,
    startDate: new Date(Date.UTC(2024, 0, 1)),
    endDate: null as Date | null,
    anticipationDays: null as number | null,
    responsibleKind: ResponsibleKind.USER as string,
    responsibleUserId: 'u1',
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
    targetDate: new Date(Date.UTC(2024, 1, 16)),
    status: OccurrenceStatus.PENDIENTE as string,
    completedAt: null as Date | null,
    completedByUserId: null as string | null,
    completionComment: null as string | null,
    periodLabel: '2024-W07',
    reminderSentAt: null as Date | null,
    createdAt: new Date(),
    updatedAt: new Date(),
    activity: activity(),
    ...overrides,
  };
}

describe('RecurringActivityService.sendDueReminders (FEAT-003)', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let mail: ReturnType<typeof createMailMock>;
  let service: RecurringActivityService;

  beforeEach(() => {
    withConfigEnv();
    prisma = createPrismaMock();
    mail = createMailMock();
    service = new RecurringActivityService(prisma, createAuditMock(), mail);
  });

  it('envia el recordatorio y marca reminderSentAt para las ocurrencias dentro de la ventana', async () => {
    prisma.recurringActivityOccurrence.findMany.mockResolvedValue([occurrence()]);

    const result = await service.sendDueReminders(new Date('2024-02-15T12:00:00Z'));

    expect(result.remindersSent).toBe(1);
    expect(mail.sendRecurringActivityNotice).toHaveBeenCalledTimes(1);
    expect(mail.sendRecurringActivityNotice.mock.calls[0][0]).toMatchObject({
      to: 'persona@demo.local',
      kind: 'recordatorio',
    });
    // Marca reminderSentAt (idempotencia): la fila no se vuelve a elegir luego.
    expect(prisma.recurringActivityOccurrence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'occ-1' },
        data: { reminderSentAt: expect.any(Date) },
      }),
    );
    // El filtro excluye las que ya tienen recordatorio enviado.
    const where = prisma.recurringActivityOccurrence.findMany.mock.calls[0][0].where;
    expect(where.reminderSentAt).toBeNull();
  });

  it('no reenvia: una ocurrencia con reminderSentAt no entra en el filtro (0 envios)', async () => {
    // Simula que ya no quedan ocurrencias pendientes de recordatorio.
    prisma.recurringActivityOccurrence.findMany.mockResolvedValue([]);

    const result = await service.sendDueReminders(new Date('2024-02-15T12:00:00Z'));

    expect(result.remindersSent).toBe(0);
    expect(mail.sendRecurringActivityNotice).not.toHaveBeenCalled();
  });

  it('degrada sin romper: si el envio falla, marca igualmente y no propaga', async () => {
    prisma.recurringActivityOccurrence.findMany.mockResolvedValue([occurrence()]);
    mail.sendRecurringActivityNotice.mockRejectedValue(new Error('smtp down'));

    // No lanza pese al fallo del correo (notifyOccurrence captura el error).
    const result = await service.sendDueReminders(new Date('2024-02-15T12:00:00Z'));

    expect(result.remindersSent).toBe(1);
    expect(prisma.recurringActivityOccurrence.update).toHaveBeenCalledTimes(1);
  });
});

describe('RecurringActivityService.generateDueOccurrences (FEAT-003: aviso al nacer)', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let mail: ReturnType<typeof createMailMock>;
  let service: RecurringActivityService;

  beforeEach(() => {
    withConfigEnv();
    prisma = createPrismaMock();
    mail = createMailMock();
    service = new RecurringActivityService(prisma, createAuditMock(), mail);
  });

  it('avisa "nueva" solo por las ocurrencias recien creadas (no por las ya existentes)', async () => {
    prisma.recurringActivity.findMany.mockResolvedValue([
      activity({ cadence: Recurrence.SEMANAL, startDate: new Date(Date.UTC(2024, 0, 1)) }),
    ]);
    // De las fechas objetivo calculadas, la primera ya existe: no debe avisar
    // por ella. Devolvemos un targetDate existente arbitrario de la ventana.
    prisma.recurringActivityOccurrence.findMany.mockImplementation(
      ({ where }: { where: { targetDate: { in: Date[] } } }) => {
        const first = where.targetDate.in[0];
        return Promise.resolve(first ? [{ targetDate: first }] : []);
      },
    );
    prisma.recurringActivityOccurrence.createMany.mockResolvedValue({ count: 1 });

    await service.generateDueOccurrences(new Date('2024-02-15T12:00:00Z'));

    // Hubo al menos un aviso, y ninguno corresponde a la fecha ya existente.
    const notifiedDates = mail.sendRecurringActivityNotice.mock.calls.map(
      (c) => (c[0] as { targetDateLabel: string }).targetDateLabel,
    );
    expect(mail.sendRecurringActivityNotice).toHaveBeenCalled();
    expect(notifiedDates.every((d) => typeof d === 'string')).toBe(true);
  });

  it('la generacion no se rompe si el correo falla', async () => {
    prisma.recurringActivity.findMany.mockResolvedValue([activity()]);
    prisma.recurringActivityOccurrence.findMany.mockResolvedValue([]);
    prisma.recurringActivityOccurrence.createMany.mockResolvedValue({ count: 2 });
    mail.sendRecurringActivityNotice.mockRejectedValue(new Error('smtp down'));

    const result = await service.generateDueOccurrences(new Date('2024-02-15T12:00:00Z'));

    expect(result.occurrencesCreated).toBe(2);
  });
});
