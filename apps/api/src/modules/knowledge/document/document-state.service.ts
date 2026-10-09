import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DocStatus,
  isDocStatus,
  isDocTransitionAllowed,
} from './doc-status';

/**
 * Helper read-only de la maquina de estado del Documento (design §4.2), analogo
 * a WorkflowStateService de Fase 5. Un salto no permitido -> 400
 * (BadRequestException); el estado destino debe ser un DocStatus conocido (si
 * no, 400). El estado SOLO se escribe por POST /documents/:id/status; crear una
 * version NO mueve el estado (D6).
 */
@Injectable()
export class DocumentStateService {
  /**
   * Valida/resuelve una transicion de estado del documento solicitada por el
   * cliente (`targetStatus`) contra el estado actual persistido (design §4.2):
   * - `to` no es un DocStatus -> 400;
   * - `from` persistido no es un DocStatus valido -> 400 (dato corrupto);
   * - `from -> to` no esta en el grafo -> 400 (salto no permitido).
   * Devuelve el estado destino tipado para persistir.
   */
  assertTransition(from: string, to: string): DocStatus {
    if (!isDocStatus(to)) {
      throw new BadRequestException(
        `Estado destino "${to}" no es un estado valido.`,
      );
    }
    if (!isDocStatus(from)) {
      throw new BadRequestException(
        `Estado actual "${from}" no es un estado valido.`,
      );
    }
    if (!isDocTransitionAllowed(from, to)) {
      throw new BadRequestException(
        `No se puede pasar de "${from}" a "${to}".`,
      );
    }
    return to;
  }
}
