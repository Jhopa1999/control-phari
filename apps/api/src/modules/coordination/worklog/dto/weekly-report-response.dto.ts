import { ApiProperty } from '@nestjs/swagger';

/**
 * Conteos de consolidacion del semanal (design §2.5, calculados por lectura).
 * Agregan SOLO los diarios ENVIADO/REVISADO del autor+proceso del semanal en la
 * semana. `hasBacking=false` -> la UI advierte "sin bitacoras de respaldo".
 */
export class WeeklyConsolidationDto {
  @ApiProperty({ type: Number, description: 'Numero de diarios elegibles (ENVIADO/REVISADO).' })
  dailyLogCount!: number;

  @ApiProperty({ type: Number, description: 'Numero de actividades en esos diarios.' })
  activityCount!: number;

  @ApiProperty({ type: Number, description: 'Suma de horas (dedicacion) de esas actividades.' })
  totalHours!: number;

  @ApiProperty({ type: Number, description: 'Numero de actividades EXTRAORDINARIA.' })
  extraordinaryCount!: number;

  @ApiProperty({ type: Boolean, description: 'true si hay al menos un diario elegible.' })
  hasBacking!: boolean;
}

/**
 * Contrato HTTP de un registro semanal (design §3.4). `weekStart` como
 * `YYYY-MM-DD` (lunes ISO). El detalle incluye `consolidation`; los listados la
 * omiten (null).
 */
export class WeeklyReportResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Autor del semanal.' })
  authorUserId!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Proceso del semanal.' })
  processId!: string;

  @ApiProperty({ type: String, description: 'Lunes ISO de la semana (YYYY-MM-DD).', example: '2025-03-10' })
  weekStart!: string;

  @ApiProperty({ type: String, description: 'Estado (BORRADOR/ENVIADO).' })
  status!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  results!: string | null;

  @ApiProperty({ type: String, nullable: true })
  proposals!: string | null;

  @ApiProperty({ type: String, nullable: true })
  blockers!: string | null;

  @ApiProperty({ type: String, nullable: true })
  commitmentsText!: string | null;

  @ApiProperty({ type: String, nullable: true })
  decisions!: string | null;

  @ApiProperty({
    type: WeeklyConsolidationDto,
    nullable: true,
    description: 'Conteos de consolidacion (solo en el detalle; null en listados).',
  })
  consolidation!: WeeklyConsolidationDto | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
