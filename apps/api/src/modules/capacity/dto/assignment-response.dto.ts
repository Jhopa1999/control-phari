import { ApiProperty } from '@nestjs/swagger';

/**
 * Contrato HTTP de una asignacion de horas (design §3.4). Separado del modelo
 * Prisma: `month` se expone como string `YYYY-MM`; `requestId`/`description`
 * pueden ser `null`.
 */
export class AssignmentResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Persona de la asignacion.' })
  userId!: string;

  @ApiProperty({ type: String, description: 'Mes en formato YYYY-MM.', example: '2025-03' })
  month!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso de la asignacion.' })
  processId!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Solicitud ligada o null.',
  })
  requestId!: string | null;

  @ApiProperty({ type: Number, description: 'Horas comprometidas en el mes.' })
  committedHours!: number;

  @ApiProperty({ type: String, nullable: true, description: 'Descripcion informativa o null.' })
  description!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de ultima actualizacion.' })
  updatedAt!: Date;
}
