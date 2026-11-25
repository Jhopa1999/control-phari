import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { NotificationService } from '../../notification/notification.service';
import { CoordinationScopeService } from '../coordination-scope.service';
import { MeetingService } from './meeting.service';

function createMocks() {
  const prismaObj: Record<string, any> = {
    meeting: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    meetingParticipant: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    dailyLogSuggestionLink: { count: jest.fn().mockResolvedValue(0) },
    user: {
      findMany: jest.fn(),
      // Por defecto todas las personas existen y pertenecen al proceso.
      count: jest.fn((args: { where: { id: { in: string[] } } }) =>
        Promise.resolve(args.where.id.in.length),
      ),
    },
    grant: { findMany: jest.fn() },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) =>
    cb(prismaObj),
  );
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const scope = new CoordinationScopeService(prisma);
  const notify = jest.fn();
  const service = new MeetingService(prisma, audit, scope, {
    notify,
  } as unknown as NotificationService);
  return { prismaObj, auditRecord, service, notify };
}
function integrante(userId = 'ui', processId = 'p1'): CurrentActor {
  return {
    userId,
    name: 'Integrante',
    identifier: 'i@demo.local',
    grants: [
      {
        processId,
        processCode: processId,
        processName: processId,
        roleCode: RoleCode.INTEGRANTE,
        roleName: 'INTEGRANTE',
      },
    ],
    roleCodes: new Set([RoleCode.INTEGRANTE]),
    scopedProcessIds: new Set([processId]),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
  };
}
/** Participante tal como lo devuelve Prisma con su usuario. */
function participant(userId: string, name = `Persona ${userId}`) {
  return { userId, user: { name } };
}

function lider(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ul',
    name: 'Lider',
    identifier: 'lider@demo.local',
    grants: scoped.map((p) => ({
      processId: p,
      processCode: p,
      processName: p,
      roleCode: RoleCode.LIDER_PROCESO,
      roleName: 'LIDER_PROCESO',
    })),
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
    isLiderProceso: false,
    isAdmin: false,
  };
}

const now = new Date('2025-03-10T00:00:00.000Z');

function meetingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mt1',
    processId: 'p1',
    title: 'Sync',
    state: 'BORRADOR',
    relatedRequestId: null,
    responsibleUserId: null,
    meetingDate: new Date(Date.UTC(2025, 2, 10)),
    meetingTime: null,
    relatedProjectRequestId: null,
    agenda: null,
    decisions: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    process: { name: 'Proceso' },
    responsible: null,
    participants: [],
    commitments: [],
    ...overrides,
  };
}

describe('MeetingService', () => {
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    m.prismaObj.grant.findMany.mockResolvedValue([{ userId: 'uA' }]);
  });

  it('crea con estado inicial BORRADOR y participantes en alcance; audita MEETING', async () => {
    m.prismaObj.meeting.create.mockImplementation(({ data }: any) =>
      Promise.resolve(
        meetingRow({
          ...data,
          participants: (data.participants?.create ?? []).map((p: any) =>
            participant(p.userId),
          ),
        }),
      ),
    );

    const res = await m.service.create(lider(['p1']), {
      processId: 'p1',
      title: 'Sync',
      meetingDate: '2025-03-10',
      participantUserIds: ['uA'],
    });
    expect(res.state).toBe('BORRADOR');
    expect(res.participantUserIds).toEqual(['uA']);
    expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
      action: 'CREATE',
      objectType: 'MEETING',
      scopeProcessId: 'p1',
    });
  });

  it('participante que no es del proceso -> 400 y no crea la reunión', async () => {
    m.prismaObj.user.count.mockResolvedValue(0);
    await expect(
      m.service.create(lider(['p1']), {
        processId: 'p1',
        title: 'Sync',
        meetingDate: '2025-03-10',
        participantUserIds: ['intruso'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(m.prismaObj.meeting.create).not.toHaveBeenCalled();
  });

  it('PATCH reemplaza el set de participantes (deleteMany + createMany)', async () => {
    m.prismaObj.meeting.findFirst.mockResolvedValue(meetingRow());
    m.prismaObj.meeting.update.mockResolvedValue(
      meetingRow({ participants: [participant('uA')] }),
    );

    await m.service.update(lider(['p1']), 'mt1', {
      participantUserIds: ['uA'],
    });
    expect(m.prismaObj.meetingParticipant.deleteMany).toHaveBeenCalledWith({
      where: { meetingId: 'mt1' },
    });
    expect(m.prismaObj.meetingParticipant.createMany).toHaveBeenCalledWith({
      data: [{ meetingId: 'mt1', userId: 'uA' }],
    });
  });

  it(':id ajeno -> 404', async () => {
    m.prismaObj.meeting.findFirst.mockResolvedValue(null);
    await expect(
      m.service.get(lider(['p1']), 'ajeno'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create sin participantes (lista vacia) no consulta personas', async () => {
    m.prismaObj.meeting.create.mockImplementation(({ data }: any) =>
      Promise.resolve(meetingRow({ ...data, participants: [] })),
    );
    const res = await m.service.create(lider(['p1']), {
      processId: 'p1',
      title: 'Sync',
      meetingDate: '2025-03-10',
    });
    expect(res.participantUserIds).toEqual([]);
    expect(m.prismaObj.user.count).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('create de-duplica participantes repetidos', async () => {
    m.prismaObj.user.findMany.mockResolvedValue([
      { id: 'ul', name: 'Lider', identifier: 'l' },
      { id: 'uA', name: 'A', identifier: 'a' },
    ]);
    m.prismaObj.meeting.create.mockImplementation(({ data }: any) =>
      Promise.resolve(
        meetingRow({
          ...data,
          participants: (data.participants?.create ?? []).map((p: any) =>
            participant(p.userId),
          ),
        }),
      ),
    );
    const res = await m.service.create(lider(['p1']), {
      processId: 'p1',
      title: 'Sync',
      meetingDate: '2025-03-10',
      participantUserIds: ['uA', 'uA'],
    });
    expect(res.participantUserIds).toEqual(['uA']);
  });

  describe('update', () => {
    it('actualiza campos escalares y audita UPDATE', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue(meetingRow());
      m.prismaObj.meeting.update.mockImplementation(({ data }: any) =>
        Promise.resolve(meetingRow({ ...data, participants: [] })),
      );
      const res = await m.service.update(lider(['p1']), 'mt1', {
        title: 'Renombrada',
        state: 'CONFIRMADA',
        meetingDate: '2025-04-01',
        meetingTime: '10:00',
        responsibleUserId: 'ul',
        agenda: 'a',
        decisions: 'd',
        notes: 'n',
      });
      expect(res.title).toBe('Renombrada');
      expect(res.state).toBe('CONFIRMADA');
      expect(res.meetingDate).toBe('2025-04-01');
      expect(m.prismaObj.meetingParticipant.deleteMany).not.toHaveBeenCalled();
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'MEETING',
      });
    });

    it('participantes a lista vacia: deleteMany sin createMany', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue(
        meetingRow({ participants: [participant('uA')] }),
      );
      m.prismaObj.meeting.update.mockResolvedValue(
        meetingRow({ participants: [] }),
      );
      await m.service.update(lider(['p1']), 'mt1', {
        participantUserIds: [],
      });
      expect(m.prismaObj.meetingParticipant.deleteMany).toHaveBeenCalled();
      expect(m.prismaObj.meetingParticipant.createMany).not.toHaveBeenCalled();
    });

    it('participante nuevo que no es del proceso en update -> 400', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue(meetingRow());
      m.prismaObj.user.count.mockResolvedValue(0);
      await expect(
        m.service.update(lider(['p1']), 'mt1', {
          participantUserIds: ['intruso'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reenviar el responsable sin cambios no valida pertenencia -> no 400', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue(meetingRow({ responsibleUserId: 'ur' }));
      m.prismaObj.user.count.mockResolvedValue(0);
      m.prismaObj.meeting.update.mockImplementation(({ data }: any) =>
        Promise.resolve(meetingRow({ responsibleUserId: 'ur', ...data, participants: [] })),
      );
      const res = await m.service.update(lider(['p1']), 'mt1', {
        title: 'Otro',
        responsibleUserId: 'ur',
      });
      expect(res.title).toBe('Otro');
      expect(m.prismaObj.user.count).not.toHaveBeenCalled();
    });

    it('cambiar el responsable a alguien ajeno al proceso sigue dando 400', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue(meetingRow({ responsibleUserId: 'ur' }));
      m.prismaObj.user.count.mockResolvedValue(0);
      await expect(
        m.service.update(lider(['p1']), 'mt1', { responsibleUserId: 'otra' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it(':id fuera de alcance -> 404', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue(null);
      await expect(
        m.service.update(lider(['p1']), 'ajeno', { title: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('aplica filtros processId/state', async () => {
      m.prismaObj.meeting.findMany.mockResolvedValue([meetingRow()]);
      const res = await m.service.list(lider(['p1']), {
        processId: 'p1',
        state: 'BORRADOR',
      } as any);
      expect(res).toHaveLength(1);
      const and = m.prismaObj.meeting.findMany.mock.calls[0][0].where.AND;
      expect(and).toContainEqual({ processId: 'p1' });
      expect(and).toContainEqual({ state: 'BORRADOR' });
    });

    it('filtra por solicitud (relacionada o proyecto) sin saltarse el alcance', async () => {
      m.prismaObj.meeting.findMany.mockResolvedValue([]);
      await m.service.list(lider(['p1']), { requestId: 'r1' } as any);
      const and = m.prismaObj.meeting.findMany.mock.calls[0][0].where.AND;
      expect(and).toHaveLength(2);
      expect(and).toContainEqual({
        OR: [{ relatedRequestId: 'r1' }, { relatedProjectRequestId: 'r1' }],
      });
    });

    it('sin filtros devuelve solo alcance', async () => {
      m.prismaObj.meeting.findMany.mockResolvedValue([]);
      const res = await m.service.list(lider(['p1']), {} as any);
      expect(res).toEqual([]);
      const and = m.prismaObj.meeting.findMany.mock.calls[0][0].where.AND;
      expect(and).toHaveLength(1);
    });
  });

  describe('remove', () => {
    it('elimina y audita DELETE con after null', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue(
        meetingRow({ participants: [participant('uA')] }),
      );
      m.prismaObj.meeting.delete.mockResolvedValue(meetingRow());
      await m.service.remove(lider(['p1']), 'mt1');
      expect(m.prismaObj.meeting.delete).toHaveBeenCalledWith({
        where: { id: 'mt1' },
      });
      expect(m.auditRecord.mock.calls[0][1].after).toBeNull();
    });

    it('un participante que no dirige el acta no la elimina (403)', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue(
        meetingRow({ responsibleUserId: 'ur', participants: [participant('ui')] }),
      );
      await expect(m.service.remove(integrante('ui'), 'mt1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(m.prismaObj.meeting.delete).not.toHaveBeenCalled();
    });
    it(':id fuera de alcance -> 404', async () => {
      m.prismaObj.meeting.findFirst.mockResolvedValue(null);
      await expect(
        m.service.remove(lider(['p1']), 'ajeno'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
