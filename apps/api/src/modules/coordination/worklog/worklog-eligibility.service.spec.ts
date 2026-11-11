import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { RequestScopeService } from '../../request/request-scope.service';
import {
  CLOSED_GRACE_PARAM_CODE,
  DEFAULT_CLOSED_GRACE_DAYS,
  WORKLOG_ELIGIBLE_STATES,
  WORKLOG_OPTIONS_LIMIT,
  WORKLOG_PARAM_CATALOG,
  WorklogEligibilityService,
} from './worklog-eligibility.service';

const P1 = 'p1';
const DAY = new Date(Date.UTC(2026, 10, 11)); // 2026-11-11

function grant(processId: string, roleCode: RoleCode) {
  return {
    processId,
    processCode: processId.toUpperCase(),
    processName: processId,
    roleCode,
    roleName: roleCode,
  };
}

function actor(role: 'jefe' | 'lider' | 'integrante', processes = [P1]): CurrentActor {
  const roleCode =
    role === 'jefe'
      ? RoleCode.JEFE_AREA
      : role === 'lider'
        ? RoleCode.LIDER_PROCESO
        : RoleCode.INTEGRANTE;
  return {
    userId: `u-${role}`,
    name: role,
    identifier: `${role}@demo.local`,
    grants: processes.map((p) => grant(p, roleCode)),
    roleCodes: new Set([roleCode]),
    scopedProcessIds: new Set(processes),
    isJefeArea: role === 'jefe',
    isLiderProceso: role === 'lider',
    isAdmin: false,
  };
}

function setup() {
  const prismaObj = {
    catalogItem: { findFirst: jest.fn().mockResolvedValue(null) },
    request: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    task: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new WorklogEligibilityService(
    prismaObj as unknown as PrismaService,
    new RequestScopeService(),
  );
  return { prismaObj, service };
}

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    code: 'PRY-0012',
    operationalState: 'EN_EJECUCION',
    closedAt: null,
    mainProcessId: P1,
    plan: { id: 'pl1' },
    participants: [],
    ...overrides,
  };
}

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    code: 'PRY-0012-T07',
    responsibleUserId: 'u-integrante',
    phase: { plan: { requestId: 'r12' } },
    ...overrides,
  };
}

describe('WorklogEligibilityService', () => {
  describe('closedGraceDays (parámetro gestionable)', () => {
    it('lee el valor de la maestra WORKLOG_PARAM', async () => {
      const { prismaObj, service } = setup();
      prismaObj.catalogItem.findFirst.mockResolvedValue({ label: '14' });
      await expect(service.closedGraceDays()).resolves.toBe(14);
      expect(prismaObj.catalogItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            catalog: WORKLOG_PARAM_CATALOG,
            code: CLOSED_GRACE_PARAM_CODE,
            active: true,
          },
        }),
      );
    });

    it('0 es válido (sin gracia)', async () => {
      const { prismaObj, service } = setup();
      prismaObj.catalogItem.findFirst.mockResolvedValue({ label: '0' });
      await expect(service.closedGraceDays()).resolves.toBe(0);
    });

    it.each([null, { label: 'siete' }, { label: '-3' }, { label: '9999' }])(
      'sin parámetro o inválido (%p) -> valor por defecto',
      async (row) => {
        const { prismaObj, service } = setup();
        prismaObj.catalogItem.findFirst.mockResolvedValue(row);
        await expect(service.closedGraceDays()).resolves.toBe(
          DEFAULT_CLOSED_GRACE_DAYS,
        );
      },
    );
  });

  describe('canImputeOthers (D1/D2)', () => {
    const { service } = setup();
    it('el integrante no puede imputar tareas ajenas', () => {
      expect(service.canImputeOthers(actor('integrante'), P1)).toBe(false);
    });
    it('el líder puede en el proceso que lidera, no en otro', () => {
      expect(service.canImputeOthers(actor('lider'), P1)).toBe(true);
      expect(service.canImputeOthers(actor('lider'), 'p2')).toBe(false);
    });
    it('el jefe puede siempre', () => {
      expect(service.canImputeOthers(actor('jefe'), 'p2')).toBe(true);
    });
  });

  describe('projectWhere (estado, ventana y proceso del diario)', () => {
    it('admite solo los estados activos y CERRADA dentro de la ventana', () => {
      const { service } = setup();
      const where = service.projectWhere(actor('integrante'), P1, DAY, 7) as {
        AND: Array<Record<string, any>>;
      };
      const states = where.AND.find((c) => c.OR?.[0]?.operationalState)!.OR;
      expect(states[0].operationalState.in).toEqual([...WORKLOG_ELIGIBLE_STATES]);
      expect(states[0].operationalState.in).not.toContain('REGISTRADA');
      expect(states[0].operationalState.in).not.toContain('RECHAZADA');
      expect(states[0].operationalState.in).not.toContain('OPERATIVA');
      expect(states[1].operationalState).toBe('CERRADA');
      // 7 días antes de 2026-11-11 = 2026-11-04.
      expect(states[1].closedAt.gte).toEqual(new Date(Date.UTC(2026, 10, 4)));
    });

    it('la ventana depende de los días de gracia', () => {
      const { service } = setup();
      const where = service.projectWhere(actor('jefe'), P1, DAY, 30) as {
        AND: Array<Record<string, any>>;
      };
      const closed = where.AND.find((c) => c.OR?.[1]?.closedAt)!.OR[1];
      expect(closed.closedAt.gte).toEqual(new Date(Date.UTC(2026, 9, 12)));
    });

    it('exige plan y que el proceso del diario sea principal o participante', () => {
      const { service } = setup();
      const where = service.projectWhere(actor('integrante'), P1, DAY, 7) as {
        AND: Array<Record<string, any>>;
      };
      expect(where.AND).toContainEqual({ plan: { isNot: null } });
      expect(where.AND).toContainEqual({
        OR: [
          { mainProcessId: P1 },
          { participants: { some: { processId: P1 } } },
        ],
      });
    });

    it('parte del alcance unificado de solicitudes (no del alcance de coordinación)', () => {
      const { service } = setup();
      const integranteWhere = service.projectWhere(actor('integrante'), P1, DAY, 7) as {
        AND: Array<Record<string, any>>;
      };
      // Integrante: procesos con grant o creadas por él.
      expect(integranteWhere.AND[0]).toEqual({
        deletedAt: null,
        OR: [
          { mainProcessId: { in: [P1] } },
          { createdByUserId: 'u-integrante' },
        ],
      });
      const liderWhere = service.projectWhere(actor('lider'), P1, DAY, 7) as {
        AND: Array<Record<string, any>>;
      };
      expect(liderWhere.AND[0]).toEqual({ deletedAt: null });
    });
  });

  describe('validateReferences', () => {
    it('sin referencias que cambian no consulta nada (historia intacta)', async () => {
      const { prismaObj, service } = setup();
      const res = await service.validateReferences(
        actor('integrante'),
        P1,
        DAY,
        { projectRequestId: null, taskId: null, declaredProjectRequestId: 'r-cerrado' },
        { projectRequestId: 'r-cerrado', taskId: 'x' },
      );
      expect(res).toEqual({});
      expect(prismaObj.request.findFirst).not.toHaveBeenCalled();
      expect(prismaObj.task.findFirst).not.toHaveBeenCalled();
    });

    it('proyecto fuera de alcance -> 404', async () => {
      const { prismaObj, service } = setup();
      prismaObj.request.findFirst.mockResolvedValue(null);
      await expect(
        service.validateReferences(actor('integrante'), P1, DAY, { projectRequestId: 'r1' }, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('proyecto elegible -> ok', async () => {
      const { prismaObj, service } = setup();
      prismaObj.request.findFirst
        .mockResolvedValueOnce(requestRow())
        .mockResolvedValueOnce({ id: 'r1' });
      await expect(
        service.validateReferences(actor('integrante'), P1, DAY, { projectRequestId: 'r1' }, {}),
      ).resolves.toEqual({});
    });

    it.each([
      ['REGISTRADA', 'registrado'],
      ['EN_TRIAGE', 'en triage'],
      ['RECHAZADA', 'rechazado'],
      ['OPERATIVA', 'operativo'],
      ['RETIRADA', 'retirado'],
    ])('estado %s -> 400 que nombra el código', async (state, label) => {
      const { prismaObj, service } = setup();
      prismaObj.request.findFirst
        .mockResolvedValueOnce(requestRow({ operationalState: state }))
        .mockResolvedValueOnce(null);
      await expect(
        service.validateReferences(actor('integrante'), P1, DAY, { projectRequestId: 'r1' }, {}),
      ).rejects.toThrow(`El proyecto PRY-0012 está ${label} y no admite actividades.`);
    });

    it('CERRADA fuera de la ventana -> 400 con mensaje de cierre', async () => {
      const { prismaObj, service } = setup();
      prismaObj.request.findFirst
        .mockResolvedValueOnce(
          requestRow({ code: 'PRY-0016', operationalState: 'CERRADA', closedAt: new Date(Date.UTC(2026, 9, 1)) }),
        )
        .mockResolvedValueOnce(null);
      await expect(
        service.validateReferences(actor('integrante'), P1, DAY, { projectRequestId: 'r1' }, {}),
      ).rejects.toThrow('El proyecto PRY-0016 está cerrado y ya no admite nuevas actividades.');
    });

    it('proyecto de otro proceso -> 400', async () => {
      const { prismaObj, service } = setup();
      prismaObj.request.findFirst
        .mockResolvedValueOnce(requestRow({ mainProcessId: 'p9' }))
        .mockResolvedValueOnce(null);
      await expect(
        service.validateReferences(actor('integrante'), P1, DAY, { projectRequestId: 'r1' }, {}),
      ).rejects.toThrow('El proyecto PRY-0012 no pertenece al proceso del diario.');
    });

    it('proyecto sin plan -> 400', async () => {
      const { prismaObj, service } = setup();
      prismaObj.request.findFirst
        .mockResolvedValueOnce(requestRow({ plan: null }))
        .mockResolvedValueOnce(null);
      await expect(
        service.validateReferences(actor('integrante'), P1, DAY, { projectRequestId: 'r1' }, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tarea propia de un proyecto elegible -> ok y deriva el proyecto', async () => {
      const { prismaObj, service } = setup();
      prismaObj.task.findFirst.mockResolvedValue(taskRow());
      prismaObj.request.findFirst
        .mockResolvedValueOnce(requestRow())
        .mockResolvedValueOnce({ id: 'r12' });
      await expect(
        service.validateReferences(actor('integrante'), P1, DAY, { taskId: 't1' }, {}),
      ).resolves.toEqual({ derivedProjectRequestId: 'r12' });
    });

    it('tarea TERMINADA propia no se rechaza (D6: solo la UI la oculta)', async () => {
      const { prismaObj, service } = setup();
      // La validación no consulta el estado de la tarea.
      prismaObj.task.findFirst.mockResolvedValue(taskRow());
      prismaObj.request.findFirst
        .mockResolvedValueOnce(requestRow())
        .mockResolvedValueOnce({ id: 'r12' });
      await expect(
        service.validateReferences(actor('integrante'), P1, DAY, { taskId: 't1' }, {}),
      ).resolves.toBeDefined();
      expect(JSON.stringify(prismaObj.task.findFirst.mock.calls[0][0])).not.toContain(
        'TERMINADA',
      );
    });

    it('tarea ajena: el integrante recibe 400; el líder del proceso y el jefe la aceptan', async () => {
      for (const [role, ok] of [
        ['integrante', false],
        ['lider', true],
        ['jefe', true],
      ] as const) {
        const { prismaObj, service } = setup();
        prismaObj.task.findFirst.mockResolvedValue(taskRow({ responsibleUserId: 'otro' }));
        prismaObj.request.findFirst
          .mockResolvedValueOnce(requestRow())
          .mockResolvedValueOnce({ id: 'r12' });
        const run = service.validateReferences(actor(role), P1, DAY, { taskId: 't1' }, {});
        if (ok) await expect(run).resolves.toBeDefined();
        else await expect(run).rejects.toThrow(/PRY-0012-T07 no está asignada a ti/);
      }
    });

    it('el líder de OTRO proceso no puede imputar tareas ajenas en este diario', async () => {
      const { prismaObj, service } = setup();
      prismaObj.task.findFirst.mockResolvedValue(taskRow({ responsibleUserId: 'otro' }));
      prismaObj.request.findFirst
        .mockResolvedValueOnce(requestRow())
        .mockResolvedValueOnce({ id: 'r12' });
      await expect(
        service.validateReferences(actor('lider', ['p2']), P1, DAY, { taskId: 't1' }, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tarea fuera de alcance -> 404', async () => {
      const { prismaObj, service } = setup();
      prismaObj.task.findFirst.mockResolvedValue(null);
      await expect(
        service.validateReferences(actor('integrante'), P1, DAY, { taskId: 't1' }, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('incoherencia proyecto-tarea -> 400', async () => {
      const { prismaObj, service } = setup();
      prismaObj.task.findFirst.mockResolvedValue(taskRow());
      prismaObj.request.findFirst
        .mockResolvedValueOnce(requestRow()) // visible: proyecto declarado
        .mockResolvedValueOnce({ id: 'r-otro' }) // elegible: proyecto declarado
        .mockResolvedValueOnce({ code: 'PRY-0099' }); // código del declarado
      await expect(
        service.validateReferences(
          actor('integrante'),
          P1,
          DAY,
          { projectRequestId: 'r-otro', taskId: 't1' },
          {},
        ),
      ).rejects.toThrow('La tarea PRY-0012-T07 no pertenece al proyecto PRY-0099.');
    });

    it('PATCH: tarea cambiada con proyecto declarado igual al guardado pero distinto al de la tarea -> 400', async () => {
      const { prismaObj, service } = setup();
      prismaObj.task.findFirst.mockResolvedValue(taskRow());
      prismaObj.request.findFirst.mockResolvedValueOnce({ code: 'PRY-0003' });
      await expect(
        service.validateReferences(
          actor('integrante'),
          P1,
          DAY,
          { projectRequestId: null, taskId: 't1', declaredProjectRequestId: 'r3' },
          { projectRequestId: 'r3', taskId: 'vieja' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listOptions', () => {
    const query = { processId: P1, date: '2026-11-11' };

    function taskOpt(overrides: Record<string, unknown> = {}) {
      return {
        id: 't1',
        code: 'PRY-0012-T07',
        title: 'Migrar',
        status: 'EN_CURSO',
        responsibleUserId: 'u-integrante',
        responsible: { name: 'Ana' },
        phase: {
          name: 'Fase 2',
          order: 1,
          plan: { request: { id: 'r12', code: 'PRY-0012', title: 'Portal' } },
        },
        ...overrides,
      };
    }

    function whereJson(call: any): string {
      return JSON.stringify(call[0].where);
    }

    it('integrante: solo sus tareas y proyectos con tareas propias; oculta terminadas', async () => {
      const { prismaObj, service } = setup();
      prismaObj.task.findMany
        .mockResolvedValueOnce([{ phase: { plan: { requestId: 'r12' } } }])
        .mockResolvedValueOnce([taskOpt()]);
      prismaObj.request.findMany.mockResolvedValue([
        { id: 'r12', code: 'PRY-0012', title: 'Portal', operationalState: 'EN_EJECUCION', closedAt: null },
      ]);
      const res = await service.listOptions(actor('integrante'), query);
      expect(res.projects).toEqual([
        { id: 'r12', code: 'PRY-0012', title: 'Portal', state: 'EN_EJECUCION', closedAt: null, hasMyTasks: true },
      ]);
      expect(res.tasks[0]).toMatchObject({ isMine: true, requestCode: 'PRY-0012', phaseName: 'Fase 2' });
      const taskWhere = whereJson(prismaObj.task.findMany.mock.calls[1]);
      expect(taskWhere).toContain('"responsibleUserId":"u-integrante"');
      expect(taskWhere).toContain('"status":{"not":"TERMINADA"}');
      expect(whereJson(prismaObj.request.findMany.mock.calls[0])).toContain('"id":{"in":["r12"]}');
    });

    it('includeTerminated=true no filtra por estado de tarea', async () => {
      const { prismaObj, service } = setup();
      await service.listOptions(actor('integrante'), { ...query, includeTerminated: true });
      expect(whereJson(prismaObj.task.findMany.mock.calls[1])).not.toContain('TERMINADA');
    });

    it('el integrante ignora scope=all', async () => {
      const { prismaObj, service } = setup();
      await service.listOptions(actor('integrante'), { ...query, scope: 'all' });
      expect(whereJson(prismaObj.task.findMany.mock.calls[1])).toContain(
        '"responsibleUserId":"u-integrante"',
      );
    });

    it('líder del proceso: ve también tareas ajenas y todos los proyectos elegibles', async () => {
      const { prismaObj, service } = setup();
      prismaObj.task.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([taskOpt({ responsibleUserId: 'otro' })]);
      const res = await service.listOptions(actor('lider'), query);
      expect(res.tasks[0].isMine).toBe(false);
      expect(whereJson(prismaObj.task.findMany.mock.calls[1])).not.toContain(
        '"responsibleUserId":"u-lider"',
      );
      expect(whereJson(prismaObj.request.findMany.mock.calls[0])).not.toContain('"id":{"in"');
    });

    it('líder de otro proceso: solo lo propio', async () => {
      const { prismaObj, service } = setup();
      await service.listOptions(actor('lider', ['p2']), query);
      expect(whereJson(prismaObj.task.findMany.mock.calls[1])).toContain(
        '"responsibleUserId":"u-lider"',
      );
    });

    it('jefe: scope=mine (por defecto) solo lo propio; scope=all todo el alcance', async () => {
      const mine = setup();
      await mine.service.listOptions(actor('jefe'), query);
      expect(whereJson(mine.prismaObj.task.findMany.mock.calls[1])).toContain(
        '"responsibleUserId":"u-jefe"',
      );
      const all = setup();
      await all.service.listOptions(actor('jefe'), { ...query, scope: 'all' });
      expect(whereJson(all.prismaObj.task.findMany.mock.calls[1])).not.toContain(
        '"responsibleUserId":"u-jefe"',
      );
    });

    it('q se envía como filtro de servidor sin distinguir mayúsculas', async () => {
      const { prismaObj, service } = setup();
      await service.listOptions(actor('integrante'), { ...query, q: 'T07' });
      const taskWhere = whereJson(prismaObj.task.findMany.mock.calls[1]);
      expect(taskWhere).toContain('"contains":"T07","mode":"insensitive"');
    });

    it('marca el truncado cuando hay más del tope', async () => {
      const { prismaObj, service } = setup();
      const many = Array.from({ length: WORKLOG_OPTIONS_LIMIT + 1 }, (_, i) =>
        taskOpt({ id: `t${i}` }),
      );
      prismaObj.task.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce(many);
      const res = await service.listOptions(actor('lider'), query);
      expect(res.tasks).toHaveLength(WORKLOG_OPTIONS_LIMIT);
      expect(res.tasksTruncated).toBe(true);
      expect(res.projectsTruncated).toBe(false);
    });

    it('expone closedAt solo de proyectos CERRADA', async () => {
      const { prismaObj, service } = setup();
      const closedAt = new Date(Date.UTC(2026, 10, 9));
      prismaObj.request.findMany.mockResolvedValue([
        { id: 'a', code: 'PRY-0001', title: 'A', operationalState: 'CERRADA', closedAt },
        { id: 'b', code: 'PRY-0002', title: 'B', operationalState: 'EN_EJECUCION', closedAt },
      ]);
      const res = await service.listOptions(actor('lider'), query);
      expect(res.projects.map((p) => p.closedAt)).toEqual([closedAt, null]);
    });
  });
});
