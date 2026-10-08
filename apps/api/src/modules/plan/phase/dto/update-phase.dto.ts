import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePhaseDto } from './create-phase.dto';

/**
 * Entrada para editar una fase (design §3.4): nombre/fechas/entregable. El
 * `order` NO se edita aqui; el reordenamiento tiene su endpoint propio
 * (/phases/reorder) para respetar @@unique([planId, order]).
 */
export class UpdatePhaseDto extends PartialType(
  OmitType(CreatePhaseDto, ['order'] as const),
) {}
