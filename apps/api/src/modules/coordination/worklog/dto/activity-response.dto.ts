import { ApiProperty } from '@nestjs/swagger';

/**
 * Contrato HTTP de una actividad del diario (design §3.4). `hours` siempre
 * numero (columna `@default(0)`). Fechas de columna se exponen como `YYYY-MM-DD`
 * o null.
 */
export class ActivityResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Diario al que pertenece.' })
  dailyLogId!: string;

  @ApiProperty({ type: String, description: 'Clasificacion (maestra ACTIVITY_CLASS).' })
  classificationCode!: string;

  @ApiProperty({ type: Number, description: 'Horas de dedicacion (BR-013).' })
  hours!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  projectRequestId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  taskId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  relatedIssueId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  assetRef!: string | null;

  @ApiProperty({ type: String, nullable: true })
  requesterRef!: string | null;

  @ApiProperty({ type: String, nullable: true })
  justification!: string | null;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, nullable: true })
  result!: string | null;

  @ApiProperty({ type: String, nullable: true })
  activityStatus!: string | null;

  @ApiProperty({ type: String, nullable: true })
  evidenceUrl!: string | null;

  @ApiProperty({ type: String, nullable: true })
  nextStep!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Fecha del siguiente paso (YYYY-MM-DD).' })
  nextStepDate!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
