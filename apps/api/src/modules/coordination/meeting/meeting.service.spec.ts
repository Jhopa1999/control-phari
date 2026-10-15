import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
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
  const service = new MeetingService(prisma, audit, scope);
  return { prismaObj, auditRecord, service };
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
    participants: [],
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
    // listPeople: lider -> el + uA.
    m.prismaObj.user.findMany.mockResolvedValue([
      { id: 'ul', name: 'Lider', identifier: 'l' },
      { id: 'uA', name: 'A', identifier: 'a' },
    ]);
    m.prismaObj.meeting.create.mockImplementation(({ data }: any) =>
      Promise.resolve(
        meetingRow({
          ...data,
          participants: (data.participants?.create ?? []).map((p: any) => ({
            userId: p.userId,
          })),
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

  it('participante fuera del alcance -> 400', async () => {
    m.prismaObj.user.findMany.mockResolvedValue([
      { id: 'ul', name: 'Lider', identifier: 'l' },
      { id: 'uA', name: 'A', identifier: 'a' },
    ]);
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
    m.prismaObj.user.findMany.mockResolvedValue([
      { id: 'ul', name: 'Lider', identifier: 'l' },
      { id: 'uA', name: 'A', identifier: 'a' },
    ]);
    m.prismaObj.meeting.update.mockResolvedValue(
      meetingRow({ participants: [{ userId: 'uA' }] }),
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
});
