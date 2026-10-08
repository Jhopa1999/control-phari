import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de una fase del plan (design §3.4). */
export class PlanPhaseResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Plan al que pertenece.' })
  planId!: string;

  @ApiProperty({ type: String, description: 'Nombre de la fase.' })
  name!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de inicio.' })
  startDate!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de fin.' })
  endDate!: Date | null;

  @ApiProperty({ type: String, nullable: true, description: 'Entregable.' })
  deliverable!: string | null;

  @ApiProperty({ type: Number, description: 'Posicion 0-based dentro del plan.' })
  order!: number;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de actualizacion.' })
  updatedAt!: Date;
}
