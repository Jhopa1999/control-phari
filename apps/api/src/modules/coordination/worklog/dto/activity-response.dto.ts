import { ApiProperty } from '@nestjs/swagger';

/** Origen de una actividad registrada desde una sugerencia del día. */
export class ActivitySourceDto {
  @ApiProperty({ type: String, enum: ['MEETING', 'OCCURRENCE', 'TASK'] })
  kind!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  meetingId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  occurrenceId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  taskId!: string | null;

  @ApiProperty({
    type: String,
    description: 'Etiqueta legible del origen (título del acta, de la actividad o código de la tarea).',
  })
  label!: string;
}

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

  @ApiProperty({
    type: Number,
    multipleOf: 0.25,
    description: 'Horas de dedicacion (pasos de 0,25; 0 = sin horas en registros antiguos). BR-013.',
  })
  hours!: number;

  @ApiProperty({
    type: ActivitySourceDto,
    nullable: true,
    description: 'Origen si la actividad vino de una sugerencia del día.',
  })
  source!: ActivitySourceDto | null;

  @ApiProperty({
    type: Boolean,
    description: 'Clasificación y origen no editables (actividad de reunión o recurrente).',
  })
  locked!: boolean;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  projectRequestId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Titulo del proyecto (solicitud) referenciado.' })
  projectRequestTitle!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'ID visible del proyecto (PRY-0012).' })
  projectRequestCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Estado operativo del proyecto referenciado (CERRADA = cerrado).' })
  projectRequestState!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  taskId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Titulo de la tarea referenciada.' })
  taskTitle!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'ID visible de la tarea (PRY-0012-T07).' })
  taskCode!: string | null;

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
