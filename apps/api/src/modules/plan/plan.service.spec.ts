import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentActor } from '../auth/current-actor';
import { RoleCode } from '../auth/role-code';
import { RequestState } from '../request/request-state';
import { RequestStateService } from '../request/request-state.service';
import { PlanService } from './plan.service';
import { PlanGuideService } from './plan-guide.service';
import { PlanStateService } from './plan-state.service';
import { PlanStatus } from './plan-status';

function createMocks() {
  const prismaObj: Record<string, unknown> = {
    request: { findFirst: jest.fn(), update: jest.fn() },
    plan: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  prismaObj.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prismaObj));
  const prisma = prismaObj as unknown as PrismaService;

  const audit = { record: jest.fn() } as unknown as AuditService;
  const auditRecord = audit.record as unknown as jest.Mock;
  const requestState = new RequestStateService(prisma);

  const planState = {
    requirePlanInScope: jest.fn(),
    assertPlanTransition: jest.fn((from: string, to: PlanStatus) =>
      new PlanStateService(prisma).assertPlanTransition(from, to),
    ),
  } as unknown as PlanStateService;

  const guide = { compute: jest.fn() } as unknown as PlanGuideService;

  return { prisma, prismaObj, audit, auditRecord, requestState, planState, guide };
}

function lider(scoped: string[] = ['p1']): CurrentActor {
  return {
    userId: 'ul',
    name: 'Beto',
    identifier: 'lider@demo.local',
    grants: [],
    roleCodes: new Set([RoleCode.LIDER_PROCESO]),
    scopedProcessIds: new Set(scoped),
    isJefeArea: false,
  };
}

function makeRequest(state: string) {
  return { id: 'r1', mainProcessId: 'p1', operationalState: state };
}

function makePlan(status: string) {
  return {
    id: 'plan1',
    requestId: 'r1',
    periodStart: null,
    periodEnd: null,
    commitmentDate: null,
    risks: null,
    mitigations: null,
    status,
    submittedAt: null,
    submittedByUserId: null,
    authorizedAt: null,
    authorizedByUserId: null,
    returnReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('PlanService', () => {
  let service: PlanService;
  let m: ReturnType<typeof createMocks>;

  beforeEach(() => {
    m = createMocks();
    service = new PlanService(m.prisma, m.audit, m.requestState, m.planState, m.guide);
  });

  describe('create', () => {
    it('crea el plan desde COMPROMETIDA, lleva Request a EN_PLANIFICACION y audita 2 eventos', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.COMPROMETIDA),
      );
      (m.prismaObj.plan as any).findFirst.mockResolvedValue(null);
      (m.prismaObj.plan as any).create.mockResolvedValue(makePlan(PlanStatus.BORRADOR));
      (m.prismaObj.request as any).update.mockResolvedValue(
        makeRequest(RequestState.EN_PLANIFICACION),
      );

      const res = await service.create(lider(), 'r1', {});

      expect(res.status).toBe(PlanStatus.BORRADOR);
      expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
        operationalState: RequestState.EN_PLANIFICACION,
      });
      expect(m.auditRecord).toHaveBeenCalledTimes(2);
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'CREATE',
        objectType: 'PLAN',
        scopeProcessId: 'p1',
      });
      expect(m.auditRecord.mock.calls[1][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'REQUEST',
        scopeProcessId: 'p1',
      });
    });

    it('crear sobre Request != COMPROMETIDA -> 409 sin mutacion', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.EN_TRIAGE),
      );
      await expect(service.create(lider(), 'r1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect((m.prismaObj.plan as any).create).not.toHaveBeenCalled();
    });

    it('crear cuando ya existe plan -> 409', async () => {
      (m.prismaObj.request as any).findFirst.mockResolvedValue(
        makeRequest(RequestState.COMPROMETIDA),
      );
      (m.prismaObj.plan as any).findFirst.mockResolvedValue({ id: 'planX' });
      await expect(service.create(lider(), 'r1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect((m.prismaObj.plan as any).create).not.toHaveBeenCalled();
    });
  });

  describe('submit (AC-007)', () => {
    it('rechaza 409 cuando la guia tiene pendientes', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.BORRADOR),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      (m.guide.compute as jest.Mock).mockResolvedValue({
        planId: 'plan1',
        canSubmit: false,
        pendings: [{ category: 'datesPhases', code: 'NO_PHASES', message: 'Falta fase.' }],
        futureCategories: [],
      });

      await expect(service.submit(lider(), 'r1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect((m.prismaObj.plan as any).update).not.toHaveBeenCalled();
    });

    it('envia (-> EN_AUTORIZACION) cuando canSubmit=true', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.BORRADOR),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      (m.guide.compute as jest.Mock).mockResolvedValue({
        planId: 'plan1',
        canSubmit: true,
        pendings: [],
        futureCategories: [],
      });
      (m.prismaObj.plan as any).update.mockResolvedValue(
        makePlan(PlanStatus.EN_AUTORIZACION),
      );

      const res = await service.submit(lider(), 'r1');

      expect(res.status).toBe(PlanStatus.EN_AUTORIZACION);
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({
        action: 'UPDATE',
        objectType: 'PLAN',
      });
    });
  });

  describe('authorize', () => {
    it('autorizar lleva la Request a EN_EJECUCION y registra UPDATE PLAN + UPDATE REQUEST', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.EN_AUTORIZACION),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      (m.prismaObj.plan as any).update.mockResolvedValue(makePlan(PlanStatus.AUTORIZADO));
      (m.prismaObj.request as any).update.mockResolvedValue(
        makeRequest(RequestState.EN_EJECUCION),
      );

      const res = await service.authorize(lider(), 'r1');

      expect(res.status).toBe(PlanStatus.AUTORIZADO);
      expect((m.prismaObj.request as any).update.mock.calls[0][0].data).toEqual({
        operationalState: RequestState.EN_EJECUCION,
      });
      expect(m.auditRecord).toHaveBeenCalledTimes(2);
      expect(m.auditRecord.mock.calls[0][1]).toMatchObject({ objectType: 'PLAN' });
      expect(m.auditRecord.mock.calls[1][1]).toMatchObject({ objectType: 'REQUEST' });
    });

    it('autorizar fuera de EN_AUTORIZACION -> 409', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.BORRADOR),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      await expect(service.authorize(lider(), 'r1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('return', () => {
    it('devolver sin motivo -> 400 sin mutacion', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.EN_AUTORIZACION),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      await expect(service.return(lider(), 'r1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect((m.prismaObj.plan as any).update).not.toHaveBeenCalled();
    });

    it('devolver con motivo -> DEVUELTO', async () => {
      (m.planState.requirePlanInScope as jest.Mock).mockResolvedValue({
        plan: makePlan(PlanStatus.EN_AUTORIZACION),
        requestId: 'r1',
        mainProcessId: 'p1',
        requestState: RequestState.EN_PLANIFICACION,
      });
      (m.prismaObj.plan as any).update.mockResolvedValue({
        ...makePlan(PlanStatus.DEVUELTO),
        returnReason: 'faltan fechas',
      });

      const res = await service.return(lider(), 'r1', { reason: 'faltan fechas' });
      expect(res.status).toBe(PlanStatus.DEVUELTO);
    });
  });
});
