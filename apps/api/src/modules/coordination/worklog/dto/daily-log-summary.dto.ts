import { ApiProperty } from '@nestjs/swagger';
import { DailyLogResponseDto } from './daily-log-response.dto';

/**
 * Pagina de diarios (mismo estilo de paginacion que la auditoria: page/pageSize
 * 1-based y respuesta envuelta). `total` cuenta los diarios en alcance que cumplen
 * los filtros vigentes.
 */
export class PaginatedDailyLogsResponseDto {
  @ApiProperty({ type: [DailyLogResponseDto], description: 'Diarios de la pagina.' })
  data!: DailyLogResponseDto[];

  @ApiProperty({ type: Number, description: 'Pagina actual (1-based).', example: 1 })
  page!: number;

  @ApiProperty({ type: Number, description: 'Tamano de pagina aplicado (acotado a 100).', example: 25 })
  pageSize!: number;

  @ApiProperty({ type: Number, description: 'Total de diarios para el filtro vigente.' })
  total!: number;

  @ApiProperty({ type: Boolean, description: 'Hay al menos una pagina mas despues de esta.' })
  hasMore!: boolean;
}

/** Diarios y horas por clasificacion de actividad. */
export class DailyLogClassificationSummaryDto {
  @ApiProperty({ type: String, description: 'Clasificacion (INTERNA, PLANIFICADA, SOPORTE, EXTRAORDINARIA).' })
  classificationCode!: string;

  @ApiProperty({ type: Number, description: 'Numero de actividades.' })
  activityCount!: number;

  @ApiProperty({ type: Number, description: 'Horas de dedicacion.' })
  hours!: number;
}

/** Resumen por persona de los diarios que cumplen el filtro. */
export class DailyLogPersonSummaryDto {
  @ApiProperty({ type: String, format: 'uuid' })
  userId!: string;

  @ApiProperty({ type: String, description: 'Nombre de la persona.' })
  name!: string;

  @ApiProperty({ type: Number, description: 'Diarios de la persona.' })
  logCount!: number;

  @ApiProperty({ type: Number, description: 'Horas de dedicacion.' })
  hours!: number;

  @ApiProperty({ type: Number, description: 'Diarios enviados que aun esperan revision.' })
  pendingReviewCount!: number;
}

/**
 * Resumen de los diarios en alcance que cumplen el filtro (para la tira de
 * indicadores de la pantalla). Se calcula sobre TODOS los diarios del filtro, no
 * solo sobre la pagina visible.
 */
export class DailyLogSummaryDto {
  @ApiProperty({ type: Number, description: 'Diarios que cumplen el filtro.' })
  total!: number;

  @ApiProperty({ type: Number, description: 'Diarios en borrador.' })
  draftCount!: number;

  @ApiProperty({ type: Number, description: 'De los borradores, los devueltos por un revisor (requieren atención del autor).' })
  returnedCount!: number;

  @ApiProperty({ type: Number, description: 'Diarios enviados que aun esperan revision.' })
  sentCount!: number;

  @ApiProperty({ type: Number, description: 'Diarios ya revisados.' })
  reviewedCount!: number;

  @ApiProperty({ type: Number, description: 'Numero de actividades.' })
  activityCount!: number;

  @ApiProperty({ type: Number, description: 'Horas de dedicacion en total.' })
  totalHours!: number;

  @ApiProperty({ type: [DailyLogClassificationSummaryDto], description: 'Distribucion por clasificacion.' })
  byClassification!: DailyLogClassificationSummaryDto[];

  @ApiProperty({ type: [DailyLogPersonSummaryDto], description: 'Resumen por persona, de mayor a menor dedicacion.' })
  byPerson!: DailyLogPersonSummaryDto[];
}
