import { ApiProperty } from '@nestjs/swagger';

/**
 * Contrato HTTP de una disponibilidad mensual (design §3.4). Separado del modelo
 * Prisma: `month` se expone como string `YYYY-MM` (el service convierte la fecha
 * de columna con `dateToMonthString`).
 */
export class AvailabilityResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Persona de la disponibilidad.' })
  userId!: string;

  @ApiProperty({ type: String, description: 'Mes en formato YYYY-MM.', example: '2025-03' })
  month!: string;

  @ApiProperty({ type: Number, description: 'Horas disponibles en el mes.' })
  availableHours!: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de ultima actualizacion.' })
  updatedAt!: Date;
}
