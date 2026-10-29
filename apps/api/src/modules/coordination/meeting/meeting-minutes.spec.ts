import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { CoordinationScopeService } from '../coordination-scope.service';
import { MeetingService } from './meeting.service';

function actor(role: RoleCode, userId = 'u1'): CurrentActor {
  return {
    userId,
    name: 'X',
    identifier: 'x',
    grants: [{ processId: 'p1', processCode: 'p1', processName: 'p1', roleCode: role, roleName: role }],
    roleCodes: new Set([role]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: role === RoleCode.JEFE_AREA,
    isAdmin: false,
  } as CurrentActor;
}

const now = new Date('2026-03-10T00:00:00.000Z');
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mt1',
    processId: 'p1',
    title: 'Comité',
    state: 'BORRADOR',
    relatedRequestId: null,
    responsibleUserId: 'resp',
    meetingDate: new Date(Date.UTC(2026, 2, 10)),
    meetingTime: null,
    relatedProjectRequestId: null,
    agenda: 'Temas',
    decisions: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    participants: [{ userId: 'u1' }],
    commitments: [],
    ...overrides,
  };
}

function build(current: ReturnType<typeof row>) {
  const prismaObj: Record<string, any> = {
    meeting: {
      findFirst: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...current, ...data })),
      delete: jest.fn(),
    },
    meetingParticipant: { deleteMany: jest.fn(), createMany: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    grant: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const service = new MeetingService(prisma, audit, new CoordinationScopeService(prisma));
  return { service, prismaObj };
}

const commitment = {
  id: 'c1', title: 'Entregar', state: 'EN_CURSO', dueDate: new Date(Date.UTC(2026, 2, 20)),
  assignedUserId: 'u2', responsibleUserId: null, expectedResult: null, result: null,
};

describe('MeetingService · acta', () => {
  it('devuelve los compromisos del acta y cuántos siguen abiertos', async () => {
    const { service } = build(row({ commitments: [commitment, { ...commitment, id: 'c2', state: 'COMPLETADO' }] }));
    const res = await service.get(actor(RoleCode.LIDER_PROCESO), 'mt1');
    expect(res.commitmentsTotal).toBe(2);
    expect(res.commitmentsOpen).toBe(1);
    expect(res.commitments[0]).toMatchObject({ id: 'c1', dueDate: '2026-03-20' });
    expect(res.closed).toBe(false);
  });

  it('no se cierra un acta sin decisiones ni compromisos', async () => {
    const { service } = build(row());
    await expect(service.close(actor(RoleCode.LIDER_PROCESO), 'mt1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('el responsable cierra el acta con decisiones; un integrante ajeno no puede', async () => {
    await expect(
      build(row({ decisions: 'Acordado' })).service.close(actor(RoleCode.INTEGRANTE, 'otro'), 'mt1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const { service, prismaObj } = build(row({ decisions: 'Acordado' }));
    const res = await service.close(actor(RoleCode.INTEGRANTE, 'resp'), 'mt1');
    expect(prismaObj.meeting.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { state: 'COMPLETADO' } }),
    );
    expect(res.closed).toBe(true);
  });

  it('un acta cerrada no se edita ni se elimina', async () => {
    const { service } = build(row({ state: 'COMPLETADO', decisions: 'x' }));
    await expect(service.update(actor(RoleCode.JEFE_AREA), 'mt1', { title: 'Nuevo' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove(actor(RoleCode.JEFE_AREA), 'mt1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('cerrar por PATCH de estado no está permitido', async () => {
    const { service } = build(row({ decisions: 'x' }));
    await expect(
      service.update(actor(RoleCode.JEFE_AREA), 'mt1', { state: 'COMPLETADO' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no se elimina un acta con compromisos', async () => {
    const { service } = build(row({ commitments: [commitment] }));
    await expect(service.remove(actor(RoleCode.JEFE_AREA), 'mt1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('reabrir: solo líder del proceso o jefe', async () => {
    await expect(
      build(row({ state: 'COMPLETADO' })).service.reopen(actor(RoleCode.INTEGRANTE, 'resp'), 'mt1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const res = await build(row({ state: 'COMPLETADO' })).service.reopen(actor(RoleCode.LIDER_PROCESO), 'mt1');
    expect(res.state).toBe('BORRADOR');
  });
});
