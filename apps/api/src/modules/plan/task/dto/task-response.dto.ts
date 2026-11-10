import { ApiProperty } from '@nestjs/swagger';

/** Predecesora embebida en una tarea (design §3.4). */
export class TaskPredecessorDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Id de la tarea predecesora.' })
  id!: string;

  @ApiProperty({ type: String, description: 'Titulo de la predecesora.' })
  title!: string;

  @ApiProperty({ type: String, description: 'Estado de la predecesora (TaskStatus).' })
  status!: string;

  @ApiProperty({ type: Boolean, description: 'Aceptacion de la predecesora.' })
  accepted!: boolean;
}

/** Contrato HTTP de una tarea (design §3.4). */
export class TaskResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Identificador unico.' })
  id!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Fase a la que pertenece.' })
  phaseId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Proceso de contexto (informativo).' })
  processId!: string | null;

  @ApiProperty({ type: String, description: 'Titulo de la tarea.' })
  title!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Responsable de la tarea.' })
  responsibleUserId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Nombre del responsable de la tarea. Se informa siempre que haya responsable, incluso si ya no es elegible para nuevas asignaciones (su proceso dejó de intervenir en la solicitud).',
  })
  responsibleName!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de inicio.' })
  startDate!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de fin/vencimiento.' })
  endDate!: Date | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Estimacion en horas.' })
  estimateHours!: number | null;

  @ApiProperty({ type: Boolean, description: 'Indica si la tarea es un hito.' })
  isMilestone!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Descripcion/alcance.' })
  description!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Criterios de aceptacion.' })
  acceptanceCriteria!: string | null;

  @ApiProperty({ type: String, description: 'Estado de la tarea (TaskStatus).' })
  status!: string;

  @ApiProperty({ type: Number, description: 'Progreso 0-100.' })
  progress!: number;

  @ApiProperty({ type: String, nullable: true, description: 'Fase de framework requerida (texto informativo).' })
  frameworkPhaseRequired!: string | null;

  @ApiProperty({ type: Boolean, description: 'Aceptacion de la tarea.' })
  accepted!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'Fecha de aceptacion.' })
  acceptedAt!: Date | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Usuario que acepto.' })
  acceptedByUserId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Evidencia como URL/texto.' })
  evidenceUrl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Motivo vigente del bloqueo; null si la tarea no esta BLOQUEADA o se bloqueo sin motivo.',
  })
  blockedReason!: string | null;

  @ApiProperty({ type: String, description: 'Nombre de la fase a la que pertenece.' })
  phaseName!: string;

  @ApiProperty({ type: String, format: 'uuid', description: 'Solicitud a la que pertenece el plan de la tarea.' })
  requestId!: string;

  @ApiProperty({ type: String, description: 'Titulo de la solicitud.' })
  requestTitle!: string;

  @ApiProperty({ type: [TaskPredecessorDto], description: 'Predecesoras directas de la tarea.' })
  predecessors!: TaskPredecessorDto[];

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de creacion.' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', description: 'Fecha de actualizacion.' })
  updatedAt!: Date;

  @ApiProperty({
    type: Boolean,
    description:
      'La tarea exige evidencia para enviarse a revisión: tiene criterios de aceptación o fase de gobierno requerida.',
  })
  evidenceRequired!: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'La tarea tiene evidencia: una nota o enlace guardado, o al menos un archivo subido.',
  })
  hasEvidence!: boolean;
}
