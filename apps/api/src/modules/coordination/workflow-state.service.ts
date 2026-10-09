import { BadRequestException, Injectable } from '@nestjs/common';
import {
  isRecordState,
  isRecordStateTransitionAllowed,
  RecordState,
} from './record-state';

/**
 * Helper de maquinas de estado minimas reversibles de Fase 5 (design §4),
 * analogo a `PlanStateService` de Fase 3. Reutilizable por Issue y Commitment:
 * ambos usan el MISMO grafo sobre RECORD_STATE. Un salto no permitido -> 400
 * (BadRequestException), igual que el helper de fecha; el estado destino debe
 * ser un RECORD_STATE conocido (si no, 400).
 */
@Injectable()
export class WorkflowStateService {
  /**
   * Valida/resuelve una transicion de estado solicitada por el cliente
   * (`{ toState }`) contra el estado actual persistido (design §4):
   * - `toState` no es un RECORD_STATE -> 400;
   * - `from` persistido no es un RECORD_STATE valido -> 400 (dato corrupto);
   * - `from -> to` no esta en el grafo -> 400 (salto no permitido).
   * Devuelve el estado destino tipado para persistir.
   */
  assertTransition(from: string, toState: string): RecordState {
    if (!isRecordState(toState)) {
      throw new BadRequestException(
        `Estado destino "${toState}" no es un estado valido.`,
      );
    }
    if (!isRecordState(from)) {
      throw new BadRequestException(
        `Estado actual "${from}" no es un estado valido.`,
      );
    }
    if (!isRecordStateTransitionAllowed(from, toState)) {
      throw new BadRequestException(
        `No se puede pasar de "${from}" a "${toState}".`,
      );
    }
    return toState;
  }
}
