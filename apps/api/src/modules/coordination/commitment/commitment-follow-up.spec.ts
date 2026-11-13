import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { NotificationType } from '../../notification/notification.service';
import { CoordinationScopeService } from '../coordination-scope.service';
import { WorkflowStateService } from '../workflow-state.service';
import { MeetingService } from '../meeting/meeting.service';
import { CommitmentService } from './commitment.service';
import { CommitmentNoticeService } from './commitment-notice.service';

// Hoy fijo: 2025-03-10 12:00 en Lima.
const NOW = new Date('2025-03-10T17:00:00.000Z');
const day = (d: number) => new Date(Date.UTC(2025, 2, d));

beforeAll(() => {
  process.env.RECURRING_ACTIVITY_TIMEZONE = 'America/Lima';
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
});
afterAll(() => jest.useRealTimers());

function actor(userId = 'ui'): CurrentActor {
  return {
    userId,
    name: 'X',
    identifier: 'x@demo.local',
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

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    processId: 'p1',
    title: 'Entregar X',
    state: 'EN_CURSO',
    relatedRequestId: null,
    responsibleUserId: null,
    assignedUserId: 'ui',
    dueDate: day(10),
    relatedProjectRequestId: null,
    sourceMeetingId: null,
    expectedResult: null,
    result: null,
    blockers: null,
    dueSoonNotifiedAt: null,
    dueTodayNotifiedAt: null,
    overdueNotifiedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    sourceMeeting: null,
    process: { name: 'Proceso 1' },
    ...overrides,
  };
}

function build() {
  const prismaObj: Record<string, any> = {
    commitment: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...row(), ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    meeting: { findFirst: jest.fn() },
    request: { findFirst: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    grant: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const notifications = { notify: jest.fn() };
  const scope = new CoordinationScopeService(prisma);
  return {
    prismaObj,
    notifications,
    commitments: new CommitmentService(prisma, audit, scope, new WorkflowStateService(), notifications as never),
    meetings: new MeetingService(prisma, audit, scope),
    notices: new CommitmentNoticeService(prisma, notifications as never),
  };
}

describe('Compromisos en Mi trabajo', () => {
  it('«míos» = asignado, o responsable cuando no hay asignado; solo abiertos', async () => {
    const m = build();
    await m.commitments.myWork(actor());
    const where = m.prismaObj.commitment.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { state: { in: ['EN_CURSO', 'BLOQUEADO'] } },
        { OR: [{ assignedUserId: 'ui' }, { assignedUserId: null, responsibleUserId: 'ui' }] },
      ]),
    );
  });

  it('lista vencidos y los que vencen hoy, y cuenta los próximos', async () => {
    const m = build();
    m.prismaObj.commitment.findMany.mockResolvedValue([
      row({ id: 'v', dueDate: day(3) }),
      row({ id: 'h', dueDate: day(10) }),
      row({ id: 'p', dueDate: day(12) }),
    ]);
    const res = await m.commitments.myWork(actor());
    expect(res).toMatchObject({ total: 3, overdueCount: 1, dueTodayCount: 1, upcomingCount: 1 });
    expect(res.items.map((i) => [i.id, i.dueStatus])).toEqual([
      ['v', 'VENCIDO'],
      ['h', 'VENCE_HOY'],
    ]);
    expect(res.items[0]).toMatchObject({ daysToDue: -7, processName: 'Proceso 1', canComplete: true });
  });

  it('la respuesta general del compromiso trae el semáforo', async () => {
    const m = build();
    m.prismaObj.commitment.findFirst.mockResolvedValue(row({ dueDate: day(9) }));
    const res = await m.commitments.get(actor(), 'c1');
    expect(res).toMatchObject({ dueStatus: 'VENCIDO', daysToDue: -1 });
  });
});

describe('Compromisos abiertos de mis reuniones', () => {
  it('solo los de reuniones donde el actor es responsable, con semáforo y contadores', async () => {
    const m = build();
    const meeting = { id: 'mt1', title: 'Comité', meetingDate: day(1) };
    m.prismaObj.commitment.findMany.mockResolvedValue([
      row({ id: 'a', dueDate: day(5), sourceMeeting: meeting, assigned: { name: 'Ana' } }),
      row({ id: 'b', dueDate: day(30), sourceMeeting: meeting, assigned: null, responsible: { name: 'Beto' } }),
    ]);
    const res = await m.meetings.commitmentsOpen(actor('resp'), {});
    const where = m.prismaObj.commitment.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { state: { in: ['EN_CURSO', 'BLOQUEADO'] } },
        { sourceMeeting: { is: { responsibleUserId: 'resp' } } },
      ]),
    );
    expect(res.counts).toEqual({ total: 2, vencido: 1, venceHoy: 0, proximo: 0, aTiempo: 1 });
    expect(res.items[0]).toMatchObject({ id: 'a', dueStatus: 'VENCIDO', assignedUserName: 'Ana', meetingTitle: 'Comité' });
    expect(res.items[1].assignedUserName).toBe('Beto');
    expect(res.truncated).toBe(false);
  });

  it('filtra por semáforo', async () => {
    const m = build();
    const meeting = { id: 'mt1', title: 'Comité', meetingDate: day(1) };
    m.prismaObj.commitment.findMany.mockResolvedValue([
      row({ id: 'a', dueDate: day(5), sourceMeeting: meeting }),
      row({ id: 'b', dueDate: day(30), sourceMeeting: meeting }),
    ]);
    const res = await m.meetings.commitmentsOpen(actor('resp'), { dueStatus: 'A_TIEMPO' });
    expect(res.items.map((i) => i.id)).toEqual(['b']);
  });
});

describe('Avisos de vencimiento de compromisos', () => {
  it('vence mañana, vence hoy y vencido: un aviso por tipo al destinatario', async () => {
    const m = build();
    m.prismaObj.commitment.findMany.mockResolvedValue([
      row({ id: 'm', dueDate: day(11) }),
      row({ id: 'h', dueDate: day(10), assignedUserId: null, responsibleUserId: 'resp' }),
      row({ id: 'v', dueDate: day(8) }),
    ]);
    const res = await m.notices.sendDueNotices(NOW);
    expect(res).toEqual({ dueSoon: 1, dueToday: 1, overdue: 1 });
    const types = m.notifications.notify.mock.calls.map((c: any[]) => [c[0].type, c[0].userIds]);
    expect(types).toEqual([
      [NotificationType.COMMITMENT_DUE_SOON, ['ui']],
      [NotificationType.COMMITMENT_DUE_TODAY, ['resp']],
      [NotificationType.COMMITMENT_OVERDUE, ['ui']],
    ]);
    expect(m.prismaObj.commitment.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'm', dueSoonNotifiedAt: null },
      data: { dueSoonNotifiedAt: NOW },
    });
  });

  it('idempotente: si otra corrida ya reclamó la marca no se vuelve a avisar', async () => {
    const m = build();
    m.prismaObj.commitment.findMany.mockResolvedValue([row({ id: 'h', dueDate: day(10) })]);
    m.prismaObj.commitment.updateMany.mockResolvedValue({ count: 0 });
    const res = await m.notices.sendDueNotices(NOW);
    expect(res.dueToday).toBe(0);
    expect(m.notifications.notify).not.toHaveBeenCalled();
  });

  it('con la marca ya puesta no reclama ni avisa; sin destinatario tampoco', async () => {
    const m = build();
    m.prismaObj.commitment.findMany.mockResolvedValue([
      row({ id: 'v', dueDate: day(8), overdueNotifiedAt: NOW }),
      row({ id: 'x', dueDate: day(10), assignedUserId: null, responsibleUserId: null }),
    ]);
    await m.notices.sendDueNotices(NOW);
    expect(m.prismaObj.commitment.updateMany).not.toHaveBeenCalled();
    expect(m.notifications.notify).not.toHaveBeenCalled();
  });

  it('un fallo al notificar no rompe la corrida', async () => {
    const m = build();
    m.prismaObj.commitment.findMany.mockResolvedValue([
      row({ id: 'a', dueDate: day(10) }),
      row({ id: 'b', dueDate: day(8) }),
    ]);
    m.notifications.notify.mockRejectedValueOnce(new Error('caída'));
    const res = await m.notices.sendDueNotices(NOW);
    expect(res).toEqual({ dueSoon: 0, dueToday: 0, overdue: 1 });
  });
});

describe('Reinicio de las marcas de aviso', () => {
  it('cambiar el vencimiento o el destinatario reinicia las marcas', async () => {
    const m = build();
    m.prismaObj.commitment.findFirst.mockResolvedValue(row({ dueTodayNotifiedAt: NOW }));
    await m.commitments.update(actor(), 'c1', { dueDate: '2025-03-20' });
    expect(m.prismaObj.commitment.update.mock.calls[0][0].data).toMatchObject({
      dueSoonNotifiedAt: null,
      dueTodayNotifiedAt: null,
      overdueNotifiedAt: null,
    });
    await m.commitments.update(actor(), 'c1', { assignedUserId: 'otra' });
    expect(m.prismaObj.commitment.update.mock.calls[1][0].data).toMatchObject({ overdueNotifiedAt: null });
  });

  it('editar otros campos no reinicia las marcas', async () => {
    const m = build();
    m.prismaObj.commitment.findFirst.mockResolvedValue(row());
    await m.commitments.update(actor(), 'c1', { title: 'Otro', dueDate: '2025-03-10' });
    expect(m.prismaObj.commitment.update.mock.calls[0][0].data).not.toHaveProperty('overdueNotifiedAt');
  });

  it('reabrir un compromiso completado reinicia las marcas', async () => {
    const m = build();
    m.prismaObj.commitment.findFirst.mockResolvedValue(row({ state: 'COMPLETADO' }));
    await m.commitments.transition(actor(), 'c1', { toState: 'EN_CURSO' });
    expect(m.prismaObj.commitment.update.mock.calls[0][0].data).toMatchObject({
      state: 'EN_CURSO',
      overdueNotifiedAt: null,
    });
  });
});
