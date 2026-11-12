import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CurrentActor } from '../../auth/current-actor';
import { RoleCode } from '../../auth/role-code';
import { requestScopeWhere } from '../../request/request-scope.service';
import { CodeResolutionService } from './code-resolution.service';

function actor(role: RoleCode): CurrentActor {
  return {
    userId: 'u1',
    name: 'Persona',
    identifier: 'persona@demo.local',
    grants: [],
    roleCodes: new Set([role]),
    scopedProcessIds: new Set(['p1']),
    isJefeArea: role === RoleCode.JEFE_AREA,
    isLiderProceso: role === RoleCode.LIDER_PROCESO,
    isAdmin: false,
  };
}

const request = { id: 'r1', code: 'PRY-0012', title: 'Portal', operationalState: 'EN_EJECUCION' };

function build() {
  const prisma = {
    request: { findFirst: jest.fn() },
    planPhase: { findFirst: jest.fn() },
    task: { findFirst: jest.fn() },
  };
  return { prisma, service: new CodeResolutionService(prisma as never) };
}

describe('CodeResolutionService', () => {
  describe('formato', () => {
    it.each(['PRY-12', 'PRY-0012-X1', 'PRY-0012-T', 'T07', 'F2', '', 'PRY-0012-T07-1', 'XYZ-0012'])(
      '"%s" -> 400 sin consultar la base',
      async (code) => {
        const { service, prisma } = build();
        await expect(service.resolve(actor(RoleCode.JEFE_AREA), code)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.request.findFirst).not.toHaveBeenCalled();
        expect(prisma.planPhase.findFirst).not.toHaveBeenCalled();
        expect(prisma.task.findFirst).not.toHaveBeenCalled();
      },
    );

    it('rechaza más de 32 caracteres', async () => {
      const { service } = build();
      await expect(
        service.resolve(actor(RoleCode.JEFE_AREA), `PRY-${'1'.repeat(40)}`),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('acepta 5 dígitos (PRY-00012)', async () => {
      const { service, prisma } = build();
      prisma.request.findFirst.mockResolvedValue({ ...request, code: 'PRY-00012', mainProcess: null });
      const res = await service.resolve(actor(RoleCode.JEFE_AREA), 'PRY-00012');
      expect(res.code).toBe('PRY-00012');
    });
  });

  describe('solicitud (PRY-0012)', () => {
    it('resuelve sin distinguir mayúsculas y devuelve proceso y estado', async () => {
      const { service, prisma } = build();
      prisma.request.findFirst.mockResolvedValue({ ...request, mainProcess: { name: 'Datos' } });
      const res = await service.resolve(actor(RoleCode.JEFE_AREA), ' pry-0012 ');
      expect(prisma.request.findFirst.mock.calls[0][0].where.AND[0]).toEqual({ code: 'PRY-0012' });
      expect(res).toEqual({
        type: 'REQUEST',
        id: 'r1',
        code: 'PRY-0012',
        title: 'Portal',
        requestId: 'r1',
        requestCode: 'PRY-0012',
        requestTitle: 'Portal',
        requestStatus: 'EN_EJECUCION',
        status: 'EN_EJECUCION',
        processName: 'Datos',
      });
    });

    it('acepta espacios y guiones largos como separador (PRY 0012)', async () => {
      const { service, prisma } = build();
      prisma.request.findFirst.mockResolvedValue({ ...request, mainProcess: null });
      const res = await service.resolve(actor(RoleCode.LIDER_PROCESO), 'pry–0012');
      expect(res.processName).toBeNull();
      expect(prisma.request.findFirst.mock.calls[0][0].where.AND[0]).toEqual({ code: 'PRY-0012' });
    });

    it.each([
      [RoleCode.JEFE_AREA, { deletedAt: null }],
      [RoleCode.LIDER_PROCESO, { deletedAt: null }],
    ])('%s aplica el alcance de lectura (todas las no eliminadas)', async (role, scope) => {
      const { service, prisma } = build();
      prisma.request.findFirst.mockResolvedValue({ ...request, mainProcess: null });
      await service.resolve(actor(role), 'PRY-0012');
      expect(prisma.request.findFirst.mock.calls[0][0].where.AND[1]).toEqual(scope);
    });

    it('integrante: alcance por sus procesos o lo que creó', async () => {
      const { service, prisma } = build();
      const a = actor(RoleCode.INTEGRANTE);
      prisma.request.findFirst.mockResolvedValue({ ...request, mainProcess: null });
      await service.resolve(a, 'PRY-0012');
      expect(prisma.request.findFirst.mock.calls[0][0].where.AND[1]).toEqual(requestScopeWhere(a));
      expect(prisma.request.findFirst.mock.calls[0][0].where.AND[1].OR).toBeDefined();
    });

    it('inexistente o fuera de alcance -> 404 con el mismo mensaje', async () => {
      const { service, prisma } = build();
      prisma.request.findFirst.mockResolvedValue(null);
      const err = await service.resolve(actor(RoleCode.INTEGRANTE), 'PRY-0099').catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect(err.message).toBe('Código "PRY-0099" no encontrado.');
    });
  });

  describe('fase (PRY-0012-F2)', () => {
    it('resuelve la fase sin estado y con su solicitud', async () => {
      const { service, prisma } = build();
      prisma.planPhase.findFirst.mockResolvedValue({
        id: 'ph1',
        code: 'PRY-0012-F2',
        name: 'Diseño',
        plan: { request },
      });
      const res = await service.resolve(actor(RoleCode.JEFE_AREA), 'pry-0012-f2');
      expect(prisma.planPhase.findFirst.mock.calls[0][0].where.code).toBe('PRY-0012-F2');
      expect(res).toMatchObject({
        type: 'PHASE',
        id: 'ph1',
        code: 'PRY-0012-F2',
        title: 'Diseño',
        requestId: 'r1',
        requestCode: 'PRY-0012',
        requestStatus: 'EN_EJECUCION',
        phaseId: 'ph1',
        phaseName: 'Diseño',
      });
      expect(res.status).toBeUndefined();
    });

    it('el alcance de la solicitud va en el where (integrante)', async () => {
      const { service, prisma } = build();
      const a = actor(RoleCode.INTEGRANTE);
      prisma.planPhase.findFirst.mockResolvedValue(null);
      await expect(service.resolve(a, 'PRY-0012-F2')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.planPhase.findFirst.mock.calls[0][0].where.plan.request).toEqual(requestScopeWhere(a));
    });
  });

  describe('tarea (PRY-0012-T07)', () => {
    it('resuelve la tarea con fase, solicitud y estado propio', async () => {
      const { service, prisma } = build();
      prisma.task.findFirst.mockResolvedValue({
        id: 't1',
        code: 'PRY-0012-T07',
        title: 'Migrar endpoints',
        status: 'EN_CURSO',
        phase: { id: 'ph1', name: 'Diseño', plan: { request } },
      });
      const res = await service.resolve(actor(RoleCode.LIDER_PROCESO), 'Pry-0012-t07');
      expect(prisma.task.findFirst.mock.calls[0][0].where.code).toBe('PRY-0012-T07');
      expect(res).toEqual({
        type: 'TASK',
        id: 't1',
        code: 'PRY-0012-T07',
        title: 'Migrar endpoints',
        requestId: 'r1',
        requestCode: 'PRY-0012',
        requestTitle: 'Portal',
        requestStatus: 'EN_EJECUCION',
        phaseId: 'ph1',
        phaseName: 'Diseño',
        status: 'EN_CURSO',
      });
    });

    it('fuera de alcance -> 404', async () => {
      const { service, prisma } = build();
      prisma.task.findFirst.mockResolvedValue(null);
      await expect(service.resolve(actor(RoleCode.INTEGRANTE), 'PRY-0012-T07')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findPhaseByCode', () => {
    it('devuelve el detalle de la fase con su solicitud', async () => {
      const { service, prisma } = build();
      prisma.planPhase.findFirst.mockResolvedValue({
        id: 'ph1',
        code: 'PRY-0012-F2',
        planId: 'pl1',
        name: 'Diseño',
        startDate: null,
        endDate: null,
        deliverable: null,
        order: 1,
        plan: { request },
      });
      const res = await service.findPhaseByCode(actor(RoleCode.JEFE_AREA), 'pry-0012-f2');
      expect(res).toMatchObject({ id: 'ph1', code: 'PRY-0012-F2', planId: 'pl1', requestCode: 'PRY-0012' });
    });

    it('un código de solicitud o de tarea -> 400', async () => {
      const { service } = build();
      await expect(service.findPhaseByCode(actor(RoleCode.JEFE_AREA), 'PRY-0012')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.findPhaseByCode(actor(RoleCode.JEFE_AREA), 'PRY-0012-T07')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('inexistente o fuera de alcance -> 404', async () => {
      const { service, prisma } = build();
      prisma.planPhase.findFirst.mockResolvedValue(null);
      await expect(service.findPhaseByCode(actor(RoleCode.INTEGRANTE), 'PRY-0012-F9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
