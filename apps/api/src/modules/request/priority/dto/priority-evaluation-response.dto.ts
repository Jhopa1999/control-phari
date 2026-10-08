import { ApiProperty } from '@nestjs/swagger';

/** Contrato HTTP de una PriorityEvaluation (design §3.4). Separado de Prisma. */
export class PriorityEvaluationResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud evaluada.' })
  requestId!: string;

  @ApiProperty({ type: Number, description: 'Impacto (1-5).' })
  impact!: number;

  @ApiProperty({ type: Number, description: 'Alineacion (1-5).' })
  alignment!: number;

  @ApiProperty({ type: Number, description: 'Control del riesgo (1-5).' })
  riskControl!: number;

  @ApiProperty({ type: Number, description: 'Urgencia (1-5).' })
  urgency!: number;

  @ApiProperty({ type: Number, description: 'Alcance (1-5).' })
  scope!: number;

  @ApiProperty({ type: Number, description: 'Disponibilidad de datos (1-5).' })
  dataAvailability!: number;

  @ApiProperty({ type: Number, description: 'Factibilidad (1-5).' })
  feasibility!: number;

  @ApiProperty({ type: Number, description: 'Reutilizacion (1-5).' })
  reuse!: number;

  @ApiProperty({ type: Number, description: 'Score calculado en backend (0-100).' })
  score!: number;

  @ApiProperty({ type: String, description: 'Etiqueta de umbral derivada del score.' })
  thresholdLabel!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Justificacion.' })
  justification!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de evaluacion.' })
  evaluatedAt!: Date;

  @ApiProperty({ type: String, format: 'uuid', description: 'Usuario que evaluo.' })
  evaluatedByUserId!: string;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;
}
