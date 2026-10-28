import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para completar una ocurrencia (FEAT-002). El comentario/evidencia es
 * OPCIONAL: una ocurrencia puede marcarse completada sin texto. El service
 * valida la transicion de estado (occurrence-status.ts) y el alcance.
 */
export class CompleteOccurrenceDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Comentario o evidencia del completado (opcional).',
    maxLength: 4000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  comment?: string;
}
