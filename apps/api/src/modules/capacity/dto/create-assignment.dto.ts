import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { MONTH_PATTERN } from '../month';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Entrada para crear una asignacion de horas (design §3.4). `processId` es
 * requerido; `requestId` opcional (si se informa debe estar en alcance, 404 no
 * 400). `committedHours` entero `>= 0` (D6). `description` texto libre (FINDING
 * 7). El alcance lo resuelve el service (§2.2).
 */
export class CreateAssignmentDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Persona a la que pertenece la asignacion.',
  })
  @IsUUID()
  userId!: string;

  @ApiProperty({
    type: String,
    description: 'Mes de la asignacion en formato YYYY-MM.',
    example: '2025-03',
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
  })
  @Matches(MONTH_PATTERN, { message: 'El mes debe tener el formato YYYY-MM.' })
  month!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Proceso de la asignacion (requerido).',
  })
  @IsUUID()
  processId!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description: 'Solicitud opcional ligada a la asignacion.',
  })
  @IsOptional()
  @IsUUID()
  requestId?: string;

  @ApiProperty({
    type: Number,
    description: 'Horas comprometidas en el mes (entero >= 0).',
    minimum: 0,
    example: 40,
  })
  @IsInt({ message: 'Las horas deben ser un numero entero.' })
  @Min(0, { message: 'Las horas no pueden ser negativas.' })
  committedHours!: number;

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
