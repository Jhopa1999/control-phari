import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { RequestState } from '../request/request-state';
import { RequestStateService } from '../request/request-state.service';
import { GateCode, GATE_APPROVE_TO_STATE, STAGE_ADVANCE_TO_STATE } from './gate';

/** Nombres de las etapas de preparacion (design §3.4). */
export type StageAction = keyof typeof STAGE_ADVANCE_TO_STATE;

/**
 * Encapsula las precondiciones de FASE de gobierno (design §3.2) y delega el
 * movimiento del `operationalState` en `RequestStateService.assertTransition`.
 * RequestStateService sigue siendo el UNICO escritor del estado: este service
 * nunca inventa transiciones, solo valida que el estado actual sea el origen
 * esperado (si no, 409) y escribe el destino que assertTransition devuelve,
 * dentro de la $transaction del service llamante (patron ApprovalService).
 *
 * No invoca ninguna transicion en block/unblock: el bloqueo es un flag
 * transversal (D-B7) y lo gestiona GateCheckService sin pasar por aqui.
 */
@Injectable()
export class GovernanceStateService {
  constructor(private readonly state: RequestStateService) {}

  /**
   * Resuelve la transicion de una etapa de PREPARACION (design §1.2 D-B4):
   * valida que `currentState` sea el origen esperado de la accion y devuelve el
   * estado destino (ya validado contra IMPLEMENTED_TRANSITIONS). 409 si el
   * estado actual no es el origen (via assertTransition).
   */
  resolveStageTransition(
    action: StageAction,
    currentState: string,
  ): RequestState {
    const { from, to } = STAGE_ADVANCE_TO_STATE[action];
    if (currentState !== from) {
      throw new ConflictException(
        `No se puede pasar de "${currentState}" a "${to}" en esta fase.`,
      );
    }
    return this.state.assertTransition(currentState, to);
  }

  /**
   * Resuelve la transicion de APROBACION de un gate (design §1.2 D-B4): solo
   * GC4/GC5 mueven el estado. Valida el origen esperado y devuelve el destino.
   * 409 si el gate no mueve estado (GC1-GC3) o si el estado actual no es el
   * origen esperado.
   */
  resolveApproveTransition(
    gateCode: GateCode,
    currentState: string,
  ): RequestState {
    const mapping = GATE_APPROVE_TO_STATE[gateCode];
    if (!mapping) {
      throw new ConflictException(
        'Este control se deriva de fases previas y no se aprueba desde gobierno.',
      );
    }
    if (currentState !== mapping.from) {
      throw new ConflictException(
        `No se puede pasar de "${currentState}" a "${mapping.to}" en esta fase.`,
      );
    }
    return this.state.assertTransition(currentState, mapping.to);
  }

  /**
   * Escribe el `operationalState` destino dentro de la $transaction del service
   * llamante y devuelve la Request actualizada. Centraliza la unica escritura de
   * estado de gobierno para que el patron sea identico en preparacion y en
   * aprobacion. El llamante audita el UPDATE de REQUEST (before/after).
   */
  async applyTransition(
    tx: Prisma.TransactionClient,
    requestId: string,
    nextState: RequestState,
  ): Promise<{ operationalState: string }> {
    const updated = await tx.request.update({
      where: { id: requestId },
      data: { operationalState: nextState },
      select: { operationalState: true },
    });
    return updated;
  }
}
