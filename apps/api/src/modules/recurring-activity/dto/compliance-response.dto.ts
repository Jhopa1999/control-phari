import { ApiProperty } from '@nestjs/swagger';

/**
 * Metricas de cumplimiento de un grupo (una actividad o un responsable) en la
 * ventana consultada (FEAT-003). Se calculan en el backend a partir de las
 * ocurrencias:
 * - onTime: COMPLETADA con completedAt <= targetDate (a tiempo).
 * - late: COMPLETADA con completedAt > targetDate (a destiempo).
 * - overdue: estado VENCIDA (no completada y fuera de fecha).
 * - pending: PENDIENTE o EN_CURSO (aun dentro de plazo).
 * - total: suma de todas las ocurrencias del grupo en la ventana.
 */
export class ComplianceMetricsDto {
  @ApiProperty({ type: Number, description: 'Completadas a tiempo (completedAt <= targetDate).' })
  onTime!: number;

  @ApiProperty({ type: Number, description: 'Completadas a destiempo (completedAt > targetDate).' })
  late!: number;

  @ApiProperty({ type: Number, description: 'Vencidas (estado VENCIDA, no completadas).' })
  overdue!: number;

  @ApiProperty({ type: Number, description: 'Pendientes o en curso dentro de plazo.' })
  pending!: number;

  @ApiProperty({ type: Number, description: 'Total de ocurrencias del grupo en la ventana.' })
  total!: number;
}

/** Fila de cumplimiento agregada por ACTIVIDAD (definicion). */
export class ComplianceByActivityDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador de la definicion.' })
  activityId!: string;

  @ApiProperty({ type: String, description: 'Titulo de la definicion.' })
  activityTitle!: string;

  @ApiProperty({ type: String, description: 'Cadencia de la definicion (Recurrence).' })
  cadence!: string;

  @ApiProperty({ type: String, description: 'Tipo de responsable (USER/AREA).' })
  responsibleKind!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Usuario responsable (si USER).' })
  responsibleUserId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Area responsable (si AREA).' })
  responsibleAreaId!: string | null;

  @ApiProperty({ type: ComplianceMetricsDto, description: 'Metricas agregadas de la actividad.' })
  metrics!: ComplianceMetricsDto;
}

/** Fila de cumplimiento agregada por RESPONSABLE (usuario o area). */
export class ComplianceByResponsibleDto {
  @ApiProperty({ type: String, description: 'Tipo de responsable (USER/AREA).' })
  responsibleKind!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Usuario responsable (si USER).' })
  responsibleUserId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Area responsable (si AREA).' })
  responsibleAreaId!: string | null;

  @ApiProperty({ type: ComplianceMetricsDto, description: 'Metricas agregadas del responsable.' })
  metrics!: ComplianceMetricsDto;
}

/**
 * Respuesta del panel de cumplimiento (FEAT-003): totales de la ventana y los
 * desgloses por actividad y por responsable. Todo lo calcula el backend; el
 * frontend solo presenta.
 */
export class ComplianceResponseDto {
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Inicio de la ventana aplicada (o null si abierta).' })
  from!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fin de la ventana aplicada (o null si abierta).' })
  to!: string | null;

  @ApiProperty({ type: ComplianceMetricsDto, description: 'Totales de toda la ventana en alcance.' })
  totals!: ComplianceMetricsDto;

  @ApiProperty({ type: [ComplianceByActivityDto], description: 'Desglose por actividad.' })
  byActivity!: ComplianceByActivityDto[];

  @ApiProperty({ type: [ComplianceByResponsibleDto], description: 'Desglose por responsable.' })
  byResponsible!: ComplianceByResponsibleDto[];
}
