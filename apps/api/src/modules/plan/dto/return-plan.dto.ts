import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para devolver un plan (design §3.4). `reason` es requerido: la
 * validacion condicional vive en el service (400 si falta), como ApprovalService.
 */
export class ReturnPlanDto {
  @ApiPropertyOptional({ type: String, description: 'Motivo de la devolucion (obligatorio).', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
