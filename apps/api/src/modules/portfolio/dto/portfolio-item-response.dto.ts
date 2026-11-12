import { ApiProperty } from '@nestjs/swagger';

/**
 * Fila del portafolio (design §5.3, SCR-07). Estado operativo EXPLICITO (no
 * inferido); `priorityBand`/`priorityLabel`/`currentScore` son `null` cuando la
 * Request no tiene evaluacion vigente (SIN_PRIORIZAR). Fechas en `YYYY-MM-DD`
 * (eco) o `null`.
 */
export class PortfolioItemResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id de la solicitud.' })
  id!: string;

  @ApiProperty({ type: String, example: 'PRY-0012', description: 'ID visible de la iniciativa (solicitud). Solo lectura.' })
  code!: string;

  @ApiProperty({ type: String, description: 'Titulo de la iniciativa.' })
  title!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Proceso principal o null (solicitud aún sin triar).',
  })
  mainProcessId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Code del proceso principal o null.' })
  mainProcessCode!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nombre del proceso principal o null.' })
  mainProcessName!: string | null;

  @ApiProperty({ type: String, description: 'Estado operativo explicito (no inferido).' })
  operationalState!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "'P1'..'P4' si hay evaluacion vigente; null cuando SIN_PRIORIZAR.",
  })
  priorityBand!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Glosa legible del marco §4 o null.' })
  priorityLabel!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Score vigente o null.' })
  currentScore!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Ruta de gobierno (COMPLETA/SIMPLIFICADA/EXPLORACION) o null.',
  })
  governanceRoute!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Responsable (functionalOwner) o null.' })
  responsibleName!: string | null;

  @ApiProperty({ type: String, description: 'Fecha de registro (YYYY-MM-DD).' })
  registeredAt!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Fecha objetivo (YYYY-MM-DD) o null.' })
  targetDate!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Compromiso inicial (YYYY-MM-DD) o null.' })
  initialCommitmentDate!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Avance del proyecto (0..100) segun sus tareas; null si no tiene tareas.',
  })
  progressPercent!: number | null;

  @ApiProperty({
    type: String,
    enum: ['SIN_FECHA', 'EN_TIEMPO', 'PROXIMO_A_VENCER', 'VENCIDO', 'NO_APLICA'],
    description:
      'Alerta de vencimiento medida contra la fecha de referencia (`referenceDate`): el compromiso del plan autorizado o, sin plan autorizado, la fecha objetivo de la solicitud. NO_APLICA en proyectos cerrados, rechazados o retirados.',
  })
  dueStatus!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Dias hasta la fecha de referencia (negativo = vencido) o null.',
  })
  daysToTarget!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Fecha (YYYY-MM-DD) contra la que se mide el vencimiento: línea base del plan autorizado o, sin él, la fecha objetivo. Null si no hay ninguna.',
  })
  referenceDate!: string | null;

  @ApiProperty({
    type: String,
    enum: ['PLAN', 'SOLICITUD', 'NINGUNA'],
    description:
      'Origen de `referenceDate`: PLAN (compromiso del plan autorizado), SOLICITUD (fecha objetivo, aún sin plan autorizado) o NINGUNA.',
  })
  referenceSource!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Pronóstico de fin (YYYY-MM-DD): mayor fecha fin entre las tareas sin terminar, o null.',
  })
  forecastDate!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Días del compromiso del plan respecto a la fecha solicitada (positivo = el plan termina después de lo solicitado). Informativo: no es un vencimiento. Null sin plan autorizado o sin fecha objetivo.',
  })
  requestedGapDays!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Desviación en días del pronóstico respecto al compromiso del plan (positivo = se corrió). Null sin plan autorizado o sin tareas abiertas con fecha.',
  })
  scheduleVarianceDays!: number | null;

  @ApiProperty({ type: Boolean, description: 'Flag transversal de bloqueo activo (Fase 7).' })
  blocked!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Motivo del bloqueo o null.' })
  blockedReason!: string | null;
}
