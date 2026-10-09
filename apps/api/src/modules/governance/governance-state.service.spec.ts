import { ConflictException } from '@nestjs/common';
import { RequestState } from '../request/request-state';
import { RequestStateService } from '../request/request-state.service';
import { GovernanceStateService } from './governance-state.service';
import { GateCode } from './gate';

/**
 * Specs del GovernanceStateService (design §6): verifica que cada transicion de
 * preparacion y de aprobacion solo es valida desde su origen correcto (409 en
 * caso contrario, via RequestStateService.assertTransition) y que el recorrido
 * EN_EJECUCION -> ... -> CERRADA es coherente. El estado solo se escribe por
 * assertTransition (RequestStateService es el unico escritor).
 */
describe('GovernanceStateService', () => {
  let service: GovernanceStateService;

  beforeEach(() => {
    // RequestStateService.assertTransition no depende de Prisma: se instancia
    // con un PrismaService ficticio porque el metodo probado no lo usa.
    const state = new RequestStateService(
      {} as unknown as ConstructorParameters<typeof RequestStateService>[0],
    );
    service = new GovernanceStateService(state);
  });

  describe('resolveStageTransition (preparacion)', () => {
    it('request-validation: EN_EJECUCION -> EN_VALIDACION', () => {
      expect(
        service.resolveStageTransition(
          'request-validation',
          RequestState.EN_EJECUCION,
        ),
      ).toBe(RequestState.EN_VALIDACION);
    });

    it('mark-ready: EN_VALIDACION -> LISTA_PARA_LIBERAR', () => {
      expect(
        service.resolveStageTransition('mark-ready', RequestState.EN_VALIDACION),
      ).toBe(RequestState.LISTA_PARA_LIBERAR);
    });

    it('confirm-stabilization: EN_ESTABILIZACION -> OPERATIVA', () => {
      expect(
        service.resolveStageTransition(
          'confirm-stabilization',
          RequestState.EN_ESTABILIZACION,
        ),
      ).toBe(RequestState.OPERATIVA);
    });

    it('rechaza (409) una preparacion desde un origen incorrecto', () => {
      expect(() =>
        service.resolveStageTransition('mark-ready', RequestState.EN_EJECUCION),
      ).toThrow(ConflictException);
      expect(() =>
        service.resolveStageTransition(
          'request-validation',
          RequestState.EN_VALIDACION,
        ),
      ).toThrow(ConflictException);
    });
  });

  describe('resolveApproveTransition (aprobacion de gate)', () => {
    it('GC4: LISTA_PARA_LIBERAR -> EN_ESTABILIZACION', () => {
      expect(
        service.resolveApproveTransition(
          GateCode.GC4,
          RequestState.LISTA_PARA_LIBERAR,
        ),
      ).toBe(RequestState.EN_ESTABILIZACION);
    });

    it('GC5: OPERATIVA -> CERRADA', () => {
      expect(
        service.resolveApproveTransition(GateCode.GC5, RequestState.OPERATIVA),
      ).toBe(RequestState.CERRADA);
    });

    it('rechaza (409) GC4/GC5 desde un origen incorrecto', () => {
      expect(() =>
        service.resolveApproveTransition(
          GateCode.GC4,
          RequestState.EN_VALIDACION,
        ),
      ).toThrow(ConflictException);
      expect(() =>
        service.resolveApproveTransition(
          GateCode.GC5,
          RequestState.EN_ESTABILIZACION,
        ),
      ).toThrow(ConflictException);
    });

    it('rechaza (409) aprobar GC1/GC2/GC3 (se derivan, no se aprueban)', () => {
      for (const gate of [GateCode.GC1, GateCode.GC2, GateCode.GC3]) {
        expect(() =>
          service.resolveApproveTransition(gate, RequestState.EN_EJECUCION),
        ).toThrow(ConflictException);
      }
    });
  });

  describe('recorrido completo EN_EJECUCION -> CERRADA', () => {
    it('encadena preparacion y aprobacion por los estados esperados', () => {
      let current: RequestState = RequestState.EN_EJECUCION;

      current = service.resolveStageTransition('request-validation', current);
      expect(current).toBe(RequestState.EN_VALIDACION);

      current = service.resolveStageTransition('mark-ready', current);
      expect(current).toBe(RequestState.LISTA_PARA_LIBERAR);

      current = service.resolveApproveTransition(GateCode.GC4, current);
      expect(current).toBe(RequestState.EN_ESTABILIZACION);

      current = service.resolveStageTransition('confirm-stabilization', current);
      expect(current).toBe(RequestState.OPERATIVA);

      current = service.resolveApproveTransition(GateCode.GC5, current);
      expect(current).toBe(RequestState.CERRADA);
    });
  });

  describe('applyTransition (unico escritor del estado)', () => {
    it('escribe operationalState con el destino recibido y lo devuelve', async () => {
      const update = jest
        .fn()
        .mockResolvedValue({ operationalState: RequestState.EN_VALIDACION });
      const tx = { request: { update } } as unknown as Parameters<
        GovernanceStateService['applyTransition']
      >[0];

      const result = await service.applyTransition(
        tx,
        'req-1',
        RequestState.EN_VALIDACION,
      );

      expect(update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { operationalState: RequestState.EN_VALIDACION },
        select: { operationalState: true },
      });
      expect(result.operationalState).toBe(RequestState.EN_VALIDACION);
    });
  });
});
