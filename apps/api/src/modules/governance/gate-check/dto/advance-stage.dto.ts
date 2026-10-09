import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para una etapa de preparacion (design §5): request-validation,
 * mark-ready, confirm-stabilization. Sin payload obligatorio: el origen de la
 * transicion se infiere del operationalState.
 */
export class AdvanceStageDto {
  @ApiPropertyOptional({ type: String, description: 'Nota opcional.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  note?: string;
}
