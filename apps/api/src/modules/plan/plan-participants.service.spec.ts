import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { PlanParticipantsService } from './plan-participants.service';
import { PlanStateService } from './plan-state.service';

const MAIN = 'p-ia';
const INTEG = 'p-int';
const OTROS = 'p-otros';

const jefe: CurrentActor = {
  userId: 'u-jefe',
  name: 'Jefe',
  identifier: 'jefe@demo.local',
  grants: [],
  roleCodes: new Set([RoleCode.JEFE_AREA]),
  scopedProcessIds: new Set([MAIN]),
  isJefeArea: true,
  isLiderProceso: false,
  isAdmin: false,
};

interface Fixture {
  participants: string[];
  tasks: Array<{ id: string; title: string; responsibleUserId: string | null; name: string }>;
  grants: Array<{ userId: string; processId: string }>;
  state: string;
}

/** Prisma en memoria con solo lo que usa el servicio. */
function build(fx: Fixture) {
  const processes = [
    { id: MAIN, code: 'IA', name: 'IA', active: true },
    { id: INTEG, code: 'INT', name: 'Integraciones', active: true },
    { id: OTROS, code: 'OTR', name: 'Otros', active: true },
    { id: 'p-off', code: 'OFF', name: 'Inactivo', active: false },
  ];
  const prisma = {
    requestParticipant: {
      findMany: jest.fn(async () => fx.participants.map((processId) => ({ processId }))),
      deleteMany: jest.fn(async ({ where }: { where: { processId: { in: string[] } } }) => {
        fx.participants = fx.participants.filter((p) => !where.processId.in.includes(p));
      }),
      createMany: jest.fn(async ({ data }: { data: Array<{ processId: string }> }) => {
        fx.participants.push(...data.map((d) => d.processId));
      }),
    },
    process: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const or = where.OR as Array<Record<string, unknown>> | undefined;
        if (or) {
          const ids = ((or[1].id as { in: string[] }).in);
          return processes.filter((p) => p.active || ids.includes(p.id));
        }
        const ids = (where.id as { in: string[] }).in;
        return processes.filter((p) => ids.includes(p.id) && (where.active !== true || p.active));
      }),
    },
    task: {
      findMany: jest.fn(async () =>
        fx.tasks
          .filter((t) => t.responsibleUserId)
          .map((t) => ({
            id: t.id,
            title: t.title,
            responsibleUserId: t.responsibleUserId,
            responsible: { name: t.name },
          })),
      ),
    },
    grant: { findMany: jest.fn(async () => fx.grants) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const planState = {
    requirePlanInScope: jest.fn(async () => ({
      plan: { id: 'plan-1' },
      requestId: 'req-1',
      mainProcessId: MAIN,
      requestState: fx.state,
    })),
  };
  const service = new PlanParticipantsService(
    prisma as unknown as PrismaService,
    audit as never,
    planState as unknown as PlanStateService,
  );
  return { service, prisma, audit };
}

function fixture(over: Partial<Fixture> = {}): Fixture {
  return {
    participants: [MAIN],
    tasks: [],
    grants: [],
    state: 'EN_PLANIFICACION',
    ...over,
  };
}

describe('PlanParticipantsService', () => {
  it('agrega un proceso, audita quién/qué y no toca nada más', async () => {
    const fx = fixture();
    const { service, audit, prisma } = build(fx);
    const res = await service.update(jefe, 'req-1', { participantProcessIds: [INTEG] });
    expect(fx.participants.sort()).toEqual([INTEG, MAIN].sort());
    expect(res.addedProcessIds).toEqual([INTEG]);
    expect(res.removedProcessIds).toEqual([]);
    expect(res.processes.find((p) => p.processId === INTEG)?.isParticipant).toBe(true);
    expect(res.processes[0].isMain).toBe(true);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorUserId: 'u-jefe',
        action: 'UPDATE',
        objectType: 'REQUEST',
        objectId: 'req-1',
        scopeProcessId: MAIN,
        after: expect.objectContaining({ addedProcessIds: [INTEG], removedProcessIds: [] }),
      }),
    );
    // Solo se tocan participantes: no hay escrituras de solicitud ni de tareas.
    expect(Object.keys(prisma)).not.toContain('request');
  });

  it('el principal no se puede quitar: se conserva aunque se omita', async () => {
    const fx = fixture({ participants: [MAIN, INTEG] });
    const { service } = build(fx);
    const res = await service.update(jefe, 'req-1', { participantProcessIds: [] });
    expect(fx.participants).toEqual([MAIN]);
    expect(res.removedProcessIds).toEqual([INTEG]);
    expect(res.processes.find((p) => p.processId === MAIN)?.canRemove).toBe(false);
  });

  it('quitar con tareas asignadas a su gente se rechaza con 409 y nombra las tareas', async () => {
    const fx = fixture({
      participants: [MAIN, INTEG],
      tasks: [{ id: 't1', title: 'Integrar API', responsibleUserId: 'u-int', name: 'Ana' }],
      grants: [{ userId: 'u-int', processId: INTEG }],
    });
    const { service, audit } = build(fx);
    const err = await service
      .update(jefe, 'req-1', { participantProcessIds: [] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).message).toContain('Integraciones');
    expect((err as ConflictException).message).toContain('«Integrar API»');
    expect(fx.participants).toEqual([MAIN, INTEG]);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('quitar sin tareas asignadas a su gente se permite', async () => {
    const fx = fixture({
      participants: [MAIN, INTEG],
      tasks: [{ id: 't1', title: 'Tarea IA', responsibleUserId: 'u-ia', name: 'Luis' }],
      grants: [{ userId: 'u-ia', processId: MAIN }],
    });
    const { service, audit } = build(fx);
    await service.update(jefe, 'req-1', { participantProcessIds: [] });
    expect(fx.participants).toEqual([MAIN]);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('una persona que sigue elegible por otro proceso no bloquea la baja', async () => {
    const fx = fixture({
      participants: [MAIN, INTEG],
      tasks: [{ id: 't1', title: 'Tarea', responsibleUserId: 'u-x', name: 'Eva' }],
      grants: [
        { userId: 'u-x', processId: INTEG },
        { userId: 'u-x', processId: MAIN },
      ],
    });
    const { service } = build(fx);
    await service.update(jefe, 'req-1', { participantProcessIds: [] });
    expect(fx.participants).toEqual([MAIN]);
  });

  it('la consulta indica por qué no se puede quitar cada proceso', async () => {
    const fx = fixture({
      participants: [MAIN, INTEG],
      tasks: [{ id: 't1', title: 'Integrar API', responsibleUserId: 'u-int', name: 'Ana' }],
      grants: [{ userId: 'u-int', processId: INTEG }],
    });
    const { service } = build(fx);
    const res = await service.get(jefe, 'req-1');
    const integ = res.processes.find((p) => p.processId === INTEG);
    expect(integ?.canRemove).toBe(false);
    expect(integ?.removalBlockedBy).toEqual([
      { id: 't1', title: 'Integrar API', responsibleName: 'Ana' },
    ]);
    expect(res.processes.find((p) => p.processId === OTROS)?.isParticipant).toBe(false);
    // Los procesos inactivos que no participan no se ofrecen.
    expect(res.processes.some((p) => p.processId === 'p-off')).toBe(false);
  });

  it.each(['COMPROMETIDA', 'CERRADA', 'RETIRADA', 'RECHAZADA', 'DEVUELTA', 'EN_TRIAGE'])(
    'rechaza con 409 en estado %s',
    async (state) => {
      const fx = fixture({ state });
      const { service, audit } = build(fx);
      await expect(
        service.update(jefe, 'req-1', { participantProcessIds: [INTEG] }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(fx.participants).toEqual([MAIN]);
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it.each(['EN_PLANIFICACION', 'EN_EJECUCION', 'EN_VALIDACION', 'OPERATIVA'])(
    'admite el estado %s',
    async (state) => {
      const { service } = build(fixture({ state }));
      await expect(
        service.update(jefe, 'req-1', { participantProcessIds: [INTEG] }),
      ).resolves.toBeDefined();
    },
  );

  it('rechaza con 400 un proceso inexistente o inactivo', async () => {
    const { service } = build(fixture());
    await expect(
      service.update(jefe, 'req-1', { participantProcessIds: ['p-off'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sin cambios no escribe ni audita (idempotente)', async () => {
    const fx = fixture({ participants: [MAIN, INTEG] });
    const { service, audit, prisma } = build(fx);
    await service.update(jefe, 'req-1', { participantProcessIds: [INTEG, MAIN] });
    expect(audit.record).not.toHaveBeenCalled();
    expect(prisma.requestParticipant.createMany).not.toHaveBeenCalled();
    expect(prisma.requestParticipant.deleteMany).not.toHaveBeenCalled();
  });
});
