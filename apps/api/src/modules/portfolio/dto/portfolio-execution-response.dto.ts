import { ApiProperty } from '@nestjs/swagger';

/** Tarea de una fase en la vista de ejecución (solo lectura). */
export class PortfolioExecutionTaskDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id de la tarea.' })
  id!: string;

  @ApiProperty({
    type: String,
    example: 'PRY-0012-T07',
    description: 'ID visible de la tarea. Solo lectura.',
  })
  code!: string;

  @ApiProperty({ type: String, description: 'Título de la tarea.' })
  title!: string;

  @ApiProperty({
    type: String,
    enum: ['POR_HACER', 'EN_CURSO', 'BLOQUEADA', 'EN_REVISION', 'TERMINADA'],
    description: 'Estado de la tarea.',
  })
  status!: string;

  @ApiProperty({ type: Number, description: 'Avance de la tarea (0..100).' })
  progress!: number;

  @ApiProperty({ type: String, nullable: true, description: 'Inicio (YYYY-MM-DD) o null.' })
  startDate!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Fin (YYYY-MM-DD) o null.' })
  endDate!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nombre del responsable o null.' })
  responsibleName!: string | null;
}

/** Fase del plan con sus tareas en la vista de ejecución. */
export class PortfolioExecutionPhaseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id de la fase.' })
  id!: string;

  @ApiProperty({
    type: String,
    example: 'PRY-0012-F2',
    description: 'ID visible de la fase. Solo lectura.',
  })
  code!: string;

  @ApiProperty({ type: String, description: 'Nombre de la fase.' })
  name!: string;

  @ApiProperty({ type: Number, description: 'Posición de la fase en el plan (desde 1).' })
  order!: number;

  @ApiProperty({ type: String, nullable: true, description: 'Inicio (YYYY-MM-DD) o null.' })
  startDate!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Fin (YYYY-MM-DD) o null.' })
  endDate!: string | null;

  @ApiProperty({
    type: String,
    enum: ['SIN_TAREAS', 'POR_HACER', 'EN_CURSO', 'TERMINADA'],
    description:
      'Estado derivado de sus tareas: SIN_TAREAS, TERMINADA (todas terminadas), POR_HACER (ninguna iniciada ni terminada) o EN_CURSO.',
  })
  status!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Avance de la fase (0..100) según sus tareas; null si no tiene tareas.',
  })
  progressPercent!: number | null;

  @ApiProperty({ type: Number, description: 'Tareas de la fase.' })
  tasksTotal!: number;

  @ApiProperty({ type: Number, description: 'Tareas terminadas de la fase.' })
  tasksDone!: number;

  @ApiProperty({ type: [PortfolioExecutionTaskDto], description: 'Tareas de la fase.' })
  tasks!: PortfolioExecutionTaskDto[];
}

/**
 * Ejecución de una iniciativa (plan, fechas, avance, fases y tareas) de solo
 * lectura, para quien tiene Portafolio sin necesitar el módulo de Planificación.
 */
export class PortfolioExecutionResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id de la solicitud.' })
  requestId!: string;

  @ApiProperty({ type: String, example: 'PRY-0012', description: 'ID visible de la solicitud.' })
  requestCode!: string;

  @ApiProperty({ type: Boolean, description: 'false si la solicitud aún no tiene plan.' })
  hasPlan!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['BORRADOR', 'EN_AUTORIZACION', 'AUTORIZADO', 'DEVUELTO'],
    description: 'Estado del plan o null sin plan.',
  })
  planStatus!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Línea base (YYYY-MM-DD): compromiso del plan autorizado. Null si el plan no está autorizado o no hay fecha.',
  })
  baselineDate!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Pronóstico de fin (YYYY-MM-DD): mayor fecha fin entre tareas sin terminar, o null.',
  })
  forecastDate!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Desviación en días del pronóstico respecto a la línea base (positivo = se corrió). Null sin plan autorizado o sin tareas abiertas con fecha.',
  })
  scheduleVarianceDays!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Avance global (0..100) según todas las tareas; null si no hay tareas.',
  })
  progressPercent!: number | null;

  @ApiProperty({ type: [PortfolioExecutionPhaseDto], description: 'Fases del plan en orden.' })
  phases!: PortfolioExecutionPhaseDto[];
}
