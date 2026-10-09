import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { RECORD_STATES } from '../record-state';

/**
 * Cuerpo de una transicion de estado de Issue/Commitment (design §4). El estado
 * destino debe ser un RECORD_STATE conocido (si no -> 400 en el DTO); la
 * validez de la ARISTA `from -> to` la resuelve `WorkflowStateService` en el
 * service (salto no permitido -> 400).
 */
export class TransitionDto {
  @ApiProperty({
    enum: RECORD_STATES,
    description: 'Estado destino de la transicion.',
    example: 'COMPLETADO',
  })
  @IsIn(RECORD_STATES, { message: 'Estado destino invalido.' })
  toState!: string;
}
