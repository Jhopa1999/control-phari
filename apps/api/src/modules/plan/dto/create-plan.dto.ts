import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear un plan (design §3.4). Todos los campos son opcionales: el
 * plan puede nacer vacio y la guia de pendientes exige el contenido para enviar.
 * No incluye `status`/`submitted*`/`authorized*` (los fija el flujo).
 */
export class CreatePlanDto {
  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Inicio del periodo del plan.' })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fin del periodo del plan.' })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Fecha de compromiso del plan.' })
  @IsOptional()
  @IsDateString()
  commitmentDate?: string;

  @ApiPropertyOptional({ type: String, description: 'Riesgos del plan.', maxLength: 4000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  risks?: string;

  @ApiPropertyOptional({ type: String, description: 'Mitigaciones del plan.', maxLength: 4000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  mitigations?: string;
}
