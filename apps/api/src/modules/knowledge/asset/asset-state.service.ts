import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AssetStatus,
  isAssetStatus,
  isAssetTransitionAllowed,
} from './asset-status';

/**
 * Helper read-only de la maquina de estado del Activo (design §4.1), analogo a
 * WorkflowStateService de Fase 5. Un salto no permitido -> 400
 * (BadRequestException); el estado destino debe ser un AssetStatus conocido (si
 * no, 400). El estado SOLO se escribe por el endpoint /status, nunca por un DTO
 * libre.
 */
@Injectable()
export class AssetStateService {
  /**
   * Valida/resuelve una transicion de estado del activo solicitada por el
   * cliente (`targetStatus`) contra el estado actual persistido (design §4.1):
   * - `to` no es un AssetStatus -> 400;
   * - `from` persistido no es un AssetStatus valido -> 400 (dato corrupto);
   * - `from -> to` no esta en el grafo -> 400 (salto no permitido, p. ej.
   *   ACTIVO->BORRADOR).
   * Devuelve el estado destino tipado para persistir.
   */
  assertTransition(from: string, to: string): AssetStatus {
    if (!isAssetStatus(to)) {
      throw new BadRequestException(
        `Estado destino "${to}" no es un estado valido.`,
      );
    }
    if (!isAssetStatus(from)) {
      throw new BadRequestException(
        `Estado actual "${from}" no es un estado valido.`,
      );
    }
    if (!isAssetTransitionAllowed(from, to)) {
      throw new BadRequestException(
        `No se puede pasar de "${from}" a "${to}".`,
      );
    }
    return to;
  }
}
