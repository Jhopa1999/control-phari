import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { CommitmentService } from './commitment/commitment.service';
import { CoordinationScopeService } from './coordination-scope.service';
import { MeetingService } from './meeting/meeting.service';
import { WorklogService } from './worklog/worklog.service';

/**
 * BL-068: las altas de Seguimiento (diario, reporte semanal, reunión y
 * compromiso) exigen que el actor pertenezca al proceso indicado. Antes aceptaban
 * cualquier `processId` (uno inexistente terminaba en un 500).
 */

function actorOf(role: RoleCode, processes: string[], isJefe = false): CurrentActor {
  return {
    userId: 'u1',
    name: 'Persona',
    identifier: 'persona@demo.local',
    grants: [],
    roleCodes: new Set([role]),
    scopedProcessIds: new Set(processes),
    isJefeArea: isJefe,
    isLiderProceso: false,
    isAdmin: false,
  };
}

const integrante = actorOf(RoleCode.INTEGRANTE, ['p1']);
const lider = actorOf(RoleCode.LIDER_PROCESO, ['p1']);
const jefe = actorOf(RoleCode.JEFE_AREA, [], true);

function build(existingProcessIds: string[] = ['p1', 'p2']) {
  const dailyCreate = jest.fn();
  const weeklyCreate = jest.fn();
  const meetingCreate = jest.fn();
  const commitmentCreate = jest.fn();
  const prismaObj: Record<string, unknown> = {
    process: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
        existingProcessIds.includes(where.id) ? { id: where.id } : null,
      ),
    },
    dailyLog: { create: dailyCreate },
    weeklyReport: { create: weeklyCreate },
    meeting: { create: meetingCreate },
    commitment: { create: commitmentCreate },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;
  const scope = new CoordinationScopeService(prisma);
  const audit = { record: jest.fn() } as unknown as AuditService;
  const notifier = { notify: jest.fn() } as never;
  const worklog = new WorklogService(prisma, audit, scope, notifier, {} as never);
  const meeting = new MeetingService(prisma, audit, scope);
  const commitment = new CommitmentService(prisma, audit, scope, {} as never, notifier);
  return { scope, worklog, meeting, commitment, dailyCreate, weeklyCreate, meetingCreate, commitmentCreate };
}

describe('CoordinationScopeService.assertActorInProcess', () => {
  it('integrante y líder con grant en el proceso: permitido', async () => {
    const { scope } = build();
    await expect(scope.assertActorInProcess(integrante, 'p1')).resolves.toBeUndefined();
    await expect(scope.assertActorInProcess(lider, 'p1')).resolves.toBeUndefined();
  });

  it('proceso ajeno: 403 sin confirmar si existe', async () => {
    const { scope } = build();
    await expect(scope.assertActorInProcess(integrante, 'p2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(scope.assertActorInProcess(lider, 'no-existe')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('jefe de área: cualquier proceso existente; uno inexistente da 400, no 500', async () => {
    const { scope } = build();
    await expect(scope.assertActorInProcess(jefe, 'p2')).resolves.toBeUndefined();
    await expect(scope.assertActorInProcess(jefe, 'no-existe')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('Altas de Seguimiento en un proceso ajeno', () => {
  it('diario: 403 y no crea nada', async () => {
    const m = build();
    await expect(
      m.worklog.createDailyLog(integrante, { processId: 'p2', date: '2026-05-04' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.dailyCreate).not.toHaveBeenCalled();
  });

  it('reporte semanal: 403 y no crea nada', async () => {
    const m = build();
    await expect(
      m.worklog.createWeeklyReport(integrante, { processId: 'p2', weekStart: '2026-05-04' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.weeklyCreate).not.toHaveBeenCalled();
  });

  it('reunión: 403 y no crea nada', async () => {
    const m = build();
    await expect(
      m.meeting.create(lider, { processId: 'p2', title: 'Comité', meetingDate: '2026-05-04' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.meetingCreate).not.toHaveBeenCalled();
  });

  it('compromiso: 403 y no crea nada', async () => {
    const m = build();
    await expect(
      m.commitment.create(integrante, { processId: 'p2', title: 'Enviar', dueDate: '2026-05-30' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.commitmentCreate).not.toHaveBeenCalled();
  });

  it('proceso inexistente enviado por el jefe: 400 en las cuatro altas', async () => {
    const m = build();
    const processId = '00000000-0000-4000-8000-000000000000';
    await expect(
      m.worklog.createDailyLog(jefe, { processId, date: '2026-05-04' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      m.worklog.createWeeklyReport(jefe, { processId, weekStart: '2026-05-04' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      m.meeting.create(jefe, { processId, title: 'Comité', meetingDate: '2026-05-04' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      m.commitment.create(jefe, { processId, title: 'Enviar', dueDate: '2026-05-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
