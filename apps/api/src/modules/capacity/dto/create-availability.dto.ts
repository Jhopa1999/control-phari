import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Matches, Max, Min } from 'class-validator';
import { MONTH_PATTERN } from '../month';

/**
 * Entrada para crear una disponibilidad mensual (design §3.4). `userId` y
 * `month` identifican la fila unica persona/mes; `availableHours` entero `>= 0`
 * (D6). El alcance de escritura sobre la persona lo resuelve el service (§2.1).
 */
export class CreateAvailabilityDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Persona a la que pertenece la disponibilidad.',
  })
  @IsUUID()
  userId!: string;

  @ApiProperty({
    type: String,
    description: 'Mes de la disponibilidad en formato YYYY-MM.',
    example: '2025-03',
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
  })
  @Matches(MONTH_PATTERN, { message: 'El mes debe tener el formato YYYY-MM.' })
  month!: string;

  @ApiProperty({
    type: Number,
    description: 'Horas disponibles en el mes (entero entre 0 y 744, un mes completo).',
    minimum: 0,
    maximum: 744,
    example: 160,
  })
  @IsInt({ message: 'Las horas deben ser un numero entero.' })
  @Min(0, { message: 'Las horas no pueden ser negativas.' })
  @Max(744, { message: 'La disponibilidad no puede superar 744 horas al mes.' })
  availableHours!: number;
}
