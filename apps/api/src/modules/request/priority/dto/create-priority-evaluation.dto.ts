import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const criterion = (description: string, weight: number) =>
  ApiProperty({
    type: Number,
    minimum: 1,
    maximum: 5,
    description: `${description} (peso ${weight}).`,
  });

/**
 * Entrada para guardar una evaluacion de prioridad (design §3.4). Los 8
 * criterios son requeridos y 1-5. `score` NO se acepta: lo calcula el backend
 * (design §1.4).
 */
export class CreatePriorityEvaluationDto {
  @criterion('Impacto', 25)
  @IsInt()
  @Min(1)
  @Max(5)
  impact!: number;

  @criterion('Alineacion', 15)
  @IsInt()
  @Min(1)
  @Max(5)
  alignment!: number;

  @criterion('Control del riesgo', 15)
  @IsInt()
  @Min(1)
  @Max(5)
  riskControl!: number;

  @criterion('Urgencia', 10)
  @IsInt()
  @Min(1)
  @Max(5)
  urgency!: number;

  @criterion('Alcance', 10)
  @IsInt()
  @Min(1)
  @Max(5)
  scope!: number;

  @criterion('Disponibilidad de datos', 10)
  @IsInt()
  @Min(1)
  @Max(5)
  dataAvailability!: number;

  @criterion('Factibilidad', 10)
  @IsInt()
  @Min(1)
  @Max(5)
  feasibility!: number;

  @criterion('Reutilizacion', 5)
  @IsInt()
  @Min(1)
  @Max(5)
  reuse!: number;

  @ApiPropertyOptional({ type: String, description: 'Justificacion de la evaluacion.', maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  justification?: string;
}
