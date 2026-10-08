import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para editar una asignacion (design §2.2). Permite cambiar
 * `processId` (revalidando alcance), `requestId`, `committedHours` y
 * `description`. `userId`/`month` NO figuran: no son editables por PATCH.
 */
export class UpdateAssignmentDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Nuevo proceso de la asignacion (revalida alcance).',
  })
  @IsOptional()
  @IsUUID()
  processId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Nueva solicitud ligada (en alcance).',
  })
  @IsOptional()
  @IsUUID()
  requestId?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Horas comprometidas (entero >= 0).',
    minimum: 0,
  })
  @IsOptional()
  @IsInt({ message: 'Las horas deben ser un numero entero.' })
  @Min(0, { message: 'Las horas no pueden ser negativas.' })
  committedHours?: number;

  @ApiPropertyOptional({
    type: String,
    description: 'Distribucion del esfuerzo por periodo (texto libre).',
    maxLength: 2000,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;
}
