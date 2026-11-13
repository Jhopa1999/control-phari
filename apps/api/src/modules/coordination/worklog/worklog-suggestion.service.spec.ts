import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Prisma } from '../../../generated/prisma/client';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { NotificationService } from '../../notification/notification.service';
import { CoordinationScopeService } from '../coordination-scope.service';
import { WorklogEligibilityService } from './worklog-eligibility.service';
import { WorklogService } from './worklog.service';
import { WorklogSuggestionService } from './worklog-suggestion.service';

const AUTHOR = '00000000-0000-0000-0000-0000000000a1';
const M1 = '00000000-0000-0000-0000-00000000m001'.replace('m', '0');
const M2 = '00000000-0000-0000-0000-000000000m02'.replace('m', '0');
const O1 = '00000000-0000-0000-0000-0000000000c1';
const O2 = '00000000-0000-0000-0000-0000000000c2';
const T1 = '00000000-0000-0000-0000-0000000000d1';
const T2 = '00000000-0000-0000-0000-0000000000d2';
const DAY = new Date(Date.UTC(2025, 2, 10));

function author(): CurrentActor {
  return {
    userId: AUTHOR,
    name: 'Autora',
    identifier: 'autora@demo.local',
    grants: [
      { processId: 'p1', processCode: 'P1', processName: 'P1', roleCode: RoleCode.INTEGRANTE, roleName: 'I' },
    ],
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
  };
}

function logRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dl1',
    authorUserId: AUTHOR,
    processId: 'p1',
    date: DAY,
    status: 'BORRADOR',
    submittedAt: null,
    dayNotes: null,
    reviewedAt: null,
    reviewedByUserId: null,
    returnedAt: null,
    returnedByUserId: null,
    returnReason: null,
    createdAt: DAY,
    updatedAt: DAY,
    activities: [],
    ...overrides,
  };
}

function meeting(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Reunión ${id.slice(-2)}`,
    state: 'COMPLETADO',
    meetingTime: '10:00',
    durationMinutes: 90,
    processId: 'p1',
    responsibleUserId: 'otro',
    process: { name: 'Proceso 1' },
    ...overrides,
  };
}

function occurrence(id: string, completedAt: string, actualHours: number) {
  return {
    id,
    targetDate: DAY,
    completedAt: new Date(completedAt),
    completionComment: 'Se envió el reporte',
    actualHours: new Prisma.Decimal(actualHours),
    activity: { title: 'Reporte semanal' },
  };
}

function build() {
  const created: any[] = [];
  const prismaObj: Record<string, any> = {
    dailyLog: { findFirst: jest.fn().mockResolvedValue(logRow()) },
    meeting: { findMany: jest.fn().mockResolvedValue([]) },
    recurringActivityOccurrence: { findMany: jest.fn().mockResolvedValue([]) },
    auditEvent: { findMany: jest.fn().mockResolvedValue([]) },
    dailyLogSuggestionLink: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    dailyLogActivity: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockImplementation(async () => created[created.length - 1] ?? null),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        const row = {
          id: `a${created.length + 1}`,
          projectRequestId: null,
          taskId: null,
          assetRef: null,
          requesterRef: null,
          justification: null,
          description: null,
          result: null,
          activityStatus: null,
          evidenceUrl: null,
          relatedIssueId: null,
          nextStep: null,
          nextStepDate: null,
          assetId: null,
          createdAt: DAY,
          updatedAt: DAY,
          ...data,
          hours: new Prisma.Decimal(data.hours ?? 0),
        };
        created.push(row);
        return row;
      }),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    grant: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const eligibility = {
    workdayHours: jest.fn().mockResolvedValue(9),
    eligibleTasksForLog: jest.fn().mockResolvedValue([]),
    validateReferences: jest.fn().mockResolvedValue({}),
  } as unknown as WorklogEligibilityService;
  const worklog = new WorklogService(
    prisma,
    audit,
    new CoordinationScopeService(prisma),
    { notify: jest.fn() } as unknown as NotificationService,
    eligibility,
  );
  const service = new WorklogSuggestionService(prisma, audit, worklog, eligibility);
  return { service, worklog, prismaObj, eligibility, created, audit };
}

describe('WorklogSuggestionService · cálculo', () => {
  it('sugiere reuniones donde el autor participa o es responsable, con horas = duración', async () => {
    const m = build();
    m.prismaObj.meeting.findMany.mockResolvedValue([
      meeting(M1),
      meeting(M2, { state: 'BORRADOR', durationMinutes: null, responsibleUserId: AUTHOR, meetingTime: '08:00' }),
    ]);
    const res = await m.service.list(author(), 'dl1');
    const where = m.prismaObj.meeting.findMany.mock.calls[0][0].where;
    expect(where.meetingDate).toEqual(DAY);
    expect(where.OR).toEqual([
      { responsibleUserId: AUTHOR },
      { participants: { some: { userId: AUTHOR } } },
    ]);
    expect(res.pendingCount).toBe(2);
    // Orden por hora: 08:00 antes que 10:00.
    expect(res.items[0]).toMatchObject({
      key: `MEETING:${M2}`,
      classificationCode: 'REUNION',
      suggestedHours: null,
      requiresHoursInput: true,
      meeting: { minutesOpen: true, responsible: true },
    });
    expect(res.items[1]).toMatchObject({
      key: `MEETING:${M1}`,
      suggestedHours: 1.5,
      meeting: { endTime: '11:30', minutesOpen: false },
    });
  });

  it('sugiere ocurrencias completadas por el autor ese día local (zona de la app)', async () => {
    process.env.RECURRING_ACTIVITY_TIMEZONE = 'America/Lima';
    const m = build();
    m.prismaObj.recurringActivityOccurrence.findMany.mockResolvedValue([
      // 2025-03-11 03:00Z = 2025-03-10 22:00 en Lima -> cuenta.
      occurrence(O1, '2025-03-11T03:00:00.000Z', 1.1),
      // 2025-03-10 03:00Z = 2025-03-09 22:00 en Lima -> otro día.
      occurrence(O2, '2025-03-10T03:00:00.000Z', 2),
    ]);
    const res = await m.service.list(author(), 'dl1');
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      key: `OCCURRENCE:${O1}`,
      classificationCode: 'RECURRENTE',
      description: 'Se envió el reporte',
      suggestedHours: 1,
      hoursAdjusted: true,
      originalHours: 1.1,
    });
    const where = m.prismaObj.recurringActivityOccurrence.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'COMPLETADA', completedByUserId: AUTHOR });
  });

  it('sugiere tareas con cambio de avance/estado del día, elegibles y sin actividad ya registrada', async () => {
    const m = build();
    m.prismaObj.auditEvent.findMany.mockResolvedValue([
      { objectId: T1, before: { progress: 10 }, after: { progress: 50 }, createdAt: new Date('2025-03-10T15:00:00Z') },
      { objectId: T2, before: { status: 'EN_CURSO' }, after: { status: 'EN_REVISION' }, createdAt: new Date('2025-03-10T16:00:00Z') },
      // Solo cambio de título: no es trabajo del día.
      { objectId: 'tx', before: { title: 'a' }, after: { title: 'b' }, createdAt: new Date('2025-03-10T16:00:00Z') },
    ]);
    (m.eligibility.eligibleTasksForLog as jest.Mock).mockResolvedValue([
      { id: T1, code: 'PRY-1-T01', title: 'Modelo', requestId: 'r1', requestCode: 'PRY-1', requestTitle: 'Proyecto' },
      { id: T2, code: 'PRY-1-T02', title: 'Tablero', requestId: 'r1', requestCode: 'PRY-1', requestTitle: 'Proyecto' },
    ]);
    // T2 ya tiene una actividad manual del autor ese día.
    m.prismaObj.dailyLogActivity.findMany.mockImplementation(async (args: any) =>
      args.where.taskId ? [{ taskId: T2 }] : [],
    );
    const res = await m.service.list(author(), 'dl1');
    expect((m.eligibility.eligibleTasksForLog as jest.Mock).mock.calls[0][3]).toEqual([T1, T2]);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      key: `TASK:${T1}:2025-03-10`,
      classificationCode: 'PLANIFICADA',
      suggestedHours: null,
      requiresHoursInput: true,
      task: { code: 'PRY-1-T01', reasons: [{ field: 'progress', from: '10', to: '50' }] },
    });
  });

  it('una sugerencia aceptada en cualquier diario del autor no reaparece; la descartada solo con includeDismissed', async () => {
    const m = build();
    m.prismaObj.meeting.findMany.mockResolvedValue([meeting(M1), meeting(M2)]);
    m.prismaObj.dailyLogSuggestionLink.findMany.mockResolvedValue([
      { sourceKey: `MEETING:${M1}`, status: 'ACEPTADA' },
      { sourceKey: `MEETING:${M2}`, status: 'DESCARTADA' },
    ]);
    const res = await m.service.list(author(), 'dl1');
    expect(res.items).toHaveLength(0);
    expect(res.pendingCount).toBe(0);
    expect(res.dismissedCount).toBe(1);
    const withDismissed = await m.service.list(author(), 'dl1', true);
    expect(withDismissed.items).toEqual([
      expect.objectContaining({ key: `MEETING:${M2}`, status: 'DISMISSED' }),
    ]);
    // El vínculo se busca por autor (todos sus diarios), no por diario.
    expect(m.prismaObj.dailyLogSuggestionLink.findMany.mock.calls[0][0].where.authorUserId).toBe(AUTHOR);
  });

  it('total del día y aviso de jornada con el umbral configurado', async () => {
    const m = build();
    (m.eligibility.workdayHours as jest.Mock).mockResolvedValue(8);
    m.prismaObj.dailyLogActivity.findMany.mockResolvedValue([
      { hours: new Prisma.Decimal(5.5), dailyLog: { authorUserId: AUTHOR, date: DAY } },
      { hours: new Prisma.Decimal(3), dailyLog: { authorUserId: AUTHOR, date: DAY } },
    ]);
    const res = await m.service.list(author(), 'dl1');
    expect(res).toMatchObject({ authorDayTotalHours: 8.5, workdayHours: 8, overWorkday: true });
  });

  it('otro actor no puede ver las sugerencias del diario: 403', async () => {
    const m = build();
    m.prismaObj.dailyLog.findFirst.mockResolvedValue(logRow({ authorUserId: 'otra' }));
    await expect(m.service.list(author(), 'dl1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('en un diario enviado informa (editable=false) pero no permite aceptar ni descartar: 409', async () => {
    const m = build();
    m.prismaObj.dailyLog.findFirst.mockResolvedValue(logRow({ status: 'ENVIADO' }));
    m.prismaObj.meeting.findMany.mockResolvedValue([meeting(M1)]);
    const res = await m.service.list(author(), 'dl1');
    expect(res).toMatchObject({ editable: false, pendingCount: 1 });
    await expect(
      m.service.accept(author(), 'dl1', { items: [{ key: `MEETING:${M1}` }] }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(m.service.dismiss(author(), 'dl1', [`MEETING:${M1}`])).rejects.toBeInstanceOf(
      ConflictException,
    );
    m.prismaObj.dailyLog.findFirst.mockResolvedValue(logRow({ status: 'REVISADO' }));
    await expect(
      m.service.accept(author(), 'dl1', { items: [{ key: `MEETING:${M1}` }] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('WorklogSuggestionService · aceptar', () => {
  it('crea la actividad por la ruta única con categoría, horas y vínculo de origen', async () => {
    const m = build();
    m.prismaObj.meeting.findMany.mockResolvedValue([meeting(M1)]);
    const res = await m.service.accept(author(), 'dl1', { items: [{ key: `MEETING:${M1}` }] });
    expect(res.failed).toEqual([]);
    expect(res.accepted).toHaveLength(1);
    const data = m.prismaObj.dailyLogActivity.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ dailyLogId: 'dl1', classificationCode: 'REUNION', hours: 1.5, description: 'Reunión 01' });
    expect(m.prismaObj.dailyLogSuggestionLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        authorUserId: AUTHOR,
        sourceKey: `MEETING:${M1}`,
        kind: 'MEETING',
        status: 'ACEPTADA',
        activityId: 'a1',
        meetingId: M1,
        workDate: DAY,
      }),
    });
  });

  it('lote con resultado parcial: horas requeridas, clave caducada, ajuste de horas', async () => {
    const m = build();
    m.prismaObj.meeting.findMany.mockResolvedValue([
      meeting(M1),
      meeting(M2, { durationMinutes: null }),
    ]);
    const res = await m.service.accept(author(), 'dl1', {
      items: [
        { key: `MEETING:${M1}`, hours: 1.25 },
        { key: `MEETING:${M2}` },
        { key: `OCCURRENCE:${O1}` },
      ],
    });
    expect(res.accepted).toHaveLength(1);
    expect(m.prismaObj.dailyLogActivity.create.mock.calls[0][0].data.hours).toBe(1.25);
    expect(res.failed).toEqual([
      expect.objectContaining({ key: `MEETING:${M2}`, code: 'HORAS_REQUERIDAS' }),
      expect.objectContaining({ key: `OCCURRENCE:${O1}`, code: 'NO_DISPONIBLE' }),
    ]);
  });

  it('carrera con otro diario del mismo día (P2002 en el vínculo) -> YA_REGISTRADA', async () => {
    const m = build();
    m.prismaObj.meeting.findMany.mockResolvedValue([meeting(M1)]);
    m.prismaObj.dailyLogSuggestionLink.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
    );
    const res = await m.service.accept(author(), 'dl1', { items: [{ key: `MEETING:${M1}` }] });
    expect(res.accepted).toEqual([]);
    expect(res.failed).toEqual([expect.objectContaining({ code: 'YA_REGISTRADA' })]);
  });

  it('una tarea que dejó de ser elegible -> NO_ELEGIBLE con el mensaje de la regla', async () => {
    const m = build();
    m.prismaObj.auditEvent.findMany.mockResolvedValue([
      { objectId: T1, before: { progress: 0 }, after: { progress: 20 }, createdAt: new Date('2025-03-10T15:00:00Z') },
    ]);
    (m.eligibility.eligibleTasksForLog as jest.Mock).mockResolvedValue([
      { id: T1, code: 'PRY-1-T01', title: 'Modelo', requestId: 'r1', requestCode: 'PRY-1', requestTitle: 'Proyecto' },
    ]);
    (m.eligibility.validateReferences as jest.Mock).mockRejectedValue(
      new BadRequestException('El proyecto PRY-1 está cerrado y ya no admite nuevas actividades.'),
    );
    const res = await m.service.accept(author(), 'dl1', {
      items: [{ key: `TASK:${T1}:2025-03-10`, hours: 2 }],
    });
    expect(res.failed).toEqual([
      { key: `TASK:${T1}:2025-03-10`, code: 'NO_ELEGIBLE', message: expect.stringContaining('cerrado') },
    ]);
  });
});

describe('WorklogSuggestionService · descartar y restaurar', () => {
  it('descartar deja una marca persistente por autor y origen (sin actividad)', async () => {
    const m = build();
    m.prismaObj.meeting.findMany.mockResolvedValue([meeting(M1)]);
    const res = await m.service.dismiss(author(), 'dl1', [`MEETING:${M1}`]);
    expect(res.dismissed).toEqual([`MEETING:${M1}`]);
    const data = m.prismaObj.dailyLogSuggestionLink.createMany.mock.calls[0][0].data;
    expect(data).toEqual([
      expect.objectContaining({ authorUserId: AUTHOR, status: 'DESCARTADA', sourceKey: `MEETING:${M1}` }),
    ]);
    expect(data[0].activityId).toBeUndefined();
  });

  it('no se descarta lo ya registrado: 409', async () => {
    const m = build();
    m.prismaObj.meeting.findMany.mockResolvedValue([meeting(M1)]);
    m.prismaObj.dailyLogSuggestionLink.findMany.mockImplementation(async (args: any) =>
      args.where.status === 'ACEPTADA' ? [{ sourceKey: `MEETING:${M1}` }] : [],
    );
    await expect(m.service.dismiss(author(), 'dl1', [`MEETING:${M1}`])).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('restaurar borra la marca de descarte', async () => {
    const m = build();
    m.prismaObj.dailyLogSuggestionLink.findMany.mockResolvedValue([
      { id: 'l1', sourceKey: `MEETING:${M1}` },
    ]);
    const res = await m.service.restore(author(), 'dl1', [`MEETING:${M1}`]);
    expect(res.restored).toEqual([`MEETING:${M1}`]);
    expect(m.prismaObj.dailyLogSuggestionLink.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['l1'] }, status: 'DESCARTADA' },
    });
  });
});

describe('WorklogService · reglas de las categorías nuevas', () => {
  it('REUNION y RECURRENTE no se crean a mano: 400', async () => {
    const m = build();
    for (const classificationCode of ['REUNION', 'RECURRENTE']) {
      await expect(
        m.worklog.addActivity(author(), 'dl1', { classificationCode, hours: 1 }),
      ).rejects.toThrow('Las actividades de reunión y recurrentes se agregan desde las sugerencias del día.');
    }
  });

  it('horas fuera del paso de 0,25 se rechazan también en el servicio', async () => {
    const m = build();
    await expect(
      m.worklog.addActivity(author(), 'dl1', { classificationCode: 'INTERNA', hours: 0.3 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const ok = await m.worklog.addActivity(author(), 'dl1', { classificationCode: 'INTERNA', hours: 0.25 });
    expect(ok.hours).toBe(0.25);
  });

  it('una actividad de reunión no cambia de clasificación ni de origen', async () => {
    const m = build();
    m.prismaObj.dailyLogActivity.findFirst.mockResolvedValue({
      id: 'a1',
      dailyLogId: 'dl1',
      classificationCode: 'REUNION',
      hours: new Prisma.Decimal(1),
      projectRequestId: null,
      taskId: null,
      assetRef: null,
      requesterRef: null,
      justification: null,
    });
    m.prismaObj.dailyLogSuggestionLink.findFirst.mockResolvedValue({ kind: 'MEETING' });
    await expect(
      m.worklog.updateActivity(author(), 'a1', { classificationCode: 'INTERNA' }),
    ).rejects.toThrow('La clasificación de una actividad de reunión o recurrente no se puede cambiar.');
    await expect(
      m.worklog.updateActivity(author(), 'a1', { taskId: T1 }),
    ).rejects.toThrow('Una actividad registrada desde una sugerencia conserva su origen.');
  });

  it('una actividad manual no se convierte en REUNION', async () => {
    const m = build();
    m.prismaObj.dailyLogActivity.findFirst.mockResolvedValue({
      id: 'a1',
      dailyLogId: 'dl1',
      classificationCode: 'INTERNA',
      hours: new Prisma.Decimal(1),
      projectRequestId: null,
      taskId: null,
    });
    await expect(
      m.worklog.updateActivity(author(), 'a1', { classificationCode: 'REUNION' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la respuesta de la actividad aceptada informa su origen y queda bloqueada', async () => {
    const m = build();
    m.prismaObj.meeting.findMany.mockResolvedValue([meeting(M1)]);
    m.prismaObj.dailyLogActivity.findFirst.mockImplementation(async () => ({
      ...m.created[0],
      dailyLogSuggestionLink: {
        kind: 'MEETING',
        meetingId: M1,
        occurrenceId: null,
        taskId: null,
        meeting: { title: 'Reunión 01' },
        occurrence: null,
        task: null,
      },
    }));
    const res = await m.service.accept(author(), 'dl1', { items: [{ key: `MEETING:${M1}` }] });
    expect(res.accepted[0]).toMatchObject({
      classificationCode: 'REUNION',
      hours: 1.5,
      locked: true,
      source: { kind: 'MEETING', meetingId: M1, label: 'Reunión 01' },
    });
  });
});
