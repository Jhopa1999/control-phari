import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequestState } from './request-state';
import {
  PriorityCriteria,
  RequestStateService,
} from './request-state.service';

function createPrismaMock() {
  const prisma = {
    request: { findFirst: jest.fn() },
    triage: { findFirst: jest.fn() },
    priorityEvaluation: { findFirst: jest.fn() },
    catalogItem: { findFirst: jest.fn() },
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

function criteria(value: number): PriorityCriteria {
  return {
    impact: value,
    alignment: value,
    riskControl: value,
    urgency: value,
    scope: value,
    dataAvailability: value,
    feasibility: value,
    reuse: value,
  };
}

describe('RequestStateService', () => {
  let service: RequestStateService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new RequestStateService(prisma);
  });

  describe('computeScore (design §1.4)', () => {
    it('todos los criterios en 5 -> 100', () => {
      expect(service.computeScore(criteria(5))).toBe(100);
    });

    it('todos los criterios en 1 -> 20', () => {
      expect(service.computeScore(criteria(1))).toBe(20);
    });

    it('aplica pesos y redondea con Math.round', () => {
      // impact=3 => 25*0.6=15; resto en 1 (peso 75) => 75*0.2=15; total 30.
      const mixed: PriorityCriteria = { ...criteria(1), impact: 3 };
      expect(service.computeScore(mixed)).toBe(30);
    });

    it('redondea medias fracciones hacia arriba (Math.round)', () => {
      // reuse=4 => 5*0.8=4; resto en 1 (peso 95) => 95*0.2=19; total 23.
      const mixed: PriorityCriteria = { ...criteria(1), reuse: 4 };
      expect(service.computeScore(mixed)).toBe(23);
      // Un caso con fraccion .5: urgency=2 (10*0.4=4), impact=2 (25*0.4=10),
      // resto 1 (peso 65 => 13) => 27.
      const half: PriorityCriteria = { ...criteria(1), urgency: 2, impact: 2 };
      expect(service.computeScore(half)).toBe(27);
    });
  });

  describe('priorityLabel (design §1.4 cortes 80/65/50)', () => {
    it('>=80 -> Muy alta', () => {
      expect(service.priorityLabel(80)).toBe('Muy alta');
      expect(service.priorityLabel(100)).toBe('Muy alta');
    });
    it('>=65 -> Alta', () => {
      expect(service.priorityLabel(65)).toBe('Alta');
      expect(service.priorityLabel(79)).toBe('Alta');
    });
    it('>=50 -> Media', () => {
      expect(service.priorityLabel(50)).toBe('Media');
      expect(service.priorityLabel(64)).toBe('Media');
    });
    it('<50 -> Baja', () => {
      expect(service.priorityLabel(49)).toBe('Baja');
      expect(service.priorityLabel(20)).toBe('Baja');
    });
  });

  describe('assertTransition (design §1.3)', () => {
    it('admite transiciones implementadas', () => {
      expect(
        service.assertTransition(RequestState.REGISTRADA, RequestState.EN_TRIAGE),
      ).toBe(RequestState.EN_TRIAGE);
      expect(
        service.assertTransition(
          RequestState.BACKLOG_PRIORIZADO,
          RequestState.COMPROMETIDA,
        ),
      ).toBe(RequestState.COMPROMETIDA);
      expect(
        service.assertTransition(
          RequestState.BACKLOG_PRIORIZADO,
          RequestState.EN_TRIAGE,
        ),
      ).toBe(RequestState.EN_TRIAGE);
    });

    it('transicion no implementada -> ConflictException', () => {
      expect(() =>
        service.assertTransition(
          RequestState.COMPROMETIDA,
          RequestState.BACKLOG_PRIORIZADO,
        ),
      ).toThrow(ConflictException);
      // No existe salida de DEVUELTA (frontera de reapertura).
      expect(() =>
        service.assertTransition(RequestState.DEVUELTA, RequestState.EN_TRIAGE),
      ).toThrow(ConflictException);
    });

    it('estado origen no tipado -> error interno', () => {
      expect(() =>
        service.assertTransition('NO_EXISTE', RequestState.EN_TRIAGE),
      ).toThrow(InternalServerErrorException);
    });
  });

  describe('assertCatalogCode (design §2.4)', () => {
    it('no valida si el code es undefined', async () => {
      await expect(
        service.assertCatalogCode('TRIAGE_ROUTE', undefined),
      ).resolves.toBeUndefined();
      expect(prisma.catalogItem.findFirst).not.toHaveBeenCalled();
    });

    it('code activo existente pasa', async () => {
      prisma.catalogItem.findFirst.mockResolvedValue({ id: 'c1' });
      await expect(
        service.assertCatalogCode('TRIAGE_ROUTE', 'BI'),
      ).resolves.toBeUndefined();
      expect(prisma.catalogItem.findFirst.mock.calls[0][0].where).toEqual({
        catalog: 'TRIAGE_ROUTE',
        code: 'BI',
        active: true,
      });
    });

    it('code inexistente/inactivo -> 400', async () => {
      prisma.catalogItem.findFirst.mockResolvedValue(null);
      await expect(
        service.assertCatalogCode('TRIAGE_ROUTE', 'ZZZ'),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('currentTriage / currentPriorityEvaluation', () => {
    it('triage vigente se lee por decidedAt desc', async () => {
      prisma.triage.findFirst.mockResolvedValue({ id: 't1', decision: 'CONTINUAR' });
      const t = await service.currentTriage('r1');
      expect(t?.decision).toBe('CONTINUAR');
      expect(prisma.triage.findFirst.mock.calls[0][0]).toMatchObject({
        where: { requestId: 'r1' },
        orderBy: { decidedAt: 'desc' },
      });
    });

    it('evaluacion vigente se lee por evaluatedAt desc', async () => {
      prisma.priorityEvaluation.findFirst.mockResolvedValue({ id: 'e1', score: 80 });
      const e = await service.currentPriorityEvaluation('r1');
      expect(e?.score).toBe(80);
      expect(prisma.priorityEvaluation.findFirst.mock.calls[0][0]).toMatchObject({
        where: { requestId: 'r1' },
        orderBy: { evaluatedAt: 'desc' },
      });
    });
  });
});
