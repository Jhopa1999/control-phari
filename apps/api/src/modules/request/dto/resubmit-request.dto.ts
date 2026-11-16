import { ApiExtraModels } from '@nestjs/swagger';
import { UpdateRequestDto } from './update-request.dto';

/**
 * Cuerpo opcional de «Reenviar a triage» (D3): los mismos campos editables de
 * la ficha que `PATCH /requests/:id`, con la misma validación, para corregir lo
 * que pidió el triage en el mismo paso. Todos son opcionales; sin cuerpo solo
 * se reenvía.
 */
@ApiExtraModels(UpdateRequestDto)
export class ResubmitRequestDto extends UpdateRequestDto {}
