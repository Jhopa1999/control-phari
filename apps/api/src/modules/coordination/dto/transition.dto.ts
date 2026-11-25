import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { RECORD_STATES } from '../record-state';

/**
 * Cuerpo de una transicion de estado de un compromiso (design §4). El estado
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

  @ApiPropertyOptional({
    type: String,
    maxLength: 500,
    description:
      'Motivo del bloqueo (1 a 500 caracteres tras recortar). OBLIGATORIO con toState BLOQUEADO (sin motivo se responde 400) y solo valido con ese estado (con otro se responde 400). Un texto vacio o solo espacios se trata como ausente. Se guarda en los bloqueos del compromiso.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsString()
  @MaxLength(500)
  blockedReason?: string;
}
