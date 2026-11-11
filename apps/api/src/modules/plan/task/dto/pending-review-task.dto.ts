import { ApiProperty } from '@nestjs/swagger';

/** Tarea en revisión que el actor puede aprobar o devolver (cola «Por aprobar»). */
export class PendingReviewTaskDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id de la tarea.' })
  id!: string;

  @ApiProperty({ type: String, example: 'PRY-0012-T07', description: 'ID visible de la tarea (solo lectura).' })
  code!: string;

  @ApiProperty({ type: String, description: 'Título de la tarea.' })
  title!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Id del responsable; null si no tiene.' })
  responsibleUserId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Nombre del responsable; null si no tiene.' })
  responsibleName!: string | null;

  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud a la que pertenece el plan de la tarea.' })
  requestId!: string;

  @ApiProperty({ type: String, description: 'Título de la solicitud.' })
  requestTitle!: string;

  @ApiProperty({ type: String, example: 'PRY-0012', description: 'ID visible de la solicitud (solo lectura).' })
  requestCode!: string;

  @ApiProperty({ type: String, description: 'Nombre de la fase.' })
  phaseName!: string;

  @ApiProperty({ type: String, example: 'PRY-0012-F2', description: 'ID visible de la fase (solo lectura).' })
  phaseCode!: string;

  @ApiProperty({ type: Number, description: 'Avance 0-100.' })
  progress!: number;

  @ApiProperty({
    type: Boolean,
    description: 'La tarea exige evidencia para enviarse a revisión (criterios de aceptación o fase de gobierno).',
  })
  evidenceRequired!: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'La tarea tiene evidencia: una nota o enlace guardado, o al menos un archivo subido.',
  })
  hasEvidence!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de vencimiento.' })
  endDate!: Date | null;

  @ApiProperty({ type: Boolean, description: 'Indica si la tarea es un hito.' })
  isMilestone!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Momento exacto en que pasó a revisión; null en tareas que ya estaban en revisión antes de existir este dato.',
  })
  reviewRequestedAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Desde cuándo espera aprobación: reviewRequestedAt o, si es null, la última actualización de la tarea.',
  })
  waitingSince!: Date;

  @ApiProperty({
    type: Boolean,
    description: 'true cuando waitingSince es aproximado (se tomó de la última actualización por falta de reviewRequestedAt).',
  })
  waitingSinceApproximate!: boolean;
}

/** Cola de tareas por aprobar del actor. */
export class PendingReviewListDto {
  @ApiProperty({ type: Number, description: 'Total real de tareas por aprobar (puede superar los ítems devueltos).' })
  total!: number;

  @ApiProperty({
    type: () => [PendingReviewTaskDto],
    description: 'Hasta 100 tareas; las que llevan más tiempo esperando, primero.',
  })
  items!: PendingReviewTaskDto[];
}
